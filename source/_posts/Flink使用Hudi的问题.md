---
title: Flink使用Hudi的问题
date: 2021-05-14 20:22:26
categories: 大数据
tags: 
    - flink
    - hudi
---

> 真的是坑居多...

<!-- more -->

> 主要还是状态的存储以及合并删除操作对连接不友好

## 记录
```
# 这个问题,真的是莫名其妙,看了源码,逻辑是没有问题的,不知道为什么会报越界
java.lang.ArrayIndexOutOfBoundsException: -1
    at java.util.ArrayList.elementData(ArrayList.java:424) ~[?:1.8.0_281]
    at java.util.ArrayList.get(ArrayList.java:437) ~[?:1.8.0_281]
    at org.apache.hudi.table.format.mor.MergeOnReadInputFormat.lambda$getReader$0(MergeOnReadInputFormat.java:280) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at java.util.LinkedHashMap.forEach(LinkedHashMap.java:684) ~[?:1.8.0_281]
    at org.apache.hudi.table.format.mor.MergeOnReadInputFormat.getReader(MergeOnReadInputFormat.java:278) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.format.mor.MergeOnReadInputFormat.open(MergeOnReadInputFormat.java:173) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.source.StreamReadOperator.processSplits(StreamReadOperator.java:159) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.flink.streaming.runtime.tasks.StreamTaskActionExecutor$1.runThrowing(StreamTaskActionExecutor.java:50) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.mailbox.Mail.run(Mail.java:90) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.mailbox.MailboxProcessor.processMail(MailboxProcessor.java:297) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.mailbox.MailboxProcessor.runMailboxLoop(MailboxProcessor.java:189) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.runMailboxLoop(StreamTask.java:617) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.invoke(StreamTask.java:581) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.doRun(Task.java:755) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.run(Task.java:570) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at java.lang.Thread.run(Thread.java:748) ~[?:1.8.0_281]
    

# 这个,使用rocksdb作为状态后端时会出现该问题,并且频繁出现
# 个人推测与commit生成或clean动作有关
java.io.IOException: Cannot connect to the client to send back the stream
    at org.apache.flink.streaming.experimental.CollectSink.open(CollectSink.java:86) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.api.common.functions.util.FunctionUtils.openFunction(FunctionUtils.java:34) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractUdfStreamOperator.open(AbstractUdfStreamOperator.java:102) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamSink.open(StreamSink.java:46) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.OperatorChain.initializeStateAndOpenOperators(OperatorChain.java:428) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.lambda$beforeInvoke$2(StreamTask.java:543) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTaskActionExecutor$1.runThrowing(StreamTaskActionExecutor.java:50) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.beforeInvoke(StreamTask.java:533) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.invoke(StreamTask.java:573) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.doRun(Task.java:755) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.run(Task.java:570) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at java.lang.Thread.run(Thread.java:748) ~[?:1.8.0_281]
    Caused by: java.net.ConnectException: Connection refused (Connection refused)
    at java.net.PlainSocketImpl.socketConnect(Native Method) ~[?:1.8.0_281]
    at java.net.AbstractPlainSocketImpl.doConnect(AbstractPlainSocketImpl.java:476) ~[?:1.8.0_281]
    at java.net.AbstractPlainSocketImpl.connectToAddress(AbstractPlainSocketImpl.java:218) ~[?:1.8.0_281]
    at java.net.AbstractPlainSocketImpl.connect(AbstractPlainSocketImpl.java:200) ~[?:1.8.0_281]
    at java.net.SocksSocketImpl.connect(SocksSocketImpl.java:394) ~[?:1.8.0_281]
    at java.net.Socket.connect(Socket.java:606) ~[?:1.8.0_281]
    at java.net.Socket.connect(Socket.java:555) ~[?:1.8.0_281]
    at java.net.Socket.<init>(Socket.java:451) ~[?:1.8.0_281]
    at java.net.Socket.<init>(Socket.java:261) ~[?:1.8.0_281]
    at org.apache.flink.streaming.experimental.CollectSink.open(CollectSink.java:82) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    ... 11 more
    
# 改为filesystem状态后端则会出现这种情况(这个应该是因为我内存不足导致的)
java.io.IOException: Could not perform checkpoint 22 for operator hoodie_stream_write (1/1)#2.
    at org.apache.flink.streaming.runtime.tasks.StreamTask.triggerCheckpointOnBarrier(StreamTask.java:963) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.CheckpointBarrierHandler.notifyCheckpoint(CheckpointBarrierHandler.java:115) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.SingleCheckpointBarrierHandler.processBarrier(SingleCheckpointBarrierHandler.java:156) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.CheckpointedInputGate.handleEvent(CheckpointedInputGate.java:180) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.CheckpointedInputGate.pollNext(CheckpointedInputGate.java:157) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.StreamTaskNetworkInput.emitNext(StreamTaskNetworkInput.java:179) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.io.StreamOneInputProcessor.processInput(StreamOneInputProcessor.java:65) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.processInput(StreamTask.java:396) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.mailbox.MailboxProcessor.runMailboxLoop(MailboxProcessor.java:191) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.runMailboxLoop(StreamTask.java:617) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.invoke(StreamTask.java:581) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.doRun(Task.java:755) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.runtime.taskmanager.Task.run(Task.java:570) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at java.lang.Thread.run(Thread.java:748) ~[?:1.8.0_281]
Caused by: org.apache.flink.runtime.checkpoint.CheckpointException: Could not complete snapshot 22 for operator hoodie_stream_write (1/1)#2. Failure reason: Checkpoint was declined.
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:241) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:162) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractStreamOperator.snapshotState(AbstractStreamOperator.java:371) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.checkpointStreamOperator(SubtaskCheckpointCoordinatorImpl.java:686) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.buildOperatorSnapshotFutures(SubtaskCheckpointCoordinatorImpl.java:607) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.takeSnapshotSync(SubtaskCheckpointCoordinatorImpl.java:572) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.checkpointState(SubtaskCheckpointCoordinatorImpl.java:298) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.lambda$performCheckpoint$9(StreamTask.java:1004) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTaskActionExecutor$1.runThrowing(StreamTaskActionExecutor.java:50) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.performCheckpoint(StreamTask.java:988) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.triggerCheckpointOnBarrier(StreamTask.java:947) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    ... 13 more
Caused by: org.apache.flink.util.SerializedThrowable: Error upserting bucketType UPDATE for partition :
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.handleUpsertPartition(BaseFlinkCommitActionExecutor.java:201) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.execute(BaseFlinkCommitActionExecutor.java:110) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.execute(BaseFlinkCommitActionExecutor.java:72) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.FlinkWriteHelper.write(FlinkWriteHelper.java:70) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.delta.FlinkUpsertDeltaCommitActionExecutor.execute(FlinkUpsertDeltaCommitActionExecutor.java:49) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.HoodieFlinkMergeOnReadTable.upsert(HoodieFlinkMergeOnReadTable.java:60) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.client.HoodieFlinkWriteClient.upsert(HoodieFlinkWriteClient.java:146) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction.lambda$initWriteFunction$1(StreamWriteFunction.java:260) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction.lambda$flushRemaining$6(StreamWriteFunction.java:459) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at java.util.LinkedHashMap$LinkedValues.forEach(LinkedHashMap.java:608) ~[?:1.8.0_281]
    at org.apache.hudi.sink.StreamWriteFunction.flushRemaining(StreamWriteFunction.java:453) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction.snapshotState(StreamWriteFunction.java:192) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.flink.streaming.util.functions.StreamingFunctionUtils.trySnapshotFunctionState(StreamingFunctionUtils.java:118) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.util.functions.StreamingFunctionUtils.snapshotFunctionState(StreamingFunctionUtils.java:99) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractUdfStreamOperator.snapshotState(AbstractUdfStreamOperator.java:89) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:205) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:162) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractStreamOperator.snapshotState(AbstractStreamOperator.java:371) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.checkpointStreamOperator(SubtaskCheckpointCoordinatorImpl.java:686) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.buildOperatorSnapshotFutures(SubtaskCheckpointCoordinatorImpl.java:607) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.takeSnapshotSync(SubtaskCheckpointCoordinatorImpl.java:572) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.SubtaskCheckpointCoordinatorImpl.checkpointState(SubtaskCheckpointCoordinatorImpl.java:298) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.lambda$performCheckpoint$9(StreamTask.java:1004) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTaskActionExecutor$1.runThrowing(StreamTaskActionExecutor.java:50) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.performCheckpoint(StreamTask.java:988) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.runtime.tasks.StreamTask.triggerCheckpointOnBarrier(StreamTask.java:947) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    ... 13 more
Caused by: org.apache.flink.util.SerializedThrowable: Java heap space
    at java.util.Arrays.copyOf(Arrays.java:3236) ~[?:1.8.0_281]
    at java.io.ByteArrayOutputStream.grow(ByteArrayOutputStream.java:118) ~[?:1.8.0_281]
    at java.io.ByteArrayOutputStream.ensureCapacity(ByteArrayOutputStream.java:93) ~[?:1.8.0_281]
    at java.io.ByteArrayOutputStream.write(ByteArrayOutputStream.java:153) ~[?:1.8.0_281]
    at java.io.DataOutputStream.write(DataOutputStream.java:107) ~[?:1.8.0_281]
    at java.io.FilterOutputStream.write(FilterOutputStream.java:97) ~[?:1.8.0_281]
    at org.apache.hudi.common.table.log.block.HoodieAvroDataBlock.serializeRecords(HoodieAvroDataBlock.java:114) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.common.table.log.block.HoodieDataBlock.getContentBytes(HoodieDataBlock.java:97) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.common.table.log.HoodieLogFormatWriter.appendBlocks(HoodieLogFormatWriter.java:164) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.io.HoodieAppendHandle.appendDataAndDeleteBlocks(HoodieAppendHandle.java:349) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.io.HoodieAppendHandle.doAppend(HoodieAppendHandle.java:332) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.delta.BaseFlinkDeltaCommitActionExecutor.handleUpdate(BaseFlinkDeltaCommitActionExecutor.java:55) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.handleUpsertPartition(BaseFlinkCommitActionExecutor.java:194) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.execute(BaseFlinkCommitActionExecutor.java:110) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.BaseFlinkCommitActionExecutor.execute(BaseFlinkCommitActionExecutor.java:72) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.FlinkWriteHelper.write(FlinkWriteHelper.java:70) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.action.commit.delta.FlinkUpsertDeltaCommitActionExecutor.execute(FlinkUpsertDeltaCommitActionExecutor.java:49) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.table.HoodieFlinkMergeOnReadTable.upsert(HoodieFlinkMergeOnReadTable.java:60) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.client.HoodieFlinkWriteClient.upsert(HoodieFlinkWriteClient.java:146) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction.lambda$initWriteFunction$1(StreamWriteFunction.java:260) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction$$Lambda$499/1784817951.apply(Unknown Source) ~[?:?]
    at org.apache.hudi.sink.StreamWriteFunction.lambda$flushRemaining$6(StreamWriteFunction.java:459) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction$$Lambda$659/1589969316.accept(Unknown Source) ~[?:?]
    at java.util.LinkedHashMap$LinkedValues.forEach(LinkedHashMap.java:608) ~[?:1.8.0_281]
    at org.apache.hudi.sink.StreamWriteFunction.flushRemaining(StreamWriteFunction.java:453) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.hudi.sink.StreamWriteFunction.snapshotState(StreamWriteFunction.java:192) ~[hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar:0.9.0-SNAPSHOT]
    at org.apache.flink.streaming.util.functions.StreamingFunctionUtils.trySnapshotFunctionState(StreamingFunctionUtils.java:118) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.util.functions.StreamingFunctionUtils.snapshotFunctionState(StreamingFunctionUtils.java:99) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractUdfStreamOperator.snapshotState(AbstractUdfStreamOperator.java:89) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:205) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.StreamOperatorStateHandler.snapshotState(StreamOperatorStateHandler.java:162) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
    at org.apache.flink.streaming.api.operators.AbstractStreamOperator.snapshotState(AbstractStreamOperator.java:371) ~[flink-dist_2.11-1.12.2.jar:1.12.2]
```