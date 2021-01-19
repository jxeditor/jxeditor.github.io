---
title: Flink系统配置参数一览
date: 2020-12-14 17:48:10
categories: 大数据
tags: flink
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
默认值:无
用于存储CK状态的状态后端.

state.checkpoints.num-retained
默认值:1
要保留的已完成CK的最大数目.

state.backend.async
默认值:true
状态后端是否使用异步快照,某些状态后端不支持异步快照或只支持异步快照.

state.backend.incremental
默认值:false
状态后端是否创建增量CK.对于增量CK,只存储上一个CK的差异,并不是完整的CK状态.
启用后,WebUI显示或从RestAPI获取的状态大小仅表示增量CK的大小,不是完整的CK大小.

state.backend.local-recovery
默认值:false
是否启动状态后端的本地恢复.本地恢复目前只支持KeyedStateBackend,MemoryStateBackend不支持本地恢复.

taskmanager.state.local.root-dirs
默认值:无
用于存储本地恢复状态的目录.

state.savepoints.dir
默认值:无
SP的默认目录.用于将SP写入文件系统的状态后端(MemoryStateBackend,FsStateBackend,RocksDBStateBackend).

state.checkpoints.dir
默认值:无
Flink支持的文件系统中存储CK的数据文件和元数据目录.路径必须可让所有参与者(TM/JM)访问.

state.backend.fs.memory-threshold
默认值:20kb
状态数据文件的最小大小.所有小于该值的状态块都以内联方式存储在根检查点元数据文件中,此配置的最大内存阈值为1MB。

state.backend.fs.write-buffer-size
默认值:4 * 1024
写入文件系统的检查点流的默认写入缓冲区大小.实际写入缓冲区大小被确定为此选项和选项state.backend.fs.memory-threshold的最大值。
```

---

## ClusterOptions(控制集群行为的配置)
```sh
cluster.registration.initial-timeout
默认值:100L
群集组件之间的初始注册超时(毫秒).

cluster.registration.max-timeout
默认值:30000L
群集组件之间的最大注册超时(毫秒).

cluster.registration.error-delay
默认值:10000L
注册尝试后进行的暂停导致了毫秒内的异常(超时除外).

cluster.registration.refused-registration-delay
默认值:30000L
注册尝试被拒绝后暂停时间间隔(毫秒).

cluster.services.shutdown-timeout
默认值:30000L
Executors等待群集服务的关闭超时(毫秒).

cluster.io-pool.size
默认值:无
集群用于执行阻塞IO操作(主进程和TaskManager进程)的IO执行器池的大小.
默认情况下,它将使用4*集群进程可以访问的CPU cores数量.增加池大小允许同时运行更多IO操作.

cluster.evenly-spread-out-slots
默认值:false
启用slot展开分配策略.此策略尝试在所有可用的TaskExecutors上均匀分布slot。

cluster.processes.halt-on-fatal-error
默认值:false
进程是否应在出现致命错误时停止,而不是执行正常关闭.在某些环境中(例如带有G1垃圾收集器的java8),正常的关闭可能会导致JVM死锁.

cluster.declarative-resource-management.enabled
默认值:true
定义群集是否使用声明性资源管理.
```

---

## CoreOptions(核心配置)
```sh
classloader.resolve-order
默认值:child-first
定义从用户代码加载类时的类解析策略.
child-first:检查用户代码jar.
parent_first:应用程序路径.

classloader.parent-first-patterns.default
默认值:java.;scala.;org.apache.flink.;com.esotericsoftware.kryo;org.apache.hadoop.;javax.annotation.;org.slf4j;org.apache.log4j;org.apache.logging;org.apache.commons.logging;ch.qos.logback;org.xml;javax.xml;org.apache.xerces;org.w3c
一个分号分割的正则列表,指定哪些类总是首先通过父类加载器解析.不建议修改,要添加另一个模式,建议使用classloader.parent-first-patterns.additional替代.

classloader.parent-first-patterns.additional
默认值:空字符串
一个分号分割的正则列表,指定哪些类总是首先通过父类加载器解析.

classloader.fail-on-metaspace-oom-error
默认值:true
如果在尝试加载用户代码类时抛出"OutOfMemoryError:Metaspace",则Flink JVM进程失败.

classloader.check-leaked-classloader
默认值:true
如果作业的用户类加载器在作业终止后使用,则尝试加载类失败.
这通常是由于延迟线程或行为不当的库泄漏了类加载器,这也可能导致类加载器被其他作业使用.只有当这种泄漏阻止进一步的作业运行时,才应禁用此检查.

