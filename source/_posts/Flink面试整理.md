---
title: Flink面试基础
date: 2020-02-27 11:40:26
categories: 大数据
tags:
    - interface
    - flink
---

> 记录面试中有关Flink的概念知识

<!-- more -->

# Flink面试基础

# Flink时间类型有哪些？
```
三种时间类型
Event Time事件生成时间，事件实际产生的时间
Ingestion Time事件接入时间，进入Flink系统的时间
Processing Time事件处理时间，Flink处理的时间

事件处理时间处理Window时，使用机器自身时间
可能因为机器时钟不同步导致乱序，适用于时间精确度不高的计算
```

---

# Flink的窗口类型有哪些？
```
两种窗口类型
    基于时间的Time Window
    基于数量的Count Window
窗口的操作又可以分为
Tumbling Window滚动窗口
Sliding Window滑动窗口
Session Window会话窗口
Global Window全局窗口
```

---

# Flink定义窗口的组件？
```
Assigner 决定某个元素被分配到哪个/哪些窗口中去
Trigger 决定一个窗口何时能够被计算或清除，每个窗口都会拥有一个自己的Trigger
Evictor 在Trigger触发之后，窗口处理之前，Evictor会用来剔除窗口中不需要的元素，相当于一个filter
```

---

# Flink窗口执行过程？
```
Assigner，Trigger，Evictor都位于一个算子(Window Operator)
数据流进入算子，每一个到达的元素都交给Assigner
Assigner决定元素被放到哪个/些窗口，可能会创建新窗口
一个元素可以被放入多个窗口中，所以存在多个窗口是可能的
每个窗口都拥有自己的Trigger
Trigger有定时器，决定窗口何时被计算或清除
每当有元素加入该窗口或之前注册的定时器超时了，Trigger都会被调用
Trigger的返回结果可以是Continue(不做任何操作)，Fire(处理窗口数据)，Purge(移除窗口和窗口中数据)，或者Fire+Purge
一个Trigger的调用结果只是Fire的话，会计算窗口并保留窗口原样，窗口数据不变，等待下次Fire时再计算
一个窗口可以被重复计算多次直到被Purge
在Purge之前，窗口会一直占用内存
当Trigger Fire了，窗口中元素集合交给Evictor(如果有)
Evictor主要用来遍历窗口中的元素列表，并决定最先进入窗口的多少个元素需要移除
剩余元素会交给用户指定函数进行窗口的计算
如果没有Evictor，窗口中所有元素会一起交给函数进行计算
```

---

# Flink的状态后端？
```
3种状态后端
内存 MemoryStateBackend
文件系统 FsStateBackend
RocksDB RocksDBStateBackend
只有RocksDB状态后端支持增量检查点，默认关闭
state.backend: rocksdb
state.backend.incremental: true
RocksDBStateBackend rocksDBStateBackend = new RocksDBStateBackend("hdfs://path/to/flink-checkpoints", true);
env.setStateBackend(rocksDBStateBackend);
```

---

# Flink中RocksDB的优缺点？
```
优:
    如果状态空间超大，增量检查点只包含本次ck与上次ck之间的差异
    而不是所有状态，变得轻量级，解决了大状态CK问题
    上一个检查点已经存在的文件可以直接引用，不被引用的文件可以及时删除
缺:
    程序出现问题，TM需要从多个检查点加载状态数据，这些数据可能包括被删除的状态
    旧检查点文件不能随便删除，因为新检查点仍然会引用他们，贸然删除，程序可能无法恢复

```

---

# Flink的状态类型有哪些？
```
基本的有OperatorState和KeyedState
特殊的有BroadcastState
OperatorState跟一个特定Operator的并发实例绑定，整个Operator只对应一个State，有多少状态由并行度决定
KeyedState是基于KeyStream上的状态，KeyBy之后的OperatorState，与并行度无关了，有多少状态由KeyBy之后有多少Key决定
BroadcastState是1.5开始出现的，用于以特定方式组合和联合处理两个事件流。
    A流的事件被广播到一个算子的所有并行实例，该算子将它们保存为状态。
    B流的事件不广播，发送给同一个算子的单个实例，并与广播流的事件一起处理。
    BroadcastState保存在内存中
```

---

# Flink如何处理延迟数据？
```
Flink窗口处理流式数据虽然提供了基础EventTime的WaterMark机制，但是只能在一定程序上解决，如果数据延迟超过了WaterMark设置的时间，数据会被Flink丢弃。
可以通过设置AllowedLateness+OutputTag来处理这些严重迟到的数据。默认是永不超时。
```

---

# Flink中ManagedState和RawState区别？
```
是KeyedState和OperatorState的两种存在形式
ManagedState，托管状态，由Flink框架管理的状态
通过框架提供的接口来更行和管理状态的值
不需要序列化
RawState，原始状态，由用户自行管理的具体数据结构
Flink在做CK时，使用byte[]来读写状态内容，对其内部数据结构一无所知
需要序列化
```

