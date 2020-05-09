---
title: Kafka源码系列之十四Controller
date: 2020-05-08 17:43:20
categories: 大数据
tags: kafka
---

> Controller类似于其他分布式系统的Master角色,Kafka任何一台Broker都可以作为Controller,但是同一集群同时只会有一个alive状态的Controller

<!-- more -->

## Controller简介
```
Broker的上线,下线处理
新创建的topic,已经topic的分区扩容,处理分区副本的分配,leader选举
管理所有副本的状态机和分区状态机,处理状态机变化事件
topic删除,副本迁移,leader切换等处理
```

---

## Controller选举
```scala
Kafka的每台Broker启动过程中都会启动Controller服务

// KafkaServer
kafkaController = new KafkaController(config, zkClient, time, metrics, brokerInfo, tokenManager, threadNamePrefix)
kafkaController.startup()
```
### 启动
```scala
def startup() = {
  // zk上controller节点变化
  zkClient.registerStateChangeHandler(new StateChangeHandler {
    override val name: String = StateChangeHandlers.ControllerHandler
    override def afterInitializingSession(): Unit = {
      eventManager.put(RegisterBrokerAndReelect)
    }
    override def beforeInitializingSession(): Unit = {
      val expireEvent = new Expire
      eventManager.clearAndPut(expireEvent)
      // Block initialization of the new session until the expiration event is being handled,
      // which ensures that all pending events have been processed before creating the new session
      expireEvent.waitUntilProcessingStarted()
    }
  })
  eventManager.put(Startup) // 选举
  eventManager.start()
}
```
### 选举
```scala
case object Startup extends ControllerEvent {
  def state = ControllerState.ControllerChange
  override def process(): Unit = {
    zkClient.registerZNodeChangeHandlerAndCheckExistence(controllerChangeHandler) // controller节点数据变化
    elect() // 在controller不存的情况下选举controller,存在的话,就是从zk获取当前的controller节点信息
  }
}
```
#### registerZNodeChangeHandlerAndCheckExistence
```scala
1.如果/controller节点内容变化,那么更新一下controller最新的节点信息,如果节点之前是controller,现在不是,需要执行关闭操作onControllerResignation()
2.如果/controller节点被删除,如果之前是controller,需要关闭,然后重新选举

// 注册controllerChangeHandler监听
// ControllerChange节点改变
// Reelect重新选举
class ControllerChangeHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChangeHandler {
  override val path: String = ControllerZNode.path

  override def handleCreation(): Unit = eventManager.put(controller.ControllerChange)
  override def handleDeletion(): Unit = eventManager.put(controller.Reelect)
  override def handleDataChange(): Unit = eventManager.put(controller.ControllerChange)
}
```
#### elect
```scala
1.获取zk的/controller节点的信息,获取controller的brokerId,如果节点不存在,那么获取controllerId为-1
2.如果controller不为-1,controller已经存在,直接结束
3.如果controller为-1,controller不存在,当前broker开始在zk注册controller
4.如果注册成功,当前broker成为controller,调用onControllerFailover()方法正式初始化controller
5.如果注册失败,那么直接返回
6.controller节点是临时节点,当前controller与zk的session断开,那么controller的临时节点会消失,会触发controller的重新选举

// 进行controller选举
private def elect(): Unit = {
    val timestamp = time.milliseconds
    activeControllerId = zkClient.getControllerId.getOrElse(-1)
    /*
     * We can get here during the initial startup and the handleDeleted ZK callback. Because of the potential race condition,
     * it's possible that the controller has already been elected when we get here. This check will prevent the following
     * createEphemeralPath method from getting into an infinite loop if this broker is already the controller.
     */
    if (activeControllerId != -1) {
      debug(s"Broker $activeControllerId has been elected as the controller, so stopping the election process.")
      return
    }

    try {
      // 没有异常就创建成功
      zkClient.registerController(config.brokerId, timestamp)
      info(s"${config.brokerId} successfully elected as the controller")
      activeControllerId = config.brokerId
      onControllerFailover() // 成为controller,开启监听
    } catch {
      // 创建时,发现有broker提前注册成功
      case _: NodeExistsException =>
        // If someone else has written the path, then
        activeControllerId = zkClient.getControllerId.getOrElse(-1)

        if (activeControllerId != -1)
          debug(s"Broker $activeControllerId was elected as controller instead of broker ${config.brokerId}")
        else
          warn("A controller has been elected but just resigned, this will result in another round of election")

      // 其他异常,重新选举controller
      case e2: Throwable =>
        error(s"Error while electing or becoming controller on broker ${config.brokerId}", e2)
        triggerControllerMove()
    }
}
```

---

