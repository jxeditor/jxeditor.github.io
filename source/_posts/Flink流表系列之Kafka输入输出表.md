---
title: Flink流表系列之Kafka输入输出表
date: 2020-01-06 11:25:27
categories: 大数据
tags:
    - flink
    - kafka
---

> 记录将kafka注册成流表,进行数据的写入写出

<!-- more -->

## Source
```scala
package com.test.flink.stream.sql

import java.util

import org.apache.flink.api.common.typeinfo.{TypeInformation, Types}
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.api.scala._
import org.apache.flink.table.api.EnvironmentSettings
import org.apache.flink.table.descriptors.{Json, Kafka, Schema}
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2019-12-12 12:38
 * @Description: 将kafkaSource注册成一张表
 * {"topic":"test","partition":3,"offset":1,"payload":[{"col1":1,"col2":"2"},{"col1":3,"col2":"4"}]}
 * [1,2, 3,4]
 */
object KafkaSourceExample {
  def main(args: Array[String]): Unit = {
    val map = Map("payload" -> Types.OBJECT_ARRAY(Types.ROW_NAMED(Array("col1", "col2"), Types.INT, Types.STRING)))
    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)
    val kafka = new Kafka()
      .version("0.10")
      .topic("test")
      .property("bootstrap.servers", "hadoop03:9092")
      //      .startFromEarliest()
      .startFromLatest()

    tableEnv.connect(kafka)
      .withFormat(
        new Json().failOnMissingField(true).deriveSchema()
      )
      .withSchema(
        registerSchema(map)
      )
      .inAppendMode()
      .registerTableSource("test")

    val sql = "select * from test"
    val table = tableEnv.sqlQuery(sql)

    table.printSchema()

    val value = tableEnv.toAppendStream[Row](table)
    value.print()
    bsEnv.execute("Flink Demo")
  }

  def registerSchema(map: Map[String, TypeInformation[_]]): Schema = {
    val schema = new Schema()
    map.map(x => {
      schema.field(x._1, x._2)
    })
    schema
  }
}
```

---

## Sink
```scala
package com.test.flink.stream.sql

import org.apache.flink.api.common.typeinfo.Types
import org.apache.flink.streaming.api.scala.{DataStream, StreamExecutionEnvironment}
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.table.descriptors.{Json, Kafka, Schema}
import org.apache.flink.table.api.scala._
import org.apache.flink.api.scala._

/**
 * @Author: xs
 * @Date: 2020-01-06 10:53
 * @Description: 将流表写入到kafka中,JSON格式
 * {"user":2,"result":"test"}
 */
object KafkaSinkExample {
  def main(args: Array[String]): Unit = {
    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)
    val topic = "test"

    val ds = bsEnv.socketTextStream("hadoop01", 9999, '\n')
    val source = ds.flatMap(_.split(" ")).map(x => {
      Source(x.toInt, "test")
    })

    tableEnv
      .connect(
        new Kafka()
          .version("0.10")
          .topic(topic)
          .property("zookeeper.connect", "hadoop03:2181")
          .property("bootstrap.servers", "hadoop03:9092"))
      .withFormat(
        new Json().deriveSchema)
      .withSchema(
        new Schema()
          .field("user", Types.INT)
          .field("result", Types.STRING)
      )
      .inAppendMode
      .registerTableSink(topic)

    tableEnv.registerDataStream("demoTable", source, 'user, 'result, 'proctime.proctime)

    val sql = "insert into " + topic + " select user, `result` from demoTable"

    tableEnv.sqlUpdate(sql)
    tableEnv.execute("test")
  }

  case class Source(user: Int, result: String)
}
```