plugin.classloader.parent-first-patterns.default
默认值:java.;scala.;org.apache.flink.;javax.annotation.;org.slf4j;org.apache.log4j;org.apache.logging;org.apache.commons.logging;ch.qos.logback
插件父类加载器

plugin.classloader.parent-first-patterns.additional
默认值:空字符串
插件父类加载器

env.java.opts
默认值:空字符串
Java选项启动所有Flink进程的JVM.

env.java.opts.jobmanager
默认值:空字符串
用于启动JobManager的JVM的Java选项.

env.java.opts.taskmanager
默认值:空字符串
用于启动TaskManager的JVM的Java选项.

env.java.opts.historyserver
默认值:空字符串
用于启动HistoryServer的JVM的Java选项.

env.java.opts.client
默认值:空字符串
启动Flink Client的JVM的Java选项.

env.log.dir
默认值:无
定义保存Flink日志的目录.它必须是一条绝对路径.(默认为Flink根目录下的log目录)

env.pid.dir
默认值:/tmp
定义保存flink-<host>-<process>.pid文件的目录.

env.log.max
默认值:5
要保留的最大旧日志文件数.

env.ssh.opts
默认值:无
启动或停止JobManager,TaskManager和Zookeeper服务时传递给SSH客户端的其他命令行选项(start-cluster.sh,stop-cluster.sh,start-zookeeper-quorum.sh,stop-zookeeper-quorum.sh).

env.hadoop.conf.dir
默认值:无
Hadoop配置目录的路径.需要读取HDFS和Yarn配置.也可以通过环境变量进行设置.

env.yarn.conf.dir
默认值:无
Yarn配置目录的路径.Flink on Yarn时是必要的.也可以通过环境变量进行设置.

env.hbase.conf.dir
默认值:无
HBase配置目录的路径.需要读取HBase配置.也可以通过环境变量进行设置.

io.tmp.dirs
默认值:System.getProperty("java.io.tmpdir")
临时文件目录.

parallelism.default
默认值:1
任务默认并行度.

fs.default-scheme
默认值:无
默认文件系统Schema.

fs.allowed-fallback-filesystems
默认值:空字符串
文件允许的Schema列表,可以使用Hadoop代替合适的Flink插件(S3,Wasb).

fs.overwrite-files
默认值:false
指定默认情况下文件输出写入程序是否应覆盖现有文件.

fs.output.always-create-directory
默认值:false
以大于1的并行度运行的文件编写器为输出文件路径创建一个目录,并将不同的结果文件(每个并行编写器任务一个)放入该目录.
如果此选项设置为"true",则并行度为1的写入程序还将创建一个目录并将单个结果文件放入其中.
如果该选项设置为"false",写入程序将直接在输出路径中创建文件,而不创建包含目录.
```

---

## DeploymentOptions(Executor配置)
```sh
execution.target
默认值:无
执行的部署目标.这可以采用以下值之一(remote,local,yarn-per-job,yarn-session,kubernetes-session)

execution.attached
默认值:false
指定Pipeline是以attached模式还是detached模式提交.

execution.shutdown-on-attached-exit
默认值:false
如果作业是在attached模式下提交的,在CLI突然终止时执行群集关闭,例如响应用户中断,例如键入Ctrl+C.

execution.job-listeners
默认值:无
要在执行环境中注册的自定义JobListener.注册的侦听器不能有带参数的构造函数.
```

---

## ExecutionOptions(特定程序的单个Executor配置)
```sh
execution.runtime-mode
默认值:RuntimeExecutionMode.STREAMING
DataStream运行时执行模式.除此之外,它还控制任务调度,网络Shuffle行为和时间语义(STREAMING,BATCH,AUTOMATIC).

execution.checkpointing.snapshot-compression
默认值:false
是否应该对状态快照数据使用压缩.

execution.buffer-timeout
默认值:Duration.ofMillis(100)
刷新缓冲区的最大时间(毫秒).默认情况下,帮助开发人员平滑输出缓冲区.
设置参数会导致三种逻辑模式:
    正值按该间隔周期性地触发刷新
    0 在每个记录之后触发刷新,从而最小化延迟
    -1 仅在输出缓冲区已满时触发刷新,从而最大限度地提高吞吐量.

execution.sorted-inputs.enabled
默认值:true
启用或禁用键控运算符的排序输入的标志.只在Batch模式下生效.

execution.batch-state-backend.enabled
默认值:true
为键控运算符启用或禁用批处理运行时特定状态后端和计时器服务的标志.
```

---

## ExternalResourceOptions(外部资源配置)
```sh
external-resources
默认值:无
所有外部资源的<resource_name>列表,分号分割,例如:gpu;fpga.

