---
title: Spark面试基础
date: 2020-03-06 14:40:35
categories: 大数据
tags:
    - interview
    - spark
---

> 记录面试中有关Spark的概念知识

<!-- more -->

# Spark面试基础

# Spark概念
```
三大核心数据结构
    RDD
    广播变量(分布式只读变量)
    累加器(分布式只写变量)
四大组件
    Spark SQL
    Spark Streaming
    MLlib
    GraphX
```

# Spark的工作机制
```
用户在客户端提交作业后,会由Driver运行main方法并创建SparkContext上下文
SparkContext向资源管理器申请资源,启动Execotor进程
并通过执行rdd算子,形成DAG有向无环图,输入DAGscheduler
然后通过DAGscheduler调度器,将DAG有向无环图按照rdd之间的依赖关系划分为几个阶段,也就是stage
输入TaskScheduler,然后通过任务调度器TaskScheduler将stage划分为Task Set分发到各个节点的Executor中执行。
```

---

# Spark的stage划分
```
在DAG调度的过程中,Stage阶段的划分是根据是否有shuffle过程
也就是存在ShuffleDependency宽依赖的时候
需要进行shuffle,这时候会将作业job划分成多个Stage

整体思路:
从后往前推,遇到宽依赖就断开,划分为一个stage
遇到窄依赖就将这个RDD加入该stage中
```

# 简单介绍一下RDD?
```
一个抽象弹性分布式数据集
可以将RDD理解为一个分布式对象集合,本质上是一个只读的分区记录集合
每个RDD可以分成多个分区,每个分区就是一个数据集片段
一个RDD的不同分区可以保存到集群中的不同结点上,从而可以在集群中的不同节点上进行并行计算

# 五大特性
1.分区列表
    RDD是一个由多个partition(某个节点里的某一片连续的数据)组成的的List
    将数据加载为RDD时,一般一个hdfs里的block会加载为一个partition
2.每一个分区都有一个计算函数
    RDD的每个partition上面都会有function,也就是函数应用,其作用是实现RDD之间partition的转换
3.依赖于其他RDD列表
    RDD会记录它的依赖,为了容错,也就是说在内存中的RDD操作时出错或丢失会进行重算
4.Key-Value数据类型的RDD分区器
    可选项,如果RDD里面存的数据是key-value形式,则可以传递一个自定义的Partitioner进行重新分区
    例如这里自定义的Partitioner是基于key进行分区,那则会将不同RDD里面的相同key的数据放到同一个partition里面
5.每个分区都有一个优先位置列表
    可选项,最优的位置去计算,也就是数据的本地性
```

---

# Transformations & Action
```
一个Application中有几个Action类算子执行,就会有几个Job运行

转换
    map
    filter
    flatMap
    mapPartitions
    mapPartitionsWithIndex
    sample
    union
    intersection
    distinct
    groupByKey
    reduceByKey
    aggregateByKey
    sortByKey
    join
    cogroup
    cartesian
    pipe
    coalesce
    repartition
    repartitionAndSortWithinPartitions

操作
    reduce
    collect
    count
    first
    take
    takeSample
    takeOrdered
    saveAsTextFile
    saveAsSequenceFile
    saveAsObjectFile
    countByKey
    foreach
    
注意:
    区别宽依赖与窄依赖的算子
```

---

# 宽依赖 & 窄依赖
```
宽依赖用于划分Stage,也就是一个Shuffle操作,子RDD的每个分区依赖于所有父分区
窄依赖子RDD的每个分区依赖于常数个父分区

宽依赖算子
    groupByKey
    reduceByKey
    join
    等

窄依赖算子
    map
    flatMap
    union
    filter
    distinct
    subtract
    sample
```

---

# repartition & coalesce
```
注意:
    repartition = coalesce(分区数,true)

原分区数大于目标分区数,不会发生shuffle的情况使用coalesce

原分区小于目标分区数,需要发生shuffle的情况下使用repartition
```

---

# Structured Streaming
```
StructuredStreaming周期性或连续不断的生成微小DataSet,然后交给SparkSQL
跟SparkSQL原有引擎相比,增加了增量处理的功能
增量就是为了状态和流标功能实现
不过也是微批处理,底层执行也是依赖SparkSQL的
不支持异步维表join
```