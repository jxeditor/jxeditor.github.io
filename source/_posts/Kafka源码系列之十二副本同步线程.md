---
title: Kafka源码系列之十二副本同步线程
date: 2020-05-08 15:17:11
categories: 大数据
tags: kafka
---

> 主要介绍副本同步线程什么情况下启动,同步线程处理逻辑,以及什么情况下线程关闭

<!-- more -->

## 同步线程的启动
```
在上一章中,Replica同步发送的Fetch请求的封装,需要设计ReplicaFetchManager
副本同步线程的启动和关闭都由这个实例操作
```
### 什么情况下启动
```scala
Broker分配的任何一个partition都是以replica对象实例的形式存在
而replica在kafka上有两个角色: leader和follower
只要这个replica是follower,那么它就会向leader进行数据同步

如果Broker的本地副本被选举为follower,那么就会启动副本同步线程

// 对于给定的这些副本，将本地副本设置为 follower
// 从 leader partition 集合移除这些 partition；
// 将这些 partition 标记为 follower，之后这些 partition 就不会再接收 produce 的请求了；
// 停止对这些 partition 的副本同步，这样这些副本就不会再有（来自副本请求线程）的数据进行追加了；
// 对这些 partition 的 offset 进行 checkpoint，如果日志需要截断就进行截断操作；
// 清空 purgatory 中的 produce 和 fetch 请求；
// 如果 broker 没有掉线，向这些 partition 的新 leader 启动副本同步线程；
//note: 上面这些操作的顺序性，保证了这些副本在 offset checkpoint 之前将不会接收新的数据，这样的话，在 checkpoint 之前这些数据都可以保证刷到磁盘
private def makeFollowers(controllerId: Int,
                            epoch: Int,
                            partitionStates: Map[Partition, LeaderAndIsrRequest.PartitionState],
                            correlationId: Int,
                            responseMap: mutable.Map[TopicPartition, Errors]) : Set[Partition] = {
    partitionStates.foreach { case (partition, partitionState) =>
      stateChangeLogger.trace(s"Handling LeaderAndIsr request correlationId $correlationId from controller $controllerId " +
        s"epoch $epoch starting the become-follower transition for partition ${partition.topicPartition} with leader " +
        s"${partitionState.basePartitionState.leader}")
    }

    for (partition <- partitionStates.keys)
      responseMap.put(partition.topicPartition, Errors.NONE)

    // 统计follower的集合
    val partitionsToMakeFollower: mutable.Set[Partition] = mutable.Set()

    try {
      // TODO: Delete leaders from LeaderAndIsrRequest
      partitionStates.foreach { case (partition, partitionStateInfo) =>
        val newLeaderBrokerId = partitionStateInfo.basePartitionState.leader
        try {
          // leader是可用的
          metadataCache.getAliveBrokers.find(_.id == newLeaderBrokerId) match {
            // Only change partition state when the leader is available
            case Some(_) => // partition的本地副本设置为follower
              if (partition.makeFollower(controllerId, partitionStateInfo, correlationId))
                partitionsToMakeFollower += partition
              else // 这个partition的本地副本已经是follower了
                stateChangeLogger.info(s"Skipped the become-follower state change after marking its partition as " +
                  s"follower with correlation id $correlationId from controller $controllerId epoch $epoch " +
                  s"for partition ${partition.topicPartition} (last update " +
                  s"controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch}) " +
                  s"since the new leader $newLeaderBrokerId is the same as the old leader")
            case None =>
              // The leader broker should always be present in the metadata cache.
              // If not, we should record the error message and abort the transition process for this partition
              stateChangeLogger.error(s"Received LeaderAndIsrRequest with correlation id $correlationId from " +
                s"controller $controllerId epoch $epoch for partition ${partition.topicPartition} " +
                s"(last update controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch}) " +
                s"but cannot become follower since the new leader $newLeaderBrokerId is unavailable.")
              // Create the local replica even if the leader is unavailable. This is required to ensure that we include
              // the partition's high watermark in the checkpoint file (see KAFKA-1647)
              partition.getOrCreateReplica(localBrokerId, isNew = partitionStateInfo.isNew)
          }
        } catch {
          case e: KafkaStorageException =>
            stateChangeLogger.error(s"Skipped the become-follower state change with correlation id $correlationId from " +
              s"controller $controllerId epoch $epoch for partition ${partition.topicPartition} " +
              s"(last update controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch}) with leader " +
              s"$newLeaderBrokerId since the replica for the partition is offline due to disk error $e")
            val dirOpt = getLogDir(partition.topicPartition)
            error(s"Error while making broker the follower for partition $partition with leader " +
              s"$newLeaderBrokerId in dir $dirOpt", e)
            responseMap.put(partition.topicPartition, Errors.KAFKA_STORAGE_ERROR)
        }
      }

      // 删除这些partition的副本同步线程
      replicaFetcherManager.removeFetcherForPartitions(partitionsToMakeFollower.map(_.topicPartition))
      partitionsToMakeFollower.foreach { partition =>
        stateChangeLogger.trace(s"Stopped fetchers as part of become-follower request from controller $controllerId " +
          s"epoch $epoch with correlation id $correlationId for partition ${partition.topicPartition} with leader " +
          s"${partitionStates(partition).basePartitionState.leader}")
      }

      partitionsToMakeFollower.foreach { partition =>
        val topicPartitionOperationKey = new TopicPartitionOperationKey(partition.topicPartition)
        tryCompleteDelayedProduce(topicPartitionOperationKey)
        tryCompleteDelayedFetch(topicPartitionOperationKey)
      }

      // 完成那些延迟请求的处理
      partitionsToMakeFollower.foreach { partition =>
        stateChangeLogger.trace(s"Truncated logs and checkpointed recovery boundaries for partition " +
          s"${partition.topicPartition} as part of become-follower request with correlation id $correlationId from " +
          s"controller $controllerId epoch $epoch with leader ${partitionStates(partition).basePartitionState.leader}")
      }

      if (isShuttingDown.get()) {
        partitionsToMakeFollower.foreach { partition =>
          stateChangeLogger.trace(s"Skipped the adding-fetcher step of the become-follower state " +
            s"change with correlation id $correlationId from controller $controllerId epoch $epoch for " +
            s"partition ${partition.topicPartition} with leader ${partitionStates(partition).basePartitionState.leader} " +
            "since it is shutting down")
        }
      }
      else {
        // 启动副本同步线程
        // we do not need to check if the leader exists again since this has been done at the beginning of this process
        val partitionsToMakeFollowerWithLeaderAndOffset = partitionsToMakeFollower.map { partition =>
          val leader = metadataCache.getAliveBrokers.find(_.id == partition.leaderReplicaIdOpt.get).get
            .brokerEndPoint(config.interBrokerListenerName)
          val fetchOffset = partition.localReplicaOrException.highWatermark.messageOffset
          partition.topicPartition -> InitialFetchState(leader, partition.getLeaderEpoch, fetchOffset)
        }.toMap
        replicaFetcherManager.addFetcherForPartitions(partitionsToMakeFollowerWithLeaderAndOffset)

        partitionsToMakeFollower.foreach { partition =>
          stateChangeLogger.trace(s"Started fetcher to new leader as part of become-follower " +
            s"request from controller $controllerId epoch $epoch with correlation id $correlationId for " +
            s"partition ${partition.topicPartition} with leader ${partitionStates(partition).basePartitionState.leader}")
        }
      }
    } catch {
      case e: Throwable =>
        stateChangeLogger.error(s"Error while processing LeaderAndIsr request with correlationId $correlationId " +
          s"received from controller $controllerId epoch $epoch", e)
        // Re-throw the exception for it to be caught in KafkaApis
        throw e
    }

    partitionStates.keys.foreach { partition =>
      stateChangeLogger.trace(s"Completed LeaderAndIsr request correlationId $correlationId from controller $controllerId " +
        s"epoch $epoch for the become-follower transition for partition ${partition.topicPartition} with leader " +
        s"${partitionStates(partition).basePartitionState.leader}")
    }

    partitionsToMakeFollower
}

并不一定会为每一个partition都启动一个fetcher线程,对于一个目的Broker
只会启动num.replica.fetchers个线程
具体这个tp会分配到那个fetcher线程上,根据topic名和partitionId计算得到的
private def getFetcherId(topic: String, partitionId: Int) : Int = {
  Utils.abs(31 * topic.hashCode() + partitionId) % numFetchers
}
```
### 线程启动
#### addFetcherForPartitions()
```scala
1.计算tp对应的fetcherId
2.根据leader和fetcherId获取对应的replica fetcher线程,没有找到就调用createFetcherThread()创建一个新的
3.如果是新启动的replica fetcher线程,那么就直接启动
4.将tp记录到fetcherThreadMap中,值对应要同步的tp列表

// 为tp添加replica-fetch线程
def addFetcherForPartitions(partitionAndOffsets: Map[TopicPartition, InitialFetchState]) {
    lock synchronized {
      // 为这些tp分配相应的fetch线程Id
      val partitionsPerFetcher = partitionAndOffsets.groupBy { case (topicPartition, brokerAndInitialFetchOffset) =>
        BrokerAndFetcherId(brokerAndInitialFetchOffset.leader, getFetcherId(topicPartition))
      }

      def addAndStartFetcherThread(brokerAndFetcherId: BrokerAndFetcherId, brokerIdAndFetcherId: BrokerIdAndFetcherId): AbstractFetcherThread = {
        // 为BrokerIdAndFetcherId构造fetcherThread
        val fetcherThread = createFetcherThread(brokerAndFetcherId.fetcherId, brokerAndFetcherId.broker)
        fetcherThreadMap.put(brokerIdAndFetcherId, fetcherThread)
        fetcherThread.start()
        fetcherThread
      }

      for ((brokerAndFetcherId, initialFetchOffsets) <- partitionsPerFetcher) {
        val brokerIdAndFetcherId = BrokerIdAndFetcherId(brokerAndFetcherId.broker.id, brokerAndFetcherId.fetcherId)
        val fetcherThread = fetcherThreadMap.get(brokerIdAndFetcherId) match {
          case Some(currentFetcherThread) if currentFetcherThread.sourceBroker == brokerAndFetcherId.broker =>
            // reuse the fetcher thread
            currentFetcherThread
          case Some(f) =>
            f.shutdown()
            addAndStartFetcherThread(brokerAndFetcherId, brokerIdAndFetcherId)
          case None =>
            addAndStartFetcherThread(brokerAndFetcherId, brokerIdAndFetcherId)
        }

        val initialOffsetAndEpochs = initialFetchOffsets.map { case (tp, brokerAndInitOffset) =>
          tp -> OffsetAndEpoch(brokerAndInitOffset.initOffset, brokerAndInitOffset.currentLeaderEpoch)
        }
        // 添加tp列表
        fetcherThread.addPartitions(initialOffsetAndEpochs)
        info(s"Added fetcher to broker ${brokerAndFetcherId.broker} for partitions $initialOffsetAndEpochs")
      }
    }
}
```
#### createFetcherThread
```scala
override def createFetcherThread(fetcherId: Int, sourceBroker: BrokerEndPoint): ReplicaFetcherThread = {
  val prefix = threadNamePrefix.map(tp => s"$tp:").getOrElse("")
  val threadName = s"${prefix}ReplicaFetcherThread-$fetcherId-${sourceBroker.id}"
  new ReplicaFetcherThread(threadName, fetcherId, sourceBroker, brokerConfig, replicaManager,
    metrics, time, quotaManager)
}
```

