---
title: Ververica&Flink进阶之流作业执行解析
date: 2019-06-08 15:13:45
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 执行流程
```
第一层: Program -> StreamGraph
第二层: StreamGraph -> JobGraph
第三层: JobGraph -> ExecutionGraph
第四层: ExecutionGraph -> 物理执行计划
```

---

# StreamGraph转换
```
从StreamExecutionEnvironment.execute开始执行程序
    将transform添加到StreamExecutionEnvironment的transformations
调用StreamGraphGenerator的generateInternal
    遍历transformations构建StreamNode及StreamEage
通过streamEdge连接StreamNode

StreamNode
    描述Operator的逻辑节点
    slotSharingGroup
    jobVertexClass
    inEdges
    outEdges
    transformationUID

StreamEdge
    描述两个Operator逻辑的连接边
    sourceVertex
    targetVertex
```

---

# StreamGraph到JobGraph的转化
```
设置调度模式,Eager所有节点立即启动
广度优先遍历StreamGraph,为每个StreamNode生成byte数组类型的hash值
从source节点开始递归寻找chain到一起的operator,不能chain到一起的节点单独生成JobVertex,能够chain到一起的,开始节点生成JobVertex,其他节点以序列化的形式写入到StreamConfig,然后merge到CHAINED_TAS_CONFIG,然后通过JobEdge链接上下游JobVertex
将每个JobVertex的入边(StreamEdge)序列化到该StreamConfig
根据GroupName为每个JobVertex指定SlotSharingGroup
配置CK
将缓存文件存文件的配置添加到configuration中
设置ExecutionConfig

# Chain的条件
下游节点只有一个输入
下游节点的操作符不为null
上游节点的操作符不为null
上下游节点在一个槽位共享组中
下游节点的连接策略是ALWAYS
上游节点的连接策略是HEAD或者ALWAYS
edge的分区函数是ForwardPartitioner的实例
上下游节点的并行度相等
可以进行节点连接操作

# 为什么要为每个Operator生成hash值
Flink任务失败时,各个Operator是能够从CK中恢复到失败之前的状态的,恢复时是依据JobVertexID(hash值)进行状态恢复的,相同的任务在恢复时要求Operator的hash值不变

# 怎么生成Operator的hash值
如果用户对节点指定了一个散列值,则基于用户指定的值,产生一个长度为16的字节数组
如果用户没有指定,则根据当前节点所处的位置,产生一个散列值,需要考虑的因素有:
    在当前StreamNode之前已经处理过的节点的个数,作为当前StreamNode的id,添加到hasher中
    遍历当前StreamNode输出的每个StreamEdge,并判断当前StreamNode与这个StreamEdge的目标StreamNode是否可以进行连接,如果可以,则将目标StreamNode的id也放入hasher中,且这个目标StreamNode的id与当前StreamNode的id取相同的值
    将上述步骤后产生的字节数据,与当前StreamNode的所有输入StreamNode对应的字节数据,进行相应的位操作,最终得到的字节数据,就是当前StreamNode对应的长度为16的字节数组
    
# 为什么不用StreamNode ID
静态累加器,相同处理逻辑,可以产生不同的id组合
```

---

# JobGraph到ExecutionGraph以及物理执行计划
```
主要为ExecutionGraphBuilder的buildGraph方法
关键流程
    将JobGraph里面的JobVertex从source节点开始排序
    executionGraph.attachJobGraph(sortedTopology)方法内部
        根据JobVertex生成ExecutionJobVertex,在ExecutionJobVertex构造方法里面
        根据JobVertex的IntermediateDataSet构建IntermediateResult
        根据JobVertex并发构建ExecutionVertex
        ExecutionVertex构建的时候,构建IntermediateResultPartition(每一个Execution构建IntermediateResult个数对应的IntermediateResultPartition)
        将创建的ExecutionJobVertex与前置的IntermediateResult连接起来
    构建ExecutionEdge,连接到前面的IntermediateResultPartition
```