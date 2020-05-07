---
title: Kafka源码系列之六ConsumerPoll调用
date: 2020-05-07 14:34:49
categories: 大数据
tags: kafka
---

> 在上一篇有大概的涉及到一点,但方向更多的是Coordinator上,所以这里补充一下

<!-- more -->

## 调用流程
```
KafkaConsumer.poll()
    ->KafkaConsumer.pollForFetches()
        ->Fetcher.fetchedRecords()
            ->Fetcher.fetchRecords(PartitionRecords partitionRecords, int maxRecords)
                ->Fetcher.fetchRecords(int maxRecords)
                    ->Fetcher.parseRecord()
```

---

## 描述
```
KafkaConsumer.poll()
    检查这个consumer是否订阅相应的tp
    调用pollForFetches()方法获取相应的records
    如果在给定时间内获取不到可用的records返回空数据

pollForFetches()
    coordinator.timeToNextPoll(): 下一次调用poll的时间
    fetchedRecords(): 实际获取数据方法
    sendFetches(): 发送fetch请求
    client.poll(): 调用底层NetworkClient发送相应的请求
    coordinator.rejoinNeededOrPending(): 如果实例分配的tp列表发生变化,consumergroup需要rebalance
    
fetchRecords(PartitionRecords partitionRecords, int maxRecords)
    处理PartitionRecords对象,在这个里面会去验证fetchOffset是否能对得上
    只有fetchOffset是一致的情况下才会去处理相应的数据,并更新the fetch offset信息
    如果不一致,不会处理,the fetch offset就不会更新
    下次fetch请求时会接着这个位置去请求相应的数据
```

---

## 更新offset的position
```
主要实现在KafkaConsumer.poll中
updateAssignmentMetadataIfNeeded()方法
    updateFetchPositions()
        resetOffsetsIfNeeded()
            resetOffsetsAsync()
                resetOffsetIfNeeded()
                    seek()
```