external-resource.gpu.driver-factory.class
默认值:无
定义由<resource_name>标识的外部资源的工厂类名.
工厂将用于在TaskExecutor端实例化ExternalResourceDriver.
例如:org.apache.flink.externalresource.gpu.GPUDriverFactory.

external-resource.gpu.amount
默认值:无
为每个TaskExecutor指定的外部资源量,例如:2.

external-resource.gpu.param.type
默认值:无
由<resource_name>指定的外部资源的自定义配置选项的命名模式.只有遵循此模式的配置才会传递到该外部资源的驱动程序工厂.
例如:nvidia.
```

---

## HeartbeatManagerOptions(心跳管理配置)
```sh
heartbeat.interval
默认值:10000L
从发送方请求心跳信号的时间间隔.

heartbeat.timeout
默认值:50000L
发送方和接收方请求和接收心跳超时.
```

---

## HighAvailabilityOptions(高可用配置)
```sh
high-availability
默认值:NONE
定义用于集群执行的高可用性模式.要启用高可用性,请将此模式设置为"ZOOKEEPER"或指定工厂类的FQN.

high-availability.cluster-id
默认值:/default
Flink群集的ID,用于将多个Flink群集彼此分离.
需要为standalone cluster设置，但会在YARN和Mesos中自动推断.

high-availability.storageDir
默认值:无
文件系统路径(URI),Flink将元数据保存在高可用性设置中.

high-availability.jobmanager.port
默认值:0
Flink主机在高可用设置中用于其RPC连接的端口(范围).在高可用性设置中,使用此值而不是JM的端口.
值"0"表示选择了随机自由端口.TaskManagers通过高可用性服务(leader election)发现此端口,因此随机端口或端口范围可以工作,而不需要任何额外的服务发现方法.

high-availability.zookeeper.quorum
默认值:无
使用ZooKeeper以高可用性模式运行Flink时要使用的ZooKeeper队列.

high-availability.zookeeper.path.root
默认值:/flink
Flink在ZooKeeper中存储实体的根路径.

high-availability.zookeeper.path.latch
默认值:/leaderlatch
定义用于选举leader的leader latch的znode.

high-availability.zookeeper.path.jobgraphs
默认值:/jobgraphs
作业图的ZooKeeper根路径(ZNode).

high-availability.zookeeper.path.leader
默认值:/leader
定义Leader的znode,其中包含指向Leader的URL和当前Leader会话ID.

high-availability.zookeeper.path.checkpoints
默认值:/checkpoints
已完成检查点的ZooKeeper根路径(ZNode).

high-availability.zookeeper.path.checkpoint-counter
默认值:/checkpoint-counter
检查点计数器的ZooKeeper根路径(ZNode).

high-availability.zookeeper.path.mesos-workers
默认值:/mesos-workers
用于持久化Mesos工作进程信息的ZooKeeper根路径.

high-availability.zookeeper.client.session-timeout
默认值:60000
定义ZooKeeper会话的会话超时(毫秒).

high-availability.zookeeper.client.connection-timeout
默认值:15000
定义ZooKeeper的连接超时(毫秒).

high-availability.zookeeper.client.retry-wait
默认值:5000
定义连续重试之间的暂停(毫秒).

high-availability.zookeeper.client.max-retry-attempts
默认值:3
定义客户端放弃之前的连接重试次数.

high-availability.zookeeper.path.running-registry
默认值:/running_job_registry/

high-availability.zookeeper.client.acl
默认值:open
定义要在ZK节点上配置的ACL(open|creator).
如果ZooKeeper服务器配置的"authProvider"属性映射为使用SASLAuthenticationProvider,并且集群配置为在安全模式(Kerberos)下运行,则可以将配置值设置为"creator".

high-availability.job.delay
默认值:无
故障转移后作业管理器恢复当前作业之前的时间.
```

---

## HistoryServerOptions(HistoryServer配置)
```sh
historyserver.archive.fs.refresh-interval
默认值:10000L
刷新存档作业目录的间隔(毫秒).

historyserver.archive.fs.dir
默认值:无
要从中提取存档作业的目录的逗号分隔列表.
historyserver将监视这些目录中的存档作业.
您可以通过配置JobManager将作业存档到目录"historyserver.archive.fs.dir".

historyserver.archive.clean-expired-jobs
默认值:false
HistoryServer是否应清理不再存在的作业.

historyserver.web.tmpdir
默认值:无
此配置参数允许定义historyserver web界面要使用的Flink web目录.web界面将其静态文件复制到目录中.

