---
title: Flink1.11新特性
date: 2020-06-08 18:28:35
categories: 大数据
tags: flink
---

> 整理下Flink1.11有什么新的功能,以及坑,只有自己用到的

<!-- more -->

## Orc格式支持
```scala
OrcBulkWriterFactory
使用方式与ParquetAvroWriters
但是,目前并没有一个完善的Demo
本人在使用时出现有文件生成却没有数据的情况
无法判断是使用问题,还是Flink本身问题

val schema: String = "struct<platform:string,event:string,dt:string>"
val writerProperties: Properties = new Properties()
writerProperties.setProperty("orc.compress", "LZ4")

val writerFactory = new OrcBulkWriterFactory(new DemoVectorizer(schema), writerProperties, new Configuration())
import org.apache.flink.core.fs.Path
val sink = StreamingFileSink.forBulkFormat(new Path("./resources"),
  writerFactory
).build()

student.addSink(sink).setParallelism(1)
```

---

## execute的使用
```
1.11之前TableEnvironmentImpl与StreamExecutionEnvironment的execute方法实现一致
无论用哪一个都可以
1.11修改了TableEnvironmentImpl中execute的实现逻辑
如果代码中涉及了DataStream的操作,则需要使用StreamExecutionEnvironment的execute方法
```