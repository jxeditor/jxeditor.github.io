---
title: Ververica&Flink进阶之八Metrics监控
date: 2019-06-22 15:13:45
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Meteric Type
```
Counter:计数器
Gauge:最简单的Metric,反映一个值
Meter:统计吞吐量,单位时间内发生"事件"的次数
Histogram:统计数据分布,Quantile,Mean,StdDev,Max,Min
```

---

# Meteric Group
```
Metric在Flink内部有多层结构,以Group的方式组织
Metric Group + Metric Name是Metrics的唯一标识
TaskManagerMetricGroup
    TaskManagerJobMetricGroup
        TaskMetricGroup
            TaskIOMetricGroup
            OperatorMetricGroup
                User-defined Group / User-defined Metrics
                OperatorIOMetricGroup
JobManagerMetricGroup
    JobManagerJobMetricGroup
```

---

# System Metrics
```
CPU
Memory
Threads
Garbage Collection
Network
ClassLoader
Cluster
Availability
CheckPointing
StateBackend
IO
```

---

# User-defined Metrics
```
除了系统的Metrics之外,Flink支持自定义Metrics
继承RichFunction
    Register User-defined Metric Group:
        getRuntimeContext().getMetricGroup().addGroup()
    Register User-defined Metric:
        getRuntimeContext().getMetricGroup().counter/gauge/meter/histogram()
```

---

# User-defined Metrics Example
```java
Counter processedCount = getRuntimeContext().getMetricGroup().counter("processed_count");
processedCount.inc();
Meter processRate = getRuntimeContext().getMetricGroup().meter("rate",new MeterView(60));
getRuntimeContext().getMetricGroup().gauge("current_timestamp",System::currentTimeMaillis);
Histogram histogram = getRuntimeContext().getMetricGroup().histogram("histogram",newDescriptiveStatisticsHistogram(1000));
histogram.update(1024);
```

---

# 获取Metrics
```
WebUI
RESTful API
Metric Reporter
```

---

# 多维度分析
```
业务维度
    并发度是否合理
    数据波峰波谷
    数据倾斜
Garbage Collection
    GC log
CK Alignment
StateBackend性能
    RockDB
系统性能
    CPU
    内存,Swap
    Disk IO,吞吐量,容量
    Network IO,带宽
```