historyserver.web.address
默认值:无
HistoryServer的web界面的地址.

historyserver.web.port
默认值:8082
HistoryServer的web界面的端口.

historyserver.web.refresh-interval
默认值:10000L
HistoryServer的web界面的刷新间隔.

historyserver.web.ssl.enabled
默认值:false
启用对HistoryServer web前端的HTTPs访问.仅当全局SSL标志security.ssl.enabled已启用设置为true.

historyserver.archive.retained-jobs
默认值:-1
由定义的每个存档目录中要保留的最大作业数.
如果设置为"-1"(默认),则对存档的数量没有限制.
如果设置"0"或小于"-1",HistoryServer将报错.
```

---

## JMXServerOptions(JMX配置)
```sh
jmx.server.port
默认值:无
JMX服务器启动注册表的端口范围.
端口配置可以是单个端口:"9123",端口范围:"50100-50200",或范围和端口列表:"50100-50200,50300-50400,51234".
```

---

## JobManagerOptions(JM配置)
```sh
jobmanager.rpc.address
默认值:无
配置参数,用于定义要连接以与作业管理器通信的网络地址.
此值仅在存在具有静态名称或地址的单个JobManager的设置(简单的独立设置或具有动态服务名称解析的容器设置)中解释.
在许多高可用性设置中,当使用领导选举服务(如ZooKeeper)从潜在的多个备用JobManagers中选择和发现JobManager领导时,不使用它.

jobmanager.bind-host
默认值:无
JM绑定到的网络接口的本地地址.如果未配置,将使用"0.0.0.0".

jobmanager.rpc.port
默认值:6123
配置参数,用于定义要连接以与JM通信的网络端口.

jobmanager.rpc.bind-port
默认值:无
JM绑定到的本地RPC端口.如果未配置,则外部端口(jobmanager.rpc.port)将被使用.

jobmanager.heap.size
默认值:无
JM的JVM堆大小.

jobmanager.heap.mb
默认值:无
JM的JVM堆大小(MB).

jobmanager.memory.process.size
默认值:无
JM的总进程内存大小.这包括JM JVM进程消耗的所有内存,包括总Flink内存,JVM元空间和JVM开销.
在容器化设置中,这应该设置为容器内存.
另见'jobmanager.memory.flink.size'表示总Flink内存大小配置.

jobmanager.memory.flink.size
默认值:无
作业管理器的总Flink内存大小.
这包括JM消耗的所有内存,除了JVM元空间和JVM开销.它由JVM堆内存和堆外内存组成.
有关总进程内存大小配置,请参见'jobmanager.memory.process.size'.

jobmanager.memory.heap.size
默认值:无
JM的JVM堆内存大小.建议的最小JVM堆大小为128M.

jobmanager.memory.off-heap.size
默认值:MemorySize.ofMebiBytes(128)
JM的ff-heap内存大小.此选项涵盖所有堆外内存使用,包括直接和本机内存分配.
如果由启用了限制,则JobManager进程的JVM直接内存限制(-XX:MaxDirectMemorySize)将设置为此值'jobmanager.memory.enable-jvm-direct-memory-limit'.

jobmanager.memory.enable-jvm-direct-memory-limit
默认值:false
是否启用JobManager进程的JVM直接内存限制(-XX:MaxDirectMemorySize).
限制将设置为"jobmanager.memory.off-heap.size"选项的值.

jobmanager.memory.jvm-metaspace.size
默认值:MemorySize.ofMebiBytes(256)
JobManager的JVM元空间大小.

jobmanager.memory.jvm-overhead.min
默认值:MemorySize.ofMebiBytes(192)
JobManager的最小JVM开销大小.
这是为JVM开销(如线程堆栈空间、编译缓存等)保留的堆外内存.这包括本机内存,但不包括直接内存,并且在Flink计算JVM最大直接内存大小参数时不会计算在内.
JVM开销的大小是用来构成总进程内存的配置部分的.如果派生大小小于或大于配置的最小或最大大小,则将使用最小或最大大小.
通过将最小和最大大小设置为相同的值,可以显式指定JVM开销的确切大小.

jobmanager.memory.jvm-overhead.max
默认值:1g
JobManager的最大JVM开销大小.

jobmanager.memory.jvm-overhead.fraction
默认值:0.1f
为JVM开销保留的总进程内存的一小部分.

jobmanager.execution.attempts-history-size
默认值:16
历史记录中保留的先前执行尝试的最大数目.

jobmanager.execution.failover-strategy
默认值:region
此选项指定作业计算如何从任务失败中恢复.
'full':重新启动所有任务以恢复作业.
'region':重新启动可能受任务影响的所有任务失败.

