---
title: Kafka源码系列之十三ReplicaManager详解
date: 2020-05-08 16:43:27
categories: 大数据
tags: kafka
---

> 详细介绍ReplicaManager中有什么成员变量,又做了些什么

<!-- more -->

## 概览
```
处理的请求
    LeaderAndIsr
    StopReplica
    UpdateMetadata
    Produce
    Fetch
    ListOffset

LogManager作为ReplicaManager的变量传入了ReplicaManager中
ReplicaManager中的allPartitions负责管理本节点所有的Partition实例
创建Partition实例时,ReplicaManager会作为变量传入Partition中
Partition会为它的每一个副本创建一个Replica实例,但只会为那个在本地副本创建Log对象实例
```

---

## 启动时做了什么
```scala
KafkaServer在启动时,就初始化了ReplicaManager实例
KafkaServer在初始化LogManager之后,就传给了ReplicaManager

replicaManager = createReplicaManager(isShuttingDown)
replicaManager.startup()

protected def createReplicaManager(isShuttingDown: AtomicBoolean): ReplicaManager =
    new ReplicaManager(config, metrics, time, zkClient, kafkaScheduler, logManager, isShuttingDown, quotaManagers,
      brokerTopicStats, metadataCache, logDirFailureChannel)

周期性任务:
    maybeShrinkIsr: 判断tp的isr是否有replica因为延迟或hang主需要从isr中移除
    maybePropagateIsrChanges: 判断是不是需要对isr进行更新
    shutdownIdleReplicaAlterLogDirsThread: 定时关闭空闲的ReplicaAlterDirThread线程
    
def startup() {
    // start ISR expiration thread
    // A follower can lag behind leader for up to config.replicaLagTimeMaxMs x 1.5 before it is removed from ISR
    scheduler.schedule("isr-expiration", maybeShrinkIsr _, period = config.replicaLagTimeMaxMs / 2, unit = TimeUnit.MILLISECONDS)
    scheduler.schedule("isr-change-propagation", maybePropagateIsrChanges _, period = 2500L, unit = TimeUnit.MILLISECONDS)
    scheduler.schedule("shutdown-idle-replica-alter-log-dirs-thread", shutdownIdleReplicaAlterLogDirsThread _, period = 10000L, unit = TimeUnit.MILLISECONDS)

    // If inter-broker protocol (IBP) < 1.0, the controller will send LeaderAndIsrRequest V0 which does not include isNew field.
    // In this case, the broker receiving the request cannot determine whether it is safe to create a partition if a log directory has failed.
    // Thus, we choose to halt the broker on any log diretory failure if IBP < 1.0
    val haltBrokerOnFailure = config.interBrokerProtocolVersion < KAFKA_1_0_IV0
    logDirFailureHandler = new LogDirFailureHandler("LogDirFailureHandler", haltBrokerOnFailure)
    logDirFailureHandler.start()
}
```

---

