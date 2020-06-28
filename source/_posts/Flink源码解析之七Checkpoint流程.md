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
@Override
public Future<Boolean> triggerCheckpointAsync(
		CheckpointMetaData checkpointMetaData,
		CheckpointOptions checkpointOptions,
		boolean advanceToEndOfEventTime) {
    // 注意这个MailboxProcessor,这是Flink1.10后的一个新特性,会在后续章节中详细说明
    return mailboxProcessor.getMainMailboxExecutor().submit(
            () -> triggerCheckpoint(checkpointMetaData, checkpointOptions, advanceToEndOfEventTime),
            "checkpoint %s with %s",
        checkpointMetaData,
        checkpointOptions);
}
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
private void checkpointState(
		CheckpointMetaData checkpointMetaData,
		CheckpointOptions checkpointOptions,
		CheckpointMetrics checkpointMetrics) throws Exception {
	
    // CK数据保存工厂类
    CheckpointStreamFactory storage = checkpointStorage.resolveCheckpointStorageLocation(
			checkpointMetaData.getCheckpointId(),
			checkpointOptions.getTargetLocation());
    // CK操作类,根据CKMetaData,CK配置,CK保存点,CK指标执行CK
    CheckpointingOperation checkpointingOperation = new CheckpointingOperation(
        this,
        checkpointMetaData,
        checkpointOptions,
        storage,
        checkpointMetrics);
    // 执行CK
    checkpointingOperation.executeCheckpointing();
}
```

---

## CK的执行
### CheckpointingOperation
```java
// 该类在StreamTask中被实现
public void executeCheckpointing() throws Exception {
    startSyncPartNano = System.nanoTime();

    try {
        for (StreamOperator<?> op : allOperators) {
            // 对各Operator进行CK调用,同步调用
            checkpointStreamOperator(op);
        }

        if (LOG.isDebugEnabled()) {
            LOG.debug("Finished synchronous checkpoints for checkpoint {} on task {}",
                checkpointMetaData.getCheckpointId(), owner.getName());
        }

        startAsyncPartNano = System.nanoTime();

        // CK指标间隔时间设置
        checkpointMetrics.setSyncDurationMillis((startAsyncPartNano - startSyncPartNano) / 1_000_000);

        // we are transferring ownership over snapshotInProgressList for cleanup to the thread, active on submit
        AsyncCheckpointRunnable asyncCheckpointRunnable = new AsyncCheckpointRunnable(
            owner,
            operatorSnapshotsInProgress,
            checkpointMetaData,
            checkpointMetrics,
            startAsyncPartNano);

        // 当前活跃的后台物理线程,注册一个Closeable
        owner.cancelables.registerCloseable(asyncCheckpointRunnable);
        // 异步快照工作线程池
        owner.asyncOperationsThreadPool.execute(asyncCheckpointRunnable);
        if (LOG.isDebugEnabled()) {
            LOG.debug("{} - finished synchronous part of checkpoint {}. " +
                    "Alignment duration: {} ms, snapshot duration {} ms",
                owner.getName(), checkpointMetaData.getCheckpointId(),
                checkpointMetrics.getAlignmentDurationNanos() / 1_000_000,
                checkpointMetrics.getSyncDurationMillis());
        }
    } catch (Exception ex) {
        ...
    }
}
private void checkpointStreamOperator(StreamOperator<?> op) throws Exception {
        if (null != op) {
            // 对于每个Operator执行snapshotState进行CK,生成OperatorSnapshotFutures
            OperatorSnapshotFutures snapshotInProgress = op.snapshotState(
                    checkpointMetaData.getCheckpointId(),
                    checkpointMetaData.getTimestamp(),
                    checkpointOptions,
                    storageLocation);
            // 存入operatorSnapshotsInProgress
            operatorSnapshotsInProgress.put(op.getOperatorID(), snapshotInProgress);
        }
    }
