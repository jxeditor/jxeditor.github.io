---
title: Kafka源码系列之四单Partition顺序性保证
date: 2020-05-07 10:24:22
categories: 大数据
tags: kafka
---

> 主要介绍Kafka怎么做到单Partition保证顺序性的原理,在业务上其实有时候也会有响应的需要,例如行为日志的一个顺序保证

<!-- more -->

## RecordAccumulator
```
每个topic-partion都有对应的deque
deque存储的是ProducerBatch,是发送的基本单位
只有当这个topic-partition的ProducerBatch达到大小或时间要求才会触发发送操作(不一定非要满足这两个条件才能发送)

append(): 向Accumulator添加一条Record,并返回添加后的结果,用于各种条件的判断,分配新的ProducerBatch
tryAppend(): 添加Record的实际方法

mutePartition(): 对partition mute,保证只有一个Batch正在发送,保证顺序性
unmutePartition(): 发送完成unmute,这样才能进行下一次发送

ready(): 获得可发送的node列表
drain(): 遍历可发送node列表,然后在leader在当前的所有tp,直到发送的batch达到max.request.size,就将这些batch作为一个request发送出去

deallocate(): 释放ProducerBatch占用的内存
reenqueue(): 将发送失败并且可以再次发送batch重新添加到deque中,添加在deque的头部(避免乱序)
abortBatches(): 由方法abortIncompleteBatches调用,在Sender强制退出时,移除未完成的batch
awitFlushCompletion(): 由Producer的flush()方法调用,block直到所有未完成的batch发送完成
abortExpireBatches(): 移除那些由于分区不可用而无法发送的batch
abortIncompleteBatches()

RecordAppendResult: batch的meta信息,在append()方法返回中调用
IncompleteBatches: 保存发送未完成的batch,线程安全类
ReadyCheckResult: ready()方法返回的对象类型,记录可以发送的node列表
```

---

## 如何保证顺序性
```java
可以了解KafkaProducer是怎么初始化一个Sender对象的

// KafkaProducer
int maxInflightRequests = configureInflightRequests(producerConfig, transactionManager != null);
config.getInt(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION);
return new Sender(logContext,
    client,
    metadata,
    this.accumulator,
    maxInflightRequests == 1, // 设置为1时保证顺序性 
    producerConfig.getInt(ProducerConfig.MAX_REQUEST_SIZE_CONFIG),
    acks,
    retries,
    metricsRegistry.senderMetrics,
    time,
    requestTimeoutMs,
    producerConfig.getLong(ProducerConfig.RETRY_BACKOFF_MS_CONFIG),
    this.transactionManager,
    apiVersions);

// Sender
public Sender(LogContext logContext,
              KafkaClient client,
              Metadata metadata,
              RecordAccumulator accumulator,
              boolean guaranteeMessageOrder,// 为true保证顺序性
              int maxRequestSize,
              short acks,
              int retries,
              SenderMetricsRegistry metricsRegistry,
              Time time,
              int requestTimeoutMs,
              long retryBackoffMs,
              TransactionManager transactionManager,
              ApiVersions apiVersions) {
    this.log = logContext.logger(Sender.class);
    this.client = client;
    this.accumulator = accumulator;
    this.metadata = metadata;
    this.guaranteeMessageOrder = guaranteeMessageOrder;
    this.maxRequestSize = maxRequestSize;
    this.running = true;
    this.acks = acks;
    this.retries = retries;
    this.time = time;
    this.sensors = new SenderMetrics(metricsRegistry, metadata, client, time);
    this.requestTimeoutMs = requestTimeoutMs;
    this.retryBackoffMs = retryBackoffMs;
    this.apiVersions = apiVersions;
    this.transactionManager = transactionManager;
    this.inFlightBatches = new HashMap<>();
}
```

---

## ProducerConfig
[传送门](http://kafka.apache.org/0102/documentation.html#producerconfigs)
```
max.in.flight.requests.per.connection: 对一个connection,同时发送最大请求数,不为1时不能保证顺序性,默认值5
详细配置信息,可以参考Kafka的官方文档
```