## Controller启动
### onControllerFailover
```scala
1.注册Controller epoch变化监听器
2.增加Controller epoch
3.初始化Controller
4.启动Controller的channel管理器
5.启动replica状态机
6.启动partition状态机

private def onControllerFailover() {
    info("Reading controller epoch from ZooKeeper")
    readControllerEpochFromZooKeeper()
    info("Incrementing controller epoch in ZooKeeper")
    incrementControllerEpoch()
    info("Registering handlers")

    // before reading source of truth from zookeeper, register the listeners to get broker/topic callbacks
    // 注册监听zk上controller节点的子节点变化
    // topic上下线,broker上下线,isr变动
    val childChangeHandlers = Seq(brokerChangeHandler, topicChangeHandler, topicDeletionHandler, logDirEventNotificationHandler,
      isrChangeNotificationHandler)
    childChangeHandlers.foreach(zkClient.registerZNodeChildChangeHandler)
    // 最优replica leader选举,分区迁移
    val nodeChangeHandlers = Seq(preferredReplicaElectionHandler, partitionReassignmentHandler)
    nodeChangeHandlers.foreach(zkClient.registerZNodeChangeHandlerAndCheckExistence)

    info("Deleting log dir event notifications")
    zkClient.deleteLogDirEventNotifications()
    info("Deleting isr change notifications")
    zkClient.deleteIsrChangeNotifications()
    info("Initializing controller context")
    // 初始化controller,包括alive broker列表,partition详细信息等
    initializeControllerContext()
    info("Fetching topic deletions in progress")
    val (topicsToBeDeleted, topicsIneligibleForDeletion) = fetchTopicDeletionsInProgress()
    info("Initializing topic deletion manager")
    topicDeletionManager.init(topicsToBeDeleted, topicsIneligibleForDeletion)

    // We need to send UpdateMetadataRequest after the controller context is initialized and before the state machines
    // are started. The is because brokers need to receive the list of live brokers from UpdateMetadataRequest before
    // they can process the LeaderAndIsrRequests that are generated by replicaStateMachine.startup() and
    // partitionStateMachine.startup().
    info("Sending update metadata request")
    // 在controller初始化之后,发送UpdateMetadata请求在状态机启动之前,获取当前存活的brokerList
    // 因为它们需要处理来自副本状态机和分区状态机启动发送的LeaderAndIsr请求
    sendUpdateMetadataRequest(controllerContext.liveOrShuttingDownBrokerIds.toSeq)

    // 初始化replica状态信息:replica存活状态OnlineReplica,否则ReplicaDeletionIneligible
    replicaStateMachine.startup()
    // 初始化partition状态信息:leader所在的broker是active的,状态为OnlinePartition,否则OfflinePartition
    // 并状态为OfflinePartition的topic选举leader
    partitionStateMachine.startup()

    info(s"Ready to serve as the new controller with epoch $epoch")
    // 触发一次分区副本迁移操作
    maybeTriggerPartitionReassignment(controllerContext.partitionsBeingReassigned.keySet)
    topicDeletionManager.tryTopicDeletion()
    val pendingPreferredReplicaElections = fetchPendingPreferredReplicaElections()
    onPreferredReplicaElection(pendingPreferredReplicaElections)
    info("Starting the controller scheduler")
    kafkaScheduler.startup()
    // 如果开启自动均衡
    if (config.autoLeaderRebalanceEnable) {
      scheduleAutoLeaderRebalanceTask(delay = 5, unit = TimeUnit.SECONDS) // 发送最新的meta信息
    }

    if (config.tokenAuthEnabled) {
      info("starting the token expiry check scheduler")
      tokenCleanScheduler.startup()
      tokenCleanScheduler.schedule(name = "delete-expired-tokens",
        fun = tokenManager.expireTokens,
        period = config.delegationTokenExpiryCheckIntervalMs,
        unit = TimeUnit.MILLISECONDS)
    }
}
```
### KafkaController内容
```
两个状态机:
    分区状态机,副本状态机
一个管理器:
    Channel管理器,负责所有的Broker通信
相关缓存:
    Partition信息,Topic信息,BrokerId信息等
四种Leader选举机制:
    用于Leader下线,Broker下线,Partition分配,最优Leader选举
    对应Handler不同的操作
    OfflinePartitionLeaderElectionStrategy
    ReassignPartitionLeaderElectionStrategy
    PreferredReplicaPartitionLeaderElectionStrategy
    ControlledShutdownPartitionLeaderElectionStrategy
```
### initializeControllerContext初始化
```
1.从zk中获取所有aliveBroker列表,记录到liveBrokers
2.从zk中获取所有topic列表,记录到allTopics
3.registerPartitionModificationsHandlers注册分区改变监听
4.从zk中获取所有Replica信息,updatePartitionReplicaAssignment()更新到partitionReplicaAssignmentUnderlying
5.清除partitionLeadershipInfo,LeaderAndIsr信息
6.注册Broker改变监听
7.更新LeaderAndIsr信息
8.启动Controller的ChannelManager
9.初始化需要进行副本迁移的Partition列表
```
### ControllerChannelManager
```scala
private def startChannelManager() {
  controllerContext.controllerChannelManager = new ControllerChannelManager(controllerContext, config, time, metrics,
    stateChangeLogger, threadNamePrefix)
  controllerContext.controllerChannelManager.startup()
}

// ControllerChannelManager在初始化时,会为集群中每个节点初始化一个ControllerBrokerStateInfo对象
protected val brokerStateInfo = new HashMap[Int, ControllerBrokerStateInfo]

// 该对象包括NetworkClient,Node,BlockingQueue,RequestSendThread
case class ControllerBrokerStateInfo(networkClient: NetworkClient,
     brokerNode: Node,
     messageQueue: BlockingQueue[QueueItem],
     requestSendThread: RequestSendThread,
     queueSizeGauge: Gauge[Int],
     requestRateAndTimeMetrics: Timer)

// KafkaController向Broker发送请求
private[controller] def sendRequest(brokerId: Int, apiKey: ApiKeys, request: AbstractRequest.Builder[_ <: AbstractRequest],
                                    callback: AbstractResponse => Unit = null) = {
  // 实际调用controllerChannelManager的sendRequest()
  controllerContext.controllerChannelManager.sendRequest(brokerId, apiKey, request, callback)
}

// ControllerChannelManager发送方法,并不是实际发送,而是添加到对应的queue中
// 真正的发送在ResultSendThread中处理
def sendRequest(brokerId: Int, apiKey: ApiKeys, request: AbstractRequest.Builder[_ <: AbstractRequest],
                callback: AbstractResponse => Unit = null) {
  brokerLock synchronized {
    val stateInfoOpt = brokerStateInfo.get(brokerId)
    stateInfoOpt match {
      case Some(stateInfo) =>
        stateInfo.messageQueue.put(QueueItem(apiKey, request, callback, time.milliseconds()))
      case None =>
        warn(s"Not sending request $request to broker $brokerId, since it is offline.")
    }
  }
}
```

