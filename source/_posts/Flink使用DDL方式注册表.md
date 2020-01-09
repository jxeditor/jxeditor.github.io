---
title: Flink使用DDL方式注册表
date: 2020-01-09 09:32:06
categories: 大数据
tags: 
    - flink
    - kafka
    - hbase
---

> 官网例子实现,主要还是语法与数据类型的使用,官网并没有详细的Demo

<!-- more -->

## KafkaSQL代码
```scala
package com.test.flink.stream.sql

import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.EnvironmentSettings
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.types.Row
import org.apache.flink.table.api.scala._
import org.apache.flink.api.scala._

/**
 * @Author: xs
 * @Date: 2020-01-08 17:11
 * @Description:
 */
object KafkaSQLExample {
  def main(args: Array[String]): Unit = {
    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)


    val sql = "create table test (" +
      "`business` varchar," +
      "`ts` bigint" +
      ") with (" +
      " 'connector.type' = 'kafka', " +
      " 'connector.version' = '0.10', " +
      " 'connector.topic' = 'test', " +
      " 'update-mode' = 'append', " +
      " 'connector.properties.0.key' = 'zookeeper.connect', " +
      " 'connector.properties.0.value' = 'hadoop01:2181', " +
      " 'connector.properties.1.key' = 'bootstrap.servers', " +
      " 'connector.properties.1.value' = 'hadoop01:9092', " +
      " 'connector.properties.2.key' = 'group.id', " +
      " 'connector.properties.2.value' = 'kafkasql', " +
      //      " 'connector.startup-mode' = 'earliest-offset', " +
      " 'connector.startup-mode' = 'latest-offset', " +
      " 'format.type' = 'json', " +
      " 'format.derive-schema' = 'true' " +
      ")"

    tableEnv.sqlUpdate(sql)

    tableEnv.toAppendStream[Row](tableEnv.sqlQuery("select * from test")).print()

    tableEnv.execute("")
  }
}
```

---

## HBaseSQL代码
**注意:** 不知道是否是版本问题,HBase-1.2.0版本运行下列代码会报`Can't get the location for replica 0`错误
```scala
package com.test.flink.stream.sql

import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.EnvironmentSettings
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.table.api.scala._
import org.apache.flink.api.scala._
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2020-01-08 16:42
 * @Description:
 */
object HBaseSQLExample {
  def main(args: Array[String]): Unit = {
    System.setProperty("HADOOP_USER_NAME", "hdfs")

    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)


    val sql = "create table test (" +
      "`name` string," +
      "`info` ROW<name varchar, age varchar>" +
      ") with (" +
      " 'connector.type' = 'hbase', " +
      " 'connector.version' = '1.4.3', " +
      " 'connector.table-name' = 'user', " +
      " 'connector.zookeeper.quorum' = 'hadoop01:2181', " +
      " 'connector.zookeeper.znode.parent' = '/hbase', " +
      " 'connector.write.buffer-flush.max-size' = '1mb', " +
      " 'connector.write.buffer-flush.max-rows' = '1', " +
      " 'connector.write.buffer-flush.interval' = '2s' " +
      ")"

    tableEnv.sqlUpdate(sql)

    tableEnv.toAppendStream[Row](tableEnv.sqlQuery("select * from test")).print()

    tableEnv.execute("")
  }
}
```