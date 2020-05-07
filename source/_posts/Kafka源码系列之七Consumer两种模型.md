---
title: Kafka源码系列之七Consumer两种模型
date: 2020-05-07 15:39:02
categories: 大数据
tags: kafka
---

> 这一块主要关注tp分配方式,以及offset的commit方式

<!-- more -->

## 模型
```
subscribe(): 动态获取其分配的topic-partition,由group动态管理
    subscribe(Pattern pattern, ConsumerRebalanceListener listener)
    subscribe(Pattern pattern)
    subscribe(Collection<String> topics)
assign()
    subscribe(Collection<String> topics, ConsumerRebalanceListener listener)

assign(): 手动分配topic-partition列表
    assign(Collection<TopicPartition> partitions)
    
# 注意:
如果是来自assign的请求,但这个group的状态不为Empty,意味着这个group已经处在活跃状态了
assign模式下的group是不会处于活跃状态的
意味着assign模式使用的group.id与subscribe模式下使用的group相同
这种情况下,会拒绝assign模式下的这个offset commit请求
```

---

## SubscriptionState
```
NONE, AUTO_TOPICS, AUTO_PATTERN, USER_ASSIGNED
无
自动发现Topic
正则
用户分配
```

---

## Commit机制
```
commitSync()
    coordinator.commitOffsetsSync()
        sendOffsetCommitRequest()
            client.poll(同步)
commitAsync()
    coordinator.commitOffsetsAsync()
        doCommitOffsetsAsync()
            sendOffsetCommitRequest()
```

---

## Partition分配机制
```
AbstractPartitionAssignor
    RangeAssignor(范围划分)
    RoundRobinAssignor(轮询)
```