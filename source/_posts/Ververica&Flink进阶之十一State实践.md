---
title: Ververica&Flink进阶之十一State实践
date: 2019-07-12 13:16:56
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# State Overview
```
State:流式计算中持久化了的状态
```

---

# OperatorState VS KeyedState
```
current key
    OperatorState没有current key概念
    KeyedState的数值总是与一个current key对应的
heap
    OperatorState只有堆内存一种实现
    KeyedState有堆内存和RocksDB两种实现
snapshot
    OperatorState需要手动实现snapshot和restore方法
    KeyedState由backend实现,对用户透明
Size
    OperatorState一般被认为是规模比较小的
    KeyedState一般是相对规模较大的
```

---

# StateBackend的选择
```
三种:
    MemoryStateBackend(CK数据直接返回给Master节点)
    FsStateBackend(CK数据写入文件中,将文件路径传递给Master)
    RocksDBStateBackend(CK数据写入文件中,将文件路径传递给Master)

OperatorStateBackend分类
    DefaultOperatorStateBackend(数据存储在内存中)

KeyedStateBackend分类
    HeapKeyedStateBackend(数据存储在内存中)
    RocksDBKeyedStateBackend((数据存储在RocksDB中)
    
选择FsStateBackend:
    性能更好,日常存储是在堆内存中,面临OOM风险,不支持增量的CK
选择RocksDBStateBackend:
    无需担心OOM风险
```

---

# RocksDB的state存储
```
RocksDB中,每个state使用一个Column Family
每个column family使用独占writebuffer,整个DB共享一个block cache
```

---

# RocksDB的相关参数
```
flink1.8开始支持ConfigurableOptionsFactory
state.backend.rocksdb.block.blocksize数据块大小,默认4KB,增大会影响减少内存使用,但是会影响读性能
state.backend.rocksdb.block.cache-size整个DB的block size大小,默认8MB,建议调大
state.backend.rocksdb.compaction.level.use-dynamic-size如果使用LEVEL compaction,在SATA磁盘上,建议配置成true,默认false
state.backend.rocksdb.files.open最大打开文件数目,-1意味着没有限制,默认值5000
state.backend.rocksdb.thread.num后台flush和compaction的线程数,默认1,建议调大
state.backend.rocksdb.writebuffer.count每个column family的writebuffer数目,默认值2,建议调大
state.backend.rocksdb.writebuffer.number-to-merge写之前的writebuffer merge数目,默认值1,建议调大
state.backend.rocksdb.writebuffer.size每个writebuffer的size,默认4MB,建议调大
```

---

# OperatorState使用建议
```
慎重使用长List
正确使用UnionListState
    restore后,每个subTask均恢复了与之前所有并发的state
    目前Flink内部的使用都是为了获取之前的全局信息,在下一次snapshot时,仅使用其中一部分做snapshot
    切勿在下一次snapshot时进行全局snapshot
```

---

# KeyedState使用建议
```
如何清空当前state
    state.clear只能清理当前key对应的value值
    需要借助KeyedStateBackend的applyToAllKeys方法
考虑value值很大的极限场景(RocksDB)
    受限于JNI bridge API的限制,单个value只支持2^31bytes
    考虑使用MapState来代替ListState或者ValueState
如何知道当前RocksDB的使用情况
    RocksDB的日志可以观察到一些compaction信息,默认存储位置在flink-io目录下,需要登录到TaskManager里面才能找到
    考虑打开RocksDB的native metrics
配置了StateTTL,可能存储空间并没有减少
    默认情况下,只有在下次读访问时才会触发清理那条过期数据
    如果那条数据之后不再访问,则也不会清理
```

---

# RawState(timer)使用建议
```
TimerState太大怎么办
    考虑存储到RocksDB中
        state.backend.rocksdb.timer-service.factory: ROCKSDB
    Trade off
        存储到Heap中,面临OOM风险,CK的同步阶段耗时大
        存储到RocksDB中,影响timer的读写性能
```

---

# RocksDBState使用建议
```
不要创建过多的state
    每个state一个column family,独占writebuffer,过多的state会导致占据过多的writebuffer
    根本上还是RocksDBStateBackend的native内存无法直接管理
```

---

# CK的使用建议
```
CK间隔不要太短
    一般5min级别足够
    CK与record处理共抢一把锁,CK的同步阶段会影响record的处理
设置合理超时时间
    默认的超时时间是10min,如果state规模大,则需要合理配置
    最坏情况是创建速度大于删除速度,导致磁盘空间不可用
FsStateBackend可以考虑文件压缩
    对于刷出去的文件可以考虑使用压缩来减少CK体积
    ExecutionConfig executionConfig = new ExecutionConfig();
    executionConfig.setUseSnapshotCompression(true);
```