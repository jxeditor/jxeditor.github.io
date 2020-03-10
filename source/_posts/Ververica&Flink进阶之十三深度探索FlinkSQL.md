---
title: Ververica&Flink进阶之十三深度探索FlinkSQL
date: 2019-08-03 14:15:36
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# TableEnvironments
```
两种planner
    Blink planner
        flink-table-runtime-blink
        flink-table-planner-blink
    Flink planner
        BatchTableEnvironment
            flink-table-planner(java/scala)

scala版本
    StreamTableEnvironment
        flink-table-api-scala-bridge
            flink-table-api-scala

java版本
    StreamTableEnvironment
        flink-table-api-java-bridge
            TableEnvironment
                flink-table-api-java
                    flink-table-common
```

---

# 适用场景
```
a.FlinkStream
b.FlinkBatch
c.BlinkStream
d.BlinkBatch
e.From/ToDataStream
f.From/ToDataSet
g.UDAF/UDTF

TableEnvironment
    a,c,d
(Java/Scala)StreamTableEnvironment
    a,c(不支持分段优化),e,g
(Java/Scala)BatchTableEnvironment
    b,f,g
```

---

# 使用示例
```java
// Blink Batch
EnvironmentSettings settings = EnvironmentSettings.newInstance().useBlinkPlanner().inBatchMode().build();
TableEnvironment tEnv = TableEnvironment.create(settings);
tEnv...
tEnv.execute("JobName")

// Blink Stream
EnvironmentSettings settings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build();
StreamExecutionEnvironment execEnv = ...
StreamTableEnvironment tEnv = StreamTableEnvironment.create(execEnv,settings);
tEnv...

// Flink Batch
ExecutionEnvironment execEnv = ...
BatchTableEnvironment tEnv = BatchTableEnvironment.create(execEnv);
tEnv...

// Flink Stream
EnvironmentSettings settings = EnvironmentSettings.newInstance().useOldPlanner().inStreamingMode().build();
TableEnvironment tEnv = TableEnvironment.create(settings);
tEnv...
tEnv.execute("JobName")
```

---

# New Catalog
```
ExternalCatalog已废弃,Blink planner不支持

GenericInMemoryCatalog+HiveCatalog
    Catalog
        CatalogManager
            TableEnvironment
                SQLClient
```

---

# DDL
```
# in tableEnv#sqlUpdate
CREATE TABLE
CREATE VIEW
DROP TABLE
DROP VIEW
创建表时的With属性,参考各个connector factory里的定义
    CsvAppendTableSourceFactory
    KafkaTableSourceSinkFactory
    
# in sqlClient
CREATE VIEW
DROP VIEW
SHOW CATALOGS/DATABASES/TABLES/FUNCTIONS
USE CATALOG xxx
SET xxx=yyy
DESCRIBE table_name
EXPLAN SELECT xxx
```

---

# Blink planner
```
改进
    功能相关
        更完整的SQL语法的支持(subquery,over,group sets等)
        更丰富,高效的算子
        更完善的cost模型,对接了catalog中的statistics
        join reorder
        shuffle service(only for batch)
    性能相关
        分段优化 & sub-plan reuse
        更丰富的优化rule
        更高效的数据结构BinaryRow
        mini-batch(only for stream)
        省多余的shuffle & sort(for batch now)
        
分段优化
    Flink planner按每个Sink单独优化,各个Sink的计算链路相互独立,有重复计算
    Blink planner先分段(能优化的最大公共子图),每段独立优化
分段优化解决的是多Sink优化问题(DAG优化)

sub-plan reuse
    相关配置
        table.optimizer.reuse-sub-plan-enabled,默认开启
        table.optimizer.reuse-source-enabled,默认开启
    在Batch模式下,sub-plan reuse可能造成死锁(hash-join,nested-loop-join先读build端再读probe端)
    框架会将probe端数据落盘来解死锁
    落盘会有额外开销,此时用户可根据情况来调整配置
sub-plan reuse解决的是优化结果的子图复用问题
```

---

# AGG分类
```
group agg:   select count(a) from t group by b
over agg:    select count(a) over (partition by b order by c) from t
window agg:  select count(a) from t group by tumble(ts, interval '10' second), b
table agg:   tEnv.scan("t").groupBy('a).flatAggregate(flatAggFunc('b as ('c, 'd)))
```

---

# Group AGG优化
```
local/global
    减少网络shuffle数据
    agg function可merge(sum(a) -> local sum(a) + global sum(local result))
distinct agg
    改写为两层agg
    Stream下是为了解决数据热点问题(state需要存所有input数据)
```

---

# Local/Global AGG
```
必要条件
    agg的所有agg function都是mergeable(实现了merge方法)
    table.optimizer.agg-phase-strategy为AUTO或TWO_PHASE
    Stream下,mini-batch开启
    Batch下,AUTO会根据cost选择
```

---

# Distinct AGG
```
Batch下,强制改写
    第一层求distinct值和非distinct agg function的值
    第二层求distinct agg function的值
    示例:
        select color,count(distinct id),count(*)
        from t
        group by color
        改写
        select color,count(id),min(cnt)
        from (
            select color,id,count(*) filter (where $e = 2) as cnt
            from (
                select color,id,1 as $e from t -- for distinct id
                union all
                select color,null as id, 2 as $e from t -- for count(*)
            ) group by color,id,$e
        ) group by color
            
    
Stream下,必要条件
    必须是支持的agg function
        avg/count/min/max/sum/first_value/last_value/concat_agg/single_value
    table.optimizer.distinct-agg.split.enabled开启(默认关闭)
    示例:
        select color,count(distinct id),count(*)
        from t
        group by color
        改写
        select color,sum(dcnt),sum(cnt)
        from (
            select color,count(distinct id) as dcnt,count(*) as cnt
            from t
            group by color,mod(hash_code(id),1024)
        ) group by color
```