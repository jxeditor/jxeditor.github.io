---
title: Flink系统配置参数一览
date: 2020-12-14 17:48:10
categories: 大数据
tags: Flink
---

> 慢慢肝,整理下Flink的系统配置信息,不同于环境配置[Flink代码编写中的环境配置](https://jxeditor.github.io/2020/04/21/Flink%E4%BB%A3%E7%A0%81%E7%BC%96%E5%86%99%E4%B8%AD%E7%9A%84%E7%8E%AF%E5%A2%83%E9%85%8D%E7%BD%AE/)

<!-- more -->

## AkkaOptions(Akka配置参数)
```
akka.ask.callstack
默认值:true
捕获异步请求的调用堆栈,当ASK失败时,得到一个适当的异常,描述原始方法调度.

akka.ask.timeout
默认值:10 s
Akka超时时间,Flink出现超时失败,可以增加该值.

akka.tcp.timeout
默认值:20 s
TCP超时时间,由于网络问题导致Flink失败,可以增加该值.

akka.startup-timeout
默认值:无
Akka启动超时时间.

akka.transport.heartbeat.interval
默认值:1000 s
Akka传输故障探测器的心跳间隔.Flink使用TCP,所以不需要检测器,可以设置一个极大值来禁用检测器.

akka.transport.heartbeat.pause
默认值:6000 s
Akka传输故障探测器可接受的心跳暂停时间间隔,同上.

akka.transport.threshold
默认值:300.0
Akka传输故障探测器的阈值,同上.

akka.ssl.enabled
默认值:true
Akka远程通信是否打开SSL.仅适用于全局SSL标志security.ssl设置为true.

akka.framesize
默认值:10485760b
在JM和TM之间发送的消息最大大小.如果Flink失败是因为消息超过了这个限制,则加大它.

akka.throughput
默认值:15
将线程返回池之前批处理的消息数.低值表示公平调度,高值可以以不公平为代价提高性能.

akka.log.lifecycle.events
默认值:false
打开Akka的远程事件日志记录.调试的时候此值设为true.

akka.lookup.timeout
默认值:10 s
用于查找TM的超时时间.

akka.client.timeout
默认值:60 s
不推荐使用.使用client.timeout替代.

akka.jvm-exit-on-fatal-error
默认值:true
出现致命的Akka错误时退出JVM.

akka.retry-gate-closed-for
默认值:50L
断开远程连接后,Gate应该在时间范围关闭(毫秒).

akka.fork-join-executor.parallelism-factor
默认值:2.0
并行系数用于使用以下公式确定线程池大小(ceil(可用处理器*并行系数)),结果大小由akka.fork-join-executor.parallelism-min和akka.fork-join-executor.parallelism-max控制.

akka.fork-join-executor.parallelism-min
默认值:8
基于并行数的上限因子的最小线程数.

akka.fork-join-executor.parallelism-max
默认值:64
基于并行数的上限因子的最大线程数.

akka.client-socket-worker-pool.pool-size-min
默认值:1
基于数量因子的最小线程数.

akka.client-socket-worker-pool.pool-size-max
默认值:2
基于数量因子的最大线程数.

akka.client-socket-worker-pool.pool-size-factor
默认值:1.0
线程池大小用于使用以下公式确定线程池大小(ceil(可用处理器*因子)),结果大小由akka.client-socket-worker-pool.pool-size-min和akka.client-socket-worker-pool.pool-size-max控制.

akka.server-socket-worker-pool.pool-size-min
默认值:1
基于数量因子的最小线程数.

akka.server-socket-worker-pool.pool-size-max
默认值:2
基于数量因子的最大线程数.

akka.server-socket-worker-pool.pool-size-factor
默认值:1.0
线程池大小用于使用以下公式确定线程池大小(ceil(可用处理器*因子)),结果大小由akka.server-socket-worker-pool.pool-size-min和akka.server-socket-worker-pool.pool-size-max控制.

--- 过时的配置,对Flink没有影响
akka.watch.heartbeat.interval
akka.watch.heartbeat.pause
akka.watch.threshold
```

---

## AlgorithmOptions(Join/Sort算法的配置参数)
```
taskmanager.runtime.hashjoin-bloom-filters
默认值:false
在HybridHashJoin实现中激活/停用bloom过滤器的标志.在HashJoin需要溢写到磁盘时,这些bloom过滤器可以极大的减少溢写记录的数量,牺牲CPU性能.

taskmanager.runtime.max-fan
默认值:128
外部合并Join的最大扇入和溢写Hash Table的扇出.限制每个运算符的文件句柄数,设置过小会导致中间合并或分区.

taskmanager.runtime.sort-spilling-threshold
默认值:0.8f
当内存预算的这一部分已满时,排序操作开始溢写.

taskmanager.runtime.large-record-handler
默认值:false
溢写时是否使用LargeRecordHandler.如果一个记录不能放入排序缓冲区.记录将溢写到磁盘上,并且只使用key继续排序.合并后读取记录本身.
```

---

## BlobServerOptions(BlobServer和BlobCache参数配置)
```
blob.storage.directory
默认值:无
定义BlobServer要是用的存储目录.

blob.fetch.retries
默认值:5
定义失败Blob获取的失效次数.

blob.fetch.num-concurrent
默认值:50
定义JM的最大并发Blob获取数.

blob.fetch.backlog
默认值:1000
在JM上定义所需的Blob获取backlog的参数.操作系统通常会根据SOMAXCONN设置对backlog大小实施一个上限.

blob.server.port
默认值:0
BlobServer的服务器端口.

blob.service.ssl.enabled
默认值:true
覆盖BlobServer传输的SSL支持标志.

blob.service.cleanup.interval
默认值:3_600L
TM中BlobCache清理时间间隔(秒).

blob.offload.minsize
默认值:1_024 * 1_024
Offload到BlobServer的消息最小大小.

blob.client.socket.timeout
默认值:300_000
Blob客户端Socket超时时间间隔(毫秒).

blob.client.connect.timeout
默认值:0
Blob客户端连接超时时间间隔(毫秒).
```

---

## CheckpointingOptions(CK和SP的配置参数)
```
state.backend

state.checkpoints.num-retained

state.backend.async

state.backend.incremental

state.backend.local-recovery

taskmanager.state.local.root-dirs

state.savepoints.dir

state.checkpoints.dir

state.backend.fs.memory-threshold

state.backend.fs.write-buffer-size
```