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
# Flink相比传统的Spark Streaming有什么区别？
架构模型上：Spark Streaming 的task运行依赖driver 和 executor和worker，当然driver和excutor还依赖于集群管理器Standalone或者yarn等。而Flink运行时主要是JobManager、TaskManage和TaskSlot。另外一个最核心的区别是：Spark Streaming 是微批处理，运行的时候需要指定批处理的时间，每次运行 job 时处理一个批次的数据；Flink 是基于事件驱动的，事件可以理解为消息。事件驱动的应用程序是一种状态应用程序，它会从一个或者多个流中注入事件，通过触发计算更新状态，或外部动作对注入的事件作出反应。
任务调度上：Spark Streaming的调度分为构建 DGA 图，划分 stage，生成 taskset，调度 task等步骤而Flink首先会生成 StreamGraph，接着生成 JobGraph，然后将 jobGraph 提交给 Jobmanager 由它完成 jobGraph 到 ExecutionGraph 的转变，最后由 jobManager 调度执行。
时间机制上：flink 支持三种时间机制事件时间，注入时间，处理时间，同时支持 watermark 机制处理滞后数据。Spark Streaming 只支持处理时间，Structured streaming则支持了事件时间和watermark机制。
容错机制上：二者保证exactly-once的方式不同。spark streaming 通过保存offset和事务的方式；Flink 则使用两阶段提交协议来解决这个问题。

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

### [Flink的基础编程模型了解吗？](https://www.cnblogs.com/cxhfuujust/p/10925843.html)
```
Flink 程序的基础构建单元是流（streams）与转换（transformations）。DataSet API 中使用的数据集也是一种流。数据流（stream）就是一组永远不会停止的数据记录流，而转换（transformation）是将一个或多个流作为输入，并生成一个或多个输出流的操作。
执行时，Flink程序映射到 streaming dataflows，由流（streams）和转换操作（transformation operators）组成。每个 dataflow 从一个或多个源（source）开始，在一个或多个接收器（sink）中结束。
```

### 说说Flink架构中的角色和作用？
```
Flink是主从架构模式，Flink集群中有主节点和从节点，另外在集群之外还有客户端节点，在这些节点
之中又有许多内部的角色，这些角色联合运作，完成整个Flink程序的计算任务。

# Client 
进行提交任务,提交完成后可以选择关闭进程或等待返回结果.不是Flink集群运行的一部分.
当用户提交一个Flink程序时，会首先创建一个Client，该Client首先会对用户提交的Flink程序进行预处理，并提交到Flink集群中处理，所以Client需要从用户提交的Flink程序配置中获取JobManager的地址，并建立到JobManager的连接，将Flink Job提交给JobManager。
Client会将用户提交的Flink程序组装一个JobGraph， 并且是以JobGraph的形式提交的。一个JobGraph是一个Flink Dataflow，它由多个JobVertex组成的DAG。
其中，一个JobGraph包含了一个Flink程序的如下信息：JobID、Job名称、配置信息、一组JobVertex等。

# Actor System(AKKA) 
Flink内部使用AKKA角色系统来管理JobManager和TaskManager

# JobManager 
主要职责是分布式执行,并协调任务做CK,协调故障恢复等,从客户端接收到任务后,首先生成优化过的执行计划,再调度到TaskManager中执行
JobManager是Flink系统的协调者，它负责接收Flink Job，调度组成Job的多个Task的执行。同时，JobManager还负责收集Job的状态信息，并管理Flink集群中从节点TaskManager。

# Scheduler 
调度器,Flink的执行者被定义为任务槽.每个任务管理器都需要管理一个或多个任务槽.在内部,Flink决定哪些任务需要共享该插槽以及哪些任务必须被放置在特定的插槽中.它通过SlotSharingGroup和CoLocationGroup完成.

# Checkpoint Coordinator
Checkpoint协调器,负责checkpoint管理执行

# Memory Manager
内存管理器,会根据配置等信息计算内存的分配

# TaskManager
主要职责是从JobManager处接收任务,并部署和启动任务,接收上游的数据并处理,TaskManager在创建之初就设置好了Slot , 每个Slot可以执行一个任务,每个TaskManager是一个进程.
TaskManager也是一个Actor，它是实际负责执行计算的Worker，在其上执行Flink Job的一组Task。每个TaskManager负责管理其所在节点上的资源信息，如内存、磁盘、网络，在启动的时候将资源的状态向JobManager汇报。

# Task Slot
任务槽，负责具体任务的执行,每一个slot是一个线程
```

