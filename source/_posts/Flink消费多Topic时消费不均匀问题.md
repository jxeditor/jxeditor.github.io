---
title: Flink消费多Topic时消费不均匀问题
date: 2020-12-21 19:29:11
categories: 大数据
tags: flink
---

> 今天社区有小伙伴提出Flink在消费Kafka多Topic数据时,并行度合理,但还是存在消费不均匀的情况

<!-- more -->

## 为什么
```java
FlinkKafkaConsumerBase.open()
    AbstractPartitionDiscoverer.discoverPartitions()
        --setAndCheckDiscoveredPartition()
        KafkaTopicPartitionAssigner.assign()


public static int assign(KafkaTopicPartition partition, int numParallelSubtasks) {
    // 测试发现,对test[0-4]这5个topic,每个topic都12个分区,最终分配的结果值并不是均匀的
    int startIndex = ((partition.getTopic().hashCode() * 31) & 0x7FFFFFFF) % numParallelSubtasks;
    return (startIndex + partition.getPartition()) % numParallelSubtasks;
}
```

---

## 修改
```
# 直接自实现该方案,暴力轮询分配
```