## ISR变化
```
maybeShrinkIsr()是检查isr是否有replica需要被移除
增加操作为maybeExpandIsr

ReplicaManager在FetchMessages()方法对来自副本的Fetch请求进行处理
实际上会更新相应replica的LEO信息
这时候leader会根据副本LEO信息的变动来判断这个副本是否满足加入isr的条件
```
### updateFollowerLogReadResults
```scala
更新远程副本的信息
找到本节点的Partition对象,然后调用其updateReplicaLogReadResult()
更新副本的LEO信息和拉取时间信息
private def updateFollowerLogReadResults(replicaId: Int,
                                           readResults: Seq[(TopicPartition, LogReadResult)]): Seq[(TopicPartition, LogReadResult)] = {
    debug(s"Recording follower broker $replicaId log end offsets: $readResults")
    readResults.map { case (topicPartition, readResult) =>
      var updatedReadResult = readResult
      nonOfflinePartition(topicPartition) match {
        case Some(partition) =>
          partition.getReplica(replicaId) match {
            case Some(replica) =>
              // 更新副本的相关信息
              partition.updateReplicaLogReadResult(replica, readResult)
            case None =>
              warn(s"Leader $localBrokerId failed to record follower $replicaId's position " +
                s"${readResult.info.fetchOffsetMetadata.messageOffset} since the replica is not recognized to be " +
                s"one of the assigned replicas ${partition.assignedReplicas.map(_.brokerId).mkString(",")} " +
                s"for partition $topicPartition. Empty records will be returned for this partition.")
              updatedReadResult = readResult.withEmptyFetchInfo
          }
        case None =>
          warn(s"While recording the replica LEO, the partition $topicPartition hasn't been created.")
      }
      topicPartition -> updatedReadResult
    }
}
```
### updateReplicaLogReadResult
```scala
1.updateLogReadResult(): 更新副本的相关信息,这里是更新该副本的LEO,LastFetchLeaderLogEndOffset和LastFetchTimeMs
2.maybeExpandIsr(): 判断isr是否需要扩充,即是否有不在isr内的副本满足进入isr的条件

def updateReplicaLogReadResult(replica: Replica, logReadResult: LogReadResult): Boolean = {
    val replicaId = replica.brokerId
    // No need to calculate low watermark if there is no delayed DeleteRecordsRequest
    val oldLeaderLW = if (replicaManager.delayedDeleteRecordsPurgatory.delayed > 0) lowWatermarkIfLeader else -1L
    // 更新副本的信息
    replica.updateLogReadResult(logReadResult)
    val newLeaderLW = if (replicaManager.delayedDeleteRecordsPurgatory.delayed > 0) lowWatermarkIfLeader else -1L
    // check if the LW of the partition has incremented
    // since the replica's logStartOffset may have incremented
    val leaderLWIncremented = newLeaderLW > oldLeaderLW
    // check if we need to expand ISR to include this replica
    // if it is not in the ISR yet
    // 如果副本不在ISR中,检查是否需要进行扩充
    val leaderHWIncremented = maybeExpandIsr(replicaId, logReadResult)

    val result = leaderLWIncremented || leaderHWIncremented
    // some delayed operations may be unblocked after HW or LW changed
    if (result)
      tryCompleteDelayedRequests()

    debug(s"Recorded replica $replicaId log end offset (LEO) position ${logReadResult.info.fetchOffsetMetadata.messageOffset}.")
    result
}
```
### maybeExpandIsr
```scala
根据replicaId的LEO来判断是否满足进入ISR的条件
如果满足,添加到ISR中
之后调用updateIsr更新这个tp的isr信息和更新HW信息

def maybeExpandIsr(replicaId: Int, logReadResult: LogReadResult): Boolean = {
    inWriteLock(leaderIsrUpdateLock) {
      // check if this replica needs to be added to the ISR
      leaderReplicaIfLocal match {
        case Some(leaderReplica) =>
          val replica = getReplica(replicaId).get
          val leaderHW = leaderReplica.highWatermark
          val fetchOffset = logReadResult.info.fetchOffsetMetadata.messageOffset
          // replica LEO大于HW情况下,加入ISR列表
          if (!inSyncReplicas.contains(replica) &&
             assignedReplicas.map(_.brokerId).contains(replicaId) &&
             replica.logEndOffset.offsetDiff(leaderHW) >= 0 &&
             leaderEpochStartOffsetOpt.exists(fetchOffset >= _)) {
            val newInSyncReplicas = inSyncReplicas + replica
            info(s"Expanding ISR from ${inSyncReplicas.map(_.brokerId).mkString(",")} " +
              s"to ${newInSyncReplicas.map(_.brokerId).mkString(",")}")
            // update ISR in ZK and cache
            // 更新到ZK
            updateIsr(newInSyncReplicas)
            replicaManager.isrExpandRate.mark()
          }
          // check if the HW of the partition can now be incremented
          // since the replica may already be in the ISR and its LEO has just incremented
          // 检查HW是否需要更新
          maybeIncrementLeaderHW(leaderReplica, logReadResult.fetchTimeMs)
        case None => false // nothing to do if no longer leader
      }
    }
}
```

---