jobmanager.archive.fs.dir
默认值:无
JM用于存储已完成作业的存档目录.

jobstore.cache-size
默认值:50L * 1024L * 1024L
作业存储缓存大小(字节),用于将已完成的作业保留在内存中.

jobstore.expiration-time
默认值:60L * 60L
完成的作业过期并从作业存储中清除的时间(以秒为单位).

jobstore.max-capacity
默认值:Integer.MAX_VALUE
作业存储中可以保留的最大已完成作业数.

jobmanager.retrieve-taskmanager-hostname
默认值:true
指示JobManager是否在注册期间检索TaskManager的规范主机名的标志.
如果该选项设置为"false",则TaskManager向JobManager注册可能会更快,因为不会执行反向DNS查找.
但是,本地input split分配(例如HDFS文件)可能会受到影响.

slot.request.timeout
默认值:5L * 60L * 1000L
从Slot池请求Slot的超时(以毫秒为单位).

slot.idle.timeout
默认值:50000L 复用heartbeat.timeout取值
Slot池中空闲Slot的超时(毫秒).

jobmanager.scheduler
默认值:ng
确定用于计划任务的计划程序实现.可接受的值为:ng 新一代调度程序.

jobmanager.partition.release-during-job-execution
默认值:true
控制在作业执行期间是否应该释放分区.
```

---

## MetricOptions(指标配置)
```sh
metrics.reporters
默认值:无
Reporter的可选列表.
如果已配置,则只会启动名称与列表中任何名称匹配的报告器.
否则,将启动配置中可以找到的所有报告程序.
例如:
metrics.reporters = foo,bar
metrics.reporter.foo.class = org.apache.flink.metrics.reporter.JMXReporter
metrics.reporter.foo.interval = 10
metrics.reporter.bar.class = org.apache.flink.metrics.graphite.GraphiteReporter
metrics.reporter.bar.port = 1337

metrics.reporter.<name>.class
默认值:无
用于名为<name>的Reporter类.

metrics.reporter.<name>.interval
默认值:Duration.ofSeconds(10)
Reporter的发送报告间隔.

metrics.reporter.<name>.<parameter>
默认值:无
Reporter的配置参数.

metrics.scope.delimiter
默认值:.
用于组合度量标识符的分隔符.

metrics.scope.jm
默认值:<host>.jobmanager
定义应用于JobManager范围内的所有度量的范围格式字符串.

metrics.scope.tm
默认值:<host>.taskmanager.<tm_id>
定义应用于TaskManager范围内的所有度量的范围格式字符串.

metrics.scope.jm.job
默认值:<host>.jobmanager.<job_name>
定义作用域格式字符串,该字符串应用于JobManager上作用域为作业的所有度量.

metrics.scope.tm.job
默认值:<host>.taskmanager.<tm_id>.<job_name>
定义作用域格式字符串,该字符串应用于TaskManager上作用域为作业的所有度量.

metrics.scope.task
默认值:<host>.taskmanager.<tm_id>.<job_name>.<task_name>.<subtask_index>
定义作用域格式字符串,该字符串应用于作用域为Task的所有度量.

metrics.scope.operator
默认值:<host>.taskmanager.<tm_id>.<job_name>.<operator_name>.<subtask_index>
定义作用域格式字符串,该字符串应用于作用域为Operator的所有度量.

metrics.latency.interval
默认值:0L
定义从Source发出延迟跟踪标记的间隔.
如果设置为0或负值,则禁用延迟跟踪.启用此功能可以显著影响集群的性能.

metrics.latency.granularity
默认值:operator
定义延迟度量的粒度.可接受的值为:
single - 跟踪延迟不区分Source和SubTask
operator - 跟踪延迟,同时区分Source,而不是SubTask
subtask - 跟踪延迟,同时区分Source和SubTask.

metrics.latency.history-size
默认值:128
定义要在每个Operator上保持的测量延迟数.

metrics.system-resource
默认值:false
指示Flink是否应报告系统资源指标(如计算机的CPU,内存或网络使用情况)的标志.

metrics.system-resource-probing-interval
默认值:5000L
探测指定的系统资源度量之间的间隔(毫秒).

metrics.internal.query-service.port
默认值:0
用于Flink的内部度量查询服务的端口范围.
接受端口列表("50100,50101"),范围("50100-50200")或两者的组合.
建议设置端口范围,以避免多个Flink组件在同一台机器上运行时发生冲突.
默认情况下,Flink将随机选择一个端口.

