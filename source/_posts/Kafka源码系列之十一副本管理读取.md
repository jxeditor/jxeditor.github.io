---
title: Kafka源码系列之十一副本管理读取
date: 2020-05-08 13:34:43
categories: 大数据
tags: kafka
---

> Kafka处理Fetch请求以及日志读取过程

<!-- more -->

## Fetch请求的来源
```
1.Consumer消费数据产生Fetch请求
    Consumer产生Fetch请求在之前有说过,在poll方法中构建
2.副本同步Fetch请求
    ReplicaManager中有一个ReplicaFetchManager实例负责开启FetchThread进行Fetch请求构建

两者的区别:
    Replica在构造FetchRequest时,调用了setReplicaId()设置了对应的replicaId
    Consumer没有进行设置,默认为CONSUMER_REPLICA_ID,为-1
    这个值就是区分Consumer的Fetch请求和Replica的Fetch请求的关键值
```
### Consumer构建
```java
// Fetcher.sendFetches()
final FetchRequest.Builder request = FetchRequest.Builder
        .forConsumer(this.maxWaitMs, this.minBytes, data.toSend())
        .isolationLevel(isolationLevel)
        .setMaxBytes(this.maxBytes)
        .metadata(data.metadata())
        .toForget(data.toForget());
```
### ReplicaFetchManager构建
```scala
// ReplicaFetcherThread.buildFetch()
val fetchData = builder.build()
val fetchRequestOpt = if (fetchData.sessionPartitions.isEmpty && fetchData.toForget.isEmpty) {
  None
} else {
  val requestBuilder = FetchRequest.Builder
    .forReplica(fetchRequestVersion, replicaId, maxWait, minBytes, fetchData.toSend)
    .setMaxBytes(maxBytes)
    .toForget(fetchData.toForget)
    .metadata(fetchData.metadata)
  Some(requestBuilder)
}
```

---

