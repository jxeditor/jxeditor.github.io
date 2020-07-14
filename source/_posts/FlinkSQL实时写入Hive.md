---
title: FlinkSQL实时写入Hive
date: 2020-07-13 17:26:40
categories: 大数据
tags: flink
---

> 在新版本中,终于可以不使用StreamingFileSink来写入HDFS了

<!-- more -->

## FileSystem连接方式的SQL
```scala
val sql =
  s"""
     |CREATE TABLE fs_table (
     |  user_uid  STRING,
     |  `ref` BIGINT,
     |  reply_attach STRING,
     |  dt STRING,
     |  h string
     |) PARTITIONED BY (dt,h) WITH (
     |  'connector'='filesystem',
     |  'path'='hdfs:///tmp/test',
     |  'sink.partition-commit.policy.kind' = 'success-file',
     |  'format'='orc'
     |)
     |""".stripMargin

tableEnv.executeSql(sql);

tableEnv.executeSql(
  s"""
     |insert into fs_table
     |select before.user_id,before.`ref`,before.reply_attach,
     |DATE_FORMAT(LOCALTIMESTAMP, 'yyyy-MM-dd'),
     |DATE_FORMAT(LOCALTIMESTAMP, 'HH')
     |FROM test
     |""".stripMargin)
```

---

## 实时Hive
```sql
SET table.sql-dialect=hive;
CREATE TABLE hive_table (
  user_id STRING,
  order_amount DOUBLE
) PARTITIONED BY (dt STRING, hr STRING) STORED AS parquet TBLPROPERTIES (
  'partition.time-extractor.timestamp-pattern'='$dt $hr:00:00',
  'sink.partition-commit.trigger'='partition-time',
  'sink.partition-commit.delay'='1 h',
  'sink.partition-commit.policy.kind'='metastore,success-file'
);

SET table.sql-dialect=default;
CREATE TABLE kafka_table (
  user_id STRING,
  order_amount DOUBLE,
  log_ts TIMESTAMP(3),
  WATERMARK FOR log_ts AS log_ts - INTERVAL '5' SECOND
) WITH (...);

-- streaming sql, insert into hive table
INSERT INTO TABLE hive_table SELECT user_id, order_amount, DATE_FORMAT(log_ts, 'yyyy-MM-dd'), DATE_FORMAT(log_ts, 'HH') FROM kafka_table;

-- batch sql, select with partition pruning
SELECT * FROM hive_table WHERE dt='2020-05-20' and hr='12';
```

---

## 参数解析
```sh
# 写入的文件路径
path

# 动态分区列值为空/空字符串时的默认分区名称
partition.default-name

# 滚动文件的最大大小,默认128MB
sink.rolling-policy.file-size

# 滚动文件打开的最长时间,默认30分钟
sink.rolling-policy.rollover-interval

# 检查滚动文件是否应该完成,默认1分钟
sink.rolling-policy.check-interval

# 是否启用按动态分区字段进行shuffle,有可能导致数据倾斜,默认是false
sink.shuffle-by-partition.enable

# 是否启动StreamingSource,确保每个分区文件都应以原子方式写入,否则会获取不完整的数据,默认不启用
streaming-source.enable

# 连续监视分区/文件的时间间隔
streaming-source.monitor-interval

# 流数据源的消费顺序,支持create-time和partition-time
streaming-source.consume-order

# StreamingSource消耗的起始偏移量,对于create-time和partition-time,应该是时间戳
streaming-source.consume-start-offset

# 从分区值中提取时间的提取器,支持default和custom
partition.time-extractor.kind

# 从分区值中提取时间的自定义提取器
partition.time-extractor.class

# default模式时间提取器允许用户使用分区字段来获取合法的时间戳
# 默认支持'yyyy-mm-dd hh:mm:ss'
# 可以配置'$dt','$year-$month-$day $hour:00:00','$dt $hour:00:00'
partition.time-extractor.timestamp-pattern

# Lookup Join的缓存有效期,默认60分钟
lookup.join.cache.ttl

# 提交分区的触发器类型
# process-time: 基于机器时间
# partition-time: 基于分区值中提取的时间,需要生成水印
sink.partition-commit.trigger

# 分区在延迟时间之前不会提交
sink.partition-commit.delay

# 写入成功后的提交模式,metastore,success-file,custom
# 支持metastore和success-file两者同时进行
sink.partition-commit.policy.kind

# 用于实现PartitionCommitPolicy接口的分区提交策略,用于custom模式
sink.partition-commit.policy.class

# success-file分区提交策略的文件名,默认是'_SUCCUESS'
sink.partition-commit.success-file.name
```