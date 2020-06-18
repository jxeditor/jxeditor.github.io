---
title: Flink源码解析之七Checkpoint流程
date: 2020-06-18 15:31:00
categories: 大数据
tags: flink
---

> Flink的CK机制可以说是一个亮点,基于Chandy-Lamport算法
> CK的配置在生成ExecutionGroup时就已经被设置 [传送门](https://jxeditor.github.io/2020/05/28/Flink%E6%BA%90%E7%A0%81%E8%A7%A3%E6%9E%90%E4%B9%8B%E5%9B%9BExecutionGraph%E7%94%9F%E6%88%90/)

<!-- more -->

## CK的触发
### 定时器
```java
// ExecutionGroup.enableCheckpointing
checkpointCoordinatorTimer = Executors.newSingleThreadScheduledExecutor(
    new DispatcherThreadFactory(
        Thread.currentThread().getThreadGroup(), "Checkpoint Timer"));
// 创建定时器,并传给CheckpointCoordinator
```
### 监听器的生成与注册
```java
// ExecutionGroup,在enableCheckpointing方法中
// 如果chkConfig的CK时间设置不等于Long.MAX_VALUE
// 则创建一个监听器并注册
if (chkConfig.getCheckpointInterval() != Long.MAX_VALUE) {
    // the periodic checkpoint scheduler is activated and deactivated as a result of
    // job status changes (running -> on, all other states -> off)
    registerJobStatusListener(checkpointCoordinator.createActivatorDeactivator());
}
```
### 触发CK
```java
// CheckpointCoordinatorDeActivator
// 当Job状态改变时调用startCheckpointScheduler()
@Override
public void jobStatusChanges(JobID jobId, JobStatus newJobStatus, long timestamp, Throwable error) {
    if (newJobStatus == JobStatus.RUNNING) {
        // start the checkpoint scheduler
        coordinator.startCheckpointScheduler();
    } else {
        // anything else should stop the trigger for now
        coordinator.stopCheckpointScheduler();
    }
}

// CheckpointCoordinator
public void startCheckpointScheduler() {
	synchronized (lock) {
		if (shutdown) {
			throw new IllegalArgumentException("Checkpoint coordinator is shut down");
		}
		// make sure all prior timers are cancelled
		// 确保启动定时CK前,没有定时器
        stopCheckpointScheduler();
		periodicScheduling = true;
        // 创建定时器,获取延迟时间
		currentPeriodicTrigger = scheduleTriggerWithDelay(getRandomInitDelay());
	}
}
private ScheduledFuture<?> scheduleTriggerWithDelay(long initDelay) {
	return timer.scheduleAtFixedRate(
        // 触发操作
		new ScheduledTrigger(),
		initDelay, baseInterval, TimeUnit.MILLISECONDS);
}

// CheckpointCoordinator.ScheduledTrigger
private final class ScheduledTrigger implements Runnable {
    @Override
    public void run() {
        try {
            // 触发CK
            triggerCheckpoint(System.currentTimeMillis(), true);
        }
        catch (Exception e) {
            LOG.error("Exception while triggering checkpoint for job {}.", job, e);
        }
    }
}
// triggerCheckpoint主要进行以下操作
// 1.根据配置进行CK需要的检验
// 2.检查需要触发CK的所有任务是否正在运行,生成executions
// 3.检查需要确认CK的所有任务是否正在运行,生成ackTasks
// 4.根据配置确定是CK还是SP
// 5.构造PendingCheckpoint
// 6.注册清除超时CK的定时器
// 7.调用execution.triggerCheckpoint()触发CK

// Execution
private void triggerCheckpointHelper(long checkpointId, long timestamp, CheckpointOptions checkpointOptions, boolean advanceToEndOfEventTime) {
    final CheckpointType checkpointType = checkpointOptions.getCheckpointType();
    if (advanceToEndOfEventTime && !(checkpointType.isSynchronous() && checkpointType.isSavepoint())) {
        throw new IllegalArgumentException("Only synchronous savepoints are allowed to advance the watermark to MAX.");
    }

    final LogicalSlot slot = assignedResource;

    if (slot != null) {
        final TaskManagerGateway taskManagerGateway = slot.getTaskManagerGateway();

    // 发送CK
        taskManagerGateway.triggerCheckpoint(attemptId, getVertex().getJobId(), checkpointId, timestamp, checkpointOptions, advanceToEndOfEventTime);
    } else {
        LOG.debug("The execution has no slot assigned. This indicates that the execution is no longer running.");
    }
}

// 后续流程
// RpcTaskManagerGateWay
// TaskExecutor
```
### CK执行
```java
// TaskExecutor
public CompletableFuture<Acknowledge> triggerCheckpoint(
        ExecutionAttemptID executionAttemptID,
        long checkpointId,
        long checkpointTimestamp,
        CheckpointOptions checkpointOptions,
        boolean advanceToEndOfEventTime) {
    log.debug("Trigger checkpoint {}@{} for {}.", checkpointId, checkpointTimestamp, executionAttemptID);

    final CheckpointType checkpointType = checkpointOptions.getCheckpointType();
    if (advanceToEndOfEventTime && !(checkpointType.isSynchronous() && checkpointType.isSavepoint())) {
        throw new IllegalArgumentException("Only synchronous savepoints are allowed to advance the watermark to MAX.");
    }

    // 获取具体Task
    final Task task = taskSlotTable.getTask(executionAttemptID);

    if (task != null) {
        // 触发CheckpointBarrier
        task.triggerCheckpointBarrier(checkpointId, checkpointTimestamp, checkpointOptions, advanceToEndOfEventTime);

        return CompletableFuture.completedFuture(Acknowledge.get());
    } else {
        final String message = "TaskManager received a checkpoint request for unknown task " + executionAttemptID + '.';

        log.debug(message);
        return FutureUtils.completedExceptionally(new CheckpointException(message, CheckpointFailureReason.TASK_CHECKPOINT_FAILURE));
    }
}

// Task
public void triggerCheckpointBarrier(
        final long checkpointID,
        final long checkpointTimestamp,
        final CheckpointOptions checkpointOptions,
        final boolean advanceToEndOfEventTime) {

    final AbstractInvokable invokable = this.invokable;
    // 创建CheckpointMetaData
    final CheckpointMetaData checkpointMetaData = new CheckpointMetaData(checkpointID, checkpointTimestamp);

    if (executionState == ExecutionState.RUNNING && invokable != null) {
        try {
            // 异步CK
            invokable.triggerCheckpointAsync(checkpointMetaData, checkpointOptions, advanceToEndOfEventTime);
        }
        ...
    }
    ...
}

// StreamTask
private boolean triggerCheckpoint(
			CheckpointMetaData checkpointMetaData,
			CheckpointOptions checkpointOptions,
			boolean advanceToEndOfEventTime) throws Exception {
    try {
        // No alignment if we inject a checkpoint
        // 指标
        CheckpointMetrics checkpointMetrics = new CheckpointMetrics()
            .setBytesBufferedInAlignment(0L)
            .setAlignmentDurationNanos(0L);

        // 开始CK
        boolean success = performCheckpoint(checkpointMetaData, checkpointOptions, checkpointMetrics, advanceToEndOfEventTime);
        if (!success) {
            declineCheckpoint(checkpointMetaData.getCheckpointId());
        }
        return success;
    } catch (Exception e) {
        ...
    }
}
private boolean performCheckpoint(
        CheckpointMetaData checkpointMetaData,
        CheckpointOptions checkpointOptions,
        CheckpointMetrics checkpointMetrics,
        boolean advanceToEndOfTime) throws Exception {

    LOG.debug("Starting checkpoint ({}) {} on task {}",
        checkpointMetaData.getCheckpointId(), checkpointOptions.getCheckpointType(), getName());

    final long checkpointId = checkpointMetaData.getCheckpointId();

    if (isRunning) {
        actionExecutor.runThrowing(() -> {

            if (checkpointOptions.getCheckpointType().isSynchronous()) {
                setSynchronousSavepointId(checkpointId);

                if (advanceToEndOfTime) {
                    advanceToEndOfEventTime();
                }
            }

            // 从barriers和records/watermarks/timers/callbacks的角度来看，以下所有步骤都是原子步骤
            // 我们通常会尽量尽快释放检查点屏障，以免影响下游的检查点对齐

            // Step (1): ck之前,operators做一些pre-barrier工作
            // 一般来说,pre-barrier工作应该为0或最小
            operatorChain.prepareSnapshotPreBarrier(checkpointId);

            // Step (2): 发送checkpoint barrier给下游
            operatorChain.broadcastCheckpointBarrier(
                    checkpointId,
                    checkpointMetaData.getTimestamp(),
                    checkpointOptions);

            // Step (3): 进行State快照. 很大程序是异步进行,避免影响流式拓扑的进度
            checkpointState(checkpointMetaData, checkpointOptions, checkpointMetrics);

        });

        return true;
    } else {
        actionExecutor.runThrowing(() -> {
            // 不能执行检查点,让下游operators不等待该operator的任何输入

            // 我们无法在operator chain上广播取消CKMarker,因为它可能尚未创建
            final CancelCheckpointMarker message = new CancelCheckpointMarker(checkpointMetaData.getCheckpointId());
            recordWriter.broadcastEvent(message);
        });

        return false;
    }
}
```