### [说说Flink中常用的算子？用过哪些？](https://ci.apache.org/projects/flink/flink-docs-release-1.9/dev/batch/)
```
map
flatMap
filter
keyBy
reduce
fold
aggregation
min/minBy
max/maxBy
```

### Flink中的分区策略有哪几种？
```
GlobalPartitioner,GLOBAL分区。将记录输出到下游Operator的第一个实例。

ShufflePartitioner,SHUFFLE分区。将记录随机输出到下游Operator的每个实例。

RebalancePartitioner,REBALANCE分区。将记录以循环的方式输出到下游Operator的每个实例。

RescalePartitioner,RESCALE分区。基于上下游Operator的并行度，将记录以循环的方式输出到下游Operator的每个实例。举例: 上游并行度是2，下游是4，则上游一个并行度以循环的方式将记录输出到下游的两个并行度上;上游另一个并行度以循环的方式将记录输出到下游另两个并行度上。若上游并行度是4，下游并行度是2，则上游两个并行度将记录输出到下游一个并行度上；上游另两个并行度将记录输出到下游另一个并行度上。

BroadcastPartitioner,BROADCAST分区。广播分区将上游数据集输出到下游Operator的每个实例中。适合于大数据集Join小数据集的场景。

ForwardPartitioner,FORWARD分区。将记录输出到下游本地的operator实例。ForwardPartitioner分区器要求上下游算子并行度一样。上下游Operator同属一个SubTasks。

KeyGroupStreamPartitioner,HASH分区。将记录按Key的Hash值输出到下游Operator实例。

CustomPartitionerWrapper,CUSTOM分区。通过Partitioner实例的partition方法(自定义的)将记录输出到下游。
```

### Flink的并行度有了解吗？Flink中设置并行度需要注意什么？
```
Flink程序由多个任务（Source、Transformation、Sink）组成。任务被分成多个并行实例来执行，每个并行实例处理任务的输入数据的子集。任务的并行实例的数量称之为并行度。

Flink中任务的并行度可以从多个不同层面设置：
操作算子层面(Operator Level)、执行环境层面(Execution Environment Level)、客户端层面(Client Level)、系统层面(System Level)。

Flink可以设置好几个level的parallelism，其中包括Operator Level、Execution Environment Level、Client Level、System Level

在flink-conf.yaml中通过parallelism.default配置项给所有execution environments指定系统级的默认parallelism；
在ExecutionEnvironment里头可以通过setParallelism来给operators、data sources、data sinks设置默认的parallelism；
如果operators、data sources、data sinks自己有设置parallelism则会覆盖ExecutionEnvironment设置的parallelism。 
```

### [Flink支持哪几种重启策略？分别如何配置？](https://www.jianshu.com/p/22409ccc7905)
```
重启策略种类：
固定延迟重启策略（Fixed Delay Restart Strategy）
故障率重启策略（Failure Rate Restart Strategy）
无重启策略（No Restart Strategy）
Fallback重启策略（Fallback Restart Strategy）
```

### [Flink的分布式缓存有什么作用？如何使用？](https://www.jianshu.com/p/7770f9aec75d)
```
Flink提供了一个分布式缓存，类似于hadoop，可以使用户在并行函数中很方便的读取本地文件，并把它放在taskmanager节点中，防止task重复拉取。

此缓存的工作机制如下：程序注册一个文件或者目录(本地或者远程文件系统，例如hdfs或者s3)，通过ExecutionEnvironment注册缓存文件并为它起一个名称。

当程序执行，Flink自动将文件或者目录复制到所有taskmanager节点的本地文件系统，仅会执行一次。用户可以通过这个指定的名称查找文件或者目录，然后从taskmanager节点的本地文件系统访问它。
```

### [Flink中的广播变量，使用广播变量需要注意什么事项？](https://www.jianshu.com/p/3b6698ec10d8)
```
在Flink中，同一个算子可能存在若干个不同的并行实例，计算过程可能不在同一个Slot中进行，不同算子之间更是如此，因此不同算子的计算数据之间不能像Java数组之间一样互相访问，而广播变量Broadcast便是解决这种情况的。

我们可以把广播变量理解为是一个公共的共享变量，我们可以把一个dataset 数据集广播出去，然后不同的task在节点上都能够获取到，这个数据在每个节点上只会存在一份。
```

