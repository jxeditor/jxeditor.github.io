---
title: Ververica&Flink运维之九作业问题分析调优
date: 2019-10-18 10:01:08
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 原理剖析
```
CK机制
    什么是CK
        简单的说就是Flink为了达到容错和Exactly-Once语义的功能
        定期把State持久化下来,而这一持久化过程就叫CK
        它是FlinkJob在某一时刻全局状态的快照
    
统一时钟-广播
    由中心点生成时钟并广播给各个Slave节点,达到时间的统一性
    缺点:
        单点故障
        数据不一致,出现脑裂现象
        系统复杂,不稳定

Flink之Barrier
    定时向数据流中发送Barrier

CK注意
    频率不宜过高,一般需求1-5分钟,精确性要求高20-30秒
    超时时间不宜过长,一般在频率的一半即可
    异步化:在Operator的自定义snapshotState尽量异步化
    
Flink背压
    Flink不同TaskManager之间的数据交换就是采用有界的buffer实现
    当上下游计算速度不一致时就会出现正背压和反背压的情况

反压-静态控流
    预估producer和consumer的处理速度,静态控制快速组件的速度
    达到系统整体的平衡

反压处理-Flink
    静态流控的缺陷:
        事先预估系统中流速
        系统的速度是静态的,不能适应动态变化的速度
    动态流控:
        TCP流控(Flink1.5之前)
            主要通过TCP协议的滑动窗口实现
            缺点:
                Flink上游对下游情况一无所知,导致上游对数据反压的感知过于迟钝
                TCP的复用导致一个channel阻塞住其他channel,尤其是CKBarrier的传递
        Credit流控
            根据TCP的流量控制原理实现一套自身的流控机制
            在数据交换是会返回一个Credit,当为0时将不会再发送数据给下游
            放空了Netty层与Socket层,作业的其他信息交换得到了保障
            
Java内存模型的问题
    JVM复杂,GC成本高
        使用JVM对开发人员来说是比较复杂的,垃圾回收的成本高
    对象存储开销大密度低
        对象存储到Heap中,需要序列化
        其中对象Header会占用比较大的空间导致了对象的存储密度低
    OOM引起稳定性问题
        当内存不足时,会引发OOM异常,导致系统崩溃

Flink内存组成
    cutoff:预留内存
    NetworkBuffers:用于Task间的数据交换
    MomeryManager:主要用于算法上,目前用于batch作业中,可以是堆外
    free:用户在算子中new的对象以及TM的数据结构使用的
    
内存计算
    TM 8G,Net 0.1,MF 0.2
    可用内存:8192M * 0.75 = 6144M
    Network:6144M * 0.1 = 614.4M
    Heap:6144M * 0.9 * 0.8 = 4424M
    Flink:6144M * 0.9 * 0.2 = 796M
```

---

# 性能定位
```
定位口诀
    一压二查三指标,延迟吞吐是核心
    时刻关注资源量,排查首先看GC

看反压
    通常最后一个被压高的subTask的下游就是Job的瓶颈之一
看CK时长
    CK时长能在一定程度影响Job的整体吞吐
看核心指标
    指标是对一个任务性能精准判断的依据
    延迟指标和吞吐则是其中最为关键的指标
资源的使用率
    提高资源的利用率是最终的目的
    
常见的性能问题
    JSON序列化和反序列化
        常是在Source和Sink的Task上,在指标上没有体现,容易被忽略
    Map和Set的Hash冲突
        由于HashMap,HashSet等随数据负载因子增高,引起的插入和查询性能下降
    数据倾斜
        数据倾斜大大影响系统的吞吐
    和低速的系统交互
        在高速的计算系统中,低速的外部系统,比如MySQL,HBase,传统的单机系统等
    频繁的GC
        内内存或是比例分配不合理导致频繁GC,甚至是TM失联
    大窗口
        窗口size大,数据量大,或是滑动窗口size和step比值比较大如size=5min,step=1s
```

---

