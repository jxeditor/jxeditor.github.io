---
title: Kafka源码系列之二Topic创建过程
date: 2020-05-06 15:42:41
categories: 大数据
tags: kafka
---

> Topic的创建过程

<!-- more -->

##  Topic的创建
### kafka-topic.sh
```scala
// exec $(dirname $0)/kafka-run-class.sh kafka.admin.TopicCommand "$@"

def createTopic(zkClient: KafkaZkClient, opts: TopicCommandOptions) {
    val topic = opts.options.valueOf(opts.topicOpt)
    val configs = parseTopicConfigsToBeAdded(opts)
    val ifNotExists = opts.options.has(opts.ifNotExistsOpt)
    if (Topic.hasCollisionChars(topic))
      println("WARNING: Due to limitations in metric names, topics with a period ('.') or underscore ('_') could collide. To avoid issues it is best to use either, but not both.")
    val adminZkClient = new AdminZkClient(zkClient)
    try {
      if (opts.options.has(opts.replicaAssignmentOpt)) { // 指定replica的分配,直接向zk更新
        val assignment = parseReplicaAssignment(opts.options.valueOf(opts.replicaAssignmentOpt))
        adminZkClient.createOrUpdateTopicPartitionAssignmentPathInZK(topic, assignment, configs, update = false)
      } else { // 未指定replica的分配,调用自动分配算法进行分配
        CommandLineUtils.checkRequiredArgs(opts.parser, opts.options, opts.partitionsOpt, opts.replicationFactorOpt)
        val partitions = opts.options.valueOf(opts.partitionsOpt).intValue
        val replicas = opts.options.valueOf(opts.replicationFactorOpt).intValue
        val rackAwareMode = if (opts.options.has(opts.disableRackAware)) RackAwareMode.Disabled
                            else RackAwareMode.Enforced
        adminZkClient.createTopic(topic, partitions, replicas, configs, rackAwareMode)
      }
      println("Created topic \"%s\".".format(topic))
    } catch  {
      case e: TopicExistsException => if (!ifNotExists) throw e
    }
}

// 如果指定了partition各个replica的分布,那么将partition replicas的结果验证之后直接更新到zk上
// 验证replicas的代码在parseReplicaAssignment中实现
def parseReplicaAssignment(replicaAssignmentList: String): Map[Int, List[Int]] = {
    val partitionList = replicaAssignmentList.split(",")
    val ret = new mutable.HashMap[Int, List[Int]]()
    for (i <- 0 until partitionList.size) {
      val brokerList = partitionList(i).split(":").map(s => s.trim().toInt)
      val duplicateBrokers = CoreUtils.duplicates(brokerList)
      // 同一个partition对应的replica是不能相同的
      if (duplicateBrokers.nonEmpty)
        throw new AdminCommandFailedException("Partition replica lists may not contain duplicate entries: %s".format(duplicateBrokers.mkString(",")))
      ret.put(i, brokerList.toList)
      // 同一个topic的副本数必须相同
      if (ret(i).size != ret(0).size)
        throw new AdminOperationException("Partition " + i + " has different replication factor: " + brokerList)
    }
    ret.toMap
}

// 如果没有指定的partition replicas分配的话,将会调用adminZkClient.createTopic方法创建topic
// 这个方法首先会检测当前的kafka集群是否机架感知
// 如果有,先获取Broker的机架信息,接着使用Replica自动分配算法分配Partition的replica
// 最后将replicas的结果更新到zk上
def createTopic(topic: String,
                  partitions: Int,
                  replicationFactor: Int,
                  topicConfig: Properties = new Properties,
                  rackAwareMode: RackAwareMode = RackAwareMode.Enforced) {
    val brokerMetadatas = getBrokerMetadatas(rackAwareMode)
    val replicaAssignment = AdminUtils.assignReplicasToBrokers(brokerMetadatas, partitions, replicationFactor)
    createOrUpdateTopicPartitionAssignmentPathInZK(topic, replicaAssignment, topicConfig)
}
```
### Producer创建Topic
```java
// 只有当Server端的auto.create.topics.enable设置为true时,Producer向一个不存在的topic发送数据,该topic才会被自动创建
// 当Producer在向一个topic发送produce请求前,会先通过Metadata请求获取这个topic的metadata信息
// Server端在处理Metadata请求时,如果发现获取metadata的topic不存在,但Server允许producer自动创建
// 那么Server将会自动创建该topic
```

---