### Flink中对窗口的支持包括哪几种？说说他们的使用场景
```
# 窗口类型
1.flink支持两种划分窗口的方式（time和count） 如果根据时间划分窗口，那么它就是一个time-window 如果根据数据划分窗口，那么它就是一个count-window
2.flink支持窗口的两个重要属性（size和interval）
    如果size=interval,那么就会形成tumbling-window(无重叠数据)
    如果size>interval,那么就会形成sliding-window(有重叠数据)
    如果size<interval,那么这种窗口将会丢失数据。比如每5秒钟，统计过去3秒的通过路口汽车的数据，将会漏掉2秒钟的数据。
3.通过组合可以得出四种基本窗口
    `time-tumbling-window` 无重叠数据的时间窗口，设置方式举例：timeWindow(Time.seconds(5))
    `time-sliding-window` 有重叠数据的时间窗口，设置方式举例：timeWindow(Time.seconds(5), Time.seconds(3))
    `count-tumbling-window`无重叠数据的数量窗口，设置方式举例：countWindow(5)
    `count-sliding-window` 有重叠数据的数量窗口，设置方式举例：countWindow(5,3)
4.flink支持在stream上的通过key去区分多个窗口 

# 窗口的实现方式
1.Tumbling Time Window
假如我们需要统计每一分钟中用户购买的商品的总数，需要将用户的行为事件按每一分钟进行切分，这种切分被成为翻滚时间窗口（Tumbling Time Window）。翻滚窗口能将数据流切分成不重叠的窗口，每一个事件只能属于一个窗口。
    // 用户id和购买数量 stream
    val counts: DataStream[(Int, Int)] = ...
    val tumblingCnts: DataStream[(Int, Int)] = counts
    // 用userId分组
    .keyBy(0)
    // 1分钟的翻滚窗口宽度
    .timeWindow(Time.minutes(1))
    // 计算购买数量
    .sum(1)
2.Sliding Time Window
我们可以每30秒计算一次最近一分钟用户购买的商品总数。这种窗口我们称为滑动时间窗口（Sliding Time Window）。在滑窗中，一个元素可以对应多个窗口。通过使用 DataStream API，我们可以这样实现
    val slidingCnts: DataStream[(Int, Int)] = buyCnts
    .keyBy(0)
    .timeWindow(Time.minutes(1), Time.seconds(30))
    .sum(1)
3.Tumbling Count Window
当我们想要每100个用户购买行为事件统计购买总数，那么每当窗口中填满100个元素了，就会对窗口进行计算，这种窗口我们称之为翻滚计数窗口（Tumbling Count Window）。通过使用 DataStream API，我们可以这样实现
    // Stream of (userId, buyCnts)
    val buyCnts: DataStream[(Int, Int)] = ...
    val tumblingCnts: DataStream[(Int, Int)] = buyCnts
    // key stream by sensorId
    .keyBy(0)
    // tumbling count window of 100 elements size
    .countWindow(100)
    // compute the buyCnt sum
    .sum(1)
4.Session Window
在这种用户交互事件流中，我们首先想到的是将事件聚合到会话窗口中（一段用户持续活跃的周期），由非活跃的间隙分隔开。如上图所示，就是需要计算每个用户在活跃期间总共购买的商品数量，如果用户30秒没有活动则视为会话断开（假设raw data stream是单个用户的购买行为流）。
    // Stream of (userId, buyCnts)
    val buyCnts: DataStream[(Int, Int)] = ...
    val sessionCnts: DataStream[(Int, Int)] = vehicleCnts
    .keyBy(0)
    // session window based on a 30 seconds session gap interval
    .window(ProcessingTimeSessionWindows.withGap(Time.seconds(30)))
    .sum(1)
```

### [Flink 中的 State Backends是什么？有什么作用？分成哪几类？说说他们各自的优缺点？](https://www.cnblogs.com/029zz010buct/p/9403283.html)
```
Flink流计算中可能有各种方式来保存状态：
    窗口操作
    使用了KV操作的函数
    继承了CheckpointedFunction的函数
    当开始做checkpointing的时候，状态会被持久化到checkpoints里来规避数据丢失和状态恢复。选择的状态存储策略不同，会导致状态持久化如何和checkpoints交互。
    Flink内部提供了这些状态后端:
    MemoryStateBackend
    FsStateBackend
    RocksDBStateBackend
    如果没有其他配置，系统将使用MemoryStateBackend。
```