---

## 四种选举策略
```
OfflinePartitionLeaderElectionStrategy
    Leader掉线时触发
ReassignPartitionLeaderElectionStrategy
    分区副本重新分配数据同步完成后触发
PreferredReplicaPartitionLeaderElectionStrategy
    最优Leader选举,手动触发或自动leader均衡调度时触发
ControlledShutdownPartitionLeaderElectionStrategy
    Broker发送ShutDown请求主动关闭服务时触发
```
### OfflinePartitionLeaderElectionStrategy
```scala
private def leaderForOffline(leaderIsrAndControllerEpochs: Seq[(TopicPartition, LeaderIsrAndControllerEpoch)]):
  Seq[(TopicPartition, Option[LeaderAndIsr], Seq[Int])] = {
    val (partitionsWithNoLiveInSyncReplicas, partitionsWithLiveInSyncReplicas) = leaderIsrAndControllerEpochs.partition { case (partition, leaderIsrAndControllerEpoch) =>
      val liveInSyncReplicas = leaderIsrAndControllerEpoch.leaderAndIsr.isr.filter(replica => controllerContext.isReplicaOnline(replica, partition))
      liveInSyncReplicas.isEmpty
    }
    val (logConfigs, failed) = zkClient.getLogConfigs(partitionsWithNoLiveInSyncReplicas.map { case (partition, _) => partition.topic }, config.originals())
    val partitionsWithUncleanLeaderElectionState = partitionsWithNoLiveInSyncReplicas.map { case (partition, leaderIsrAndControllerEpoch) =>
      if (failed.contains(partition.topic)) {
        logFailedStateChange(partition, partitionState(partition), OnlinePartition, failed(partition.topic))
        (partition, None, false)
      } else {
        (partition, Option(leaderIsrAndControllerEpoch), logConfigs(partition.topic).uncleanLeaderElectionEnable.booleanValue())
      }
    } ++ partitionsWithLiveInSyncReplicas.map { case (partition, leaderIsrAndControllerEpoch) => (partition, Option(leaderIsrAndControllerEpoch), false) }
    partitionsWithUncleanLeaderElectionState.map { case (partition, leaderIsrAndControllerEpochOpt, uncleanLeaderElectionEnabled) =>
      val assignment = controllerContext.partitionReplicaAssignment(partition)
      val liveReplicas = assignment.filter(replica => controllerContext.isReplicaOnline(replica, partition))
      if (leaderIsrAndControllerEpochOpt.nonEmpty) {
        val leaderIsrAndControllerEpoch = leaderIsrAndControllerEpochOpt.get
        val isr = leaderIsrAndControllerEpoch.leaderAndIsr.isr
        val leaderOpt = PartitionLeaderElectionAlgorithms.offlinePartitionLeaderElection(assignment, isr, liveReplicas.toSet, uncleanLeaderElectionEnabled, controllerContext)
        val newLeaderAndIsrOpt = leaderOpt.map { leader =>
          val newIsr = if (isr.contains(leader)) isr.filter(replica => controllerContext.isReplicaOnline(replica, partition))
          else List(leader)
          leaderIsrAndControllerEpoch.leaderAndIsr.newLeaderAndIsr(leader, newIsr)
        }
        (partition, newLeaderAndIsrOpt, liveReplicas)
      } else {
        (partition, None, liveReplicas)
      }
    }
}
```
### ReassignPartitionLeaderElectionStrategy
```scala
private def leaderForReassign(leaderIsrAndControllerEpochs: Seq[(TopicPartition, LeaderIsrAndControllerEpoch)]):
  Seq[(TopicPartition, Option[LeaderAndIsr], Seq[Int])] = {
    leaderIsrAndControllerEpochs.map { case (partition, leaderIsrAndControllerEpoch) =>
      val reassignment = controllerContext.partitionsBeingReassigned(partition).newReplicas
      val liveReplicas = reassignment.filter(replica => controllerContext.isReplicaOnline(replica, partition))
      val isr = leaderIsrAndControllerEpoch.leaderAndIsr.isr
      val leaderOpt = PartitionLeaderElectionAlgorithms.reassignPartitionLeaderElection(reassignment, isr, liveReplicas.toSet)
      val newLeaderAndIsrOpt = leaderOpt.map(leader => leaderIsrAndControllerEpoch.leaderAndIsr.newLeader(leader))
      (partition, newLeaderAndIsrOpt, reassignment)
    }
}
```
### PreferredReplicaPartitionLeaderElectionStrategy
```scala
private def leaderForPreferredReplica(leaderIsrAndControllerEpochs: Seq[(TopicPartition, LeaderIsrAndControllerEpoch)]):
  Seq[(TopicPartition, Option[LeaderAndIsr], Seq[Int])] = {
    leaderIsrAndControllerEpochs.map { case (partition, leaderIsrAndControllerEpoch) =>
      val assignment = controllerContext.partitionReplicaAssignment(partition)
      val liveReplicas = assignment.filter(replica => controllerContext.isReplicaOnline(replica, partition))
      val isr = leaderIsrAndControllerEpoch.leaderAndIsr.isr
      val leaderOpt = PartitionLeaderElectionAlgorithms.preferredReplicaPartitionLeaderElection(assignment, isr, liveReplicas.toSet)
      val newLeaderAndIsrOpt = leaderOpt.map(leader => leaderIsrAndControllerEpoch.leaderAndIsr.newLeader(leader))
      (partition, newLeaderAndIsrOpt, assignment)
    }
}
```
### ControlledShutdownPartitionLeaderElectionStrategy
```scala
private def leaderForControlledShutdown(leaderIsrAndControllerEpochs: Seq[(TopicPartition, LeaderIsrAndControllerEpoch)], shuttingDownBrokers: Set[Int]):
  Seq[(TopicPartition, Option[LeaderAndIsr], Seq[Int])] = {
    leaderIsrAndControllerEpochs.map { case (partition, leaderIsrAndControllerEpoch) =>
      val assignment = controllerContext.partitionReplicaAssignment(partition)
      val liveOrShuttingDownReplicas = assignment.filter(replica => controllerContext.isReplicaOnline(replica, partition, includeShuttingDownBrokers = true))
      val isr = leaderIsrAndControllerEpoch.leaderAndIsr.isr
      val leaderOpt = PartitionLeaderElectionAlgorithms.controlledShutdownPartitionLeaderElection(assignment, isr, liveOrShuttingDownReplicas.toSet, shuttingDownBrokers)
      val newIsr = isr.filter(replica => !controllerContext.shuttingDownBrokerIds.contains(replica))
      val newLeaderAndIsrOpt = leaderOpt.map(leader => leaderIsrAndControllerEpoch.leaderAndIsr.newLeaderAndIsr(leader, newIsr))
      (partition, newLeaderAndIsrOpt, liveOrShuttingDownReplicas)
    }
}
```