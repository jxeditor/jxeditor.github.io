---
title: Ververica&Flink运维之一反压延时
date: 2019-08-11 14:15:36
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more 

# Flink运维基础
```
对比其他的大数据计算平台,Flink运维更类似于微服务架构(micro-service)运维
    微服务部署 vs 流处理的无限性
    微服务存储 vs state的维护
    微服务请求响应 vs 流处理延时

Metrics应作为重要的运维参考
    Flink丰富的内置Metrics接口
    Flink针对各种运维场景的运维泛用性
    
定义运维标准
    定义Service-Level Agreement(SLA)
定义基本Metrics
    直观定义,能反应SLA的参数
    延时,反压,吞吐量等
更多衍生Metrics
    深入Flink作业,反应内部的性能/异常状态
制定运维策略
    根据Metrics参数制定具体策略
    自动化策略执行
```

---

# 图形界面
```
实时Metrics
    收集实时Metrics数据
    精确到算子
触发反压计算
    反压计算需要触发
```

---

# 程序监控-RESTful API
```
RESTful API
    与WebUI的应用情况类似,使用程序触发Metrics收集
```

---

# 第三方Metrics Reporter
```
分离收集与处理
    Grafana
    JMX
查看历史记录
    第三方Metrics可以视为一个实时OLAP数据库
```

---

# 基于Metrics运维的优点
```
整合数据
    比起RESTful或者WebUI,Metrics Reporter能更容易整合数据
稳定性
    高可用Metric系统
多维度分析
    JVM基础分析
    与周边系统连调
    与集群系统连调
    整合State后端以及外部DFS
整合第三方资源
    Flink直接支持向第三方Metrics系统
```

---

# 延时基本概念
```
什么是延时?
    定义两个时间点差值
        最近一个成功处理的数据offset
        最新一个生成的数据offset

如何测量延时?
    基于流数据系统
        Kafka系统直接返回延时差值
        其他系统可能需要通过Metrics计算

如何使用延时数据?
    延时是衡量流数据作业是否能够定义为实时的基本参数
```

---

# 反压基本概念
```
什么是反压?
    定义两个连接的算子之间的差值
        上游算子的处理速度
        下游算子的处理速度

如何测量反压?
    Flink RESTful API直接触发计算
        Flink(>1.6)使用内部Credit反压机制
        与缓冲区的使用有直接关联

如何使用反压数据?
    反压计算能够更精确找到系统性错误
        精确到算子级别
```

---

# JVM Metrics基本设置
```
JVM Metrics
    适用于几乎所有作业类型

JVM通用定义
    CPU usage
    Heap commit/use/max
    GC时间,类型和比例

定义合理数据区间
    CPU占用比小于50%
    Heap占用比小于50%
    GC比例小于15%
    FullGC时间恒定
```

---

# 流数据Metrics
```
流数据-接口整合
    Flink接口Metrics反应接受端Metrics
    流数据系统Metrics反应发送端Metrics

自定义流数据系统
    不同的流数据系统一般会自定义不同类型的数据Metrics
        sleepTimeMillis(Kinesis)接口的休眠延时
        connection-close-rate(Kafka)接口连接断开/传输比例
```

---

# State Metrics
```
Flink的原生支持
    CK对JVM有较大影响
        当前CK的进度,时长,文件大小,频率
        CK的失败恢复比例

外部分布式存储
    不能忽视外部分布式存储系统(DFS)对于CK与SP的影响
        DFS的设置-冗余,分片
        DFS的管理-配额管理,碎片文件管理,回收机制
```

---

# 反压检测
```
利用反压
    反压的计算能够提供更多参考
        直接判断问题算子
        确定跨算子之间的联系以及瓶颈

触发反压计算
    反压的计算需要触发,意味着反压的计算并不是免费运维
        合理分配反压计算的频率
        结合Metrics,只针对需要深入分析的作业进行反压分析
```