# 经典场景调优
```
数据去重
    通过Set,Map等数据结构结合Flink的State实现
        缺陷:
            随时间的推移,Set,Map等数据量增大,Hash冲突导致对写性能急剧下降
            内存直线上升,导致频繁GC
            资源耗尽吞吐低,TM失联,任务异常
    精准去重:通过bitMap/roaring bitMap
    近似去重:bloomFilter

数据倾斜
    单点问题
        数据集中在某些partition上,致使数据严重不平衡
    GC频繁
        过多的数据集中在某些JVM中导致其内存资源短缺,进而引起频繁的GC
    吞吐下降,延迟增大
        频繁的GC和数据单点导致系统吞吐下降,数据延迟
    系统崩溃
        严重情况下过长的GC会导致TM和JM失联,系统崩溃
倾斜-源头
    数据源的消费不均匀:调整并发度
        对于数据源消费不均匀,比如kafka数据源,尝试通过调整数据源算子的并发度实现
        原则:通常情况下是Source的并发度和Kafka的分区数一致或是Kafka分区数是Source并发度的正整数倍

无统计场景
    改变Key的分布
聚合场景
    预聚合
```

---

# 内存调优
```
Flink内存主要是三部分,NetworkBuffer和ManagerPool都是由Flink管理
ManagerPool也已经走向堆外内存,所以内存调优分为两部分
    非堆内存NetWorkBuffer和ManagerPool调优
    Flink系统中Heap内存调优

非堆内存
    调整NetworkBuffer和ManagerPool的比例
        NetworkBuffer:
            taskmanager.network.memory.fraction(默认0.1)
            taskmanager.network.memory.min(默认64M)
            taskmanager.network.memory.max(默认1G)
            原则:默认是0.1或是小于0.1可以根据使用的情况进行调整
        ManagerPool:
            taskmanager.memory.off-heap:true(默认是false)
            taskmanager.memory.fraction(默认是0.7)
            原则:在流计算中建议调整成小于0.3
            
堆内存
    Flink是运行在JVM上的,所以堆内存调优和传统JVM调优无差别
    默认Flink使用的ParallelScavenge的垃圾回收器,可以改用G1垃圾回收器
    启动参数
        env.java.opts= -server -XX:+UseG1GC -XX:MaxGCPauseMillis=300 -XX:+PrintGCDetails
        
G1的优势
    无空间碎片
        G1基于标记-整理算法,不会产生空间碎片,分配大对象时不会无法得到连续的空间而提前触发一次FULLGC
    可控制的暂停时间
        G1通过动态调整young代空间并根据回收代价和空间率选择部分回收Old代垃圾达到可预测的暂停时间
    并行与并发
        G1能更充分的利用CPU,多核环境下的硬件优势来缩短stop the world的停顿时间
        
G1参数
    -XX:MaxGCPauseMillis:设置允许的最大GC停顿时间(GC Pause Time),默认是200ms
    -XX:G1HeapRegionSize:每个分区的大小,默认值是会根据整个堆区的大小计算出来,范围是1M~32M,取值是2的幂,计算的倾向是尽量有2048个分区数
    -XX:MaxTenuringThreshold=n:晋升老年代的年龄阈值,默认值为15
    -XX:InitiatingHeapOccupancyPercent:
        一般会简写IHOP,默认是45%,这个占比跟并发周期的启动相关,当空间占比达到这个值时,会启动并发周期
        如果经常出现FULLGC,可以调低该值,尽早的回收可以减少FULLGC的触发
        但如果过低,则并发阶段会更加频繁,降低应用的吞吐
    -XX:G1NewSizePercent:年轻代最小的堆空间占比,默认5%
    -XX:G1MaxNewSizePercent:年轻代最大的堆空间占比,默认60%
    -XX:CountGCThreads:并发执行的线程数,默认值接近整个应用线程数的1/4
    -XX:-XX:G1HeapWastePercent:允许的浪费堆空间的占比,默认5%,如果并发标记可回收的空间小于5%,则不会触发MixedGC
    -XX:G1MixedGCCountTarget:一次全局并发标记之后,后续最多执行的MixedGC次数,默认值是8
    
```