```
### 同步执行
```java
// AbstractStreamOperator
public final OperatorSnapshotFutures snapshotState(long checkpointId, long timestamp, CheckpointOptions checkpointOptions,
        CheckpointStreamFactory factory) throws Exception {

    KeyGroupRange keyGroupRange = null != keyedStateBackend ?
            keyedStateBackend.getKeyGroupRange() : KeyGroupRange.EMPTY_KEY_GROUP_RANGE;

    OperatorSnapshotFutures snapshotInProgress = new OperatorSnapshotFutures();

    StateSnapshotContextSynchronousImpl snapshotContext = new StateSnapshotContextSynchronousImpl(
        checkpointId,
        timestamp,
        factory,
        keyGroupRange,
        getContainingTask().getCancelables());

    try {
        // 调用算子/函数的snapshot方法
        snapshotState(snapshotContext);

        snapshotInProgress.setKeyedStateRawFuture(snapshotContext.getKeyedStateStreamFuture());
        snapshotInProgress.setOperatorStateRawFuture(snapshotContext.getOperatorStateStreamFuture());

        if (null != operatorStateBackend) {
            snapshotInProgress.setOperatorStateManagedFuture(
                // operatorStateBackend持久化
                operatorStateBackend.snapshot(checkpointId, timestamp, factory, checkpointOptions));
        }

        if (null != keyedStateBackend) {
            snapshotInProgress.setKeyedStateManagedFuture(
                // keyedStateBackend持久化
                keyedStateBackend.snapshot(checkpointId, timestamp, factory, checkpointOptions));
        }
    } catch (Exception snapshotException) {
        ...
    }

    return snapshotInProgress;
}
public void snapshotState(StateSnapshotContext context) throws Exception {
    final KeyedStateBackend<?> keyedStateBackend = getKeyedStateBackend();
    //TODO all of this can be removed once heap-based timers are integrated with RocksDB incremental snapshots
    if (keyedStateBackend instanceof AbstractKeyedStateBackend &&
        ((AbstractKeyedStateBackend<?>) keyedStateBackend).requiresLegacySynchronousTimerSnapshots()) {

        KeyedStateCheckpointOutputStream out;

        try {
            out = context.getRawKeyedOperatorStateOutput();
        } catch (Exception exception) {
            throw new Exception("Could not open raw keyed operator state stream for " +
                getOperatorName() + '.', exception);
        }

        try {
            KeyGroupsList allKeyGroups = out.getKeyGroupList();
            for (int keyGroupIdx : allKeyGroups) {
                out.startNewKeyGroup(keyGroupIdx);

                timeServiceManager.snapshotStateForKeyGroup(
                    new DataOutputViewStreamWrapper(out), keyGroupIdx);
            }
        } catch (Exception exception) {
            ...
        } finally {
            ...
        }
    }
}
```
### 异步执行
```java
// AsyncCheckpointRunnable
当同步CK完成之后,异步实现具体信息写入,由AsyncOperations-thread-*线程执行
public void run() {
    FileSystemSafetyNet.initializeSafetyNetForThread();
    try {

        TaskStateSnapshot jobManagerTaskOperatorSubtaskStates =
            new TaskStateSnapshot(operatorSnapshotsInProgress.size());

        TaskStateSnapshot localTaskOperatorSubtaskStates =
            new TaskStateSnapshot(operatorSnapshotsInProgress.size());

        for (Map.Entry<OperatorID, OperatorSnapshotFutures> entry : operatorSnapshotsInProgress.entrySet()) {

            OperatorID operatorID = entry.getKey();
            OperatorSnapshotFutures snapshotInProgress = entry.getValue();

            // finalize the async part of all by executing all snapshot runnables
            // 等待各Future执行完成
            OperatorSnapshotFinalizer finalizedSnapshots =
                new OperatorSnapshotFinalizer(snapshotInProgress);

            jobManagerTaskOperatorSubtaskStates.putSubtaskStateByOperatorID(
                operatorID,
                finalizedSnapshots.getJobManagerOwnedState());

            localTaskOperatorSubtaskStates.putSubtaskStateByOperatorID(
                operatorID,
                finalizedSnapshots.getTaskLocalState());
        }

        final long asyncEndNanos = System.nanoTime();
        final long asyncDurationMillis = (asyncEndNanos - asyncStartNanos) / 1_000_000L;

        checkpointMetrics.setAsyncDurationMillis(asyncDurationMillis);

        if (asyncCheckpointState.compareAndSet(CheckpointingOperation.AsyncCheckpointState.RUNNING,
            CheckpointingOperation.AsyncCheckpointState.COMPLETED)) {
            // 上报CK状态给JobManager
            reportCompletedSnapshotStates(
                jobManagerTaskOperatorSubtaskStates,
                localTaskOperatorSubtaskStates,
                asyncDurationMillis);
        } else {
            LOG.debug("{} - asynchronous part of checkpoint {} could not be completed because it was closed before.",
                owner.getName(),
                checkpointMetaData.getCheckpointId());
        }
    } catch (Exception e) {
        if (LOG.isDebugEnabled()) {
            LOG.debug("{} - asynchronous part of checkpoint {} could not be completed.",
                owner.getName(),
                checkpointMetaData.getCheckpointId(),
                e);
        }
        handleExecutionException(e);
    } finally {
        owner.cancelables.unregisterCloseable(this);
        FileSystemSafetyNet.closeSafetyNetAndGuardedResourcesForThread();
    }
}
```
### 非Source的消息处理
```java
上游在进行CK时,会向下游发送CheckBarrier消息,而下游的task正是拿到该消息,进行CK操作