## Server端处理Fetch请求
```
ApiKeys.FETCH -> handleFetchRequest()
```
### handleFetchRequest()
```scala
def handleFetchRequest(request: RequestChannel.Request) {
    val versionId = request.header.apiVersion
    val clientId = request.header.clientId
    val fetchRequest = request.body[FetchRequest]
    val fetchContext = fetchManager.newContext(
      fetchRequest.metadata,
      fetchRequest.fetchData,
      fetchRequest.toForget,
      fetchRequest.isFromFollower)

    // 检验错误的请求
    def errorResponse[T >: MemoryRecords <: BaseRecords](error: Errors): FetchResponse.PartitionData[T] = {
      new FetchResponse.PartitionData[T](error, FetchResponse.INVALID_HIGHWATERMARK, FetchResponse.INVALID_LAST_STABLE_OFFSET,
        FetchResponse.INVALID_LOG_START_OFFSET, null, MemoryRecords.EMPTY)
    }

    val erroneous = mutable.ArrayBuffer[(TopicPartition, FetchResponse.PartitionData[Records])]()
    val interesting = mutable.ArrayBuffer[(TopicPartition, FetchRequest.PartitionData)]()
    if (fetchRequest.isFromFollower) {
      // The follower must have ClusterAction on ClusterResource in order to fetch partition data.
      // 检验tp是否存在以及是否有Describe权限
      if (authorize(request.session, ClusterAction, Resource.ClusterResource)) {
        fetchContext.foreachPartition { (topicPartition, data) =>
          // 不存在或没有Describe权限的topic,返回UNKNOWN_TOPIC_OR_PARTITION错误
          if (!metadataCache.contains(topicPartition))
            erroneous += topicPartition -> errorResponse(Errors.UNKNOWN_TOPIC_OR_PARTITION)
          else
            interesting += (topicPartition -> data)
        }
      } else {
        // 没有ClusterAction权限,返回TOPIC_AUTHORIZATION_FAILED错误
        fetchContext.foreachPartition { (part, _) =>
          erroneous += part -> errorResponse(Errors.TOPIC_AUTHORIZATION_FAILED)
        }
      }
    } else {
      fetchContext.foreachPartition { (topicPartition, data) =>
        if (!authorize(request.session, Read, Resource(Topic, topicPartition.topic, LITERAL)))
          // 没有read权限,返回TOPIC_AUTHORIZATION_FAILED错误
          erroneous += topicPartition -> errorResponse(Errors.TOPIC_AUTHORIZATION_FAILED)
        else if (!metadataCache.contains(topicPartition))
          // 不存在或没有Describe权限的topic,返回UNKNOWN_TOPIC_OR_PARTITION错误
          erroneous += topicPartition -> errorResponse(Errors.UNKNOWN_TOPIC_OR_PARTITION)
        else
          interesting += (topicPartition -> data)
      }
    }
    
    // ......
    
    if (interesting.isEmpty)
      processResponseCallback(Seq.empty)
    else {
      // call the replica manager to fetch messages from the local replica
      // 从replica上拉取数据,满足条件后调用函数进行返回
      replicaManager.fetchMessages(
        fetchRequest.maxWait.toLong, // 拉取请求最长等待时间
        fetchRequest.replicaId, // ReplicaId,Consumer的为-1
        fetchRequest.minBytes, // 拉取请求的最小拉取字节
        fetchRequest.maxBytes, // 拉取请求的最大拉取字节
        versionId <= 2,
        interesting,
        replicationQuota(fetchRequest),
        processResponseCallback,
        fetchRequest.isolationLevel)
    }
}
```
### ReplicaManager
#### fetchMessages
```scala
1.readFromLocalLog(): 从本地日志拉取相应的数据
2.判断Fetch请求来源,如果来自副本同步,那么更新该副本的the end offset记录,如果该副本不在isr中,判断是否需要更新isr
3.返回结果,满足条件立即返回,否则通过延迟操作,延迟返回结果

// 从leader拉取数据,等待拉取到足够的数据或者达到timeout时间后返回拉取的结果
def fetchMessages(timeout: Long,
                    replicaId: Int,
                    fetchMinBytes: Int,
                    fetchMaxBytes: Int,
                    hardMaxBytesLimit: Boolean,
                    fetchInfos: Seq[(TopicPartition, PartitionData)],
                    quota: ReplicaQuota = UnboundedQuota,
                    responseCallback: Seq[(TopicPartition, FetchPartitionData)] => Unit,
                    isolationLevel: IsolationLevel) {
    // 判断请求时来自consumer还是副本同步
    val isFromFollower = Request.isValidBrokerId(replicaId)
    // 默认从leader拉取
    val fetchOnlyFromLeader = replicaId != Request.DebuggingConsumerId && replicaId != Request.FutureLocalReplicaId
    
    // 如果拉取请求来自consumer(true),只拉取HW以内的数据
    // 如果来自Replica,则没有限制
    val fetchIsolation = if (isFromFollower || replicaId == Request.FutureLocalReplicaId)
      FetchLogEnd
    else if (isolationLevel == IsolationLevel.READ_COMMITTED)
      FetchTxnCommitted
    else
      FetchHighWatermark


    def readFromLog(): Seq[(TopicPartition, LogReadResult)] = {
      // 获取本地日志
      val result = readFromLocalLog(
        replicaId = replicaId,
        fetchOnlyFromLeader = fetchOnlyFromLeader,
        fetchIsolation = fetchIsolation,
        fetchMaxBytes = fetchMaxBytes,
        hardMaxBytesLimit = hardMaxBytesLimit,
        readPartitionInfo = fetchInfos,
        quota = quota)
      // 如果fetch来自broker的副本同步,更新相关的log end offset
      if (isFromFollower) updateFollowerLogReadResults(replicaId, result)
      else result
    }

    val logReadResults = readFromLog()

    // check if this fetch request can be satisfied right away
    val logReadResultValues = logReadResults.map { case (_, v) => v }
    val bytesReadable = logReadResultValues.map(_.info.records.sizeInBytes).sum
    val errorReadingData = logReadResultValues.foldLeft(false) ((errorIncurred, readResult) =>
      errorIncurred || (readResult.error != Errors.NONE))

    // 如果满足以下条件的其中一个,立马返回结果
    // 1.timeout达到
    // 2.拉取结果为空
    // 3.拉取到足够的数据
    // 4.拉取时遇到Error
    if (timeout <= 0 || fetchInfos.isEmpty || bytesReadable >= fetchMinBytes || errorReadingData) {
      val fetchPartitionData = logReadResults.map { case (tp, result) =>
        tp -> FetchPartitionData(result.error, result.highWatermark, result.leaderLogStartOffset, result.info.records,
          result.lastStableOffset, result.info.abortedTransactions)
      }
      responseCallback(fetchPartitionData)
    } else {
      // construct the fetch results from the read results
      // 延迟发送结果
      val fetchPartitionStatus = logReadResults.map { case (topicPartition, result) =>
        val fetchInfo = fetchInfos.collectFirst {
          case (tp, v) if tp == topicPartition => v
        }.getOrElse(sys.error(s"Partition $topicPartition not found in fetchInfos"))
        (topicPartition, FetchPartitionStatus(result.info.fetchOffsetMetadata, fetchInfo))
      }
      val fetchMetadata = FetchMetadata(fetchMinBytes, fetchMaxBytes, hardMaxBytesLimit, fetchOnlyFromLeader,
        fetchIsolation, isFromFollower, replicaId, fetchPartitionStatus)
      val delayedFetch = new DelayedFetch(timeout, fetchMetadata, this, quota, responseCallback)

      // create a list of (topic, partition) pairs to use as keys for this delayed fetch operation
      val delayedFetchKeys = fetchPartitionStatus.map { case (tp, _) => new TopicPartitionOperationKey(tp) }

      // try to complete the request immediately, otherwise put it into the purgatory;
      // this is because while the delayed fetch operation is being created, new requests
      // may arrive and hence make this operation completable.
      delayedFetchPurgatory.tryCompleteElseWatch(delayedFetch, delayedFetchKeys)
    }
}
```
#### readFromLocalLog()->readRecords()
```scala
1.先根据要拉取的tp获取对应的partition对象,根据partition对象获取对应的Replica对象
2.根据Replica对象找到对应的Log对象,然后调用其read()从指定位置读取数据

// 按offset从tp列表中读取相应的数据
def readRecords(fetchOffset: Long,
                  currentLeaderEpoch: Optional[Integer],
                  maxBytes: Int,
                  fetchIsolation: FetchIsolation,
                  fetchOnlyFromLeader: Boolean,
                  minOneMessage: Boolean): LogReadInfo = inReadLock(leaderIsrUpdateLock) {
    // 获取相应的Replica对象
    val localReplica = localReplicaWithEpochOrException(currentLeaderEpoch, fetchOnlyFromLeader)

    val initialHighWatermark = localReplica.highWatermark.messageOffset
    val initialLogStartOffset = localReplica.logStartOffset
    val initialLogEndOffset = localReplica.logEndOffset.messageOffset
    val initialLastStableOffset = localReplica.lastStableOffset.messageOffset
    
    // 获取hw位置,副本同步不用设置这个值
    val maxOffsetOpt = fetchIsolation match {
      case FetchLogEnd => None
      case FetchHighWatermark => Some(initialHighWatermark)
      case FetchTxnCommitted => Some(initialLastStableOffset)
    }

    val fetchedData = localReplica.log match {
      case Some(log) =>
        // 从指定的offset读取数据,副本同步不需要maxOffsetOpt
        log.read(fetchOffset, maxBytes, maxOffsetOpt, minOneMessage,
          includeAbortedTxns = fetchIsolation == FetchTxnCommitted)

      case None =>
        error(s"Leader does not have a local log")
        FetchDataInfo(LogOffsetMetadata.UnknownOffsetMetadata, MemoryRecords.EMPTY)
    }

    LogReadInfo(
      fetchedData = fetchedData,
      highWatermark = initialHighWatermark,
      logStartOffset = initialLogStartOffset,
      logEndOffset = initialLogEndOffset,
      lastStableOffset = initialLastStableOffset)
}
```

