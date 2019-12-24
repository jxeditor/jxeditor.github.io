---
title: Kafka的高吞吐量
date: 2019-12-20 10:21:28
categories: 大数据
tags: kafka
---

> Kafka为什么速度快,吞吐量大

<!-- more -->

## 顺序读写
```
a.Kafka将消息记录持久化到本地磁盘,并且顺序读写
b.磁盘/内存的快慢取决于寻址的方式,磁盘随机读写慢,但是磁盘顺序读写性能高于内存随机读写
```

---

## Page Cache(页高缓)
```
a.使用了操作系统本身的Page Cache,而不是JVM空间内存,避免了Object消耗以及GC问题
b.Kafka的读写操作基本上是基于内存的,读写速度得到了极大的提升
```

---

## Zero Copy(零拷贝)
```
a.同样是操作系统本身机制
b.允许操作系统使用sendFile方法直接将数据Page Cache发送到网络(常规socket网络需要使用用户空间缓存区)
```

---

## 分区分段
```
a.Kafka的信息记录按topic分类存储
b.topic中的数据按partition存储在不同的broker节点
c.每个partition对应操作系统的一个文件夹
d.partition按segment分段存储
e.每次文件操作也是直接操作segment
f.segment又有索引文件.index
```