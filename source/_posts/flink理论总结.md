---
title: Flink理论总结
date: 2020-08-11 14:43:44
categories: 大数据
tags: flink
---

> 平时flink的实际应用太多,根据实际的应用,添加必不可少的相关理论知识

<!-- more -->
#### flink定义
```
flink 是一个分布式大数据处理引擎,可对有限数据流和无限数据流进行有状态或无状态的计算,能够部署在各种集群环境,对各种规模大小的数据进行快速计算
```

#### flink Application
```
streams流: 分为有限数据流和无限数据流;实际应用的比较多的还是无限数据流的方式
state:状态是计算过程中的数据信息,在容错恢复和ck中有重要的作用,流计算在本质上是increment processing;因此需要不断查询保持状态;为了确保exactly once语义,需要数据能够写入到状态中;而持久化存储,能够保证在整个分布式系统运行失败或者挂掉的情况下做到exactly-once,这是状态的另外一个价值
time:分为event time,ingestion time,processing time;flink的无限数据流是一个持续化的过程,时间是我们判断业务状态是否滞后,数据处理是否及时的重要依据
event time: 相当于事件,它在数据最源头产生时带有时间戳,后面都需要用到事件戳来实现;把对应时间3点到4点的数据放在3点到4点的bucket,然后bucket产生结果
```

#### flink operation
```
flink具备7*24小时高可用的SOA(面向服务架构),原因是在实现上flink提供了一致性的checkpoint,ck是flink实现容错机制的核心,它周期性的记录计算过程中operator的状态,并生成快照保存到持久化存储;当flink作业发生故障崩溃时,可以有选择的从ck中恢复,保证了计算的一致性
```

#### flink有状态分散式流式处理
```
定义了变数X,X在数据处理过程中会进行读和写,在最后输出结果时,可以依据变数X决定输出的内容,即状态X会影响最终的输出结果;
可以分成两种形式理解:
1.先进行了状态co-partitioned key by,同样的key都会流到computation instance;与使用者出现次数的原理相同,次数即所谓的状态,这个状态一定会跟同一个key的事件累积在同一个computation instance;类似于根据输入流的key重新分区的状态,当分区进入stream之后,这个stream会累积起来的状态也变成coPartition
quesIdDS.map(x => {
      val info = x.getMsg.asInstanceOf[Tuple2[String,String]]
      (info._1,1)
    }).keyBy(_._1).timeWindow(Time.of(1,TimeUnit.SECONDS)).sum(1).map(x=> (x._1,""))
```
```
2.embedded local state backend;有状态分散式流式处理的引擎,状态可能会累积的非常大,当key非常多时,状态可能就会超出单一节点的memory的负荷量;需要使用到状态后端

状态后端分为:
1.MemoryStateBackend:直接将state对象存储到taskManager的JVM上,如MapState会被存储为一个HashMap对象.对于远程备份,备份到JobMananger的堆内存上,但是不安全
2.FSStatebackend:跟MemorySatateBackend一样,将state存储到TaskManager的JVM堆上;只是对于远程备份,将state写入到hdfs上
3.RocksDBStateBackend:将state存储到taskManager节点上的RocksDB数据库实力上;对于远程备份,备份到远程的存储系统中

总结:
MemoryStateBackend和FSStateBackend都是在内存中进行状态管理,所以可以获取较低的读写延迟;但会受限于TM的内存大小,而RocksDBStateBackend直接将state存储到RocksDB数据库中,所以不受JobManager的内存限制,但会有读写延迟的情况
```

#### watermarks
```
一般event-time会搭配watermarks来使用,精髓在于当某个运算值收到带有时间戳"T"的watermarks是就意味着它不会接收到最新的数据了;好处在于可以准确预估收到数据的截止时间;
eg:
假设预期收到数据时间与输出数据时间的时间差延迟5分钟,那么flink中所有的window operator搜索3点到4点的数据,但因为存在延迟需要在多等5分钟直至收集完4点05分数据,判定4点钟的资料收集完毕
```

