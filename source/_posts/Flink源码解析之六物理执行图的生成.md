---
title: Flink源码解析之六物理执行图的生成
date: 2020-06-12 14:56:35
categories: 大数据
tags: flink
---

> 在前面的文章里StreamGraph,JobGraph以及ExecutionGraph的生成逻辑已经整理的差不多
> 接下来就是如何去真正执行
> 了解用户逻辑代码最终如何被Flink执行

<!-- more -->

## 大致流程
```
a.任务代码生成Transformation
b.StreamGraphGenerator生成StreamGraph
c.PipelineExecutor调用ExecutorUtils转换为JobGraph
d.JobMasterServiceFactory创建JobMaster,调用createScheduler生成ExecutionGraph
e.JobManagerRunner调用start方法,进行选举,选举完毕后回调grantLeadership方法调用startJobMaster开始运行
f.JobMaster调用start方法,确保RPC通信,调用startJobExecution方法
g.resetAndStartScheduler()
    ->startScheduling()
    ->startSchedulingInternal()选取调度器执行
    获取ExecutionGraph并进行调度executionGraph.scheduleForExecution()
h.调用Scheduling.schedule方法进行调度
    根据配置的调度模式选择调度方法
    scheduleLazy
    scheduleEager
i.为每一个ExecutionVertex分配一个LogicalSlot
j.封装为Execution,进行deploy
```

---

## Execution
```java
public void deploy() throws JobException {
    assertRunningInJobMasterMainThread();

    // 分配的slot
    final LogicalSlot slot  = assignedResource;

    checkNotNull(slot, "In order to deploy the execution we first have to assign a resource via tryAssignResource.");

    // Check if the TaskManager died in the meantime
    // This only speeds up the response to TaskManagers failing concurrently to deployments.
    // The more general check is the rpcTimeout of the deployment call
    if (!slot.isAlive()) {
        throw new JobException("Target slot (TaskManager) for deployment is no longer alive.");
    }

    // make sure exactly one deployment call happens from the correct state
    // note: the transition from CREATED to DEPLOYING is for testing purposes only
    ExecutionState previous = this.state;
    if (previous == SCHEDULED || previous == CREATED) {
        if (!transitionState(previous, DEPLOYING)) {
            // race condition, someone else beat us to the deploying call.
            // this should actually not happen and indicates a race somewhere else
            throw new IllegalStateException("Cannot deploy task: Concurrent deployment call race.");
        }
    }
    else {
        // vertex may have been cancelled, or it was already scheduled
        throw new IllegalStateException("The vertex must be in CREATED or SCHEDULED state to be deployed. Found state " + previous);
    }

    if (this != slot.getPayload()) {
        throw new IllegalStateException(
            String.format("The execution %s has not been assigned to the assigned slot.", this));
    }

    try {

        // race double check, did we fail/cancel and do we need to release the slot?
        if (this.state != DEPLOYING) {
            slot.releaseSlot(new FlinkException("Actual state of execution " + this + " (" + state + ") does not match expected state DEPLOYING."));
            return;
        }

        if (LOG.isInfoEnabled()) {
            LOG.info(String.format("Deploying %s (attempt #%d) to %s", vertex.getTaskNameWithSubtaskIndex(),
                    attemptNumber, getAssignedResourceLocation()));
        }

        // 将ExecutionGraph转换为物理执行图
        // ResultPartition的生成
        // InputGate的前身InputGateDeploymentDescriptor生成
        final TaskDeploymentDescriptor deployment = TaskDeploymentDescriptorFactory
            .fromExecutionVertex(vertex, attemptNumber)
            .createDeploymentDescriptor(
                slot.getAllocationId(),
                slot.getPhysicalSlotNumber(),
                taskRestore,
                producedPartitions.values());

        // null taskRestore to let it be GC'ed
        taskRestore = null;

        final TaskManagerGateway taskManagerGateway = slot.getTaskManagerGateway();

        final ComponentMainThreadExecutor jobMasterMainThreadExecutor =
            vertex.getExecutionGraph().getJobMasterMainThreadExecutor();

        // We run the submission in the future executor so that the serialization of large TDDs does not block
        // the main thread and sync back to the main thread once submission is completed.
        // 进行任务提交,submitTask
        CompletableFuture.supplyAsync(() -> taskManagerGateway.submitTask(deployment, rpcTimeout), executor)
            .thenCompose(Function.identity())
            .whenCompleteAsync(
                (ack, failure) -> {
                    // only respond to the failure case
                    if (failure != null) {
                        if (failure instanceof TimeoutException) {
                            String taskname = vertex.getTaskNameWithSubtaskIndex() + " (" + attemptId + ')';

                            markFailed(new Exception(
                                "Cannot deploy task " + taskname + " - TaskManager (" + getAssignedResourceLocation()
                                    + ") not responding after a rpcTimeout of " + rpcTimeout, failure));
                        } else {
                            markFailed(failure);
                        }
                    }
                },
                jobMasterMainThreadExecutor);

    }
    catch (Throwable t) {
        markFailed(t);

        if (isLegacyScheduling()) {
            ExceptionUtils.rethrow(t);
        }
    }
}
```

