---
title: Flink连接器解析UpsertKafka
date: 2021-05-13 15:19:01
categories: 大数据
tags: flink
---

> Flink的RowKind和Kafka的ChangeLog消息互转

<!-- more -->

## 消息类型
```
# Flink
INSERT
UPDATE-BEFORE
UPDATE-AFTER
DELETE

# Kafka
UPSERT
DELETE(Tombstone)
```

---

## 顺序性
```
确保具有相同Key的消息写入到一个Partition之中
    Flink内部分发不允许使用非Keyby的Partitioner
    Flink->Kafka按照id = mod(hash(key),num)的分区策略,num为Kafka分区数

# 注意(并行度修改没有问题)
UpsertKafka不允许修改分片策略
不允许修改分区数量
确保查询的Key和Sink表的Key是一致的
```

---

## Demo
```sql
# https://github.com/fsk119/flink-pageviews-demo
# 添加依赖项
# MySQL添加测试表数据
CREATE DATABASE flink;
USE flink;

CREATE TABLE users (
  user_id BIGINT,
  user_name VARCHAR(1000),
  region VARCHAR(1000)
);

INSERT INTO users VALUES 
(1, 'Timo', 'Berlin'),
(2, 'Tom', 'Beijing'),
(3, 'Apple', 'Beijing');

# SqlClient创建表
CREATE TABLE users (
  user_id BIGINT,
  user_name STRING,
  region STRING
) WITH (
  'connector' = 'mysql-cdc',
  'hostname' = 'localhost',
  'database-name' = 'flink',
  'table-name' = 'users',
  'username' = 'root',
  'password' = '123456'
);

CREATE TABLE pageviews (
  user_id BIGINT,
  page_id BIGINT,
  view_time TIMESTAMP(3),
  proctime AS PROCTIME()
) WITH (
  'connector' = 'kafka',
  'topic' = 'pageviews',
  'properties.bootstrap.servers' = 'localhost:9092',
  'scan.startup.mode' = 'earliest-offset',
  'format' = 'json'
);

INSERT INTO pageviews VALUES
  (1, 101, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (2, 104, TO_TIMESTAMP('2020-11-23 15:00:01.00'));


# 案例一,创建Sink表,灌入关联数据
CREATE TABLE enriched_pageviews (
  user_id BIGINT,
  user_region STRING,
  page_id BIGINT,
  view_time TIMESTAMP(3),
  WATERMARK FOR view_time as view_time - INTERVAL '5' SECOND,
  PRIMARY KEY (user_id, page_id) NOT ENFORCED
) WITH (
  'connector' = 'upsert-kafka',
  'topic' = 'enriched_pageviews',
  'properties.bootstrap.servers' = 'localhost:9092',
  'key.format' = 'json',
  'value.format' = 'json'
);

INSERT INTO enriched_pageviews
SELECT pageviews.user_id, region, pageviews.page_id, pageviews.view_time
FROM pageviews
LEFT JOIN users ON pageviews.user_id = users.user_id;

kafka-console-consumer --bootstrap-server mac:9092 --topic "enriched_pageviews" --from-beginning --property print.key=true

# 案例二,聚合数据
CREATE TABLE pageviews_per_region (
  user_region STRING,
  cnt BIGINT,
  PRIMARY KEY (user_region) NOT ENFORCED
) WITH (
  'connector' = 'upsert-kafka',
  'topic' = 'pageviews_per_region',
  'properties.bootstrap.servers' = 'localhost:9092',
  'key.format' = 'json',
  'value.format' = 'json'
)

INSERT INTO pageviews_per_region
SELECT
  user_region,
  COUNT(*)
FROM enriched_pageviews
WHERE user_region is not null
GROUP BY user_region;

kafka-console-consumer --bootstrap-server mac:9092 --topic "pageviews_per_region" --from-beginning --property print.key=true
```

---

## 源码项
### Sink
```java
# 主要是将RowKind进行合并
# BufferedUpsertSinkFunction
invoke()->addToBuffer()->changeFlag()
private RowData changeFlag(RowData value) {
    switch (value.getRowKind()) {
        case INSERT:
        case UPDATE_AFTER:
            value.setRowKind(UPDATE_AFTER);
            break;
        case UPDATE_BEFORE:
        case DELETE:
            value.setRowKind(DELETE);
    }
    return value;
}
```
### Source
```java
# 将读取的数据转换为对应的格式
# DynamicKafkaDeserializationSchema
@Override
public void deserialize(ConsumerRecord<byte[], byte[]> record, Collector<RowData> collector)
        throws Exception {
    // 没有Key并且没有MetaData
    if (keyDeserialization == null && !hasMetadata) {
        valueDeserialization.deserialize(record.value(), collector);
        return;
    }

    // key
    if (keyDeserialization != null) {
        keyDeserialization.deserialize(record.key(), keyCollector);
    }

    // project output while emitting values
    outputCollector.inputRecord = record;
    outputCollector.physicalKeyRows = keyCollector.buffer;
    outputCollector.outputCollector = collector;
    if (record.value() == null && upsertMode) {
        // Kafka的墓碑信息,value为null
        outputCollector.collect(null);
    } else {
        valueDeserialization.deserialize(record.value(), outputCollector);
    }
    keyCollector.buffer.clear();
}

# Value的emit在OutputProjectionCollector
@Override
public void collect(RowData physicalValueRow) {
    // no key defined
    if (keyProjection.length == 0) {
        emitRow(null, (GenericRowData) physicalValueRow);
        return;
    }

    // otherwise emit a value for each key
    for (RowData physicalKeyRow : physicalKeyRows) {
        emitRow((GenericRowData) physicalKeyRow, (GenericRowData) physicalValueRow);
    }
}

private void emitRow(
        @Nullable GenericRowData physicalKeyRow,
        @Nullable GenericRowData physicalValueRow) {
    final RowKind rowKind;
    if (physicalValueRow == null) {
        if (upsertMode) {
            rowKind = RowKind.DELETE;
        } else {
            throw new DeserializationException(
                    "Invalid null value received in non-upsert mode. Could not to set row kind for output record.");
        }
    } else {
        rowKind = physicalValueRow.getRowKind();
    }
    ......
    outputCollector.collect(producedRow);
}
```