### [Flink中的时间种类有哪些？各自介绍一下？](https://www.jianshu.com/p/0a135391ff41)
```
Flink中的时间与现实世界中的时间是不一致的，在flink中被划分为事件时间，摄入时间，处理时间三种。
如果以EventTime为基准来定义时间窗口将形成EventTimeWindow,要求消息本身就应该携带EventTime
如果以IngesingtTime为基准来定义时间窗口将形成IngestingTimeWindow,以source的systemTime为准。
如果以ProcessingTime基准来定义时间窗口将形成ProcessingTimeWindow，以operator的systemTime为准。
```

### [WaterMark是什么？是用来解决什么问题？如何生成水印？水印的原理是什么？](https://www.jianshu.com/p/1c2542f11da0)
```
Watermark是Apache Flink为了处理EventTime 窗口计算提出的一种机制,本质上也是一种时间戳。
Watermark是用于处理乱序事件的，处理乱序事件通常用watermark机制结合window来实现。
```

### Flink的table和SQL熟悉吗？Table API和SQL中TableEnvironment这个类有什么作用？
```
TableEnvironment是Table API和SQL集成的核心概念。它负责：
    1.在内部catalog中注册表
    2.注册外部catalog
    3.执行SQL查询
    4.注册用户定义（标量，表或聚合）函数
    5.将DataStream或DataSet转换为表
    6.持有对ExecutionEnvironment或StreamExecutionEnvironment的引用 
```

### [Flink如何实现SQL解析的呢？](https://cloud.tencent.com/developer/article/1471612)
```
StreamSQL API的执行原理如下：
    1.用户使用对外提供Stream SQL的语法开发业务应用；
    2.用calcite对StreamSQL进行语法检验，语法检验通过后，转换成calcite的逻辑树节点；最终形成calcite的逻辑计划；
    3.采用Flink自定义的优化规则和calcite火山模型、启发式模型共同对逻辑树进行优化，生成最优的Flink物理计划；
    4.对物理计划采用janino codegen生成代码，生成用低阶API DataStream 描述的流应用，提交到Flink平台执行
```

### [Flink是如何做到批处理与流处理统一的？](https://cloud.tencent.com/developer/article/1501348)
```
Flink设计者认为：有限流处理是无限流处理的一种特殊情况，它只不过在某个时间点停止而已。Flink通过一个底层引擎同时支持流处理和批处理。
```

### [Flink中的数据传输模式是怎么样的？](https://www.cnblogs.com/029zz010buct/p/10156836.html)
```
在一个运行的application中，它的tasks在持续交换数据。TaskManager负责做数据传输。
TaskManager的网络组件首先从缓冲buffer中收集records，然后再发送。也就是说，records并不是一个接一个的发送，而是先放入缓冲，然后再以batch的形式发送。这个技术可以高效使用网络资源，并达到高吞吐。类似于网络或磁盘 I/O 协议中使用的缓冲技术。
```

### [Flink的容错机制知道吗？](https://www.jianshu.com/p/1fca8fb61f86)
```
Flink基于分布式快照与可部分重发的数据源实现了容错。用户可自定义对整个Job进行快照的时间间隔，当任务失败时，Flink会将整个Job恢复到最近一次快照，并从数据源重发快照之后的数据。
```