metrics.internal.query-service.thread-priority
默认值:1
用于Flink的内部度量查询服务的线程优先级.
线程是由Akka的线程池执行器创建的.
优先级的范围是从1(最小优先级)到10(最大优先级).
警告,增加此值可能会降低主要Flink组件.

metrics.fetcher.update-interval
默认值:10000L
WEB UI使用的度量获取程序的更新间隔(毫秒).
减小此值以加快更新度量.如果度量获取程序导致过多负载,请增加此值.将此值设置为0将完全禁用度量获取.
```

---

## NettyShuffleEnvironmentOptions(网络堆栈配置)
```sh
taskmanager.data.port
默认值:0
用于数据交换操作的TM的外部端口.

taskmanager.data.bind-port
默认值:无
用于数据交换操作的TM的绑定端口.

taskmanager.data.ssl.enabled
默认值:true
为TM数据传输启用SSL支持.仅当内部SSL的全局标志"security.ssl.internal.enabled"启用时设置为true.

taskmanager.network.blocking-shuffle.compression.enabled
默认值:false
指示是否将压缩shuffle数据以阻止shuffle模式.

taskmanager.network.compression.codec
默认值:LZ4
压缩Shuffle数据时要使用的编解码器.

taskmanager.network.detailed-metrics
默认值:false
用于启用/禁用有关入站/出站网络队列长度的更详细度量.

taskmanager.network.numberOfBuffers
默认值:2048
网络堆栈中使用的缓冲区数.

taskmanager.network.memory.fraction
默认值:0.1f
JVM内存的一小部分用于网络缓冲区.
被taskmanager.memory.network.fraction替代.

taskmanager.network.memory.min
默认值:64mb
网络缓冲最小内存.
被taskmanager.memory.network.min替代.

taskmanager.network.memory.max
默认值:1gb
网络缓冲最大内存.
被taskmanager.memory.network.max替代.

taskmanager.network.memory.buffers-per-channel
默认值:2
在credit-based的流控制模型中,用于每个传出/传入通道(subpartition/inputchannel)的独占网络缓冲区数.
为获得良好的性能,应至少配置2个.
1个缓冲区用于接收subpartition中的in-fight数据,
1个缓冲区用于并行序列化.

taskmanager.network.memory.floating-buffers-per-gate
默认值:8
为每个输出/输入gate(resultpartition/inputgate)使用的额外网络缓冲区数.
在credit-based的流控制模式中,这表示所有inputchannel之间共享多少floating credit.
Floating缓冲区基于backlog(subpartition中的实时输出缓冲区)反馈进行分配,有助于缓解subpartition间数据分布不平衡造成的反压.
如果节点之间的往返时间较长或者群集中的机器数量较多,则应增加此值.

taskmanager.network.sort-shuffle.min-buffers
默认值:64
每个sort-merge blocking结果分区所需的最小网络缓冲区数.
对于大规模批量作业,建议增加此配置值以提高压缩比并减少小的网络数据包.
注意:要增加此配置值,您可能还需要增加总网络内存的大小,以避免"网络缓冲区数量不足"错误.

taskmanager.network.sort-shuffle.min-parallelism
默认值:Integer.MAX_VALUE
并行度阈值,用于在sort-merge blocking shuffle和默认的基于哈希的blocking shuffle之间切换
这意味着对于较小的并行度,将使用基于哈希的blocking shuffle,对于较大的并行度,将使用sort-merge blocking shuffle.
注意:sort merge blocking shuffle使用unmanaged direct内存进行数据写入和读取,因此如果发生直接内存错误,只需增加直接内存的大小.

taskmanager.network.memory.max-buffers-per-channel
默认值:10
可用于每个channel的最大缓冲区数.
如果一个channel超过了最大缓冲区的数目,它将使任务变得不可用,导致背压并阻塞数据处理.
这可能会加快检查点对齐,因为在数据倾斜和配置了大量Float缓冲区的情况下,可以防止缓冲的in-flight数据的过度增长.
这个限制没有严格的保证,可以被flatMap操作符,跨越多个缓冲区的记录或产生大量数据的单个计时器忽略.

taskmanager.network.memory.exclusive-buffers-request-timeout-ms
默认值:30000L
为每个channel请求独占缓冲区的超时.
由于本地缓冲池的最大缓冲区数和所需缓冲区数不同,因此可能存在上游任务已占用所有缓冲区而下游任务正在等待独占缓冲区的死锁情况.
超时使独占缓冲区请求失败,并要求用户增加缓冲区总数,从而打破了这种关系.