// CheckpointedInputGate
public Optional<BufferOrEvent> pollNext() throws Exception {
    while (true) {
        ...
        BufferOrEvent bufferOrEvent = next.get();
        // 如果消息对应的channel已经被block,则将消息缓存到bufferStorage
        if (barrierHandler.isBlocked(offsetChannelIndex(bufferOrEvent.getChannelIndex()))) {
            // if the channel is blocked, we just store the BufferOrEvent
            bufferStorage.add(bufferOrEvent);
            if (bufferStorage.isFull()) {
                barrierHandler.checkpointSizeLimitExceeded(bufferStorage.getMaxBufferedBytes());
                bufferStorage.rollOver();
            }
        }
        // 如果是一般的消息,返回继续下一步处理
        else if (bufferOrEvent.isBuffer()) {
            return next;
        }
        // 对消息类型进行判断,如果是CheckpointBarrier类型的消息
        // 进一步判断是否需要对齐或者进行CK
        else if (bufferOrEvent.getEvent().getClass() == CheckpointBarrier.class) {
            CheckpointBarrier checkpointBarrier = (CheckpointBarrier) bufferOrEvent.getEvent();
            if (!endOfInputGate) {
                // process barriers only if there is a chance of the checkpoint completing
                // 对齐Barrier
                if (barrierHandler.processBarrier(checkpointBarrier, offsetChannelIndex(bufferOrEvent.getChannelIndex()), bufferStorage.getPendingBytes())) {
                    bufferStorage.rollOver();
                }
            }
        }
        // 如果是CancelCheckpointMarker类型,处理该消息
        else if (bufferOrEvent.getEvent().getClass() == CancelCheckpointMarker.class) {
            if (barrierHandler.processCancellationBarrier((CancelCheckpointMarker) bufferOrEvent.getEvent())) {
                bufferStorage.rollOver();
            }
        }
        else {
            if (bufferOrEvent.getEvent().getClass() == EndOfPartitionEvent.class) {
                if (barrierHandler.processEndOfPartition()) {
                    bufferStorage.rollOver();
                }
            }
            return next;
        }
    }
}

