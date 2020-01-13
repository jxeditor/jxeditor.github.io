---
title: Flink的侧输出操作
date: 2020-01-13 12:12:12
categories: 大数据
tags: flink
---

> Filter算子的替代,节省不必要的性能浪费

<!-- more -->

## OutputTag
```
指定分流的标签,侧输出数据格式可以和主流的数据格式不一致
```

---

## 特定的函数发送数据
```
ProcessFunction
CoProcessFunction
ProcessWindowFunction
ProcessAllWindowFunction
```

---

## Demo代码实现
```scala
package com.test.flink.stream.window

import java.util.Properties

import com.test.flink.stream.hive.JsonDeserializationSchema
import org.apache.flink.api.common.serialization.SimpleStringSchema
import org.apache.flink.runtime.state.filesystem.FsStateBackend
import org.apache.flink.streaming.api.TimeCharacteristic
import org.apache.flink.streaming.api.scala.{OutputTag, StreamExecutionEnvironment}
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer010
import org.apache.kafka.clients.consumer.ConsumerConfig

import scala.collection.convert.WrapAsJava._
import org.apache.flink.api.scala._
import org.apache.flink.streaming.api.functions.ProcessFunction
import org.apache.flink.util.Collector

/**
 * @Author: xs
 * @Date: 2020-01-13 11:02
 * @Description:
 */
object SideOutputExample {
  def main(args: Array[String]): Unit = {
    val properties = new Properties()
    properties.setProperty("bootstrap.servers", "cdh04:9092")
    properties.setProperty("group.id", "test")
    properties.setProperty("auto.offset.reset", "latest")
    properties.setProperty(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true")
    val consumer010 = new FlinkKafkaConsumer010[String](
      List("test"),
      new SimpleStringSchema(),
      properties
    ).setStartFromLatest()
    System.setProperty("HADOOP_USER_NAME", "hdfs")
    val senv = StreamExecutionEnvironment.getExecutionEnvironment

    val delayOutputTag = OutputTag[String]("delay-side-output")
    val ds = senv.addSource(consumer010).map(x => {
      val arr = x.split(",")
      Demo(arr(0), arr(1).toLong)
    }).process(new ProcessFunction[Demo, Demo] {
      override def processElement(value: Demo, ctx: ProcessFunction[Demo, Demo]#Context, out: Collector[Demo]): Unit = {
        if (value.delayTime < 100) {
          out.collect(value)
        } else {
          ctx.output(delayOutputTag, s"数据 ${value.toString} 迟到了 ：" + value.delayTime + "秒")
        }
      }
    })

    // 常规数据处理
    ds.print()

    // 对侧输出的数据处理
    ds.getSideOutput(delayOutputTag).print()

    senv.execute("Side Outputs Test")
  }

  case class Demo(id: String, time: Long) {
    val delayTime: Long = System.currentTimeMillis() / 1000 - time
  }
}

```