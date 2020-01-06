---
title: Flink流表系列之HBase输出表
date: 2020-01-06 14:09:30
categories: 大数据
tags: 
    - flink
    - hbase
---

> 将流表直接插入HBase表中,Source其实也有但是没有找到应用场景

<!-- more -->

## Sink
```scala
package com.test.flink.stream.sql

import java.util
import org.apache.flink.addons.hbase.{HBaseOptions, HBaseTableFactory, HBaseTableSchema, HBaseTableSource, HBaseUpsertTableSink, HBaseWriteOptions}
import org.apache.flink.api.common.typeinfo.{TypeInformation, Types}
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.table.descriptors.DescriptorProperties
import org.apache.flink.table.descriptors.Schema.SCHEMA
import org.apache.flink.table.factories.TableFactoryService
import org.apache.flink.table.api.scala._
import org.apache.flink.api.scala._

/**
 * @Author: xs
 * @Date: 2020-01-06 10:37
 * @Description:
 */
object HBaseSinkExample {
  def main(args: Array[String]): Unit = {
    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)
    val schema = new HBaseTableSchema()
    schema.setRowKey("test", classOf[String])
    schema.addColumn("info", "name", classOf[String])
    schema.addColumn("info", "age", classOf[String])
    val options = HBaseOptions.builder
      .setTableName("user")
      .setZkQuorum("hadoop01:2181")
      .setZkNodeParent("/hbase")
      .build()
    val writeOptions = HBaseWriteOptions.builder()
      .setBufferFlushIntervalMillis(1000)
      .setBufferFlushMaxRows(1000)
      .setBufferFlushMaxSizeInBytes(10 * 1024 * 1024)
      .build()
    val sink = new HBaseUpsertTableSink(schema, options, writeOptions)
    tableEnv.registerTableSink("hbaseTable", sink)

    val ds = bsEnv.socketTextStream("hadoop01", 9999, '\n')
    val source = ds.flatMap(_.split(" ")).map(x => {
      Source(x, "name", "age")
    })
    
    tableEnv.registerDataStream("demoTable", source, 'user, 'result, 'age, 'proctime.proctime)

    val sql = "insert into hbaseTable select user, ROW(`result`,age) from demoTable"
    
    tableEnv.sqlUpdate(sql)
    tableEnv.execute("test")
  }

  case class Source(user: String, result: String, age: String)
}
```

---

## TableFactory
```scala
package com.test.flink.stream.sql

import java.util
import java.util.{HashMap, Map}
import org.apache.flink.addons.hbase.{HBaseOptions, HBaseTableFactory, HBaseTableSchema, HBaseTableSource, HBaseUpsertTableSink, HBaseWriteOptions}
import org.apache.flink.api.common.typeinfo.{TypeInformation, Types}
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.table.api.scala.StreamTableEnvironment
import org.apache.flink.table.descriptors.DescriptorProperties
import org.apache.flink.table.descriptors.Schema.SCHEMA
import org.apache.flink.table.factories.TableFactoryService
import org.apache.flink.table.api.scala._
import org.apache.flink.api.scala._
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2020-01-06 10:37
 * @Description:
 */
object HBaseSinkExample {
  def main(args: Array[String]): Unit = {
    val bsEnv = StreamExecutionEnvironment.getExecutionEnvironment
    val bsSettings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
    val tableEnv = StreamTableEnvironment.create(bsEnv, bsSettings)

    val columnNames = Array("test", "info")
    val f1 = Types.ROW_NAMED(Array[String]("name", "age"), Types.STRING, Types.STRING)
    val columnTypes = Array[TypeInformation[_]](Types.STRING, f1)
    val tableSchema = new TableSchema(columnNames, columnTypes)

    val tableProperties = new util.HashMap[String, String]
    // 必须制定connector类型
    tableProperties.put("connector.type", "hbase")
    tableProperties.put("connector.version", "1.4.3")
    tableProperties.put("connector.property-version", "1")
    tableProperties.put("connector.table-name", "user")
    tableProperties.put("connector.zookeeper.quorum", "hadoop01:2181")
    tableProperties.put("connector.zookeeper.znode.parent", "/hbase")
    tableProperties.put("connector.write.buffer-flush.max-size", "10mb")
    tableProperties.put("connector.write.buffer-flush.max-rows", "1000")
    tableProperties.put("connector.write.buffer-flush.interval", "10s")

    val descriptorProperties = new DescriptorProperties(true)
    descriptorProperties.putTableSchema(SCHEMA, tableSchema)
    descriptorProperties.putProperties(tableProperties)
    val sink = TableFactoryService.find(classOf[HBaseTableFactory], descriptorProperties.asMap).createTableSink(descriptorProperties.asMap)
    tableEnv.registerTableSink("hbaseTable", sink)

    val ds = bsEnv.socketTextStream("hadoop01", 9999, '\n')
    val source = ds.flatMap(_.split(" ")).map(x => {
      Source(x, "name", "age")
    })
    tableEnv.registerDataStream("demoTable", source, 'user, 'result, 'age, 'proctime.proctime)
    val sql = "insert into hbaseTable select user, ROW(`result`,age) from demoTable"
    tableEnv.sqlUpdate(sql)
    tableEnv.execute("test")
  }

  case class Source(user: String, result: String, age: String)

}
```

