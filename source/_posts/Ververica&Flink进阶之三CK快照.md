---
title: Ververica&Flink进阶之三CK快照
date: 2019-05-31 11:51:07
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# CK与State
```
CK是从source触发到下游所有节点完成的一次全局操作
State是构成CK的数据构成

Key与NoKey维度
    KeyedState
    OperatorState
Flink管理维度
    ManagedState
    RawState
```

---

# CK执行机制
```
三类存储机制
    Memory
    Fs
    RocksDB

执行流程
    a.Checkpoint Coordinator向所有source节点trigger Checkpoint
    b.source节点向下游广播barrier,这个barrier就是实现Chandy-Lamport分布式快照算法的核心,下游的task只有收到所有input的barrier才会执行相应的Checkpoint
    c.当task完成state备份后,会将备份数据的地址(state handle)通知给Checkpoint coordinator
    d.下游的sink节点收集齐上游两个input的barrier之后,会执行本地快照
        RocksDB会全量刷数据到磁盘上,然后Flink框架会从中选择没有上传的文件进行持久化备份
    e.sink节点在完成自己的Checkpoint之后,会将state handle返回通知Coordinator
    f.当Checkpoint coordinator收集齐所有task的state handle,就认为这一次的Checkpoint全局完成了,向持久化存储中再备份一个Checkpoint meta文件
```

---

# CK的Exactly_Once
```
为了实现EXACTLY ONCE语义,Flink通过一个input buffer将在对齐阶段收到的数据缓存起来,等对齐完成之后再进行处理
而对于AT LEAST ONCE语义,无需缓存收集到的数据
会对后续直接处理,所以导致restore时,数据可能会被多次处理

Flink的Checkpoint机制只能保证Flink的计算过程可以做到EXACTLY ONCE
端到端的EXACTLY ONCE需要source和sink支持
```