## Replica如何分配
### 创建时指定分配
```sh
kafka-topics.sh --create --topic test --zookeeper XXXX --replica-assignment 1:2,3:4,5:6
# 该topic有三个分区,分区0的replica分布在1和2上,分区1的replica分布在3和4上,分区2的replica分布在4和5上
# Server端会将该replica分布直接更新到zk上
```
### replicas自动分配
```scala
/**
   * 副本分配时,有三个原则:
   * 1. 将副本平均分布在所有的 Broker 上;
   * 2. partition 的多个副本应该分配在不同的 Broker 上;
   * 3. 如果所有的 Broker 有机架信息的话, partition 的副本应该分配到不同的机架上。
   *
   * 为实现上面的目标,在没有机架感知的情况下，应该按照下面两个原则分配 replica:
   * 1. 从 broker.list 随机选择一个 Broker,使用 round-robin 算法分配每个 partition 的第一个副本;
   * 2. 对于这个 partition 的其他副本,逐渐增加 Broker.id 来选择 replica 的分配。
   *
   * @param brokerMetadatas
   * @param nPartitions
   * @param replicationFactor
   * @param fixedStartIndex
   * @param startPartitionId
   * @return
   */
def assignReplicasToBrokers(brokerMetadatas: Seq[BrokerMetadata],
                              nPartitions: Int,
                              replicationFactor: Int,
                              fixedStartIndex: Int = -1,
                              startPartitionId: Int = -1): Map[Int, Seq[Int]] = {
    if (nPartitions <= 0) // 要增加的分区数要大于0
      throw new InvalidPartitionsException("Number of partitions must be larger than 0.")
    if (replicationFactor <= 0) // replicas要大于0
      throw new InvalidReplicationFactorException("Replication factor must be larger than 0.")
    if (replicationFactor > brokerMetadatas.size) // replicas超过了broker数
      throw new InvalidReplicationFactorException(s"Replication factor: $replicationFactor larger than available brokers: ${brokerMetadatas.size}.")
    if (brokerMetadatas.forall(_.rack.isEmpty)) // 没有开启机架感知
      assignReplicasToBrokersRackUnaware(nPartitions, replicationFactor, brokerMetadatas.map(_.id), fixedStartIndex,
        startPartitionId)
    else { // 机架感知
      if (brokerMetadatas.exists(_.rack.isEmpty)) // 并不是所有机器都有机架感知
        throw new AdminOperationException("Not all brokers have rack information for replica rack aware assignment.")
      assignReplicasToBrokersRackAware(nPartitions, replicationFactor, brokerMetadatas, fixedStartIndex,
        startPartitionId)
    }
}

// 没有开启机架感知模式,使用assignReplicasToBrokersRackUnaware实现
private def assignReplicasToBrokersRackUnaware(nPartitions: Int,
                                                 replicationFactor: Int,
                                                 brokerList: Seq[Int],
                                                 fixedStartIndex: Int,
                                                 startPartitionId: Int): Map[Int, Seq[Int]] = {
    val ret = mutable.Map[Int, Seq[Int]]()
    val brokerArray = brokerList.toArray
    val startIndex = if (fixedStartIndex >= 0) fixedStartIndex else rand.nextInt(brokerArray.length) // 随机选择一个Broker
    var currentPartitionId = math.max(0, startPartitionId) // 开始增加的第一个Partition
    var nextReplicaShift = if (fixedStartIndex >= 0) fixedStartIndex else rand.nextInt(brokerArray.length)
    for (_ <- 0 until nPartitions) { // 对每个partition进行分配
      if (currentPartitionId > 0 && (currentPartitionId % brokerArray.length == 0))
        nextReplicaShift += 1 // 防止partition过大时,其中某些partition的分配(leader,follower)完全一样
      val firstReplicaIndex = (currentPartitionId + startIndex) % brokerArray.length // partition的第一个replica
      val replicaBuffer = mutable.ArrayBuffer(brokerArray(firstReplicaIndex))
      for (j <- 0 until replicationFactor - 1) // 其他replica的分配
        replicaBuffer += brokerArray(replicaIndex(firstReplicaIndex, nextReplicaShift, j, brokerArray.length))
      ret.put(currentPartitionId, replicaBuffer)
      currentPartitionId += 1
    }
    ret
}

// 为partition设置完第一个replica后,其他replica分配的计算
private def replicaIndex(firstReplicaIndex: Int, secondReplicaShift: Int, replicaIndex: Int, nBrokers: Int): Int = {
    val shift = 1 + (secondReplicaShift + replicaIndex) % (nBrokers - 1) // 在secondReplicaShift的基础上增加一个replicaIndex
    (firstReplicaIndex + shift) % nBrokers
}
```
### replicas更新到zk后触发的操作
```scala
// 当一个topic的replicas更新到zk上后
// 监控zk这个目录的方法会被触发(KafkaTopicChangeHandler.handleChildChange())

// 实际调用的是controller.TopicChange
class TopicChangeHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = TopicsZNode.path

  override def handleChildChange(): Unit = eventManager.put(controller.TopicChange)
}

case object TopicChange extends ControllerEvent {
  override def state: ControllerState = ControllerState.TopicChange
  override def process(): Unit = {
    if (!isActive) return
    val topics = zkClient.getAllTopicsInCluster.toSet
    val newTopics = topics -- controllerContext.allTopics // 新创建的topic列表
    val deletedTopics = controllerContext.allTopics -- topics // 已经删除的topic列表
    controllerContext.allTopics = topics
    registerPartitionModificationsHandlers(newTopics.toSeq)
    
    // 新创建topic对应的partition列表
    val addedPartitionReplicaAssignment = zkClient.getReplicaAssignmentForTopics(newTopics)
    deletedTopics.foreach(controllerContext.removeTopic) // 把已经删除partition的topic过滤掉
    addedPartitionReplicaAssignment.foreach {
      case (topicAndPartition, newReplicas) => controllerContext.updatePartitionReplicaAssignment(topicAndPartition, newReplicas) // 将新增的tp-replicas更新到缓存中
    }
    info(s"New topics: [$newTopics], deleted topics: [$deletedTopics], new partition replica assignment " +
      s"[$addedPartitionReplicaAssignment]")
    if (addedPartitionReplicaAssignment.nonEmpty) // 处理新创建的topic
      onNewPartitionCreation(addedPartitionReplicaAssignment.keySet)
  }
}

/**
 * 此回调由topic更改回调调用，并将失败的代理列表作为输入。
 * 1. 将新创建的分区移到NewPartition状态
 * 2. 从NewPartition->OnlinePartition状态移动新创建的分区
 */
private def onNewPartitionCreation(newPartitions: Set[TopicPartition]) {
  info(s"New partition creation callback for ${newPartitions.mkString(",")}")
  partitionStateMachine.handleStateChanges(newPartitions.toSeq, NewPartition) // 创建Partition对象,并将其状态置为NewPartition状态
  replicaStateMachine.handleStateChanges(controllerContext.replicasForPartition(newPartitions).toSeq, NewReplica) // 创建Replica对象,并将其状态置为NewReplica状态
  partitionStateMachine.handleStateChanges(newPartitions.toSeq, OnlinePartition, Option(OfflinePartitionLeaderElectionStrategy)) // 将Partition对象从NewPartition状态改为OnlinePartition状态
  replicaStateMachine.handleStateChanges(controllerContext.replicasForPartition(newPartitions).toSeq, OnlineReplica) // 将Replica对象从NewReplica改为OnlineReplica状态
}
```
### Replica状态机
```
七种状态
NewReplica: The controller can create new replicas during partition reassignment. In this state, a replica can only get become follower state change request.  Valid previous state is NonExistentReplica
OnlineReplica: Once a replica is started and part of the assigned replicas for its partition, it is in this state. In this state, it can get either become leader or become follower state change requests. Valid previous state are NewReplica, OnlineReplica or OfflineReplica
OfflineReplica: If a replica dies, it moves to this state. This happens when the broker hosting the replica is down. Valid previous state are NewReplica, OnlineReplica
ReplicaDeletionStarted: If replica deletion starts, it is moved to this state. Valid previous state is OfflineReplica
ReplicaDeletionSuccessful: If replica responds with no error code in response to a delete replica request, it is moved to this state. Valid previous state is ReplicaDeletionStarted
ReplicaDeletionIneligible: If replica deletion fails, it is moved to this state. Valid previous state is ReplicaDeletionStarted
NonExistentReplica: If a replica is deleted successfully, it is moved to this state. Valid previous state is ReplicaDeletionSuccessful
```
### Partition状态机
```
四种状态
NonExistentPartition: Partition不存在
NewPartition: Partition刚创建,有对应的Replicas,但还没有Leader和ISR
OnlinePartition: Partition的Leader已经选举出来了,处于正常的工作状态
OfflinePartition: Partition的Leader挂了

只有在OnlinePartition状态,才是可用状态
```

