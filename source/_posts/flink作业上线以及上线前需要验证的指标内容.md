---
title: flink作业上线以及上线前需要验证的指标内容
date: 2020-08-10 10:28:04
categories: 大数据
tags: flink
---

> 公司的相关需求越来越重视对毫秒级数据的处理,flink刚好在这方面暂有不可替代的优势;使得在技术选型上有着重要的地位

<!-- more -->
#### 数据源处理
```
根据业务的不同,实时数据源选取kafka,但是数据内容分为两块内容:
1.研发将实时日志数据打点至kafka上,数据格式json形式
2.使用debezium监控mysql的binlog,实时将mysql变更的数据捕获至kafka;数据格式json形式,并且使用before和after的形式来区分数据更变之前和更变之后的数据内容
```

#### 选取语义使用exactly once
```
一个sender发送一条message到recevier;根据receiver出现fail时sender如何处理fail,可以降message delivery分为三种语义:
1.at most once: 对于一条message,receiver最多收到一次
sender把massage发送给receiver;无论receiver是否收到message,sender都不再重发message
2.at least once : 对于一条message,receiver最少收到一次
sender把message发送给receiver;当receiver在规定时间内没有回复ack或回复了error信息,那么sender重发这条message给receiver,知道sender收到receiver的ack
3.exactly once:对于一条message,receiver确保只收到一次
选取原因:
根据公司业务需求对准确的数据量的要求性比较高,最后选用了exactly once;其他语义也进行了测试,确定了确实有数据量变多或者变少的情况

exactly once模式:
flink会持续对整个系统做snapslot,然后把global state存储到master node或HDFS;当系统出现failure,flink会停止数据处理,然后把系统恢复到最近的一次checkpoint

flink的snapslot算法:
为了消去记录channel state,process在接收到第一个barrier后不会马上做snapslot
而是等待接受其他上游channel的barrier
在等待期间,process会把barrier已到的channel的record放入input buffer
当所有上游channel的barrier到齐后,process才记录自身state,之后向所有下游channel发送barrier
因为先到的barrier会等待后到的barrier,所有barrier相当于同时到达process;因此,该process的上游channel的state都是空集,避免了去记录channel的state
```

#### 一般关注的指标点
```
1.作业状态: 作业是否出故障,作业是否存活,作业是否稳定运行
可参考监控脚本的相关文章
[https://jxeditor.github.io/2020/08/10/shell%E8%84%9A%E6%9C%AC%E7%9B%91%E6%8E%A7flink%E9%A1%B9%E7%9B%AE%E6%98%AF%E5%90%A6%E6%AD%A3%E5%B8%B8%E8%BF%90%E8%A1%8C/]
2.作业性能:作业的处理延迟,数据倾斜问题是否存在,性能瓶颈情况(技术选型必须测试内容)
1) flink接收kafka的数据性能情况的压力测试(每秒上万没有问题)
2) flink读取或者写入hbase的数据性能情况测试
分为客户端方式和批处理读写方式
i:客户端,每秒的处理速度5000条左右
ii:批处理方式:5-7w左右
3.业务逻辑:上游数据质量,新上的逻辑是否存在问题,数据是否存在丢失(新作业上线必须测试的内容)
```

#### sink落地
```
主要落地有:s3,hbase,es
1.s3主要用于实时仓库处理
2.hbase主要用于flink的中间表,相当于维表方式;除了共享课直接提供接口的方式进行调用
3.es主要提供给搜索系统,实时报表展示和用户行为轨迹
```