---

# Flink的KeyedState和OperatorState的区别？
```
KeyedState
    只适用于KeyedStream上的算子
    每个Key对应一个状态
    重写RichFunction，通过里面的RuntimeContext访问
    状态随着Key自动在多个算子子任务上迁移
    支持ValueState，ListState，MapSate等数据结构
OperatorState
    可以用于所有算子
    一个算子子任务对应一个状态
    通过实现CheckpointedFunction等接口访问
    有多种状态重新分配方式
    支持ListState，BroadcastSate等数据结构
```

--- 

# Flink的Join优化？
```
Flink处理数据时，每台机器只是存储了集群的部分数据。
为了执行Join，Flink需要找到两个数据集的所有满足Join条件的数据。
Flink需要将两个数据集有相同Key的数据发送到同一台机器上
两种策略：
repartition-repartition strategy
    两个数据集都会使用Key进行重分区并通过网络传输
broadcast-forward strategy
    一个数据集不动，另一个数据集会复制到有第一个数据集部分数据的所有机器上
    ds1.join(ds2,JoinHint.BROADCAST_HASH_FIRST)
    第二个参数就是提示
    BROADCAST_HASH_FIRST：第一个数据集是较小的数据集
    BROADCAST_HASH_SECOND：第二个数据集是较小的数据集
    REPARTITION_HASH_FIRST：第一个数据集是较小的数据集
    REPARTITION_HASH_SECOND：第二个数据集是较小的数据集
    REPARTITION_SORT_MERGE：对数据集进行重分区，同时使用sort和merge策略
    OPTIMIZER_CHOOSES：Flink的优化器决定两个数据集如何join
```

---

# Flink自定义Sink和Source写法？
```
自定义Sink，继承RichSinkFunction，实现数据写入
自定义Source，继承RichSourceFunction，实现数据读取
```

---

# Flink自定义UDF函数写法？
```
UDF:继承ScalarFunction
UDAF:继承AggregateFunction
UDTF:继承TableFunction
```

---

# Flink如何保证exactly-once？
```
通过Flink的CK机制保证唯一
Barrier插入到数据流中，作为数据流的一部分和数据一起向下流动
Barrier不会干扰正常数据，每个Barrier都带有快照ID
多个不同快照的多个Barrier会在流中同时出现
当所有的OperatorTask成功存储了它们的状态，一个检查点才算完成
```

---

# Flink反压如何解决的？
```
示例：
    A进入FLink，被Task1处理
    记录被序列化进缓冲区
    缓冲区的数据被移动到Task2，Task2会从缓冲区内读取记录
    Task1在其输出端分配了一个缓冲区，Task2在其输入端也有一个
本地传输：
    如果Task1和Task2在同一个TM，缓冲区可以直接共享
    一旦Task2消费了数据它会被回收
    如果Task2比Task1慢，缓冲区会以比Task1填充速度更慢的速度进行回收
    从而使Task1降速
    
```

---

# Flink异步IO读写的情况？
```
Flink的Async I/O允许用户将异步请求客户端与数据流一起使用
操作:
    实现AsyncFunction调度请求
    一个结果ResultFuture的回调
    在数据流上应用异步IO操作作为转换
/**
 * AsyncFunction的一个实现，它发送请求并设置回调
 */
class AsyncDatabaseRequest extends AsyncFunction[String, (String, String)] {

    /** 可以发出带有回调的并发请求的特定数据库的客户端 */
    lazy val client: DatabaseClient = new DatabaseClient(host, post, credentials)

    /** 用于将来回调的上下文 */
    implicit lazy val executor: ExecutionContext = ExecutionContext.fromExecutor(Executors.directExecutor())

    override def asyncInvoke(str: String, resultFuture: ResultFuture[(String, String)]): Unit = {

        // 发出异步请求，接收结果的Future
        val resultFutureRequested: Future[String] = client.query(str)

        // 将回调设置为在客户端请求完成后执行
        // 回调只是将结果转发到结果Future
        resultFutureRequested.onSuccess {
            case result: String => resultFuture.complete(Iterable((str, result)))
        }
    }
}

// 创建原始流
val stream: DataStream[String] = ...

// 应用异步I/O转换
val resultStream: DataStream[(String, String)] =
    AsyncDataStream.unorderedWait(stream, new AsyncDatabaseRequest(), 1000, TimeUnit.MILLISECONDS, 100)
```

---

# Flink的CK和SP的区别是什么？
```
CK的生命周期由Flink管理，即Flink创建，拥有和发布CK，无需用户交互，轻量级，快速恢复
SP由用户创建，拥有和删除，是计划的，手动备份的，可作为恢复。像Flink版本更新，更改JobGraph，更改并行度
```