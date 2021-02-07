---
title: 记录一次Flink写Kafka的In-Flight问题
date: 2021-02-07 09:36:12
categories: 大数据
tags: flink
---

> 涉及到Kafka的消息发送的问题

<!-- more -->

## 问题点
```
场景: 简单的Flink消费数据写入kafka,无其他任何复杂操作,在晚上9点附近有峰值情况
问题: 写入Kafka数据失败,并带有CK失败
堆栈:
    throw new IllegalStateException("There are no in-flight requests for node " + node);
```

--- 

## 问题分析
```
简单说下往Kafka写数据的操作,会将一批量请求放入InFlightRequests中
包括已处理的请求以及未处理的请求,每个请求都会有他的响应结果(response)
在Kafka底层做Socket通信的时候,会将指定节点的request队列进行队尾拉出处理

现在就发现在InFlightRequests中不存在指定节点的队列
NetworkClient
    poll()
        --->handleCompletedSends()
        --->handleCompletedReceives()
InFlightRequest
    lastSent()
    completeNext()
        --->requestQueue()
        
指定节点的NodeId按理应该是固定不变的broker.id
```

---

## 解决问题
```
1.问题首先是由峰值引起的,所以进行slot调节,设为Kafka分区数*2
2.增大TM内存,用于提高网络缓冲区的大小,或者直接调节taskmanager.memory.network.fraction,加大网络缓冲区内存大小
3.加大CK的间隔,避免频繁CK

为什么会产生一个未知的Node,是本次问题的关键
```