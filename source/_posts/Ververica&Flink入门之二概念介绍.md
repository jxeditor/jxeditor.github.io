---
title: Ververica&Flink入门之二概念介绍
date: 2019-03-14 21:00:26
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Flink入门之二

## 有状态分散式流
```
保证精确一次的状态容错
全域一致的快照，更改完所有State，再产生快照 

分散式快照
CheckPoint Barrier N跟随着数据流完成，并填充CheckPoint N，当填充完成或数据流完成所有计算，代表快照完成

状态维护
本地状态后端去维护
JVM Heap状态后端
RocksDB状态后端

WaterMarks
Flink中的特殊事件
一个带有时间戳T的WaterMark会让运算元判定不会再收到任何时间戳<T的事件

状态保存与迁移
CheckPoint&SavePoint
```

---

## Flink是什么
```
状态容错：精确一次保证，分布式快照
可应付极大的状态量：out-of-core状态后端，异步快照
状态迁移：在应用重新平行化/更改应用代码的状况下仍然恢复历史状态
Event-Time处理：用以定义何时接收完毕所需数据
```
