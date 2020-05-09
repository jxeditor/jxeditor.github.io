---
title: Kafka源码系列之十五状态机
date: 2020-05-09 10:26:52
categories: 大数据
tags: kafka
---

> 介绍KafkaController中的两种状态机

<!-- more -->

## ReplicaStateMachine
### 初始化
```scala
ReplicaStateMachine记录集群所有Replica的状态信息
决定着Replica处在什么状态,能够转变为什么状态

// KafkaController.onControllerFailover().replicaStateMachine.startup()
def startup() {
  info("Initializing replica state")
  // 初始化
  initializeReplicaState()
  info("Triggering online replica state changes")
  // 将存活的副本状态转变为OnlineReplica
  handleStateChanges(controllerContext.allLiveReplicas().toSeq, OnlineReplica)
  info(s"Started replica state machine with initial state -> $replicaState")
}

// 这里只是将Replica状态信息更新副本状态机缓存中replicaState,并没有真正进行状态转移操作
private def initializeReplicaState() {
  controllerContext.allPartitions.foreach { partition =>
    val replicas = controllerContext.partitionReplicaAssignment(partition)
    replicas.foreach { replicaId =>
      val partitionAndReplica = PartitionAndReplica(partition, replicaId)
      // 如果副本是存活的,将状态置为OnlineReplica
      if (controllerContext.isReplicaOnline(replicaId, partition))
        replicaState.put(partitionAndReplica, OnlineReplica)
      else
        // 将不存活的副本状态置为ReplicaDeletionIneligible
        replicaState.put(partitionAndReplica, ReplicaDeletionIneligible)
    }
  }
}

// handleStateChanges()才是真正进行状态转移的地方
def handleStateChanges(replicas: Seq[PartitionAndReplica], targetState: ReplicaState,
                       callbacks: Callbacks = new Callbacks()): Unit = {
  if (replicas.nonEmpty) {
    try {
      controllerBrokerRequestBatch.newBatch()
      replicas.groupBy(_.replica).map { case (replicaId, replicas) =>
        val partitions = replicas.map(_.topicPartition)
        // 状态转移
        doHandleStateChanges(replicaId, partitions, targetState, callbacks)
      }
      // 向Broker发送相应请求
      controllerBrokerRequestBatch.sendRequestsToBrokers(controllerContext.epoch)
    } catch {
      case e: Throwable => error(s"Error while moving some replicas to $targetState state", e)
    }
  }
}
```
### 种类
```
NewReplica: 
    此状态下,Controller可以创建这个Replica,该Replica只能为Follower,可以是Replica删除后的一个临时状态
    有效前置状态: 
        NonExistentReplica

OnlineReplica:
    一旦这个Replica被分配到指定的Partition上,并且Replica创建完成,那么它会被置为这个状态,这个状态下,既可以为Leader,也可以为Follower
    有效前置状态:
        NewReplica
        OnlineReplica
        OfflineReplica

OfflineReplica:
    如果一个Replica挂掉,该Replica转换到这个状态
    有效前置状态:
        NewReplica
        OnlineReplica
        OfflineReplica

ReplicaDeletionStarted:
    Replica开始删除时被置为的状态
    有效前置状态:
        OfflineReplica

ReplicaDeletionSuccessful:
    Replica在删除时没有任何问题,将被置为这个状态,代表Replica的数据已经从节点上清除了
    有效前置状态:
        ReplicaDeletionStarted

ReplicaDeletionIneligible:
    Replica删除失败,转换为这个状态
    有效前置状态:
        ReplicaDeletionStarted

NonExistentReplica:
    Replica删除成功,转换为这个状态
    有效前置状态:
        ReplicaDeletionSuccessful
```
### 副本状态转移
```
参考ReplicaStateMachine中各状态的调用情况
doHandleStateChanges()
```

---

