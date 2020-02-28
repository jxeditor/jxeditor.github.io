---
title: Ververica&Flink入门之三上手使用
date: 2019-03-22 20:29:47
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Flink入门之三

# 编译Flink代码
```
mvn clean install -DskipTests
# 或者
mvn clean package -DskipTests
```

---

# 基本概念
```
DAG图中不能被Chain在一起的Operator会被分隔到不同的Task中
Task是Flink中资源调度的最小单元

两类进程
JobManager:协调Task的分布式执行,包括调度Task,协调创建CK以及当Job Failover时协调各个Task从CK恢复等
TaskManager:执行DataFlow中的Tasks,包括内存Buffer的分配,DataStream的传递等

Task Slot是TM中最小资源分配单位,一个TM中有多少个Task Slot就意味着支持多少并发Task处理
一个Task Slot可以执行多个Operator
Operator是能够被Chain在一起处理的,任务链
```

---

# 日志配置
```
默认使用log4j配置,如果需要使用其他的日志方式,可以删除文件
log4j-cli.properties:用Flink命令行时用的log配置,比如执行flink run
log4j-yarn-session.properties:用yarn-session.sh启动时命令行执行时用的日志配置
log4j.properties:无论Standalone还是Yarn模式,JM和TM使用的日志配置
```