#### 运行flink应用
```
用户用DataStream API 写的一个数据处理程序;
在一个DAG图中不能被chain在一起的operator会被分隔到不同的task中,也就是task是flink中资源调度的最小单位
flink实际运行时包括两类进程:
1.JobManager(JobMaster):协调task的分布式执行,包括调度task,协调创ck以及当job failover时协调各个task从ck中恢复
2.TaskManager(work):执行dataFlow中的tasks,包括内存buffer的分配,dataStream的传递
task slot是一个TM中最小资源分配单位,一个taskmanager中多少个slot意味着能支持多少并发的task处理,一个task slot中可以执行多个operator,一般这些operator是能被chain在一起处理

基于yarn调度系统:
1.JobManager进程和TaskManager进程都有yarn NodeManager监控
2.如果JobManager进程异常退出,则yarn resourceManager会重新调度JobManager到其他机器
3.如果taskManager进程异常退出,JobManager会收到消息并重新向Yarn ResourceManager申请资源,重新启动TaskManager

flink作业执行脚本(参考):

## flink 作业样例
 chk=`getConfigChk $BASE/$config`
 jarName='flink-action-log-to-hbase-full.jar'
 appName='FlinkActionLogToHbase'
 noRecover=false
 for arg in $@; do
   if [ "$arg" = "-a" ]; then
    noRecover=true
   fi
 done
 if [ "$chk" = "hdfs://" -o $noRecover = true ]; then  
  echo "##########################################"
  echo "#              初始化运行                #"
  echo "##########################################"
  flink run -m yarn-cluster \
  -ynm $appName \
  -p 7 -ys 2 -ytm 3072 \
  $BASE/$jarName \
  $BASE/$config
 else
  echo "##########################################"
  echo "# 加载 checkpoint => $chk                 "
  echo "##########################################"
  flink run -m yarn-cluster \
  -ynm $appName"-recover" \
  -p 7 -ys 2 -ytm 3072 \
  -s $chk \
  $BASE/$jarName \
  $BASE/$config
 fi
```

#### 理解keyedStream
```
为了能够在多个并发实例上并行的对数据进行处理,需要通过keyby将数据进行分组;keyby和window操作都是对数据进行分组,但是keyby是在水平方向对流进行切分,而window是在垂直方向对流进行切分
keyby操作只有当key的数量超过算子的并发实例数才可以较好的工作.由于同一个key对应的所有数据都会发送到同一个实例上,因此如果key的数量比实例数量少时,就会导致部分实例收不到数据,从而导致计算能力不能充分发挥
```

#### savepoint和checkpoint的区别
```
1.checkpoint是增量做的,每次的时间较短,数据量较小,只要在程序里面启用后会自动触发,用户无须感知,checkpoint是作业failover的时候自动使用,不需要用户指定
2.savepoint是全量做的,每次的时间较长,数据量较大,需要用户主动去触发;savepoint一般用于程序的版本更新,bug修复,A/B Test等场景,需要用户指定
```

#### 无状态计算
```
消费延迟计算
在这种模式的计算中,无论这条输入进来多少次,输出的结果都是一样的,因为单条输入中已经包含了所需的所有信息;消费落后等于生产者减去消费者;生产者的消费在单条数据中可以得到,消费者的数据也可以在单条数据中得到,所以相同输入可以得到相同输出,这就是一个无状态计算
```

#### 有状态计算
```
访问日志统计量
这个计算模式是将数据输入算子中,用来进行各种复杂的计算并输出数据;这个过程中算子会去访问之前存储在里面的状态;另外一个方面,它还会把现在的数据对状态的影响实时更新
```

