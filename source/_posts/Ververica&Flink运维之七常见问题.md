---
title: Ververica&Flink运维之七常见问题诊断
date: 2019-09-21 08:43:06
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 作业运行环境
```
Yarn Per-Job
```

---

# 为什么作业延时了
```
时间类型
    Processing Time
    Event Time
    Ingestion Time

延时特殊定义
    Delay = 当前系统时间 - Event Time
    反应处理数据的进度情况
    
延时定义
    自定义Source源解析中加入Gauge类型指标埋点,汇报如下指标:
        记录最新的一条数据中的EventTime,在汇报指标时使用当前系统时间-EventTime
        记录读取到数据的系统时间-数据中的EventTime,直接汇报差值
    Fetch_delay = 读取到数据的系统时间 - Event Time
    反应实时计算的实际处理能力

延时分析
    几个上游源头,每个源头的并发问题
    是否上游数据稀疏导致
    作业性能问题
```

---

# 为什么作业Failover了
```
JM
    ZK访问超时
    长时间GC
    资源问题
    主机层面问题
TM
    上下游异常
    数据问题
    Runtime异常
    主机层面异常
```

---

#  作业无法提交,异常停止
```
无法提交
    Yarn问题-资源限制
    HDFS问题-Jar包过大,DFS异常
    JM资源不足,无法响应TM注册
    TM启动过程中异常

异常停止-指标监控无法覆盖
    重启策略配置错误
    重启次数达到上限
```

---

# 延时问题处理方式
```
延时与吞吐
    确定延时节点以及时间
反压分析
    找到反压源节点
指标分析
    查看一段时间相关指标
堆栈
    找到指定节点JVM进程,分析Jstack等堆栈信息
相关日志
    查看TM相关日志是否有异常
```

---

# 作业性能问题
```
延时与吞吐
    延时指标
    TPS输出
    节点输入输出

反压
    反压源头节点
    节点连接方式Shuffle/Rebalance/Hash
    节点各并发情况
    业务逻辑,是否有正则,外部系统访问等

指标
    GC时间
    GC次数
    State性能,CK情况
    外部系统访问延时

堆栈
    节点所在TM进行
    查看线程TID CPU使用情况,确定CPU还是IO问题
    ps H -p ${javapid} -o user,pid,ppid,tid,time,%cpu,cmd
    转换为16进制后查看tid具体堆栈
    jstack ${javapid} > jstack.log
```

---

# 常见处理方式
```
调整节点并发
    性能瓶颈节点增加并发
调整节点资源
    增加节点CPU,内存
拆分节点
    将chain起来的消耗资源较多的operator拆开,增加并发
作业/集群优化
    主键设置,数据去重,数据倾斜
    GC参数
    JM参数
```

---

# 作业Failover分析
```
Failover信息
是否频繁Failover节点SubTask->TM
Job/TaskManager日志
Yarn/OS相关日志
```

---

# 作业生命周期
```
作业状态变化JobStatus
    Created
    Running
        Finished
    Cancelling
        Canceled
    Failing
        Failed
    Restarting
    Suspended
    
Task状态变化ExecutionState
    Created
    Scheduled
    Deploying
    Running
    Failed
    Finished
    Canceling
    Canceled
```

---

# 工具化经验
```
指标
    延时与吞吐
        衡量Flink作业的黄金指标
    外部系统调用
        外部系统耗时
        缓存名字
        排除外部系统因素
    基线管理
        State访问延时
        CK耗时
        排查异常问题
        
日志
    错误日志
        关键字及错误日志报警
    事件日志
        采集关键日志信息,形成关键事件
    日志收集
        存储关键信息
    日志分析
        日志聚类,Failover建议等

关联分析
    集群环境各组件关联分析
        作业指标/事件-TM,JM
        Yarn事件-资源抢占,NodeManager Decommission
        机器异常-宕机,替换
        Failover日志聚类
```