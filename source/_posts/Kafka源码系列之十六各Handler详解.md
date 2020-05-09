---
title: Kafka源码系列之十六各Handler详解
date: 2020-05-09 11:44:32
categories: 大数据
tags: kafka
---

> 主要介绍Controller在启动时注册的这么多监听,各自的用处

<!-- more -->

## 监听概览
```scala
// KafkaController.Startup
zkClient.registerZNodeChangeHandlerAndCheckExistence(controllerChangeHandler)

// KafkaController.onControllerFailover()
val childChangeHandlers = Seq(brokerChangeHandler, topicChangeHandler, topicDeletionHandler, logDirEventNotificationHandler, isrChangeNotificationHandler)
childChangeHandlers.foreach(zkClient.registerZNodeChildChangeHandler)
val nodeChangeHandlers = Seq(preferredReplicaElectionHandler, partitionReassignmentHandler)
nodeChangeHandlers.foreach(zkClient.registerZNodeChangeHandlerAndCheckExistence)

controllerChangeHandler
brokerChangeHandler
topicChangeHandler
topicDeletionHandler
logDirEventNotificationHandler
isrChangeNotificationHandler
preferredReplicaElectionHandler
partitionReassignmentHandler
```

---

## ZNodeChangeHandler
```
ZK节点变化监听
```
### ControllerChangeHandler
```scala
def path = "/controller"

// 主要监听controller节点的变化
// 对应的操作有ControllerChange,Reelect
class ControllerChangeHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChangeHandler {
  override val path: String = ControllerZNode.path
  override def handleCreation(): Unit = eventManager.put(controller.ControllerChange)
  override def handleDeletion(): Unit = eventManager.put(controller.Reelect)
  override def handleDataChange(): Unit = eventManager.put(controller.ControllerChange)
}
```
### PreferredReplicaElectionHandler
```scala
def path = s"${AdminZNode.path}/preferred_replica_election"

// 监听Partition最优Leader选举
class PreferredReplicaElectionHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChangeHandler {
  override val path: String = PreferredReplicaElectionZNode.path

  override def handleCreation(): Unit = eventManager.put(controller.PreferredReplicaLeaderElection)
}
```
### PartitionReassignmentHandler
```scala
def path = s"${AdminZNode.path}/reassign_partitions"

// 监听分区副本迁移
class PartitionReassignmentHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChangeHandler {
  override val path: String = ReassignPartitionsZNode.path

  // Note that the event is also enqueued when the znode is deleted, but we do it explicitly instead of relying on
  // handleDeletion(). This approach is more robust as it doesn't depend on the watcher being re-registered after
  // it's consumed during data changes (we ensure re-registration when the znode is deleted).
  override def handleCreation(): Unit = eventManager.put(controller.PartitionReassignment)
}
```

---

## ZNodeChildChangeHandler
```
监听ZK子节点信息变化
```
### BrokerChangeHandler
```scala
Broker上下线变化

def path = s"${BrokersZNode.path}/ids"

// 监听Broker变化,对应操作BrokerChange
class BrokerChangeHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = BrokerIdsZNode.path
  override def handleChildChange(): Unit = {
    eventManager.put(controller.BrokerChange)
  }
}
```
### TopicChangeHandler
```scala
def path = s"${BrokersZNode.path}/topics"

// 监听topic变化,对应操作TopicChange
class TopicChangeHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = TopicsZNode.path
  override def handleChildChange(): Unit = eventManager.put(controller.TopicChange)
}
```
### TopicDeletionHandler
```scala
def path = s"${AdminZNode.path}/delete_topics"

// 监听删除topic的变化,TopicDeletion
class TopicDeletionHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = DeleteTopicsZNode.path

  override def handleChildChange(): Unit = eventManager.put(controller.TopicDeletion)
}
```
### LogDirEventNotificationHandler
```scala
def path = "/log_dir_event_notification"

// 监听日志目录事件通知,LogDirEventNotification
class LogDirEventNotificationHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = LogDirEventNotificationZNode.path

  override def handleChildChange(): Unit = eventManager.put(controller.LogDirEventNotification)
}
```
### IsrChangeNotificationHandler
```scala
def path = "/isr_change_notification"

// 监听Partition ISR变化,IsrChangeNotification
class IsrChangeNotificationHandler(controller: KafkaController, eventManager: ControllerEventManager) extends ZNodeChildChangeHandler {
  override val path: String = IsrChangeNotificationZNode.path

  override def handleChildChange(): Unit = eventManager.put(controller.IsrChangeNotification)
}
```