#### 状态的应用场景
```
1.去重: 比如上游的系统数据可能会有重复,落到下游系统时希望把重复的数据都去掉;去重需要先了解哪些数据来过,哪些数据还没有来,也就是把所有的主键都记录下来.当一条数据到来后,能够看到在主键当中是否存在
2.窗口计算: 比如统计每分钟nginx日志API被访问了多少次;窗口是一分钟计算一次,在窗口触发前,前59s的数据来了需要先放入内存,即需要把这个窗口之内的数据先保留下来,等到一分钟后,再将整个窗口内触发的数据输出;未触发的窗口数据也是一种状态
3.机器学习/深度学习:如训练的模型以及当前模型的参数也是一种状态,机器学习可能每次都用有一个数据集,需要在数据集上进行学习,对模型进行一个反馈
4.访问历史数据: 比如与昨天的数据进行对比,需要访问一些历史数据;如果每次从外部去读,对资源的消耗可能比较大,所以也希望把这些历史数据也放入状态中做对比
```

#### 理想的状态管理
最理想的状态管理需要满足易用,高效,可靠
```
1.易用: flink提供了丰富的数据结构,多样的状态组织形式以及简洁的扩展接口,让状态管理更加易用
2.高效: 实时作业一般需要更低的延迟,一般出现故障,恢复速度也需要更快,当处理能力不够时,可以横向扩展,同时在处理备份时,不影响作业本身处理性能
3.可靠: flink提供了状态持久化,包括不丢不重的语义以及具备自动的容错能力,比如HA,当节点挂掉后会自动拉起,不需要人工介入
```

### Flink状态类型
#### Managed State & Row State
```
Managed State是Flink自动管理的state,而Raw State是原生态的state;区别在于:
1.从状态管理方式来说,Managed State有flink runtime管理,自动存储,自动恢复,在内存管理上有优化;而raw state需要用户自己管理,需要自己序列化,flink不知道state中存入的数据是什么结构,只有用户自己知道,需要最终序列化为可存储的数据结构
2.从状态数据结构来说,managed state支持已知的数据结构,如value,list,map;而raw state只支持字节数组,所有状态都要转换为二进制字节数组
3.从推荐使用场景,managed state大多数情况下均可使用,而raw state是当managed state不够用时,比如使用自定义operator时,推荐使用raw state
```

#### keyed State & Operator State
```
Manager State分为两种:keyed State和Opearator State;在Flink Stream模型中,DataStream 经过keyby的操作可以变为keyedStream
Keyed State:
1.只能用在keyStream上的算子中
2.每个key对应一个State
  一个Operator实例处理多个key,访问相应的多个State
3.并发改变,State随着key在实例见迁移
4.通过RuntimeContext访问
5.支持的数据结构: ValueState/ListState/ReducingState/AggregatingState/MapState

Operator State:
1.可以用于所有算子
  常用于source,例如FlinkKafkaConsumer
2.一个Operator实例对应一个State
3.并发改变时有多种重新分配方式可选
  1.均匀分配
  2.合并后每个得到全量
4.实现checkpointedFunction 或 ListCheckpointed接口
5.支持的数据结构:ListState
```

#### 状态保存以及恢复
```
checkpoint:
1.定时制作分布式快照,对程序中的状态进行备份
2.发生故障时
  将整个作业的所有task都回滚到最后一次成功checkpoint中的状态,然后从那个点开始继续处理
3.必要条件
  数据源支持重发
4.一致性语义
   恰好一次,至少一次,至多一次

在做checkpoint时,可根据Barrier对齐来判断是哪个语义;如果对齐,则为恰好一次,否则没有对齐就是其他两个语义;如果只有一个上游,也就是说Barrier是不需要对齐的;如果只有一个ck在做,不管什么时候从ck恢复,都会恢复到刚才的状态;如果有多个上游,加入一个上游的Barrier到了,另一个Barrier还没有来,如果这个时候对状态进行快照,那么从这个快照恢复的时候,其中一个上游的数据可能会有重复或丢失的情况
```