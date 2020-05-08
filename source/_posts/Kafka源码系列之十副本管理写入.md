---
title: Kafka源码系列之十副本管理写入
date: 2020-05-08 09:15:54
categories: 大数据
tags: kafka
---

> 介绍Server端接收到Produce请求,是如何进行处理的,处理之后分片是如何产生的

<!-- more -->

## Client端发送Produce请求
```
在第一章有详细描述,Producer是如何向Server发送请求的
主要是在Sender.sendProduceRequests()方法中实现
发送List<ProducerBatch> batches
```

---

## Server端处理Produce请求
```
在之前的章节里,可以知道Server端Broker在收到Produce请求后
会有一个KafkaApis进行处理,它是Server端处理所有请求的入口
KafkaApis.PRODUCE -> handleProduceRequest()
```
### handleProduceRequest
整体为,查看topic是否存在,client是否有相应的Describe权限
对于已经有Describe权限的topic查看是否有Write权限
调用replicaManager.appendRecords()方法向有Write权限的tp追加相应的record
```scala
def handleProduceRequest(request: RequestChannel.Request) {
    val produceRequest = request.body[ProduceRequest]
    val numBytesAppended = request.header.toStruct.sizeOf + request.sizeOfBodyInBytes

    if (produceRequest.isTransactional) {
      // 事务授权失败
      if (!authorize(request.session, Write, Resource(TransactionalId, produceRequest.transactionalId, LITERAL))) {
        sendErrorResponseMaybeThrottle(request, Errors.TRANSACTIONAL_ID_AUTHORIZATION_FAILED.exception)
        return
      }
      // Note that authorization to a transactionalId implies ProducerId authorization

    // 集群授权失败
    } else if (produceRequest.isIdempotent && !authorize(request.session, IdempotentWrite, Resource.ClusterResource)) {
      sendErrorResponseMaybeThrottle(request, Errors.CLUSTER_AUTHORIZATION_FAILED.exception)
      return
    }

    // 没有Describe权限
    val unauthorizedTopicResponses = mutable.Map[TopicPartition, PartitionResponse]()
    // 不存在
    val nonExistingTopicResponses = mutable.Map[TopicPartition, PartitionResponse]()
    // 有权限
    val authorizedRequestInfo = mutable.Map[TopicPartition, MemoryRecords]()
    
    // 进行筛选,判断有没有Write权限
    for ((topicPartition, memoryRecords) <- produceRequest.partitionRecordsOrFail.asScala) {
      if (!authorize(request.session, Write, Resource(Topic, topicPartition.topic, LITERAL)))
        unauthorizedTopicResponses += topicPartition -> new PartitionResponse(Errors.TOPIC_AUTHORIZATION_FAILED)
      else if (!metadataCache.contains(topicPartition))
        nonExistingTopicResponses += topicPartition -> new PartitionResponse(Errors.UNKNOWN_TOPIC_OR_PARTITION)
      else
        authorizedRequestInfo += (topicPartition -> memoryRecords)
    }

    // the callback for sending a produce response
    // 回调函数
    def sendResponseCallback(responseStatus: Map[TopicPartition, PartitionResponse]) {
      val mergedResponseStatus = responseStatus ++ unauthorizedTopicResponses ++ nonExistingTopicResponses
      var errorInResponse = false

      mergedResponseStatus.foreach { case (topicPartition, status) =>
        if (status.error != Errors.NONE) {
          errorInResponse = true
          debug("Produce request with correlation id %d from client %s on partition %s failed due to %s".format(
            request.header.correlationId,
            request.header.clientId,
            topicPartition,
            status.error.exceptionName))
        }
      }

      // When this callback is triggered, the remote API call has completed
      request.apiRemoteCompleteTimeNanos = time.nanoseconds

      // Record both bandwidth and request quota-specific values and throttle by muting the channel if any of the quotas
      // have been violated. If both quotas have been violated, use the max throttle time between the two quotas. Note
      // that the request quota is not enforced if acks == 0.
      val bandwidthThrottleTimeMs = quotas.produce.maybeRecordAndGetThrottleTimeMs(request, numBytesAppended, time.milliseconds())
      val requestThrottleTimeMs = if (produceRequest.acks == 0) 0 else quotas.request.maybeRecordAndGetThrottleTimeMs(request)
      val maxThrottleTimeMs = Math.max(bandwidthThrottleTimeMs, requestThrottleTimeMs)
      if (maxThrottleTimeMs > 0) {
        if (bandwidthThrottleTimeMs > requestThrottleTimeMs) {
          quotas.produce.throttle(request, bandwidthThrottleTimeMs, sendResponse)
        } else {
          quotas.request.throttle(request, requestThrottleTimeMs, sendResponse)
        }
      }

      // 立即发送响应,如果进行限制,则channel已经mute
      if (produceRequest.acks == 0) {
        // 因为设置的ack=0,相当于client会默认发送成功,如果server在处理过程出现错误,会关闭socket连接来间接通知client
        // client会重新刷新meta,重新建立相应的连接
        if (errorInResponse) {
          val exceptionsSummary = mergedResponseStatus.map { case (topicPartition, status) =>
            topicPartition -> status.error.exceptionName
          }.mkString(", ")
          info(
            s"Closing connection due to error during produce request with correlation id ${request.header.correlationId} " +
              s"from client id ${request.header.clientId} with ack=0\n" +
              s"Topic and partition to exceptions: $exceptionsSummary"
          )
          closeConnection(request, new ProduceResponse(mergedResponseStatus.asJava).errorCounts)
        } else {
          // Note that although request throttling is exempt for acks == 0, the channel may be throttled due to
          // bandwidth quota violation.
          sendNoOpResponseExemptThrottle(request)
        }
      } else {
        sendResponse(request, Some(new ProduceResponse(mergedResponseStatus.asJava, maxThrottleTimeMs)), None)
      }
    }

    def processingStatsCallback(processingStats: FetchResponseStats): Unit = {
      processingStats.foreach { case (tp, info) =>
        updateRecordConversionStats(request, tp, info)
      }
    }

    if (authorizedRequestInfo.isEmpty)
      sendResponseCallback(Map.empty)
    else {
      val internalTopicsAllowed = request.header.clientId == AdminUtils.AdminClientId

      // call the replica manager to append messages to the replicas
      // 追加Record,写入
      replicaManager.appendRecords(
        timeout = produceRequest.timeout.toLong,
        requiredAcks = produceRequest.acks,
        internalTopicsAllowed = internalTopicsAllowed,
        isFromClient = true,
        entriesPerPartition = authorizedRequestInfo,
        responseCallback = sendResponseCallback,
        recordConversionStatsCallback = processingStatsCallback)

      // if the request is put into the purgatory, it will have a held reference and hence cannot be garbage collected;
      // hence we clear its data here in order to let GC reclaim its memory since it is already appended to log
      produceRequest.clearPartitionRecords()
    }
}
```
### ReplicaManager
```
副本管理器,一个副本对应一个Log对象
KafkaServer启动时,会创建ReplicaManager对象
ReplicaManager并不负责具体的日志创建,只是管理Broker上的所有分区
在创建Partition对象时,需要ReplicaManager的LogManager对象
Partition会通过这个LogManager对象为每个Replica创建相应的日志

// 注意replicaManager与logManager的来源
object Partition {
  def apply(topicPartition: TopicPartition,
            time: Time,
            replicaManager: ReplicaManager): Partition = {
    new Partition(topicPartition,
      isOffline = false,
      replicaLagTimeMaxMs = replicaManager.config.replicaLagTimeMaxMs,
      localBrokerId = replicaManager.config.brokerId,
      time = time,
      replicaManager = replicaManager,
      logManager = replicaManager.logManager,
      zkClient = replicaManager.zkClient)
  }
}

ReplicaManager与LogManager的对比
LogManager管理Log,由LogSegment组成
ReplicaManager管理Partition,由Replica组成

replicaManager = createReplicaManager(isShuttingDown)
replicaManager.startup()

// 传递了LogManager
protected def createReplicaManager(isShuttingDown: AtomicBoolean): ReplicaManager =
    new ReplicaManager(config, metrics, time, zkClient, kafkaScheduler, logManager, isShuttingDown, quotaManagers,
      brokerTopicStats, metadataCache, logDirFailureChannel)
```
#### appendRecords
```scala
1.判断acks设置是否有效(-1,0,1),无效直接返回异常,不再处理
2.有效,调用appendToLocalLog()将records追加到本地对应的Log对象中
3.appendToLocalLog()处理完后,如果发现clients设置的acks=-1,则需要isr的其他副本同步完成才能返回Response
    那么就会创建一个DelayedProduce对象,等待isr其他副本进行同步
    否则直接返回追加的结果

// 向partition的leader写入数据
def appendRecords(timeout: Long,
                    requiredAcks: Short,
                    internalTopicsAllowed: Boolean,
                    isFromClient: Boolean,
                    entriesPerPartition: Map[TopicPartition, MemoryRecords],
                    responseCallback: Map[TopicPartition, PartitionResponse] => Unit,
                    delayedProduceLock: Option[Lock] = None,
                    recordConversionStatsCallback: Map[TopicPartition, RecordConversionStats] => Unit = _ => ()) {
    if (isValidRequiredAcks(requiredAcks)) { // acks设置有效
      val sTime = time.milliseconds
      // 向本地的副本log追加数据
      val localProduceResults = appendToLocalLog(internalTopicsAllowed = internalTopicsAllowed,
        isFromClient = isFromClient, entriesPerPartition, requiredAcks)
      debug("Produce to local log in %d ms".format(time.milliseconds - sTime))

      val produceStatus = localProduceResults.map { case (topicPartition, result) =>
        topicPartition ->
                ProducePartitionStatus(
                  result.info.lastOffset + 1, // required offset
                  new PartitionResponse(result.error, result.info.firstOffset.getOrElse(-1), result.info.logAppendTime, result.info.logStartOffset)) // response status
      }

      recordConversionStatsCallback(localProduceResults.mapValues(_.info.recordConversionStats))

      if (delayedProduceRequestRequired(requiredAcks, entriesPerPartition, localProduceResults)) {
        // 处理ack=-1的情况,需要等到isr的follower都写入成功,才能返回最后结果
        // create delayed produce operation
        val produceMetadata = ProduceMetadata(requiredAcks, produceStatus)
        // 延迟produce请求
        val delayedProduce = new DelayedProduce(timeout, produceMetadata, this, responseCallback, delayedProduceLock)

        // create a list of (topic, partition) pairs to use as keys for this delayed produce operation
        val producerRequestKeys = entriesPerPartition.keys.map(new TopicPartitionOperationKey(_)).toSeq

        // try to complete the request immediately, otherwise put it into the purgatory
        // this is because while the delayed produce operation is being created, new
        // requests may arrive and hence make this operation completable.
        delayedProducePurgatory.tryCompleteElseWatch(delayedProduce, producerRequestKeys)

      } else {
        // we can respond immediately
        val produceResponseStatus = produceStatus.mapValues(status => status.responseStatus)
        // 通过回调函数直接返回结果
        responseCallback(produceResponseStatus)
      }
    } else {
      // 返回INVALID_REQUIRED_ACKS错误
      // If required.acks is outside accepted range, something is wrong with the client
      // Just return an error and don't handle the request at all
      val responseStatus = entriesPerPartition.map { case (topicPartition, _) =>
        topicPartition -> new PartitionResponse(Errors.INVALID_REQUIRED_ACKS,
          LogAppendInfo.UnknownLogAppendInfo.firstOffset.getOrElse(-1), RecordBatch.NO_TIMESTAMP, LogAppendInfo.UnknownLogAppendInfo.logStartOffset)
      }
      responseCallback(responseStatus)
    }
}
```
#### appendToLocalLog()
```scala
1.首先判断要写入的topic是不是kafka内置的topic,内置topic不允许Producer写入
2.查找TP对应的Partition对象,如果在allPartitions中查找到了对应的Partition
    直接调用partition.appendRecordsToLeader()追加相应的records
    否则向client抛出异常

// 向本地的Replica写入数据
private def appendToLocalLog(internalTopicsAllowed: Boolean,
                               isFromClient: Boolean,
                               entriesPerPartition: Map[TopicPartition, MemoryRecords],
                               requiredAcks: Short): Map[TopicPartition, LogAppendResult] = {
    trace(s"Append [$entriesPerPartition] to local log")
    entriesPerPartition.map { case (topicPartition, records) =>
      // 遍历要写的所哦呦tp
      brokerTopicStats.topicStats(topicPartition.topic).totalProduceRequestRate.mark()
      brokerTopicStats.allTopicsStats.totalProduceRequestRate.mark()

      // 不允许向kafka内部使用的topic追加数据
      if (Topic.isInternal(topicPartition.topic) && !internalTopicsAllowed) {
        (topicPartition, LogAppendResult(
          LogAppendInfo.UnknownLogAppendInfo,
          Some(new InvalidTopicException(s"Cannot append to internal topic ${topicPartition.topic}"))))
      } else {
        try {
          // 查找对应的Partition,并向分区对应的副本写入数据文件
          val partition = getPartitionOrException(topicPartition, expectLeader = true)
          // 追加数据
          val info = partition.appendRecordsToLeader(records, isFromClient, requiredAcks)
          val numAppendedMessages = info.numMessages

          // 更新Metrics
          brokerTopicStats.topicStats(topicPartition.topic).bytesInRate.mark(records.sizeInBytes)
          brokerTopicStats.allTopicsStats.bytesInRate.mark(records.sizeInBytes)
          brokerTopicStats.topicStats(topicPartition.topic).messagesInRate.mark(numAppendedMessages)
          brokerTopicStats.allTopicsStats.messagesInRate.mark(numAppendedMessages)

          trace(s"${records.sizeInBytes} written to log $topicPartition beginning at offset " +
            s"${info.firstOffset.getOrElse(-1)} and ending at offset ${info.lastOffset}")
          (topicPartition, LogAppendResult(info))
        } catch {
          // 处理追加过程中的异常
          // NOTE: Failed produce requests metric is not incremented for known exceptions
          // it is supposed to indicate un-expected failures of a broker in handling a produce request
          case e@ (_: UnknownTopicOrPartitionException |
                   _: NotLeaderForPartitionException |
                   _: RecordTooLargeException |
                   _: RecordBatchTooLargeException |
                   _: CorruptRecordException |
                   _: KafkaStorageException |
                   _: InvalidTimestampException) =>
            (topicPartition, LogAppendResult(LogAppendInfo.UnknownLogAppendInfo, Some(e)))
          case t: Throwable =>
            val logStartOffset = getPartition(topicPartition) match {
              case Some(partition) =>
                partition.logStartOffset
              case _ =>
                -1
            }
            brokerTopicStats.topicStats(topicPartition.topic).failedProduceRequestRate.mark()
            brokerTopicStats.allTopicsStats.failedProduceRequestRate.mark()
            error(s"Error processing append operation on partition $topicPartition", t)
            (topicPartition, LogAppendResult(LogAppendInfo.unknownLogAppendInfoWithLogStartOffset(logStartOffset), Some(t)))
        }
      }
    }
}
```
#### Partition.appendRecordsToLeader()
```scala
// 根据topic的min.isrs配置以及当前这个partition的isr情况判断是否可以写入
// 如果不满足条件,抛出NotEnoughReplicasException
// 满足,调用log.append()向replica追加日志

def appendRecordsToLeader(records: MemoryRecords, isFromClient: Boolean, requiredAcks: Int = 0): LogAppendInfo = {
    val (info, leaderHWIncremented) = inReadLock(leaderIsrUpdateLock) {
      leaderReplicaIfLocal match {
        case Some(leaderReplica) =>
          // 获取对应的Log对象
          val log = leaderReplica.log.get
          val minIsr = log.config.minInSyncReplicas
          val inSyncSize = inSyncReplicas.size

          // Avoid writing to leader if there are not enough insync replicas to make it safe
          // 如果ack设置为-1,isr数小于设置的min.isr时,会向producer抛出异常
          if (inSyncSize < minIsr && requiredAcks == -1) {
            throw new NotEnoughReplicasException(s"The size of the current ISR ${inSyncReplicas.map(_.brokerId)} " +
              s"is insufficient to satisfy the min.isr requirement of $minIsr for partition $topicPartition")
          }

          // 向副本对应的log追加相应的数据
          val info = log.appendAsLeader(records, leaderEpoch = this.leaderEpoch, isFromClient)
          // probably unblock some follower fetch requests since log end offset has been updated
          replicaManager.tryCompleteDelayedFetch(TopicPartitionOperationKey(this.topic, this.partitionId))
          // we may need to increment high watermark since ISR could be down to 1
          // 判断是否需要增加HW(追加日志后会进行一次判断)
          (info, maybeIncrementLeaderHW(leaderReplica))

        case None =>
          // leader不在本台机器上
          throw new NotLeaderForPartitionException("Leader not local for partition %s on broker %d"
            .format(topicPartition, localBrokerId))
      }
    }

    // some delayed operations may be unblocked after HW changed
    if (leaderHWIncremented)
      tryCompleteDelayedRequests()

    info
}
```

