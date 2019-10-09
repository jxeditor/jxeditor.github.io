---
title: Flink系列问题
date: 2019-09-23 09:43:58
categories: 大数据
tags: flink
---

> 针对Flink的一些知识问答

<!-- more -->

### 简单介绍一下Flink
```
Apache Flink是一个分布式大数据处理引擎，可对有限数据流和无限数据流进行有状态计算。可部署在各种集群环境，对各种大小的数据规模进行快速计算。
```

### Flink相比传统的Spark Streaming有什么区别？和Spark中的Structured Streaming相比呢？Flink相比Spark Streaming和Storm有什么优势？
```
# 相比Spark Streaming和Storm有什么优势
Spark streaming的本质还是一款基于Microbatch计算的引擎。这种引擎一个天生的缺点就是每个Microbatch的调度开销比较大，当我们要求越低的延迟时，额外的开销就越大。这就导致了Spark Streaming实际上不是特别适合于做秒级甚至亚秒级的计算。
Storm在最开始的流处理中扮演了很重要的角色，可以亚秒级的响应，阿里开源的JStorm，在很多互联网公司，被广泛应用于流计算处理。Storm是一个没有批处理能力的数据流处理器，除此之外Storm只提供了非常底层的API，用户需要自己实现很多复杂的逻辑。另外，Storm在状态管理和容错能力上不足。种种原因，Storm也无法满足我们的需求。
Flink不同于Spark，Flink是一个真正意义上的流计算引擎，和Storm类似，Flink是通过流水线数据传输实现低延迟的流处理；Flink使用了经典的Chandy-Lamport算法，能够在满足低延迟和低failover开销的基础之上，完美地解决exactly once的目标；如果要用一套引擎来统一流处理和批处理，那就必须以流处理引擎为基础。Flink还提供了SQL／TableAPI这两个API，为批和流在Query层的统一又铺平了道路。因此Flink是最合适的批和流统一的引擎；Flink在设计之初就非常在意性能相关的任务状态state和流控等关键技术的设计，这些都使得用Flink执行复杂的大规模任务时性能更胜一筹。
```

### Flink的组件栈是怎么样的？
```
# API & Libraries 层
作为分布式数据处理框架，Flink同时提供了支撑流计算和批计算的接口，同时在此基础上抽象出不同的应用类型的组件库，如基于流处理的CEP（复杂事件处理库），SQL & TABLE库和基于批处理的FlinkML（机器学习库），Gelly（图处理库）等。
API层包括构建流计算应用的DataStream API和批计算应用的DataSet API，两者都是提供给用户丰富的数据处理高级API，例如Map，FlatMap 等，同时也提供比较低级的Process Function API ，用户可以直接操作状态和时间等底层数据。

# Runtime 核心层
该层主要负责对上层不同接口提供基础服务，也是Flink 分布式计算框架的核心实现层，支持分布式Stream作业的执行、JobGraph到ExecutionGraph的映射转换、任务调度等。
将DataStream和DataSet转成统一的可执行的Task Operator，达到在流式引擎下同时处理批量计算和流式计算的目的

# 物理部署层
该层主要涉及Flink的部署模式，目前Flink支持多种部署模式：本地、集群（Standalone / YARN）、云（GCE / EC2）、kubenetes。
Flink能够通过该层支持不同平台的部署，用户可以根据需要选择使用对应的部署模式。
```

### Flink的基础编程模型了解吗？


### 说说Flink架构中的角色和作用？
```
Flink是主从架构模式，Flink集群中有主节点和从节点，另外在集群之外还有客户端节点，在这些节点
之中又有许多内部的角色，这些角色联合运作，完成整个Flink程序的计算任务。

# Client 
进行提交任务,提交完成后可以选择关闭进程或等待返回结果.不是Flink集群运行的一部分.

# Actor System(AKKA) 
Flink内部使用AKKA角色系统来管理JobManager和TaskManager

# JobManager 
主要职责是分布式执行,并协调任务做CK,协调故障恢复等,从客户端接收到任务后,首先生成优化过的执行计划,再调度到TaskManager中执行

# Scheduler 
调度器,Flink的执行者被定义为任务槽.每个任务管理器都需要管理一个或多个任务槽.在内部,Flink决定哪些任务需要共享该插槽以及哪些任务必须被放置在特定的插槽中.它通过SlotSharingGroup和CoLocationGroup完成.

# Checkpoint Coordinator
Checkpoint协调器,负责checkpoint管理执行

# Memory Manager
内存管理器,会根据配置等信息计算内存的分配

# TaskManager
主要职责是从JobManager处接收任务,并部署和启动任务,接收上游的数据并处理,TaskManager在创建之初就设置好了Slot , 每个Slot可以执行一个任务,每个TaskManager是一个进程

# Task Slot
任务槽，负责具体任务的执行,每一个slot是一个线程
```

### 说说Flink中常用的算子？用过哪些？
### Flink中的分区策略有哪几种？
### Flink的并行度有了解吗？Flink中设置并行度需要注意什么？
### Flink支持哪几种重启策略？分别如何配置？
### Flink的分布式缓存有什么作用？如何使用？
### Flink中的广播变量，使用广播变量需要注意什么事项？
### Flink中对窗口的支持包括哪几种？说说他们的使用场景
### Flink 中的 State Backends是什么？有什么作用？分成哪几类？说说他们各自的优缺点？
### Flink中的时间种类有哪些？各自介绍一下？
### WaterMark是什么？是用来解决什么问题？如何生成水印？水印的原理是什么？
### Flink的table和SQL熟悉吗？Table API和SQL中TableEnvironment这个类有什么作用？
### Flink如何实现SQL解析的呢？
### Flink是如何做到批处理与流处理统一的？
### Flink中的数据传输模式是怎么样的？
### Flink的容错机制知道吗？
### Flink中的分布式快照机制是怎么样的？
### Flink是如何实现Exactly-once的？
### Flink的Kafka-connector是如何做到向下兼容的呢？
### Flink中的内存管理是如何做的？
### Flink中的序列化是如何做的？
### Flink中的RPC框架选型是怎么样的？
### Flink在使用Window时出现数据倾斜，你有什么解决办法？
### Flink SQL在使用Groupby时出现热点数据，如何处理？
### 现在我有Flink任务，delay极高，请问你有什么调优策略？
### Flink是如何处理反压的？和Spark有什么区别？Storm呢？
### Operator Chains（算子链）这个概念你了解吗？Flink是如何优化的？什么情况下Operator才会chain在一起？
### 讲讲一个Flink job提交的整个流程吗？
### 讲讲一个Flink job调度和执行的流程吗？
### Flink所谓"三层图"结构是哪几个"图"？它们之间是什么关系？他们之间是如何转化的？
### JobManger和TaskManager分别在集群中扮演了什么角色，说说它们都做了些什么？
### 简单说说Flink数据的抽象和数据的交换过程
### Flink的分布式快照机制是如何实现的？ 
### Flink的反压是如何实现的？
### 说说FlinkSQL是如何转化的？了解逻辑计划和和物理计划吗？FlinkSQL的维表JOIN是如何做的？了解Async IO吗？解决了什么问题？