---

## 同步线程处理过程
### 流程
```
ReplicaFetchManager.addAndStartFetcherThread()
 ->start()
  ->ShutdownableThread.run()->doWork()
   ->AbstractFetcherThread.doWork()->maybeTruncate(),maybeFetch()
    ->ReplicaFetchThread.buildFetch()
     ->AbstractFetcherThread.processFetchRequest()
      ->ReplicaFetchThread.fetchFromLeader()    
       ->ReplicaFetchThread.processPartitionData()
```
### doWork()->maybeFetch()
```scala
1.构造Fetch请求
2.通过processFetchRequest()发送Fetch请求,并对其结果进行相应的处理

// AbstractFetcherThread
private def maybeFetch(): Unit = {
  val (fetchStates, fetchRequestOpt) = inLock(partitionMapLock) {
    val fetchStates = partitionStates.partitionStateMap.asScala
    // 关键在于setReplicaId,区分consumer,注意调用的是子类ReplicaFetchThread
    val ResultWithPartitions(fetchRequestOpt, partitionsWithError) = buildFetch(fetchStates)
    handlePartitionsWithErrors(partitionsWithError)
    if (fetchRequestOpt.isEmpty) {
      trace(s"There are no active partitions. Back off for $fetchBackOffMs ms before sending a fetch request")
      // 如果没有活跃的partition,在下次调用之前,sleep fetchBackOffMs时间
      partitionMapCond.await(fetchBackOffMs, TimeUnit.MILLISECONDS)
    }
    (fetchStates, fetchRequestOpt)
  }
  fetchRequestOpt.foreach { fetchRequest =>
    processFetchRequest(fetchStates, fetchRequest)
  }
}
```
#### processFetchRequest()
```scala
1.主要实现在fetchFromLeader方法内
2.获取相应的response(如果遇到异常,下次发送fetch请求前,会sleep一段时间再发)
3.如果返回结果不为空,并且fetch请求的offset信息与返回结果的offset信息对的上
    调用processPartitionData()方法将拉取到的数据追加到本地副本日志文件中
    如果返回结果有错误,按相应的错误进行处理
4.对在fetch过程遇到的异常或返回的错误,会进行delay操作
    下次fetch请求发生至少间隔replica.fetch.backoff.ms

// 发送fetch,返回相应结果
responseData = fetchFromLeader(fetchRequest)

// 将fetch的数据追加到日志文件中
val logAppendInfoOpt = processPartitionData(topicPartition, currentFetchState.fetchOffset, partitionData)
```

