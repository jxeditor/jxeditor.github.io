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

---

# Yarn跑Flink的好处
```
资源按需使用，提高集群的资源利用率
任务有优先级，根据优先级运行作业
基于 Yarn 调度系统，能够自动化地处理各个角色的 Failover
    JobManager进程和TaskManager进程都由Yarn NodeManager监控
    如果JobManager进程异常退出，则Yarn ResourceManager会重新调度JobManager到其他机器
    如果TaskManager进程异常退出，JobManager会收到消息并重新向Yarn ResourceManager申请资源，重新启动TaskManager
```

---

# 参数关系
```
-n(yarn-session) 与 -p 的关系
    -n和-yn在社区版本中没有实际的控制作用,实际资源由-p申请
    在blink的开源版本的yarn-session中,-n用于启动指定的TM,即使Job需要更多的slot也不会申请新的TM
-yn(yarn-cluster) 与 -p 的关系
    在blink的开源版本的yarn-cluster中,-yn表示初始TM数量,不设置上限,实际还是由-p和-ys决定
```