taskmanager.network.blocking-shuffle.type
默认值:file
blocking shuffle类型,可以是"mmap"或"file".
"auto"表示根据系统内存结构自动选择属性类型(mmap为64位,file为32位).
请注意,mmap的内存使用情况不受配置的内存限制的影响,但是一些资源框架(如yarn)会跟踪内存使用情况,一旦内存超过某个阈值,就会终止容器.
另外请注意,此选项是实验性的,将来可能会更改.

taskmanager.network.netty.num-arenas
默认值:-1
Netty arenas的数量.

taskmanager.network.netty.server.numThreads
默认值:-1
Netty服务器的线程数量.

taskmanager.network.netty.client.numThreads
默认值:-1
Netty客户端的线程数量.

taskmanager.network.netty.server.backlog
默认值:0
Netty服务器连接积压.

taskmanager.network.netty.client.connectTimeoutSec
默认值:120
Netty客户端连接超时.

taskmanager.network.retries
默认值:0
网络通信的重试次数.
目前它只用于建立input/output channel连接.

taskmanager.network.netty.sendReceiveBufferSize
默认值:0
Netty发送和接收缓冲区大小.
这默认为系统缓冲区大小(cat /proc/sys/net/ipv4/tcp_[rw]mem),在现代Linux中是4mib.

taskmanager.network.netty.transport
默认值:auto
Netty传输类型,可以是"nio"或"epoll".
"auto"是指根据平台自动选择属性模式.
请注意,"epoll"模式可以获得更好的性能,更少的GC,并且具有更高级的特性,这些特性仅在现代Linux上可用.

taskmanager.network.request-backoff.initial
默认值:100
输入通道分区请求的最小回退(毫秒).

taskmanager.network.request-backoff.max
默认值:10000
输入通道分区请求的最大回退(毫秒).
```

---

## OptimizerOptions(优化器配置)
```sh
compiler.delimited-informat.max-line-samples
默认值:10
编译器为分隔输入获取的最大行样本数.样本用于估计记录的数量.可以使用输入格式的参数覆盖特定输入的此值.

compiler.delimited-informat.min-line-samples
默认值:2
编译器为分隔输入获取的最小行样本数.样本用于估计记录的数量.可以使用输入格式的参数覆盖特定输入的此值.

compiler.delimited-informat.max-sample-len
默认值:2097152
编译器对分隔输入所采用的行样本的最大长度.如果单个样本的长度超过此值(可能是因为解析器配置错误),则采样将中止.
可以使用输入格式的参数覆盖特定输入的此值.
```

---

## PipelineOptions(作业执行配置)
```sh
pipeline.name
默认值:无
用于打印和记录的作业名称.

pipeline.jars
默认值:无
要打包的jar和要发送到集群的作业jar的分号分隔列表.这些必须是有效的路径.

pipeline.classpaths
默认值:无
要打包的类路径的分号列表,其中包含要发送到集群的作业jar.这些必须是有效的URL.

pipeline.auto-generate-uids
默认值:true
禁用自动生成的UID时,用户将被迫在DataStream应用程序上手动指定UID.

pipeline.auto-type-registration
默认值:true
控制Flink是否自动向Kryo注册用户程序中的所有类型.

pipeline.auto-watermark-interval
默认值:Duration.ZERO
自动水印发射的间隔.整个流系统都使用水印来跟踪时间的进程.例如,它们用于基于时间的窗口.

pipeline.closure-cleaner-level
默认值:ClosureCleanerLevel.RECURSIVE
配置闭包清理器的工作模式.
ClosureCleanerLevel.NONE - 完全禁用闭包清理器
ClosureCleanerLevel.TOP_LEVEL - 只清理顶级类而不递归到字段中
ClosureCleanerLevel.RECURSIVE - 递归地清除所有字段.

pipeline.force-avro
默认值:false
强制Flink对pojo使用apache avro序列化程序.
重要提示:请确保包含flink-avro模块.

pipeline.force-kryo
默认值:false
如果启用,则强制TypeExtractor对POJO使用Kryo序列化程序,即使我们可以作为POJO进行分析.
在某些情况下,这可能更可取.例如,当使用子类不能作为POJO分析的接口时.

pipeline.generic-types
默认值:true
如果禁用泛型类型的使用,Flink将在遇到要通过Kryo进行序列化的数据类型时抛出UnsupportedOperationException.

pipeline.global-job-parameters
默认值:无
注册自定义的可序列化用户配置对象.可以在Operator中访问配置.

pipeline.max-parallelism
默认值:-1
用于尚未指定最大并行度的运算符的程序范围内的最大并行度.最大并行度指定动态缩放的上限和用于分区状态的键组数.

