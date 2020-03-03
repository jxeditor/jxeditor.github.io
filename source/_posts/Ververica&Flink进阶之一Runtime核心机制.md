---
title: Ververica&Flink进阶之一Runtime核心机制
date: 2019-05-14 16:08:13
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 整理架构
```
物理资源层
Runtime统一执行引擎
API层
High-Level API层
```

---

# Runtime层总体架构
```
Client
AM
    Dispatcher
    ResourceMananger
    JobManager
        JobGraph
TaskManager
    StateBackend
    Tasks
```

---

# 资源管理与任务调度
```
ResourceManager
    Slot Manager
    管理Slot状态
    分配Slot资源
TaskExecutor
    实际持有Slot资源
JobMaster
    Slot资源的申请者
    
# 调度策略
Eager调度
    适用于流作业
    一次性调度所有的Task
LAZY_FROM_SOURCE
    适用于批作业
    上游作业执行完成后,调度下游的作业
```

---

# 错误恢复
```
TaskFailover
    单个Task执行失败或TM出错退出等
    可以有多种不同的恢复策略
        Restart-all:重启所有Task,从上次的CK开始重新执行
        Restart-individual:只重启出错Task,只能用于Task间无连接的情况,应用极为有限
        Restart-Region:重启PipelineRegion,Blocking数据落盘,可以直接读取,逻辑上仅需要重启通过Pipeline边关联的Task 

MasterFailover
    AM执行失败
    多个Master通过ZK进行选主
    目前MasterFailover要求全图重启
```