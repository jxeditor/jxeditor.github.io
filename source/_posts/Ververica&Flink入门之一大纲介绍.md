---
title: Ververica&Flink入门之一大纲介绍
date: 2019-03-07 21:40:26
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Flink入门之一

## 知识点
```
Flink Application
    基础处理语义
    多层次API
Flink Architecture
    有界和无界数据流
    部署灵活
    极高可伸缩性
    极致流式处理性能
FLink Operation
    7*24小时高可用
    业务应用监控运维
``` 

---

## Flink Application - Streams
```
有边界的流
    Batch可以看做一个有边界的流
无边界的流
    Stream
```

---

## Flink Application - State
```
带状态的计算
```

---

## Flink Application - Time
```
Event Time
Ingestion Time
Processing Time
```

---

## Flink Application - API
```
SQL/Table API
DataStream API
ProcessFunction
```

---

## Flink Architecture - Stateful
```
Tasks会保存自身的状态，本地内存或硬盘
Flink会定期远程对State归档
```

---

# Flink Scenario - Data Pipeline
```
数据搬运，在搬运过程中进行清洗转换，流式的ETL
实时数仓
实时搜索引擎
```

---

# Flink Scenario - Data Analytics
```
实时报表
实时大屏
```

---

# Flink Scenario - Data Driven
```
规则触发
风控系统
```