---

## TaskDeploymentDescriptorFactory
```java
将IntermediateResultPartition转换为ResultPartition
getConsumedPartitionShuffleDescriptor()
```

---

## 实际Task
### RPCTaskManagerGateway
```java
// submitTask方法将通过RPC的方法提交Task
public CompletableFuture<Acknowledge> submitTask(TaskDeploymentDescriptor tdd, Time timeout) {
    return taskExecutorGateway.submitTask(tdd, jobMasterId, timeout);
}
```
### TaskExecutor
```java
public CompletableFuture<Acknowledge> submitTask(
			TaskDeploymentDescriptor tdd,
			JobMasterId jobMasterId,
			Time timeout) {

    try {
        ...
        // 创建Task
        // InputGate,ResultPartition,ResultPartitionWriter
        Task task = new Task(
            jobInformation,
            taskInformation,
            tdd.getExecutionAttemptId(),
            tdd.getAllocationId(),
            tdd.getSubtaskIndex(),
            tdd.getAttemptNumber(),
            tdd.getProducedPartitions(),
            tdd.getInputGates(),
            tdd.getTargetSlotNumber(),
            memoryManager,
            taskExecutorServices.getIOManager(),
            taskExecutorServices.getShuffleEnvironment(),
            taskExecutorServices.getKvStateService(),
            taskExecutorServices.getBroadcastVariableManager(),
            taskExecutorServices.getTaskEventDispatcher(),
            taskStateManager,
            taskManagerActions,
            inputSplitProvider,
            checkpointResponder,
            aggregateManager,
            blobCacheService,
            libraryCache,
            fileCache,
            taskManagerConfiguration,
            taskMetricGroup,
            resultPartitionConsumableNotifier,
            partitionStateChecker,
            getRpcService().getExecutor());

        taskMetricGroup.gauge(MetricNames.IS_BACKPRESSURED, task::isBackPressured);

        log.info("Received task {}.", task.getTaskInfo().getTaskNameWithSubtasks());

        boolean taskAdded;

        try {
            taskAdded = taskSlotTable.addTask(task);
        } catch (SlotNotFoundException | SlotNotActiveException e) {
            throw new TaskSubmissionException("Could not submit task.", e);
        }

        if (taskAdded) {
            // 启动Task
            task.startTaskThread();
            ...
        }
        ...
    } catch (TaskSubmissionException e) {
        return FutureUtils.completedExceptionally(e);
    }
}
```
### Task
```java
public void startTaskThread() {
    // 调用Task.run()方法
	executingThread.start();
}

public void run() {
    try {
        doRun();
    } finally {
        terminationFuture.complete(executionState);
    }
}

// 太长,省略点
private void doRun() {
    ...
    // 用户代码加载
    invokable = loadAndInstantiateInvokable(userCodeClassLoader, nameOfInvokableClass, env);
    
    ...
    
    // 运行invokable,实际上最后会去调用AbstractInvokable派生类的init方法以及runThrowing方法
    invokable.invoke();
    ...
}
```

---

## AbstractInvokable派生类举例
```
其包括Flink中的各种Task类
StreamTask
BatchTask
等等

// StreamTask
private void initializeStateAndOpen() throws Exception {

    StreamOperator<?>[] allOperators = operatorChain.getAllOperators();

    for (StreamOperator<?> operator : allOperators) {
        if (null != operator) {
            // 运行StreamOperator
            operator.initializeState();
            operator.open();
        }
    }
}
```

---

## 用户代码调用
```
用户写的代码,其实会生成为一个个的Operator,用户代码就是它的userFunction
AbstractInvokable.invoke()
-> StreamTask ->循环调用processInput
-> StreamInputProcessor.processInput[StreamOneInputProcessor]
-> PushingAsyncDataInput.emitNext[StreamTaskNetworkInput]
-> StreamTaskNetworkInput.processElement
-> PushingAsyncDataInput.DataOutput.emitRecord[OneInputStreamTask]
-> OneInputStreamOperator.processElement[StreamFlatMap]

@Override
public void processElement(StreamRecord<IN> element) throws Exception {
    collector.setTimestamp(element);
    userFunction.flatMap(element.getValue(), collector);
}
```