---
title: IceBerg初探
date: 2021-04-27 09:29:12
categories: 大数据
tags: iceberg
---

> 整活,去年就有听过之信大佬讲过iceberg,不过当时认为iceberg只是做了一层数据编排的操作,认识还是太过于浅薄

<!-- more -->

## 准备工作
```
# Flink和Zeppelin环境需要提前部署起来
# 下载Iceberg源码
git clone https://github.com/apache/iceberg.git
cd iceberg
# 开始编译
./gradlew build -x test
# 对应的运行时依赖包
spark-runtime/build/libs
spark-runtime/build/libs
flink-runtime/build/libs
hive-runtime/build/libs

# 在Zeppelin配置Iceberg依赖包
%flink.conf
flink.execution.jars /opt/iceberg/flink-runtime/build/libs/iceberg-flink-runtime-dae6c49.jar
```

---

## 创建新Catalog
### HiveCatalog
```sql
%flink.ssql
CREATE CATALOG hive_catalog WITH (
'type'='iceberg',
'catalog-type'='hive',
'uri'='thrift://mac:9083',
'clients'='5',
'property-version'='1',
'warehouse'='hdfs://user/hive/warehouse'
);

# 以我的理解,这里使用的还是Hive的元数据,相当于一个软连接
# 对hive_catalog的操作就是对Hive的元数据进行操作
```
### HadoopCatalog
```sql
CREATE CATALOG hadoop_catalog WITH (
  'type'='iceberg',
  'catalog-type'='hadoop',
  'warehouse'='hdfs://mac:9000/warehouse/test',
  'property-version'='1'
);
```
### CustomCatalog
```sql
CREATE CATALOG my_catalog WITH (
  'type'='iceberg',
  'catalog-impl'='com.my.custom.CatalogImpl',
  'my-additional-catalog-config'='my-value'
);
```

---

## 目前支持的SQL操作
### DDL操作
```sql
-- 创建DataBase
CREATE DATABASE iceberg_db;
USE iceberg_db;

-- 创建表
CREATE TABLE hive_catalog.default.sample (
    id BIGINT COMMENT 'unique id',
    data STRING
);
-- 不支持计算列,水印,主键

-- 分区
CREATE TABLE hive_catalog.default.sample (
    id BIGINT COMMENT 'unique id',
    data STRING
) PARTITIONED BY (data);
-- Iceberg支持隐藏分区,但是FlinkSQL暂不支持

-- Like建表
CREATE TABLE hive_catalog.default.sample (
    id BIGINT COMMENT 'unique id',
    data STRING
);
CREATE TABLE  hive_catalog.default.sample_like LIKE hive_catalog.default.sample;

-- 修改表
ALTER TABLE hive_catalog.default.sample SET ('write.format.default'='avro')
-- 仅支持flink-1.11

-- 修改表名
ALTER TABLE hive_catalog.default.sample RENAME TO hive_catalog.default.new_sample;

-- 删除表
DROP TABLE hive_catalog.default.sample;
```
### 查询操作
```sql
-- 支持流\批两种模式
SET execution.type = streaming
SET table.dynamic-table-options.enabled=true;
SELECT * FROM sample /*+ OPTIONS('streaming'='true', 'monitor-interval'='1s')*/ ;
SELECT * FROM sample /*+ OPTIONS('streaming'='true', 'monitor-interval'='1s', 'start-snapshot-id'='3821550127947089987')*/ ;
-- monitor-interval 连续监视新提交的数据文件的时间间隔(默认值:"1s")
-- start-snapshot-id 流作业开始的快照ID
SET execution.type = batch
SELECT * FROM sample       ;
```
### 插入操作
```sql
-- Append
INSERT INTO hive_catalog.default.sample VALUES (1, 'a');
INSERT INTO hive_catalog.default.sample SELECT id, data from other_kafka_table;

-- Overwrite(流作业不支持)
INSERT OVERWRITE sample VALUES (1, 'a');
INSERT OVERWRITE hive_catalog.default.sample PARTITION(data='a') SELECT 6;
```

---

## API操作
### 数据读取
```java
--- Batch
StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment();
TableLoader tableLoader = TableLoader.fromHadooptable("hdfs://nn:8020/warehouse/path");
DataStream<RowData> batch = FlinkSource.forRowData()
     .env(env)
     .tableLoader(loader)
     .streaming(false)
     .build();

// Print all records to stdout.
batch.print();

// Submit and execute this batch read job.
env.execute("Test Iceberg Batch Read");

--- Stream
StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment();
TableLoader tableLoader = TableLoader.fromHadooptable("hdfs://nn:8020/warehouse/path");
DataStream<RowData> stream = FlinkSource.forRowData()
     .env(env)
     .tableLoader(loader)
     .streaming(true)
     .startSnapshotId(3821550127947089987)
     .build();

// Print all records to stdout.
stream.print();

// Submit and execute this streaming read job.
env.execute("Test Iceberg Batch Read");
```
### 数据写入
```java
--- 追加
StreamExecutionEnvironment env = ...;

DataStream<RowData> input = ... ;
Configuration hadoopConf = new Configuration();
TableLoader tableLoader = TableLoader.fromHadooptable("hdfs://nn:8020/warehouse/path");

FlinkSink.forRowData(input)
    .tableLoader(tableLoader)
    .hadoopConf(hadoopConf)
    .build();

env.execute("Test Iceberg DataStream");

--- 覆写

```
### 合并小文件
```java
// 原理和Spark的rewriteDataFiles相同
import org.apache.iceberg.flink.actions.Actions;

TableLoader tableLoader = TableLoader.fromHadooptable("hdfs://nn:8020/warehouse/path");
Table table = tableLoader.loadTable();
RewriteDataFilesActionResult result = Actions.forTable(table)
        .rewriteDataFiles()
        .execute();
```

---

## 问题
```
# 由于我使用的版本较高,iceberg目前好像支持到flink-1.11.*,hadoop-2.7.3,hive-2.3.8
# 编译之后会报错,不让强转,翻看源码就有点懵圈了
# 明明HadoopCatalog就是继承BaseMetastoreCatalog抽象类,然后BaseMetastoreCatalog实现Catalog接口
Cannot initialize Catalog, org.apache.iceberg.hadoop.HadoopCatalog does not implement Catalog.
# 通过flink版本降级到1.11.3之后可以使用
```

---

## 更多操作[传送门](https://iceberg.apache.org/flink/)