---

## 同步线程的关闭
### 什么情况下关闭
```
1.stopReplica(): broker收到了controller发来的StopReplica请求,这时会开始关闭对指定tp的同步线程
2.makeLeaders(): 这些partition的本地副本被选举成了leader,这时会先停止对这些tp副本的同步线程
3.makeFollowers(): 停止副本同步,然后再开启同步
```
### stopReplica
```scala
ReplicaManager.stopReplica()
是Controller发送过来的,触发条件有多种,broker下线,partition replica迁移

def stopReplica(topicPartition: TopicPartition, deletePartition: Boolean)  = {
    stateChangeLogger.trace(s"Handling stop replica (delete=$deletePartition) for partition $topicPartition")

    if (deletePartition) {
      val removedPartition = allPartitions.remove(topicPartition)
      if (removedPartition eq ReplicaManager.OfflinePartition) {
        allPartitions.put(topicPartition, ReplicaManager.OfflinePartition)
        throw new KafkaStorageException(s"Partition $topicPartition is on an offline disk")
      }

      if (removedPartition != null) {
        val topicHasPartitions = allPartitions.values.exists(partition => topicPartition.topic == partition.topic)
        if (!topicHasPartitions)
          brokerTopicStats.removeMetrics(topicPartition.topic)
        // this will delete the local log. This call may throw exception if the log is on offline directory
        removedPartition.delete()
      } else {
        stateChangeLogger.trace(s"Ignoring stop replica (delete=$deletePartition) for partition $topicPartition as replica doesn't exist on broker")
      }

      // Delete log and corresponding folders in case replica manager doesn't hold them anymore.
      // This could happen when topic is being deleted while broker is down and recovers.
      if (logManager.getLog(topicPartition).isDefined)
        logManager.asyncDelete(topicPartition)
      if (logManager.getLog(topicPartition, isFuture = true).isDefined)
        logManager.asyncDelete(topicPartition, isFuture = true)
    }
    stateChangeLogger.trace(s"Finished handling stop replica (delete=$deletePartition) for partition $topicPartition")
}
```
### makeLeaders
```scala
ReplicaManager.makeLeaders()
当broker上这个partition的副本被设置为leader时触发的

private def makeLeaders(controllerId: Int,
                          epoch: Int,
                          partitionState: Map[Partition, LeaderAndIsrRequest.PartitionState],
                          correlationId: Int,
                          responseMap: mutable.Map[TopicPartition, Errors]): Set[Partition] = {
    partitionState.keys.foreach { partition =>
      stateChangeLogger.trace(s"Handling LeaderAndIsr request correlationId $correlationId from " +
        s"controller $controllerId epoch $epoch starting the become-leader transition for " +
        s"partition ${partition.topicPartition}")
    }

    for (partition <- partitionState.keys)
      responseMap.put(partition.topicPartition, Errors.NONE)

    val partitionsToMakeLeaders = mutable.Set[Partition]()

    try {
      // First stop fetchers for all the partitions
      replicaFetcherManager.removeFetcherForPartitions(partitionState.keySet.map(_.topicPartition))
      // Update the partition information to be the leader
      partitionState.foreach{ case (partition, partitionStateInfo) =>
        try {
          if (partition.makeLeader(controllerId, partitionStateInfo, correlationId)) {
            partitionsToMakeLeaders += partition
            stateChangeLogger.trace(s"Stopped fetchers as part of become-leader request from " +
              s"controller $controllerId epoch $epoch with correlation id $correlationId for partition ${partition.topicPartition} " +
              s"(last update controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch})")
          } else
            stateChangeLogger.info(s"Skipped the become-leader state change after marking its " +
              s"partition as leader with correlation id $correlationId from controller $controllerId epoch $epoch for " +
              s"partition ${partition.topicPartition} (last update controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch}) " +
              s"since it is already the leader for the partition.")
        } catch {
          case e: KafkaStorageException =>
            stateChangeLogger.error(s"Skipped the become-leader state change with " +
              s"correlation id $correlationId from controller $controllerId epoch $epoch for partition ${partition.topicPartition} " +
              s"(last update controller epoch ${partitionStateInfo.basePartitionState.controllerEpoch}) since " +
              s"the replica for the partition is offline due to disk error $e")
            val dirOpt = getLogDir(partition.topicPartition)
            error(s"Error while making broker the leader for partition $partition in dir $dirOpt", e)
            responseMap.put(partition.topicPartition, Errors.KAFKA_STORAGE_ERROR)
        }
      }

    } catch {
      case e: Throwable =>
        partitionState.keys.foreach { partition =>
          stateChangeLogger.error(s"Error while processing LeaderAndIsr request correlationId $correlationId received " +
            s"from controller $controllerId epoch $epoch for partition ${partition.topicPartition}", e)
        }
        // Re-throw the exception for it to be caught in KafkaApis
        throw e
    }

    partitionState.keys.foreach { partition =>
      stateChangeLogger.trace(s"Completed LeaderAndIsr request correlationId $correlationId from controller $controllerId " +
        s"epoch $epoch for the become-leader transition for partition ${partition.topicPartition}")
    }

    partitionsToMakeLeaders
}
```
### makeFollowers
```
参考同步线程启动
```
### removeFetcherForPartitions
```scala
def removeFetcherForPartitions(partitions: Set[TopicPartition]) {
  lock synchronized {
    for (fetcher <- fetcherThreadMap.values)
      fetcher.removePartitions(partitions)
  }
  info(s"Removed fetcher for partitions $partitions")
}
```
### removePartitions
```scala
def removePartitions(topicPartitions: Set[TopicPartition]) {
  partitionMapLock.lockInterruptibly()
  try {
    topicPartitions.foreach { topicPartition =>
      partitionStates.remove(topicPartition)
      fetcherLagStats.unregister(topicPartition)
    }
  } finally partitionMapLock.unlock()
}
```
### shutdownIdleFetcherThreads
```scala
ReplicaManager每次处理完LeaderAndIsr请求后,都会调用ReplicaFetcherManager的shutdownIdleFetcherThreads()方法
如果fetcher线程要拉取的tp集合为空,就会关闭对应的fetcher线程
// 真正关闭线程
def shutdownIdleFetcherThreads() {
    lock synchronized {
      val keysToBeRemoved = new mutable.HashSet[BrokerIdAndFetcherId]
      for ((key, fetcher) <- fetcherThreadMap) {
        if (fetcher.partitionCount <= 0) { // 要拉取的partition数小于0
          fetcher.shutdown()
          keysToBeRemoved += key
        }
      }
      fetcherThreadMap --= keysToBeRemoved
    }
}
```