## PartitionStateMachine
### 初始化
```
PartitionStateMachine记录着集群所有Partition的状态信息
决定一个Partition处在什么状态以及可以转变为什么状态

def startup() {
  info("Initializing partition state")
  // 初始化
  initializePartitionState()
  info("Triggering online partition state changes")
  // 为所有处理NewPartition,OnlinePartition状态的Partition选举Leader
  triggerOnlinePartitionStateChange()
  info(s"Started partition state machine with initial state -> $partitionState")
}

// 如果该Partition有LeaderAndIsr信息,PartitionLeader所在的机器是alive的,那么将其状态设置OnlinePartition,否则设置为OfflinePartition
// 如果该Partition没有LeaderAndIsr信息,状态设置为NewPartition
// 同样也是缓存partitionState
private def initializePartitionState() {
  for (topicPartition <- controllerContext.allPartitions) {
    // check if leader and isr path exists for partition. If not, then it is in NEW state
    controllerContext.partitionLeadershipInfo.get(topicPartition) match {
      case Some(currentLeaderIsrAndEpoch) =>
        // else, check if the leader for partition is alive. If yes, it is in Online state, else it is in Offline state
        if (controllerContext.isReplicaOnline(currentLeaderIsrAndEpoch.leaderAndIsr.leader, topicPartition))
        // leader is alive
          changeStateTo(topicPartition, NonExistentPartition, OnlinePartition)
        else
          changeStateTo(topicPartition, NonExistentPartition, OfflinePartition)
      case None =>
        changeStateTo(topicPartition, NonExistentPartition, NewPartition)
    }
  }
}

// 修改状态,在controller选举后或者broker上下线的时候触发
def triggerOnlinePartitionStateChange(partitionState: Map[TopicPartition, PartitionState]) {
  // try to move all partitions in NewPartition or OfflinePartition state to OnlinePartition state except partitions
  // that belong to topics to be deleted
  val partitionsToTrigger = partitionState.filter { case (partition, partitionState) =>
    !topicDeletionManager.isTopicQueuedUpForDeletion(partition.topic) &&
      (partitionState.equals(OfflinePartition) || partitionState.equals(NewPartition))
  }.keys.toSeq
  // 更改状态
  handleStateChanges(partitionsToTrigger, OnlinePartition, Option(OfflinePartitionLeaderElectionStrategy))
  // TODO: If handleStateChanges catches an exception, it is not enough to bail out and log an error.
  // It is important to trigger leader election for those partitions.
}

def handleStateChanges(partitions: Seq[TopicPartition], targetState: PartitionState,
                       partitionLeaderElectionStrategyOpt: Option[PartitionLeaderElectionStrategy] = None): Unit = {
  if (partitions.nonEmpty) {
    try {
      controllerBrokerRequestBatch.newBatch()
      // 尝试为处在OfflinePartition或NewPartition状态的Partition选主
      // 成功后转换为OnlinePartition
      doHandleStateChanges(partitions, targetState, partitionLeaderElectionStrategyOpt)
      // 发送请求给所有broker,包括LeaderAndIsr请求和UpdateMetadata请求,添加到队列中
      controllerBrokerRequestBatch.sendRequestsToBrokers(controllerContext.epoch)
    } catch {
      case e: Throwable => error(s"Error while moving some partitions to $targetState state", e)
    }
  }
}
```
### 种类
```
NonExistentPartition:
    代表这个Partition之前没有被创建过或者之前创建了现在又被删除了
    有效前置状态:
        OfflinePartition

NewPartition:
    Partition创建之后,处于这个状态,这个状态下Partition还没有Leader和ISR
    有效前置状态:
        NonExistentPartition

OnlinePartition:
    一旦这个Partition的Leader被选举出来了,将处于这个状态
    有效前置状态:
        NewPartition
        OnlinePartition
        OfflinePartition

OfflinePartition:
    如果这个Partition的Leader掉线,这个Partition将被转移到这个状态
    有效前置状态:
        NewPartition
        OnlinePartition
        OfflinePartition
```
### 分区状态转移
```
参考PartitionStateMachine中各状态的调用情况
doHandleStateChanges()
```