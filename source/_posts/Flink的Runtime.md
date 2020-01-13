---
title: Flink的Runtime
date: 2020-01-13 14:38:13
categories: 大数据
tags: flink
---

> 介绍Flink Runtime的作业执行的核心机制

<!-- more -->

## 架构
首先Flink是可以运行在多种环境中的,如Standalone,Yarn,K8S之类;Flink Runtime层采用了标准的Master-Slave架构.
- `Client`(不属于Runtime)
- `Master`
- - JobManager
- - Dispatcher
- - ResourceManager 
- `Slave`
- - TaskManager
- `Akka`(角色通信)
- `Netty`(数据传输)

`Dispatcher`负责负责接收用户提供的作业，并且负责为这个新提交的作业拉起一个新的`JobManager`组件。
`ResourceManager`负责资源的管理,在整个Flink集群中只有一个`ResourceManager`
`JobManager`负责管理作业的执行,在一个Flink集群中可能有多个作业同时执行,每个作业都有自己的`JobManager`组件

---

## 执行流程
用户提交作业,提交脚本会首先启动一个`Client`进程负责作业的编译与提交
首先将用户编写的代码编译为一个`JobGraph`(会进行一些检查或优化等工作)
`Client`将产生的`JobGraph`提交到集群中执行
**两种情况**
```
Standalone这种Session模式,AM会预先启动,此时Client直接与Dispatcher建立连接并提交作业即可
Per-Job模式,AM不会预先启动,此时Client将首先向资源管理系统<如Yarn,K8S>申请资源来启动AM,然后再向AM中的Dispatcher提交作业
```
作业到`Dispatcher`后,`Dispatcher`会首先启动一个`JobManager`组件
`JobManager`会向`ResourceManager`申请资源来启动作业中具体的任务
**两种情况**
```
根据Session和Per-Job模式的区别,TaskExecutor可能已经启动或者尚未启动
Session模式,ResourceManager中已有记录了TaskExecutor注册的资源,可以直接选取空闲资源进行分配
Per-Job模式,ResourceManager也需要首先向外部资源管理系统申请资源来启动TaskExecutor,然后等待TaskExecutor注册相应资源后再继续选择空闲资源进程分配
```
`TaskExecutor`的资源是通过`Slot`来描述的,一个`Slot`一般可以执行一个具体的`Task`
`ResourceManager`选择到空闲的`Slot`之后,就会通知相应的`TM`将该`Slot`分配分`JobManager`
`TaskExecutor`进行相应的记录后,会向`JobManager`进行注册
`JobManager`收到`TaskExecutor`注册上来的`Slot`后,就可以实际提交`Task`了
`TaskExecutor`收到`JobManager`提交的`Task`之后,会启动一个新的线程来执行该`Task`
`Task`启动后就会开始进行预先指定的计算,并通过数据`Shuffle`模块互相交换数据

**注意**
```
Flink支持两种不同的模式,Per-job模式与Session模式
Per-job模式下整个Flink集群只执行单个作业,即每个作业会独享Dispatcher和ResourceManager组件
Per-job模式下AppMaster和TaskExecutor都是按需申请的
Per-job模式更适合运行执行时间较长的大作业,这些作业对稳定性要求较高,并且对申请资源的时间不敏感

Session模式下,Flink预先启动AppMaster以及一组TaskExecutor
然后在整个集群的生命周期中会执行多个作业
Session模式更适合规模小,执行时间短的作业。
```

---

## 作业调度
Flink中,资源是由`TaskExecutor`上的`Slot`来表示的,每个`Slot`可以用来执行不同的`Task`
任务即`Job`中实际的`Task`,它包含了待执行的用户逻辑
调度的主要目的就是为了给`Task`找到匹配的`Slot`

---

在`ResourceManager`中有一个子组件叫做`SlotManager`,它维护了当前集群中所有`TaskExecutor`上的`Slot`的信息与状态
如该`Slot`在哪个`TaskExecutor`中,该`Slot`当前是否空闲等
当`JobManger`来为特定`Task`申请资源的时候,根据当前是`Per-job`还是`Session`模式,`ResourceManager`可能会去申请资源来启动新的`TaskExecutor`

---

当`TaskExecutor`启动之后,它会通过服务发现找到当前活跃的`ResourceManager`并进行注册
注册信息中,会包含该`TaskExecutor`中所有`Slot`的信息
`ResourceManager`收到注册信息后,其中的`SlotManager`就会记录下相应的`Slot`信息
当`JobManager`为某个`Task`来申请资源时,`SlotManager`就会从当前空闲的`Slot`中按一定规则选择一个空闲的`Slot`进行分配
当分配完成后`RM`会首先向`TaskManager`发送`RPC`要求将选定的`Slot`分配给特定的`JobManager`
`TaskManager`如果还没有执行过该`JobManager`的`Task`的话,它需要首先向相应的`JobManager`建立连接,然后发送提供`Slot`的`RPC`请求
在`JobManager`中,所有`Task`的请求会缓存到`SlotPool`中
当有`Slot`被提供之后,`SlotPool`会从缓存的请求中选择相应的请求并结束相应的请求过程

---

当`Task`结束之后,无论是正常结束还是异常结束,都会通知`JobManager`相应的结束状态
`TaskManager`端将`Slot`标记为已占用但未执行任务的状态
`JobManager`会首先将相应的`Slot`缓存到`SlotPool`中,但不会立即释放
这种方式避免了如果将`Slot`直接还给`ResourceManager`,在任务异常结束之后需要重启时,需要立刻重新申请`Slot`的问题
通过延时释放,`Failover`的`Task`可以尽快调度回原来的`TaskManager`,从而加快`Failover`的速度

---

当`SlotPool`中缓存的`Slot`超过指定的时间仍未使用时,`SlotPool`就会发起释放该`Slot`的过程
与申请`Slot`的过程对应,`SlotPool`会首先通知`TaskManager`来释放该`Slot`
`TaskExecutor`通知`ResourceManager`该`Slot`已经被释放,从而最终完成释放的逻辑
**注意**
```
除了正常的通信逻辑外,在ResourceManager和TaskExecutor之间还存在定时的心跳消息来同步Slot的状态
```
**调度方式**
```
Eager调度(适用于流作业)
Eager调度如其名子所示,它会在作业启动时申请资源将所有的Task调度起来
这种调度算法主要用来调度可能没有终止的流作业

Lazy From Source(适用于批作业)
Lazy From Source是从Source开始,按拓扑顺序来进行调度
简单来说,Lazy From Source会先调度没有上游任务的Source任务
当这些任务执行完成时,它会将输出数据缓存到内存或者写入到磁盘中
然后,对于后续的任务,当它的前驱任务全部执行完成后
Flink就会将这些任务调度起来
这些任务会从读取上游缓存的输出数据进行自己的计算
这一过程继续进行直到所有的任务完成计算
```

---

## 错误恢复
整体上来说,错误可能分为两大类:`Task`执行出现错误或`Flink`集群的`Master`出现错误

**第一类错误恢复策略**
```
Restart-all,重启所有的Task
对于Flink的流任务,由于Flink提供Checkpoint机制
因此当任务重启后可以直接从上次的Checkpoint开始继续执行
因此这种方式更适合于流作业
```

**第二类错误恢复策略**
```
Restart-individual
只适用于Task之间没有数据传输的情况
这种情况下,我们可以直接重启出错的任务
```