---

## onNewPartitionCreation详细步骤
### changeStateTo方法
```scala
private def changeStateTo(partition: TopicPartition, currentState: PartitionState, targetState: PartitionState): Unit = {
  partitionState.put(partition, targetState) // 缓存partition的状态
  updateControllerMetrics(partition, currentState, targetState)
}
```
### partitionStateMachine->NewPartition
```scala
case NewPartition =>
    validPartitions.foreach { partition =>
      stateChangeLog.trace(s"Changed partition $partition state from ${partitionState(partition)} to $targetState with " +
        s"assigned replicas ${controllerContext.partitionReplicaAssignment(partition).mkString(",")}")
      changeStateTo(partition, partitionState(partition), NewPartition) // 将分区对象的状态置为NewPartition
    }
```
### replicaStateMachine->NewReplica
```scala
case NewReplica =>
  validReplicas.foreach { replica =>
    val partition = replica.topicPartition
    controllerContext.partitionLeadershipInfo.get(partition) match {
      case Some(leaderIsrAndControllerEpoch) =>
        if (leaderIsrAndControllerEpoch.leaderAndIsr.leader == replicaId) { // 这个状态的Replica不能作为Leader
          val exception = new StateChangeFailedException(s"Replica $replicaId for partition $partition cannot be moved to NewReplica state as it is being requested to become leader")
          logFailedStateChange(replica, replicaState(replica), OfflineReplica, exception)
        } else {
          // 向所有replicaId发送LeaderAndIsr请求,这个方法同时也会向所有的Broker发送updateMeta请求
          controllerBrokerRequestBatch.addLeaderAndIsrRequestForBrokers(Seq(replicaId),
            replica.topicPartition,
            leaderIsrAndControllerEpoch,
            controllerContext.partitionReplicaAssignment(replica.topicPartition),
            isNew = true)
          logSuccessfulTransition(replicaId, partition, replicaState(replica), NewReplica)
          replicaState.put(replica, NewReplica)
        }
      case None =>
        logSuccessfulTransition(replicaId, partition, replicaState(replica), NewReplica)
        replicaState.put(replica, NewReplica)
    }
  }
```
### partitionStateMachine->OnlinePartition
```scala
case OnlinePartition =>
    val uninitializedPartitions = validPartitions.filter(partition => partitionState(partition) == NewPartition)
    val partitionsToElectLeader = validPartitions.filter(partition => partitionState(partition) == OfflinePartition || partitionState(partition) == OnlinePartition)
    if (uninitializedPartitions.nonEmpty) {
      // 为新建的Partition初始化Leader和Isr,选取Replica中第一个Replica作为Leader,所有的Replica作为ISR
      // 最后向所有replicaId发送LeaderAndIsr请求以及向所有的Broker发送updateMetadata请求
      val successfulInitializations = initializeLeaderAndIsrForPartitions(uninitializedPartitions)
      successfulInitializations.foreach { partition =>
        stateChangeLog.trace(s"Changed partition $partition from ${partitionState(partition)} to $targetState with state " +
          s"${controllerContext.partitionLeadershipInfo(partition).leaderAndIsr}")
        changeStateTo(partition, partitionState(partition), OnlinePartition)
      }
    }
    if (partitionsToElectLeader.nonEmpty) {
      val successfulElections = electLeaderForPartitions(partitionsToElectLeader, partitionLeaderElectionStrategyOpt.get)
      successfulElections.foreach { partition =>
        stateChangeLog.trace(s"Changed partition $partition from ${partitionState(partition)} to $targetState with state " +
          s"${controllerContext.partitionLeadershipInfo(partition).leaderAndIsr}")
        changeStateTo(partition, partitionState(partition), OnlinePartition)
      }
    }
```
### replicaStateMachine->OnlineReplica
```scala
case OnlineReplica =>
  validReplicas.foreach { replica =>
    val partition = replica.topicPartition
    replicaState(replica) match {
      case NewReplica =>
        // 向 the assigned replicas list 添加这个 replica(正常情况下这些 replicas 已经更新到 list 中了)
        val assignment = controllerContext.partitionReplicaAssignment(partition)
        if (!assignment.contains(replicaId)) {
          controllerContext.updatePartitionReplicaAssignment(partition, assignment :+ replicaId)
        }
      case _ =>
        controllerContext.partitionLeadershipInfo.get(partition) match {
          case Some(leaderIsrAndControllerEpoch) =>
            controllerBrokerRequestBatch.addLeaderAndIsrRequestForBrokers(Seq(replicaId),
              replica.topicPartition,
              leaderIsrAndControllerEpoch,
              controllerContext.partitionReplicaAssignment(partition), isNew = false)
          case None =>
        }
    }
    logSuccessfulTransition(replicaId, partition, replicaState(replica), OnlineReplica)
    replicaState.put(replica, OnlineReplica)
  }
```

---

## 参考
[如何创建Topic](https://www.cnblogs.com/huxi2b/p/5923252.html)