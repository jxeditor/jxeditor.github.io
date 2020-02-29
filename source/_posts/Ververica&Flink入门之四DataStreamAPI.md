---
title: Ververica&Flink入门之四DataStreamAPI
date: 2019-04-11 20:29:47
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->


# 分布式流处理的基本模型
```
流可以看做一个DAG有向无环图,每一个节点看做一个算子操作
每一个算子操作可能有多个实例
```

---

# DataStream程序结构
```
设置运行环境
配置数据源读取数据
进行一系列转换
配置数据Sink写出数据
提交执行
```

---

# 操作概览
```
基于单条记录:filter,map
基于窗口:window
合并多条流:union,join,connect
拆分单条流:split
```

---

# 物理分组
```
dataStream.global()全部发往第一个Task
dataStream.broadcast()广播
dataStream.forward()上下游并发度一样时一对一发送,不一致会报错
dataStream.shuffle()随机均匀分配
dataStream.rebalance()轮流分配
dataStream.recale()本地轮流分配
dataStream.partitionCustom()自定义单播
```