---

## 存储层
### Log对象
```scala
每个Replica都会对应一个Log对象,Log对象是管理当前分区的一个单位
它会包含这个分区的所有Segment文件(包括索引,时间戳索引文件)
提供增删查方法

nextOffsetMetadata: 下一个偏移量元数据,包括activeSegment的下一条消息的偏移量,该activeSegment的基准偏移量及日志分段的大小
activeSegment: Log管理segments中最新segment,一个Log只会有一个activeSegment,其他的segment已经持久化到磁盘了
logEndOffset: 下一条消息的offset,取自nextOffsetMetadata的offset

// 声明为volatile,如果该值被修改,其他使用此变量的线程就可以立刻见到变化后的值,在生产和消费都会使用到这个值
@volatile private var nextOffsetMetadata: LogOffsetMetadata = _
// 下一个偏移量元数据
// 第一个参数: 下一条消息的偏移量
// 第二个参数: 日志分段的基准偏移量
// 第三个参数: 日志分段大小
nextOffsetMetadata = new LogOffsetMetadata(nextOffset, activeSegment.baseOffset, activeSegment.size)

// 只会有一个活动的日志分段
def activeSegment = segments.lastEntry.getValue

// 下一条消息的offset,从nextOffsetMetadata获取
def logEndOffset: Long = nextOffsetMetadata.messageOffset
```
#### 日志写入
```scala
analyzeAndValidateRecords(): 对这批要写入的消息进行检测,检查消息的大小以及校验
trimInvalidBytes(): 删除无效消息
LogValidator.validateMessagesAndAssignOffsets(): 设置相应的offset和timestrap
maybeRoll(): 判断是否需要新建一个segment,如果当前segment放不下这批消息的话,需要新建
segment.append(): 向segment添加信息
updateLogEndOffset(): 更新LEO
flush(): 刷新磁盘

时间戳记录有两种
    CreateTime: 默认,创建时间
    LogAppendTime: 添加时间

// 向activeSegment追加log,必要的情况下,滚动创建新的segment
private def append(records: MemoryRecords, isFromClient: Boolean, assignOffsets: Boolean, leaderEpoch: Int): LogAppendInfo = {
    maybeHandleIOException(s"Error while appending records to $topicPartition in dir ${dir.getParent}") {
      // 返回这批消息的概要信息,并对其进行校验
      val appendInfo = analyzeAndValidateRecords(records, isFromClient = isFromClient)

      // return if we have no valid messages or if this is a duplicate of the last appended entry
      if (appendInfo.shallowCount == 0)
        return appendInfo

      // trim any invalid bytes or partial messages before appending it to the on-disk log
      // 删除无效信息
      var validRecords = trimInvalidBytes(records, appendInfo)

      // they are valid, insert them in the log
      lock synchronized {
        checkIfMemoryMappedBufferClosed()
        if (assignOffsets) {
          // assign offsets to the message set
          // 计算这个消息集的起始offset,对offset的操作是一个原子操作
          val offset = new LongRef(nextOffsetMetadata.messageOffset)
          // 作为消息集的第一个offset
          appendInfo.firstOffset = Some(offset.value)
          // 设置时间戳以server收到的时间戳为准
          val now = time.milliseconds
          // 验证消息,并为每条record设置相应的offset和timestrap
          val validateAndOffsetAssignResult = try {
            LogValidator.validateMessagesAndAssignOffsets(validRecords,
              offset,
              time,
              now,
              appendInfo.sourceCodec,
              appendInfo.targetCodec,
              config.compact,
              config.messageFormatVersion.recordVersion.value,
              config.messageTimestampType,
              config.messageTimestampDifferenceMaxMs,
              leaderEpoch,
              isFromClient)
          } catch {
            case e: IOException =>
              throw new KafkaException(s"Error validating messages while appending to log $name", e)
          }
          // 返回已经计算好的offset和timestrap的MemoryRecord
          validRecords = validateAndOffsetAssignResult.validatedRecords
          appendInfo.maxTimestamp = validateAndOffsetAssignResult.maxTimestamp
          appendInfo.offsetOfMaxTimestamp = validateAndOffsetAssignResult.shallowOffsetOfMaxTimestamp
          // 最后一条消息的offset
          appendInfo.lastOffset = offset.value - 1
          appendInfo.recordConversionStats = validateAndOffsetAssignResult.recordConversionStats
          if (config.messageTimestampType == TimestampType.LOG_APPEND_TIME)
            appendInfo.logAppendTime = now

          // re-validate message sizes if there's a possibility that they have changed (due to re-compression or message
          // format conversion)
          // 更新metrics记录
          if (validateAndOffsetAssignResult.messageSizeMaybeChanged) {
            for (batch <- validRecords.batches.asScala) {
              if (batch.sizeInBytes > config.maxMessageSize) {
                // we record the original message set size instead of the trimmed size
                // to be consistent with pre-compression bytesRejectedRate recording
                brokerTopicStats.topicStats(topicPartition.topic).bytesRejectedRate.mark(records.sizeInBytes)
                brokerTopicStats.allTopicsStats.bytesRejectedRate.mark(records.sizeInBytes)
                throw new RecordTooLargeException(s"Message batch size is ${batch.sizeInBytes} bytes in append to" +
                  s"partition $topicPartition which exceeds the maximum configured size of ${config.maxMessageSize}.")
              }
            }
          }
        } else {
          // we are taking the offsets we are given
          if (!appendInfo.offsetsMonotonic)
            throw new OffsetsOutOfOrderException(s"Out of order offsets found in append to $topicPartition: " +
                                                 records.records.asScala.map(_.offset))

          if (appendInfo.firstOrLastOffsetOfFirstBatch < nextOffsetMetadata.messageOffset) {
            // we may still be able to recover if the log is empty
            // one example: fetching from log start offset on the leader which is not batch aligned,
            // which may happen as a result of AdminClient#deleteRecords()
            val firstOffset = appendInfo.firstOffset match {
              case Some(offset) => offset
              case None => records.batches.asScala.head.baseOffset()
            }

            val firstOrLast = if (appendInfo.firstOffset.isDefined) "First offset" else "Last offset of the first batch"
            throw new UnexpectedAppendOffsetException(
              s"Unexpected offset in append to $topicPartition. $firstOrLast " +
              s"${appendInfo.firstOrLastOffsetOfFirstBatch} is less than the next offset ${nextOffsetMetadata.messageOffset}. " +
              s"First 10 offsets in append: ${records.records.asScala.take(10).map(_.offset)}, last offset in" +
              s" append: ${appendInfo.lastOffset}. Log start offset = $logStartOffset",
              firstOffset, appendInfo.lastOffset)
          }
        }

        // update the epoch cache with the epoch stamped onto the message by the leader
        validRecords.batches.asScala.foreach { batch =>
          if (batch.magic >= RecordBatch.MAGIC_VALUE_V2)
            _leaderEpochCache.assign(batch.partitionLeaderEpoch, batch.baseOffset)
        }

        // check messages set size may be exceed config.segmentSize
        if (validRecords.sizeInBytes > config.segmentSize) {
          throw new RecordBatchTooLargeException(s"Message batch size is ${validRecords.sizeInBytes} bytes in append " +
            s"to partition $topicPartition, which exceeds the maximum configured segment size of ${config.segmentSize}.")
        }

        // now that we have valid records, offsets assigned, and timestamps updated, we need to
        // validate the idempotent/transactional state of the producers and collect some metadata
        val (updatedProducers, completedTxns, maybeDuplicate) = analyzeAndValidateProducerState(validRecords, isFromClient)
        maybeDuplicate.foreach { duplicate =>
          appendInfo.firstOffset = Some(duplicate.firstOffset)
          appendInfo.lastOffset = duplicate.lastOffset
          appendInfo.logAppendTime = duplicate.timestamp
          appendInfo.logStartOffset = logStartOffset
          return appendInfo
        }

        // maybe roll the log if this segment is full
        // 如果当前segment满了,需要重新创建一个segment
        val segment = maybeRoll(validRecords.sizeInBytes, appendInfo)

        val logOffsetMetadata = LogOffsetMetadata(
          messageOffset = appendInfo.firstOrLastOffsetOfFirstBatch,
          segmentBaseOffset = segment.baseOffset,
          relativePositionInSegment = segment.size)

        // 追加消息到当前segment
        segment.append(largestOffset = appendInfo.lastOffset,
          largestTimestamp = appendInfo.maxTimestamp,
          shallowOffsetOfMaxTimestamp = appendInfo.offsetOfMaxTimestamp,
          records = validRecords)

        // update the producer state
        for ((_, producerAppendInfo) <- updatedProducers) {
          producerAppendInfo.maybeCacheTxnFirstOffsetMetadata(logOffsetMetadata)
          producerStateManager.update(producerAppendInfo)
        }

        // update the transaction index with the true last stable offset. The last offset visible
        // to consumers using READ_COMMITTED will be limited by this value and the high watermark.
        for (completedTxn <- completedTxns) {
          val lastStableOffset = producerStateManager.completeTxn(completedTxn)
          segment.updateTxnIndex(completedTxn, lastStableOffset)
        }

        // always update the last producer id map offset so that the snapshot reflects the current offset
        // even if there isn't any idempotent data being written
        producerStateManager.updateMapEndOffset(appendInfo.lastOffset + 1)

        // increment the log end offset
        // 修改最新的next_offset
        updateLogEndOffset(appendInfo.lastOffset + 1)

        // update the first unstable offset (which is used to compute LSO)
        updateFirstUnstableOffset()

        trace(s"Appended message set with last offset: ${appendInfo.lastOffset}, " +
          s"first offset: ${appendInfo.firstOffset}, " +
          s"next offset: ${nextOffsetMetadata.messageOffset}, " +
          s"and messages: $validRecords")

        // 满足条件的话,刷新磁盘
        if (unflushedMessages >= config.flushInterval)
          flush()

        appendInfo
      }
    }
  }

```
#### 日志分段
```
// 判断是否需要创建日志分段,如果不需要,就返回当前分段,需要则返回新创建的日志分段
private def maybeRoll(messagesSize: Int, appendInfo: LogAppendInfo): LogSegment = {
    // 最新日志分段(活跃日志分段)
    val segment = activeSegment
    val now = time.milliseconds

    val maxTimestampInMessages = appendInfo.maxTimestamp
    val maxOffsetInMessages = appendInfo.lastOffset

    if (segment.shouldRoll(RollParams(config, appendInfo, messagesSize, now))) {
      debug(s"Rolling new log segment (log_size = ${segment.size}/${config.segmentSize}}, " +
        s"offset_index_size = ${segment.offsetIndex.entries}/${segment.offsetIndex.maxEntries}, " +
        s"time_index_size = ${segment.timeIndex.entries}/${segment.timeIndex.maxEntries}, " +
        s"inactive_time_ms = ${segment.timeWaitedForRoll(now, maxTimestampInMessages)}/${config.segmentMs - segment.rollJitterMs}).")
      appendInfo.firstOffset match {
        // 创建新的日志分段
        case Some(firstOffset) => roll(firstOffset)
        case None => roll(maxOffsetInMessages - Integer.MAX_VALUE)
      }
    } else {
      // 使用当前的日志分段
      segment
    }
}

// LogSegment
def shouldRoll(rollParams: RollParams): Boolean = {
  // 距离上次日志分段是否达到了阈值
  val reachedRollMs = timeWaitedForRoll(rollParams.now, rollParams.maxTimestampInMessages) > rollParams.maxSegmentMs - rollJitterMs
  // 1.文件满了,不足以放下这么大的messageSet
  // 2.文件有数据,到了分段的阈值
  // 3.索引文件满了
  // 4.时间索引文件满了
  // 5.最大offset,其相对偏移量超过了正整数的阈值
  size > rollParams.maxSegmentBytes - rollParams.messagesSize ||
    (size > 0 && reachedRollMs) ||
    offsetIndex.isFull || timeIndex.isFull || !canConvertToRelativeOffset(rollParams.maxOffsetInMessages)
}

// 滚动创建日志,并添加到日志管理的映射表中
def roll(expectedNextOffset: Long = 0): LogSegment = {
    maybeHandleIOException(s"Error while rolling log segment for $topicPartition in dir ${dir.getParent}") {
      val start = time.hiResClockMs()
      lock synchronized {
        checkIfMemoryMappedBufferClosed()
        // 选择最新的offset作为基准偏移量
        val newOffset = math.max(expectedNextOffset, logEndOffset)
        // 创建数据文件
        val logFile = Log.logFile(dir, newOffset)
        // 创建offset索引文件
        val offsetIdxFile = offsetIndexFile(dir, newOffset)
        // 创建时间索引文件
        val timeIdxFile = timeIndexFile(dir, newOffset)
        val txnIdxFile = transactionIndexFile(dir, newOffset)
        for (file <- List(logFile, offsetIdxFile, timeIdxFile, txnIdxFile) if file.exists) {
          warn(s"Newly rolled segment file ${file.getAbsolutePath} already exists; deleting it first")
          Files.delete(file.toPath)
        }

        Option(segments.lastEntry).foreach(_.getValue.onBecomeInactiveSegment())

        producerStateManager.updateMapEndOffset(newOffset)
        producerStateManager.takeSnapshot()

        // 创建一个segment对象
        val segment = LogSegment.open(dir,
          baseOffset = newOffset,
          config,
          time = time,
          fileAlreadyExists = false,
          initFileSize = initFileSize,
          preallocate = config.preallocate)
        // 添加到日志管理中
        val prev = addSegment(segment)
        if (prev != null)
          throw new KafkaException(s"Trying to roll a new log segment for topic partition $topicPartition with " +
            s"start offset $newOffset while it already exists.")
        // 更新offset
        updateLogEndOffset(nextOffsetMetadata.messageOffset)
        // schedule an asynchronous flush of the old segment
        scheduler.schedule("flush-log", () => flush(newOffset), delay = 0L)

        info(s"Rolled new log segment at offset $newOffset in ${time.hiResClockMs() - start} ms.")

        segment
      }
    }
}
```
### LogSegment对象
```
真正的日志写入,在LogSegment的append()方法中完成
它会跟Kafka最底层的文件通道,mmap打交道

// 在指定offset处追加msgs,需要的情况下追加相应的索引
@nonthreadsafe
def append(largestOffset: Long,
             largestTimestamp: Long,
             shallowOffsetOfMaxTimestamp: Long,
             records: MemoryRecords): Unit = {
    if (records.sizeInBytes > 0) {
      trace(s"Inserting ${records.sizeInBytes} bytes at end offset $largestOffset at position ${log.sizeInBytes} " +
            s"with largest timestamp $largestTimestamp at shallow offset $shallowOffsetOfMaxTimestamp")
      val physicalPosition = log.sizeInBytes()
      if (physicalPosition == 0)
        rollingBasedTimestamp = Some(largestTimestamp)

      ensureOffsetInRange(largestOffset)

      // 追加到数据文件
      val appendedBytes = log.append(records)
      trace(s"Appended $appendedBytes to ${log.file} at end offset $largestOffset")
      // Update the in memory max timestamp and corresponding offset.
      if (largestTimestamp > maxTimestampSoFar) {
        maxTimestampSoFar = largestTimestamp
        offsetOfMaxTimestamp = shallowOffsetOfMaxTimestamp
      }
      // 判断是否需要追加索引(数据每次都会添加到数据文件中,但不是每次都会添加索引的,间隔indexIntervalBytes 大小才会写入一个索引文件)
      if (bytesSinceLastIndexEntry > indexIntervalBytes) {
        // 添加索引
        offsetIndex.append(largestOffset, physicalPosition)
        timeIndex.maybeAppend(maxTimestampSoFar, offsetOfMaxTimestamp)
        bytesSinceLastIndexEntry = 0
      }
      bytesSinceLastIndexEntry += records.sizeInBytes
    }
}
```
### 索引文件
```
offsetIndex以及timeIndex

offsetIndex
    采用绝对偏移量+相对偏移量的方式进行存储,每个segment最开始的绝对偏移量也是其基准偏移量
    数据文件每隔一定的大小创建一个索引条目,而不是每条消息会创建索引条目,通过index.interval.bytes来配置
        默认4096,4KB

好处:
    索引条目稀疏
    索引的相对偏移量占据4个字节,绝对偏移量占据8个字节,物理位置4个字节
        使用相对索引可以将每条索引条目的大小从12字节减少到8字节
    因为偏移量有序的,再读取数据时,可以按照二分查找的方式去快速定位偏移量的位置
    这样的稀疏索引是可以完全放到内存中,加快偏移量的查找
```