// CheckpointBarrierAligner
public boolean processBarrier(CheckpointBarrier receivedBarrier, int channelIndex, long bufferedBytes) throws Exception {
    final long barrierId = receivedBarrier.getId();

    // fast path for single channel cases
    // 只有一个输入Channel
    if (totalNumberOfInputChannels == 1) {
        // 调用notifyCheckpoint触发CK
        if (barrierId > currentCheckpointId) {
            // new checkpoint
            currentCheckpointId = barrierId;
            notifyCheckpoint(receivedBarrier, bufferedBytes, latestAlignmentDurationNanos);
        }
        return false;
    }

    boolean checkpointAborted = false;

    // -- general code path for multiple input channels --

    if (numBarriersReceived > 0) {
        // this is only true if some alignment is already progress and was not canceled
        // 不是首次接收到CheckpointBarrier
        if (barrierId == currentCheckpointId) {
            // regular case
            // 将该消息的channel block,并numBarriersReceived++
            onBarrier(channelIndex);
        }
        else if (barrierId > currentCheckpointId) {
            // we did not complete the current checkpoint, another started before
            LOG.warn("{}: Received checkpoint barrier for checkpoint {} before completing current checkpoint {}. " +
                    "Skipping current checkpoint.",
                taskName,
                barrierId,
                currentCheckpointId);

            // let the task know we are not completing this
            notifyAbort(currentCheckpointId,
                new CheckpointException(
                    "Barrier id: " + barrierId,
                    CheckpointFailureReason.CHECKPOINT_DECLINED_SUBSUMED));
            
            // 对齐之前的CK
            // abort the current checkpoint
            releaseBlocksAndResetBarriers();
            checkpointAborted = true;
            
            // 进行新一次的CK
            // begin a the new checkpoint
            beginNewAlignment(barrierId, channelIndex);
        }
        else {
            // ignore trailing barrier from an earlier checkpoint (obsolete now)
            return false;
        }
    }
    else if (barrierId > currentCheckpointId) {
        // 首次接收到CK,开启新的对齐操作,将currentCheckpoinitId设置为barrierId
        // 并将该消息的channel block
        // numBarriersReceived++
        // first barrier of a new checkpoint
        beginNewAlignment(barrierId, channelIndex);
    }
    else {
        // either the current checkpoint was canceled (numBarriers == 0) or
        // this barrier is from an old subsumed checkpoint
        return false;
    }

    // check if we have all barriers - since canceled checkpoints always have zero barriers
    // this can only happen on a non canceled checkpoint
    // 对齐完成
    if (numBarriersReceived + numClosedChannels == totalNumberOfInputChannels) {
        // actually trigger checkpoint
        if (LOG.isDebugEnabled()) {
            LOG.debug("{}: Received all barriers, triggering checkpoint {} at {}.",
                taskName,
                receivedBarrier.getId(),
                receivedBarrier.getTimestamp());
        }
        // 直接将blockedChannels均设置为非block状态
        // numBarriersReceived设置为0
        // 调用notifyCheckpoint触发CK
        releaseBlocksAndResetBarriers();
        notifyCheckpoint(receivedBarrier, bufferedBytes, latestAlignmentDurationNanos);
        return true;
    }
    return checkpointAborted;
}
```

---

## CK执行完成后的上报
### 上报逻辑
```java
// StreamTask,本章前面异步执行时有提到当CK同步完成后,会将CK状态上报给JobManager
private void reportCompletedSnapshotStates(
        TaskStateSnapshot acknowledgedTaskStateSnapshot,
        TaskStateSnapshot localTaskStateSnapshot,
        long asyncDurationMillis) {

    TaskStateManager taskStateManager = owner.getEnvironment().getTaskStateManager();

    boolean hasAckState = acknowledgedTaskStateSnapshot.hasState();
    boolean hasLocalState = localTaskStateSnapshot.hasState();

    Preconditions.checkState(hasAckState || !hasLocalState,
        "Found cached state but no corresponding primary state is reported to the job " +
            "manager. This indicates a problem.");

    // we signal stateless tasks by reporting null, so that there are no attempts to assign empty state
    // to stateless tasks on restore. This enables simple job modifications that only concern
    // stateless without the need to assign them uids to match their (always empty) states.
    taskStateManager.reportTaskStateSnapshots(
        checkpointMetaData,
        checkpointMetrics,
        hasAckState ? acknowledgedTaskStateSnapshot : null,
        hasLocalState ? localTaskStateSnapshot : null);

    ...
}
// TaskStateManagerImpl
public void reportTaskStateSnapshots(@Nonnull CheckpointMetaData checkpointMetaData, @Nonnull CheckpointMetrics checkpointMetrics, @Nullable TaskStateSnapshot acknowledgedState, @Nullable TaskStateSnapshot localState) {
    long checkpointId = checkpointMetaData.getCheckpointId();
    this.localStateStore.storeLocalState(checkpointId, localState);
    // jobId,执行Id,ckId,ck指标,acknowledgeState
    this.checkpointResponder.acknowledgeCheckpoint(this.jobId, this.executionAttemptID, checkpointId, checkpointMetrics, acknowledgedState);
}
```
### JobManager接收处理逻辑
```java
// CheckpointCoordinator
public boolean receiveAcknowledgeMessage(AcknowledgeCheckpoint message, String taskManagerLocationInfo) throws CheckpointException {
    if (shutdown || message == null) {
        return false;
    }

    if (!job.equals(message.getJob())) {
        LOG.error("Received wrong AcknowledgeCheckpoint message for job {} from {} : {}", job, taskManagerLocationInfo, message);
        return false;
    }

    final long checkpointId = message.getCheckpointId();

    synchronized (lock) {
        // we need to check inside the lock for being shutdown as well, otherwise we
        // get races and invalid error log messages
        if (shutdown) {
            return false;
        }

        final PendingCheckpoint checkpoint = pendingCheckpoints.get(checkpointId);

        if (checkpoint != null && !checkpoint.isDiscarded()) {
            // acknowledgeTask对一些状态进行清理
            // 根据不同情况返回不同的状态
            switch (checkpoint.acknowledgeTask(message.getTaskExecutionId(), message.getSubtaskState(), message.getCheckpointMetrics())) {
                // 根据不同的返回状态进行响应处理
                case SUCCESS:
                    LOG.debug("Received acknowledge message for checkpoint {} from task {} of job {} at {}.",
                        checkpointId, message.getTaskExecutionId(), message.getJob(), taskManagerLocationInfo);

                    if (checkpoint.areTasksFullyAcknowledged()) {
                        // 所有的Task都反馈了Ack信息
                        completePendingCheckpoint(checkpoint);
                    }
                    break;
                case DUPLICATE:
                    ...
                case UNKNOWN:
                    ...
                case DISCARDED:
                    ...
            }

            return true;
        }
        else if (checkpoint != null) {
            ...
        }
    }
}
private void completePendingCheckpoint(PendingCheckpoint pendingCheckpoint) throws CheckpointException {
    final long checkpointId = pendingCheckpoint.getCheckpointId();
    final CompletedCheckpoint completedCheckpoint;

    // As a first step to complete the checkpoint, we register its state with the registry
    Map<OperatorID, OperatorState> operatorStates = pendingCheckpoint.getOperatorStates();
    sharedStateRegistry.registerAll(operatorStates.values());

    try {
        try {
            completedCheckpoint = pendingCheckpoint.finalizeCheckpoint();
            failureManager.handleCheckpointSuccess(pendingCheckpoint.getCheckpointId());
        }
        catch (Exception e1) {
            ...
        }

        // 完成后必须放弃挂起的CK
        Preconditions.checkState(pendingCheckpoint.isDiscarded() && completedCheckpoint != null);

        try {
            completedCheckpointStore.addCheckpoint(completedCheckpoint);
        } catch (Exception exception) {
            ...
        }
    } finally {
        pendingCheckpoints.remove(checkpointId);

        triggerQueuedRequests();
    }

    rememberRecentCheckpointId(checkpointId);

    // 删除在完成CK之前挂起的CK
    dropSubsumedCheckpoints(checkpointId);

    // 记录完成此操作的时间,以计算检查点之间的最小延迟
    lastCheckpointCompletionRelativeTime = clock.relativeTimeMillis();
    
    LOG.info("Completed checkpoint {} for job {} ({} bytes in {} ms).", checkpointId, job,
        completedCheckpoint.getStateSize(), completedCheckpoint.getDuration());

    if (LOG.isDebugEnabled()) {
        StringBuilder builder = new StringBuilder();
        builder.append("Checkpoint state: ");
        for (OperatorState state : completedCheckpoint.getOperatorStates().values()) {
            builder.append(state);
            builder.append(", ");
        }
        // Remove last two chars ", "
        builder.setLength(builder.length() - 2);

        LOG.debug(builder.toString());
    }

    // 向所有vertices发送完成通知
    final long timestamp = completedCheckpoint.getTimestamp();

    for (ExecutionVertex ev : tasksToCommitTo) {
        Execution ee = ev.getCurrentExecutionAttempt();
        if (ee != null) {
            // 通知CK完成
            ee.notifyCheckpointComplete(checkpointId, timestamp);
        }
    }
}
```