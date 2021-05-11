---
title: ApacheHudi简介
date: 2021-05-07 11:47:36
categories: 大数据
tags: hudi
---

> 参考Hudi[官网](https://hudi.apache.org/docs/spark_quick-start-guide.html),[文章](https://copyfuture.com/blogs-details/20200104193221803maaaqfq9dqvkkhf)以及[知乎](https://zhuanlan.zhihu.com/p/339932084)回答,只做简单介绍

<!-- more -->

## Hudi是什么?
```
Hadoop Upserts Deletes and Incrementals.
对于我自己的理解就是利用Hadoop存储更新/删除/变更的记录.
基于时间线对数据进行存储,并保证原子性.
Hudi的关键动作:
    COMMITS - 将一批记录原子写入表中
    CLEANS - 清除表中不再使用的旧版本文件
    DELTA_COMMIT - 将一批记录原子写入MergeOnRead类型表中
    COMPACTION - 压缩,可以看做基于时间线上的特殊提交(从基于行的日志文件移动到列格式)
    ROLLBACK - 表示COMMITS/DELTA_COMMIT不成功且已经回滚(删除了写入过程产生的任何文件)
    SAVEPOINT - 将某些文件标记为SAVEPOINT,清理程序不会删除它们,便于将表还原到时间线上的某个快照上

Hudi的状态:
    REQUESTED - 已安排动作,但未开始
    INFLIGHT - 正在执行该操作
    COMPLETED - 动作完成
```

---

## 为什么使用Hudi?
```
对于大数据处理,我们一般分为实时处理与离线处理,数据同理
Hudi可以将MySQL数据以近实时的方式映射到大数据平台中(Hive)
MySQL处理耗时长/没法处理/跨库的分析可以交由大数据平台来处理
这时候有同学会问,如何只是这样的话,也有其他的组件可以做到,为啥要选择Hudi?
Apache Kudu,需要单独部署集群,Hudi不需要,只需要利用现在的HDFS做数据文件存储,Hive做数据分析即可,更加适合资源受限的环境
```

---

## Hudi表数据结构
```
一般使用HDFS进行数据存储
包含_partition_key的为实际数据文件,按分区存储,_partition_key可以指定

.hoodie 
对应表的元数据信息
由于CRUD的零散性,每一次操作都会生成一个文件,小文件越来越多后会严重影响HDFS的性能,Hudi设计了文件合并机制,.hoodie中存放了对应的文件合并操作相关日志
```

---

## Hudi常见配置
```
需要注意必要的配置
TABLE_NAME(表名)
RECORDKEY_FIELD_OPT_KEY(主键字段,用来唯一标识每个分区内的记录,默认值:uuid)
PARTITIONPATH_FIELD_OPT_KEY(用于对表进行分区的列,设置""可以避免分区,默认值:partitionpath)
PRECOMBINE_FIELD_OPT_KEY(当一批数据中有两个记录具有相同的键时,选择指定字段最大值的记录,默认值:ts)

非必要配置
OPERATION_OPT_KEY(写操作类型,默认值:UPSERT_OPERATION_OPT_VAL,可选:BULK_INSERT_OPERATION_OPT_VAL,INSERT_OPERATION_OPT_VAL,DELETE_OPERATION_OPT_VAL)
TABLE_TYPE_OPT_KEY(表类型,默认值:COW_TABLE_TYPE_OPT_VAL,可选:MOR_TABLE_TYPE_OPT_VAL)
```

---

## COW和MOR表
```
Copy On Write
写时复制表中的文件片,仅包含基本列文件,每次提交都会生成新版本的基本文件
此存储类型使客户端能够以列式文件格式(当前为parquet)摄取数据
使用COW存储类型时,任何写入Hudi数据集的新数据都将写入新的parquet文件
更新现有的行将导致重写整个parquet文件(这些parquet文件包含要更新的受影响的行)
因此,所有对此类数据集的写入都受parquet写性能的限制,parquet文件越大,摄取数据所花费的时间就越长

Merge On Read
读时合并表,仅通过最新版本的数据文件来支持读取查询
此存储类型使客户端可以快速将数据摄取为基于行(如avro)的数据格式
使用MOR存储类型时,任何写入Hudi数据集的新数据都将写入新的日志/增量文件,这些文件在内部将数据以avro进行编码
压缩(Compaction)过程(配置为嵌入式或异步)将日志文件格式转换为列式文件格式(parquet)

如果满足以下条件,则选择写时复制(COW)存储:
    寻找一种简单的替换现有的parquet表的方法,而无需实时数据
    当前的工作流是重写整个表/分区以处理更新,而每个分区中实际上只有几个文件发生更改
    想使操作更为简单(无需压缩等),并且摄取/写入性能仅受parquet文件大小以及受更新影响文件数量限制
    工作流很简单,并且不会突然爆发大量更新或插入到较旧的分区
    COW写入时付出了合并成本,因此,这些突然的更改可能会阻塞摄取,并干扰正常摄取延迟目标

如果满足以下条件，则选择读时合并(MOR)存储:
    希望数据尽快被摄取并尽可能快地可被查询
    工作负载可能会突然出现模式的峰值/变化(例如,对上游数据库中较旧事务的批量更新导致对DFS上旧分区的大量更新)
    异步压缩(Compaction)有助于缓解由这种情况引起的写放大,而正常的提取则需跟上上游流的变化
```