pipeline.object-reuse
默认值:false
启用时,Flink内部用于反序列化和将数据传递给用户代码函数的对象将被重用.
请记住,当操作的用户代码函数不知道这种行为时,这可能会导致错误.

pipeline.default-kryo-serializers
默认值:无
以分号分隔的类名和Kryo序列化程序对的列表要用作Kryo默认序列化程序的类名.

pipeline.registered-kryo-types
默认值:无
要在序列化堆栈中注册的类型的分号分隔列表.
如果该类型最终被序列化为POJO,则该类型将向POJO序列化程序注册.
如果类型最终被Kryo序列化,那么它将在Kryo注册,以确保只写入标记.

pipeline.registered-pojo-types
默认值:无
要在序列化堆栈中注册的类型的分号分隔列表.

pipeline.operator-chaining
默认值:true
Operator Chain允许将non-shuffle操作放在同一线程中,从而完全避免序列化和反序列化.

pipeline.cached-files
默认值:无
要以给定名称在分布式缓存中注册的文件.
这些文件可以通过本地路径从(分布式)运行时中的任何用户定义函数访问.
文件可以是本地文件(将通过BlobServer分发),也可以是分布式文件系统中的文件.
如果需要,运行时会将文件临时复制到本地缓存中.
```

---

## QueryableStateOptions(查询状态配置)
```sh
queryable-state.proxy.ports
默认值:9069
可查询状态代理的端口范围.

queryable-state.proxy.network-threads
默认值:0
可查询状态代理的网络(Netty的事件循环)线程数.

queryable-state.proxy.query-threads
默认值:0
可查询状态代理的查询线程数.
如果设置为0,则使用Slot数.

queryable-state.server.ports
默认值:9067
可查询状态服务器的端口范围.

queryable-state.server.network-threads
默认值:0
可查询状态服务器的网络(Netty的事件循环)线程数.

queryable-state.server.query-threads
默认值:0
可查询状态服务器的查询线程数.如果设置为0,则使用Slot数.

queryable-state.enable
默认值:false
是否启用可查询状态代理和服务器.

queryable-state.client.network-threads
默认值:0
可查询状态客户端的网络(Netty的事件循环)线程数.
```

---

## ResourceManagerOptions(RM配置)
```sh
resourcemanager.job.timeout
默认值:5 minutes
没有指派JM作为leader的作业超时时间.

local.number-resourcemanager
默认值:1
启动RM的数量.

resourcemanager.rpc.port
默认值:0
定义与资源管理器通信时要连接的网络端口.
默认情况下,作业管理器的端口,因为使用的是同一ActorSystem.
无法使用此配置键定义端口范围.

slotmanager.number-of-slots.max
默认值:Integer.MAX_VALUE
定义Flink群集分配的最大Slot数.
此配置选项用于限制批处理工作负载的资源消耗.
不建议为流式工作负载配置此选项,如果没有足够的插槽,流式工作负载可能会失败.
请注意,此配置选项对standalone集群不起作用,其中分配的插槽数量不受Flink控制.

slotmanager.redundant-taskmanager-num
默认值:0
冗余任务管理器的数量.冗余任务管理器是由Flink启动的额外任务管理器,目的是在由于任务管理器丢失而导致失败时加快作业恢复.
请注意,此功能仅适用于Active部署(Native K8s,Yarn和Mesos).

slotmanager.request-timeout
默认值:-1L
丢弃Slot请求的超时时间.

resourcemanager.standalone.start-up-time
默认值:-1L
standalone群集启动期间的时间(毫秒).
在此期间,standalone集群的资源管理器期望注册新的任务执行器,并且不会使任何当前注册的Slot都无法满足的Slot请求失败.
在这段时间之后,它将立即失败挂起的和新来的请求.这些请求不能被注册的Slot满足.
如果不设置,将使用'slotmanager.request-timeout'.

slotmanager.taskmanager-timeout
默认值:30000L
释放空闲任务管理器的超时.

resourcemanager.taskmanager-timeout
默认值:30000L
释放空闲任务管理器的超时.

resourcemanager.taskmanager-release.wait.result.consumed
默认值:true
仅当每个生成的结果分区被占用或失败时才释放任务执行器.
'True'是默认值,'False'表示空闲任务执行器释放未被确认结果分区消耗的接收方阻止,并且可以在'resourcemanager.taskmanager-timeout'.
将此选项设置为'false'可以加快任务执行器的释放速度,但如果使用结束时间比'false'慢,则可能导致意外失败'resourcemanager.taskmanager-timeout'。
```