## UpdateMetadata请求
```scala
def handleUpdateMetadataRequest(request: RequestChannel.Request) {
    val correlationId = request.header.correlationId
    val updateMetadataRequest = request.body[UpdateMetadataRequest]

    if (isAuthorizedClusterAction(request)) {
      // 更新metadata,返回需要删除的partition
      val deletedPartitions = replicaManager.maybeUpdateMetadataCache(correlationId, updateMetadataRequest)
      if (deletedPartitions.nonEmpty)
        // GroupCoordinator会清除相关partition的信息
        groupCoordinator.handleDeletedPartitions(deletedPartitions)

      if (adminManager.hasDelayedTopicOperations) {
        updateMetadataRequest.partitionStates.keySet.asScala.map(_.topic).foreach { topic =>
          adminManager.tryCompleteDelayedTopicOperations(topic)
        }
      }
      quotas.clientQuotaCallback.foreach { callback =>
        if (callback.updateClusterMetadata(metadataCache.getClusterMetadata(clusterId, request.context.listenerName))) {
          quotas.fetch.updateQuotaMetricConfigs()
          quotas.produce.updateQuotaMetricConfigs()
          quotas.request.updateQuotaMetricConfigs()
        }
      }
      sendResponseExemptThrottle(request, new UpdateMetadataResponse(Errors.NONE))
    } else {
      sendResponseMaybeThrottle(request, _ => new UpdateMetadataResponse(Errors.CLUSTER_AUTHORIZATION_FAILED))
    }
}
```
### maybeUpdateMetadataCache
```scala
def maybeUpdateMetadataCache(correlationId: Int, updateMetadataRequest: UpdateMetadataRequest) : Seq[TopicPartition] =  {
    replicaStateChangeLock synchronized {
      if(updateMetadataRequest.controllerEpoch < controllerEpoch) {
        val stateControllerEpochErrorMessage = s"Received update metadata request with correlation id $correlationId " +
          s"from an old controller ${updateMetadataRequest.controllerId} with epoch ${updateMetadataRequest.controllerEpoch}. " +
          s"Latest known controller epoch is $controllerEpoch"
        stateChangeLogger.warn(stateControllerEpochErrorMessage)
        throw new ControllerMovedException(stateChangeLogger.messageWithPrefix(stateControllerEpochErrorMessage))
      } else {
        // 更新metadata信息,并返回要删除的partition信息
        val deletedPartitions = metadataCache.updateMetadata(correlationId, updateMetadataRequest)
        controllerEpoch = updateMetadataRequest.controllerEpoch
        deletedPartitions
      }
    }
}
```
### updateMetadata
```scala
1.本节点的aliveNodes和aliveBrokers记录,更新为最新的记录
2.对于要删除的tp,从缓存中删除,并记录下来作为这个方法的返回
3.对于其他的tp,addOrUpdatePartitionInfo

def updateMetadata(correlationId: Int, updateMetadataRequest: UpdateMetadataRequest): Seq[TopicPartition] = {
    inWriteLock(partitionMetadataLock) {

      //since kafka may do partial metadata updates, we start by copying the previous state
      val partitionStates = new mutable.AnyRefMap[String, mutable.LongMap[UpdateMetadataRequest.PartitionState]](metadataSnapshot.partitionStates.size)
      metadataSnapshot.partitionStates.foreach { case (topic, oldPartitionStates) =>
        val copy = new mutable.LongMap[UpdateMetadataRequest.PartitionState](oldPartitionStates.size)
        copy ++= oldPartitionStates
        partitionStates += (topic -> copy)
      }
      // 更新
      val aliveBrokers = new mutable.LongMap[Broker](metadataSnapshot.aliveBrokers.size)
      val aliveNodes = new mutable.LongMap[collection.Map[ListenerName, Node]](metadataSnapshot.aliveNodes.size)
      val controllerId = updateMetadataRequest.controllerId match {
          case id if id < 0 => None
          case id => Some(id)
        }

      updateMetadataRequest.liveBrokers.asScala.foreach { broker =>
        // `aliveNodes` is a hot path for metadata requests for large clusters, so we use java.util.HashMap which
        // is a bit faster than scala.collection.mutable.HashMap. When we drop support for Scala 2.10, we could
        // move to `AnyRefMap`, which has comparable performance.
        val nodes = new java.util.HashMap[ListenerName, Node]
        val endPoints = new mutable.ArrayBuffer[EndPoint]
        broker.endPoints.asScala.foreach { ep =>
          endPoints += EndPoint(ep.host, ep.port, ep.listenerName, ep.securityProtocol)
          nodes.put(ep.listenerName, new Node(broker.id, ep.host, ep.port))
        }
        aliveBrokers(broker.id) = Broker(broker.id, endPoints, Option(broker.rack))
        aliveNodes(broker.id) = nodes.asScala
      }
      aliveNodes.get(brokerId).foreach { listenerMap =>
        val listeners = listenerMap.keySet
        if (!aliveNodes.values.forall(_.keySet == listeners))
          error(s"Listeners are not identical across brokers: $aliveNodes")
      }

      val deletedPartitions = new mutable.ArrayBuffer[TopicPartition]
      updateMetadataRequest.partitionStates.asScala.foreach { case (tp, info) =>
        val controllerId = updateMetadataRequest.controllerId
        val controllerEpoch = updateMetadataRequest.controllerEpoch
        if (info.basePartitionState.leader == LeaderAndIsr.LeaderDuringDelete) {
          // 删除
          removePartitionInfo(partitionStates, tp.topic, tp.partition)
          stateChangeLogger.trace(s"Deleted partition $tp from metadata cache in response to UpdateMetadata " +
            s"request sent by controller $controllerId epoch $controllerEpoch with correlation id $correlationId")
          deletedPartitions += tp
        } else {
          // 更新
          addOrUpdatePartitionInfo(partitionStates, tp.topic, tp.partition, info)
          stateChangeLogger.trace(s"Cached leader info $info for partition $tp in response to " +
            s"UpdateMetadata request sent by controller $controllerId epoch $controllerEpoch with correlation id $correlationId")
        }
      }
      metadataSnapshot = MetadataSnapshot(partitionStates, controllerId, aliveBrokers, aliveNodes)
      deletedPartitions
    }
}
```