### Flink中的分布式快照机制是怎么样的？
[参考1](https://zhuanlan.zhihu.com/p/43536305) [参考2](https://blog.csdn.net/u014589856/article/details/94346801)
```
Flink容错机制的核心就是持续创建分布式数据流及其状态的一致快照。这些快照在系统遇到故障时，充当可以回退的一致性检查点（checkpoint）。Lightweight Asynchronous Snapshots for Distributed Dataflows 描述了Flink创建快照的机制。此论文是受分布式快照算法 Chandy-Lamport启发，并针对Flink执行模型量身定制。
```

### [Flink是如何实现Exactly-once的？](https://www.jianshu.com/p/9d875f6e54f2)
```
Flink通过状态和两次提交协议来保证了端到端的exactly-once语义。
```

### Flink的Kafka-connector是如何做到向下兼容的呢？
[参考1](https://www.cnblogs.com/Springmoon-venn/p/10690531.html) [参考2](https://www.cnblogs.com/huxi2b/p/6784795.html) [参考3](https://www.cnblogs.com/0x12345678/p/10463539.html)
```
在新的连接器中，Flink提供了一个基础connector模块，它是实现所有connector的核心模块，所有的connector都依赖于基础connector。
Kafka社区也改写了Java clients底层的网络客户端代码，里面会自动地判断连接的broker端所支持client请求的最高版本，并自动创建合乎标准的请求。
```

### [Flink中的内存管理是如何做的？](https://www.cnblogs.com/ooffff/p/9508271.html)
```
Flink 并不是将大量对象存在堆上，而是将对象都序列化到一个预分配的内存块上，这个内存块叫做 MemorySegment，它代表了一段固定长度的内存（默认大小为 32KB），也是 Flink 中最小的内存分配单元，并且提供了非常高效的读写方法。每条记录都会以序列化的形式存储在一个或多个MemorySegment中。
Flink堆内存划分：
    Network Buffers: 一定数量的32KB大小的缓存，主要用于数据的网络传输。在 TaskManager启动的时候就会分配。默认数量是2048个，可以通过 taskmanager.network.numberOfBuffers来配置。
    Memory Manager Pool:这是一个由MemoryManager管理的，由众多MemorySegment组成的超大集合。Flink中的算法（如 sort/shuffle/join）会向这个内存池申请MemorySegment，将序列化后的数据存于其中，使用完后释放回内存池。默认情况下，池子占了堆内存的70% 的大小。
    Remaining (Free) Heap: 这部分的内存是留给用户代码以及TaskManager 的数据结构使用的，可以把这里看成的新生代。
Flink大量使用堆外内存。
```

### [Flink中的序列化是如何做的？](https://www.cnblogs.com/ooffff/p/9508271.html)
```
Flink实现了自己的序列化框架，Flink处理的数据流通常是一种类型，所以可以只保存一份对象Schema信息，节省存储空间。又因为对象类型固定，所以可以通过偏移量存取。
Java支持任意Java或Scala类型，类型信息由TypeInformation类表示，TypeInformation支持以下几种类型：
BasicTypeInfo:任意Java 基本类型或String类型。
BasicArrayTypeInfo:任意Java基本类型数组或String数组。
WritableTypeInfo:任意Hadoop Writable接口的实现类。
TupleTypeInfo:任意的Flink Tuple类型(支持Tuple1 to Tuple25)。Flink tuples 是固定长度固定类型的Java Tuple实现。
CaseClassTypeInfo: 任意的 Scala CaseClass(包括 Scala tuples)。
PojoTypeInfo: 任意的 POJO (Java or Scala)，例如，Java对象的所有成员变量，要么是 public 修饰符定义，要么有 getter/setter 方法。
GenericTypeInfo: 任意无法匹配之前几种类型的类。

针对前六种类型数据集，Flink皆可以自动生成对应的TypeSerializer，能非常高效地对数据集进行序列化和反序列化。对于最后一种数据类型，Flink会使用Kryo进行序列化和反序列化。每个TypeInformation中，都包含了serializer，类型会自动通过serializer进行序列化，然后用Java Unsafe接口写入MemorySegments。

操纵二进制数据：
Flink提供了如group、sort、join等操作，这些操作都需要访问海量数据。以sort为例:首先，Flink会从MemoryManager中申请一批 MemorySegment，用来存放排序的数据。
这些内存会分为两部分，一个区域是用来存放所有对象完整的二进制数据。另一个区域用来存放指向完整二进制数据的指针以及定长的序列化后的key（key+pointer）。将实际的数据和point+key分开存放有两个目的。
第一，交换定长块（key+pointer）更高效，不用交换真实的数据也不用移动其他key和pointer;
第二，这样做是缓存友好的，因为key都是连续存储在内存中的，可以增加cache命中。排序会先比较 key 大小，这样就可以直接用二进制的 key 比较而不需要反序列化出整个对象。访问排序后的数据，可以沿着排好序的key+pointer顺序访问，通过 pointer 找到对应的真实数据。
```

### [Flink中的RPC框架选型是怎么样的？](https://www.cnblogs.com/letsfly/p/10853341.html)
```
对于Flink中各个组件（JobMaster、TaskManager、Dispatcher等），其底层RPC框架基于Akka实现。
```

### [Flink在使用Window时出现数据倾斜，你有什么解决办法？](https://blog.csdn.net/it_lee_j_h/article/details/88641894)
```
注意：这里window产生的数据倾斜指的是不同的窗口内积攒的数据量不同，主要是由源头数据的产生速度导致的差异。
核心思路：1.重新设计key 2.在窗口计算前做预聚合
```

### [Flink SQL在使用Groupby时出现热点数据，如何处理？](https://help.aliyun.com/knowledge_detail/68645.html)
```
数据倾斜:
SELECT 
ID,
COUNT(distinct NAME)
FROM  AA
GROUP BY ID;

可以对上述SQL进行拆分

去重:
CREATE VIEW SSS AS
SELECT
ID,
NAME
FROM  AA
GROUP BY ID,NAME;

聚合:
INSERT INTO  SS
SELECT
ID,
COUNT(NAME)
FROM  SSS
GROUP BY ID;
```

### 现在我有Flink任务，delay极高，请问你有什么调优策略？
```
首先要确定问题产生的原因，找到最耗时的点，确定性能瓶颈点。
比如任务频繁反压，找到反压点。
主要通过：资源调优、作业参数调优。
资源调优即是对作业中的Operator的并发数（parallelism）、CPU（core）、堆内存（heap_memory）等参数进行调优。
作业参数调优包括：并行度的设置，State的设置，checkpoint的设置。
```

### [Flink是如何处理反压的？和Spark有什么区别？Storm呢？](https://yq.aliyun.com/articles/64821)
```
Flink 没有使用任何复杂的机制来解决反压问题，因为根本不需要那样的方案！它利用自身作为纯数据流引擎的优势来优雅地响应反压问题。

Storm 是通过监控 Bolt 中的接收队列负载情况，如果超过高水位值就会将反压信息写到 Zookeeper ，Zookeeper 上的 watch 会通知该拓扑的所有 Worker 都进入反压状态，最后 Spout 停止发送 tuple。

JStorm 认为直接停止 Spout 的发送太过暴力，存在大量问题。当下游出现阻塞时，上游停止发送，下游消除阻塞后，上游又开闸放水，过了一会儿，下游又阻塞，上游又限流，如此反复，整个数据流会一直处在一个颠簸状态。所以 JStorm 是通过逐级降速来进行反压的，效果会较 Storm 更为稳定，但算法也更复杂。另外 JStorm 没有引入 Zookeeper 而是通过 TopologyMaster 来协调拓扑进入反压状态，这降低了 Zookeeper 的负载。

SparkStreaming的Backpressure,根据处理能力来调整输入速率，从而在流量高峰时仍能保证最大的吞吐和性能
```

### Operator Chains（算子链）这个概念你了解吗？Flink是如何优化的？什么情况下Operator才会chain在一起？
```
为了更高效地分布式执行，Flink会尽可能地将operator的subtask链接（chain）在一起形成task。每个task在一个线程中执行。将operators链接成task是非常有效的优化：它能减少线程之间的切换，减少消息的序列化/反序列化，减少数据在缓冲区的交换，减少了延迟的同时提高整体的吞吐量。
两个operator chain在一起的的条件：
    上下游的并行度一致
    下游节点的入度为1 （也就是说下游节点没有来自其他节点的输入）
    上下游节点都在同一个 slot group 中（下面会解释 slot group）
    下游节点的 chain 策略为 ALWAYS（可以与上下游链接，map、flatmap、filter等默认是ALWAYS）
    上游节点的 chain 策略为 ALWAYS 或 HEAD（只能与下游链接，不能与上游链接，Source默认是HEAD）
    两个节点间数据分区方式是 forward（参考理解数据流的分区）
    用户没有禁用 chain
```

### 讲讲一个Flink job提交的整个流程吗？
### 讲讲一个Flink job调度和执行的流程吗？
### Flink所谓"三层图"结构是哪几个"图"？它们之间是什么关系？他们之间是如何转化的？
### JobManger和TaskManager分别在集群中扮演了什么角色，说说它们都做了些什么？
### 简单说说Flink数据的抽象和数据的交换过程
### Flink的分布式快照机制是如何实现的？ 
### Flink的反压是如何实现的？
### 说说FlinkSQL是如何转化的？了解逻辑计划和和物理计划吗？FlinkSQL的维表JOIN是如何做的？了解Async IO吗？解决了什么问题？