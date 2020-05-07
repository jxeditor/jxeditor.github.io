---
title: Kafka源码系列之八GroupCoordinator详解
date: 2020-05-07 16:42:30
categories: 大数据
tags: kafka
---

> 在如何创建一个Group时有过简单使用,这里详细介绍一下

<!-- more -->

## ApiKeys
```
包含所有Kafka API
常用
OFFSET_COMMIT
OFFSET_FETCH
JOIN_GROUP
SYNC_GROUP
DESCRIBE_GROUPS
LIST_GROUPS
HEARTBEAT
```

---

## 启动
```java
// Broker在启动时,都会启动GroupCoordinator
groupCoordinator = GroupCoordinator(config, zkClient, replicaManager, Time.SYSTEM)
groupCoordinator.startup()

def startup(enableMetadataExpiration: Boolean = true) {
  info("Starting up.")
  // 启动一个后台线程删除过期的group metadata
  groupManager.startup(enableMetadataExpiration)
  // 标志变量设置为true
  isActive.set(true)
  info("Startup complete.")
}

// GroupMetadata
private[group] class GroupMetadata(val groupId: String, initialState: GroupState, time: Time) extends Logging {
    // group状态
    private var state: GroupState = initialState
    // generation id
    var generationId = 0
    // leader consumer id
    private var leaderId: Option[String] = None
    private var protocol: Option[String] = None
    // group的member信息
    private val members = new mutable.HashMap[String, MemberMetadata]
    // 等待加入的member数
    private var numMembersAwaitingJoin = 0
    private val supportedProtocols = new mutable.HashMap[String, Integer]().withDefaultValue(0)
    // 对应的commit offset
    private val offsets = new mutable.HashMap[TopicPartition, CommitRecordMetadataAndOffset]
    // commit offset成功后更新到上面的map中
    private val pendingOffsetCommits = new mutable.HashMap[TopicPartition, OffsetAndMetadata]
}

// MemberMetadata 记录group中每个成员的状态信息
private[group] class MemberMetadata(val memberId: String,
        val groupId: String,
        val clientId: String,
        val clientHost: String,
        val rebalanceTimeoutMs: Int,
        val sessionTimeoutMs: Int,
        val protocolType: String,
        var supportedProtocols: List[(String, Array[Byte])])
```

---

## GroupCoordinator请求处理
### Offset请求处理
```
OFFSET_FETCH: 查询offset
    handleFetchOffsets()
OFFSET_COMMIT: 提供offset
    handleCommitOffsets()
```
### Group相关处理
```
JOIN_GROUP,SYNC_GROUP(前面已经详细说明过)
DESCRIBE_GROUPS: 返回Group中各个member的详细信息
    handleDescribeGroup()
LEAVE_GROUP: 移除失败的member,并进行相应的状态转换
    handleLeaveGroup()
```
### 心跳请求处理
```
HEARTBEAT
    handleHeartbeat()

对于Server端,是GroupCoordinator判断consumer member是否存活的重要条件

对于Client端,是Client感应group状态变化的一个重要中介
```

---

## Group的状态机
```
GroupState
    Dead -> [Stable, PreparingRebalance, CompletingRebalance, Empty, Dead]
    CompletingRebalance -> [PreparingRebalance]
    Stable -> [CompletingRebalance]
    PreparingRebalance -> [Stable, CompletingRebalance, Empty]
    Empty -> [PreparingRebalance]

状态之间的有效转换关系
    右为前置状态
```