---

## 存储层
### Log对象
#### read()
```scala
1.根据要读取的起始偏移量(startOffset)读取offset索引文件中对应的物理位置
2.查找offset索引文件最后返回,起始偏移量对应的最近物理位置(startPosition)
3.根据startPosition指定定位到数据文件,然后读取数据文件内容
4.最多能读到数据文件的结束位置

// 从指定offset开始读取数据
def read(startOffset: Long,
           maxLength: Int,
           maxOffset: Option[Long],
           minOneMessage: Boolean,
           includeAbortedTxns: Boolean): FetchDataInfo = {
    maybeHandleIOException(s"Exception while reading from $topicPartition in dir ${dir.getParent}") {
      trace(s"Reading $maxLength bytes from offset $startOffset of length $size bytes")

      // Because we don't use lock for reading, the synchronization is a little bit tricky.
      // We create the local variables to avoid race conditions with updates to the log.
      val currentNextOffsetMetadata = nextOffsetMetadata
      val next = currentNextOffsetMetadata.messageOffset
      if (startOffset == next) {
        val abortedTransactions =
          if (includeAbortedTxns) Some(List.empty[AbortedTransaction])
          else None
        return FetchDataInfo(currentNextOffsetMetadata, MemoryRecords.EMPTY, firstEntryIncomplete = false,
          abortedTransactions = abortedTransactions)
      }

      // 查找对应的日志分段
      var segmentEntry = segments.floorEntry(startOffset)

      // return error on attempt to read beyond the log end offset or read below log start offset
      if (startOffset > next || segmentEntry == null || startOffset < logStartOffset)
        throw new OffsetOutOfRangeException(s"Received request for offset $startOffset for partition $topicPartition, " +
          s"but we only have log segments in the range $logStartOffset to $next.")

      while (segmentEntry != null) {
        val segment = segmentEntry.getValue

        // 如果fetch请求刚好发生在the active segment上
        // 当多个Fetch请求同时处理,如果nextOffsetMetadata更新不及时
        // 可能会导致发送OffsetOutOfRangeException异常
        // 为了解决这个问题,这里能读取的最大位置是对应的物理位置(exposedPos),而不是the log end of the active segment
        val maxPosition = {
          if (segmentEntry == segments.lastEntry) {
            // nextOffsetMetadata对应的实际物理位置
            val exposedPos = nextOffsetMetadata.relativePositionInSegment.toLong
            // Check the segment again in case a new segment has just rolled out.
            // 可能会有新的segment产生,所以需要再次判断
            if (segmentEntry != segments.lastEntry)
            // New log segment has rolled out, we can read up to the file end.
              segment.size
            else
              exposedPos
          } else {
            segment.size
          }
        }
        // 从segment中读取相应的数据
        val fetchInfo = segment.read(startOffset, maxOffset, maxLength, maxPosition, minOneMessage)
        // 如果该日志分段没有读取到数据,则读取更高的日志分段
        if (fetchInfo == null) {
          segmentEntry = segments.higherEntry(segmentEntry.getKey)
        } else {
          return if (includeAbortedTxns)
            addAbortedTransactions(startOffset, segmentEntry, fetchInfo)
          else
            fetchInfo
        }
      }

      // okay we are beyond the end of the last segment with no data fetched although the start offset is in range,
      // this can happen when all messages with offset larger than start offsets have been deleted.
      // In this case, we will return the empty set with log end offset metadata
      FetchDataInfo(nextOffsetMetadata, MemoryRecords.EMPTY)
    }
}
```
### LogSegment对象
#### read()
```scala
1.根据startOffset得到实际的物理位置(translateOffset())
2.计算要读取的实际物理长度
3.根据实际起始物理位置和要读取实际物理长度读取数据文件

// 读取日志分段(副本同步不会设置maxSize)
@threadsafe
def read(startOffset: Long, maxOffset: Option[Long], maxSize: Int, maxPosition: Long = size,
           minOneMessage: Boolean = false): FetchDataInfo = {
    if (maxSize < 0)
      throw new IllegalArgumentException(s"Invalid max size $maxSize for log read from segment $log")

    // log文件的物理长度
    val logSize = log.sizeInBytes // this may change, need to save a consistent copy
    // 将起始的offset转换为起始的实际物理位置
    val startOffsetAndSize = translateOffset(startOffset)

    // if the start position is already off the end of the log, return null
    if (startOffsetAndSize == null)
      return null

    val startPosition = startOffsetAndSize.position
    val offsetMetadata = new LogOffsetMetadata(startOffset, this.baseOffset, startPosition)

    val adjustedMaxSize =
      if (minOneMessage) math.max(maxSize, startOffsetAndSize.size)
      else maxSize

    // return a log segment but with zero size in the case below
    if (adjustedMaxSize == 0)
      return FetchDataInfo(offsetMetadata, MemoryRecords.EMPTY)

    // calculate the length of the message set to read based on whether or not they gave us a maxOffset
    // 计算读取的长度
    val fetchSize: Int = maxOffset match {
      // 副本同步时计算方式
      case None =>
        // no max offset, just read until the max position
        // 直接读最大的位置
        min((maxPosition - startPosition).toInt, adjustedMaxSize)
      // consumer拉取时计算方式
      case Some(offset) =>
        // there is a max offset, translate it to a file position and use that to calculate the max read size;
        // when the leader of a partition changes, it's possible for the new leader's high watermark to be less than the
        // true high watermark in the previous leader for a short window. In this window, if a consumer fetches on an
        // offset between new leader's high watermark and the log end offset, we want to return an empty response.
        if (offset < startOffset)
          return FetchDataInfo(offsetMetadata, MemoryRecords.EMPTY, firstEntryIncomplete = false)
        val mapping = translateOffset(offset, startPosition)
        val endPosition =
          if (mapping == null)
            logSize // the max offset is off the end of the log, use the end of the file
          else
            mapping.position
        min(min(maxPosition, endPosition) - startPosition, adjustedMaxSize).toInt
    }

    // 根据起始的物理位置和读取长度读取数据文件
    FetchDataInfo(offsetMetadata, log.slice(startPosition, fetchSize),
      firstEntryIncomplete = adjustedMaxSize < startOffsetAndSize.size)
}
```
#### translateOffset()
具体计算方法可以参考<Kafka技术内幕>
```scala
1.查找offset索引文件: 调用offset索引文件的lookup()查找方法,获取里startOffset最接近的物理位置
2.调用数据文件的searchFor()方法,从指定的物理位置开始读取每条数据,直到找到对应的offset的物理位置

@threadsafe
private[log] def translateOffset(offset: Long, startingFilePosition: Int = 0): LogOffsetPosition = {
  val mapping = offsetIndex.lookup(offset)
  log.searchForOffsetWithSize(offset, max(mapping.position, startingFilePosition))
}

// 查找索引文件
def lookup(targetOffset: Long): OffsetPosition = {
  // 查找小于等于指定offset的最大offset,并且返回对应的offset和实际物理位置
  maybeLock(lock) {
    val idx = mmap.duplicate // 查询时,mmap会发生变化,先复制一个
    val slot = largestLowerBoundSlotFor(idx, targetOffset, IndexSearchType.KEY) // 二分查找
    if(slot == -1)
      OffsetPosition(baseOffset, 0)
    else
      // 计算绝对偏移量,在计算物理位置
      parseEntry(idx, slot).asInstanceOf[OffsetPosition]
  }
}

override def parseEntry(buffer: ByteBuffer, n: Int): IndexEntry = {
    OffsetPosition(baseOffset + relativeOffset(buffer, n), physical(buffer, n))
}

private def relativeOffset(buffer: ByteBuffer, n: Int): Int = buffer.getInt(n * entrySize)
private def physical(buffer: ByteBuffer, n: Int): Int = buffer.getInt(n * entrySize + 4)

// 数据文件查找,前面找到的物理位置是一个接近值
public LogOffsetPosition searchForOffsetWithSize(long targetOffset, int startingPosition) {
    for (FileChannelRecordBatch batch : batchesFrom(startingPosition)) {
        long offset = batch.lastOffset();
        if (offset >= targetOffset)
            return new LogOffsetPosition(offset, batch.position(), batch.sizeInBytes());
    }
    return null;
}
```