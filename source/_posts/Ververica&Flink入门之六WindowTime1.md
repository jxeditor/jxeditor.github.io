---
title: Ververica&Flink入门之六WindowTime
date: 2019-04-19 15:38:06
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 状态类型
```
Managed State & Raw State
MS: Flink Runtime管理,已知数据结构,大多数情况均可使用
RS: 用户自定义,自己管理,字节数组,需要自定义时使用

MS分为两种,KeyedState,OperatorState
KeyState
    Datastream经过keyBy的操作可以变为KeyedStream
    每个Key对应一个State,即一个Operator实例处理多个Key,访问相应的多个State,并由此就衍生了KeyedState
    KeyedState只能用在KeyedStream的算子中,即在整个程序中没有keyBy的过程就没有办法使用KeyedState
OperatorState
     可以用于所有算子,相对于数据源有一个更好的匹配方式
     常用于Source,例如FlinkKafkaConsumer
     相比KeyedState,一个Operator实例对应一个State
     随着并发的改变,KeyedState中,State随着Key在实例间迁移
     OperatorState没有Key,并发改变时需要选择状态如何重新分配
         均匀分配
         所有State合并为全量State再分发给每个实例
```

---

# KeyedState使用
```
State
    ValueState 存储单个值,Get/Set,Update
    MapState Put/Remove
    AppendlingState
        MergingState
            ListState Add/Update
            ReducingState 单个值,可以将数据相加
            AggregatingState 单个值,输入输出类型可以不一致
```

---

# 容错机制
```
env.enableCheckpointing(1000) # 每1秒做CK
env.getCheckpointConfig().setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE) # EXACTLY_ONCE代表Barries对齐
env.getCheckpointConfig().setMinPauseBetweenCheckpoints(500) # 2个CK之间至少等待500ms
env.getCheckpointConfig().setCheckpointTimeout(60000) # CK超时,一分钟没有做完就超时
env.getCheckpointConfig().enableExternalizedCheckpoints(ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION) # 是否Cancel时是否保留当前的CK
```

---

# 状态存储方式
```
MemoryStateBackend
    存储方式
        State: TaskManager内存
        CK: JobManager内存
    容量限制
        单个State MaxStateSize默认5M
        maxStateSize <= akka.framesize默认10M
        CK总大小不超过JobManager的内存

FsStateBackend
    存储方式
        State: TaskManager内存
        CK: 外部文件系统(本地或HDFS)
    容量限制
        单TM上State总量不超过它的内存
        CK总大小不超过配置的文件系统容量
        
RocksDBStateBackend
    存储方式
        State: TM的KV数据库(内存+磁盘)
        CK: 外部文件系统(本地或HDFS)
    容量限制
        单TM上State总量不超过它的内存+磁盘
        单Key最大2G
        CK总大小不超过配置的文件系统容量
```