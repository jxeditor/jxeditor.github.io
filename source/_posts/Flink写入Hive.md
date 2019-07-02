---
title: Flink写入Hive
date: 2019-07-02 08:53:01
categories: 大数据
tags: 
    - Flink
    - Hive
---

> 虽然说是Flink写入Hive,其实真正的操作是Flink写入Hdfs,Hive进行刷新操作.

<!-- more -->
## 引用依赖
```xml
<properties>
    <scala.version>2.12.7</scala.version>
    <flink.version>1.7.2</flink.version>
</properties>

<dependency>
    <groupId>org.apache.hive</groupId>
    <artifactId>hive-exec</artifactId>
    <version>1.1.0</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-connector-filesystem_2.12</artifactId>
    <version>${flink.version}</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-hcatalog</artifactId>
    <version>1.6.4</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-java</artifactId>
    <version>${flink.version}</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-scala_2.12</artifactId>
    <version>${flink.version}</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-streaming-scala_2.12</artifactId>
    <version>${flink.version}</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-clients_2.12</artifactId>
    <version>${flink.version}</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-connector-kafka-0.10_2.12</artifactId>
    <version>${flink.version}</version>
</dependency>
```

---

## 代码实现
### Kafka数据格式类
```
package com.dev.flink.stream.hive

import org.apache.flink.api.common.typeinfo.BasicTypeInfo
import org.apache.flink.streaming.util.serialization.KeyedDeserializationSchema
import org.json.JSONObject

class JsonDeserializationSchema extends KeyedDeserializationSchema[String] {

  override def isEndOfStream(nextElement: String) = false

  override def deserialize(messageKey: Array[Byte], message: Array[Byte], topic: String, partition: Int, offset: Long) = {
    val json = new JSONObject()
    json.put("topic", topic)
    json.put("partition", partition)
    json.put("offset", offset)
    json.put("key", if (messageKey == null) null else new String(messageKey))
    json.put("value", if (message == null) null else new String(message))
    json.toString()
  }

  override def getProducedType = BasicTypeInfo.STRING_TYPE_INFO
}
```

### Message信息封装类
```
package com.dev.flink.stream.hive;

public class Message {
    private String topic;
    private int partition;
    private int offset;
    private String msg;

    public Message(String topic, int partition, int offset, String msg) {
        this.topic = topic;
        this.partition = partition;
        this.offset = offset;
        this.msg = msg;

    }

    public String getTopic() {
        return topic;
    }

    public void setTopic(String topic) {
        this.topic = topic;
    }

    public int getPartition() {
        return partition;
    }

    public void setPartition(int partition) {
        this.partition = partition;
    }

    public int getOffset() {
        return offset;
    }

    public void setOffset(int offset) {
        this.offset = offset;
    }

    public String getMsg() {
        return msg;
    }

    public void setMsg(String msg) {
        this.msg = msg;
    }

    @Override
    public String toString() {
        return "Message{" +
                "topic='" + topic + '\'' +
                ", partition=" + partition +
                ", offset=" + offset +
                ", msg='" + msg + '\'' +
                '}';
    }
}
```
### OrcWriter写入类实现
```
package com.dev.flink.stream.hive

import org.apache.flink.streaming.connectors.fs.Writer
import org.apache.hadoop.fs.{FileSystem, Path}
import org.apache.hadoop.hive.ql.io.orc.OrcFile
import org.apache.hadoop.hive.serde2.objectinspector.ObjectInspectorFactory.ObjectInspectorOptions
import org.apache.hadoop.hive.serde2.objectinspector.{ObjectInspector, ObjectInspectorFactory}

import scala.util.Random

class OrcWriter[T](struct: Class[T]) extends Writer[T] with Serializable {

  @transient var writer: org.apache.hadoop.hive.ql.io.orc.Writer = null
  @transient var inspector: ObjectInspector = null
  @transient var basePath: Path = null
  @transient var fileSystem: FileSystem = null

  override def duplicate() = new OrcWriter(struct)

  override def open(fs: FileSystem, path: Path) = {
    basePath = path
    fileSystem = fs
    inspector = ObjectInspectorFactory.getReflectionObjectInspector(struct, ObjectInspectorOptions.JAVA)
    initWriter
  }

  private def initWriter(): Unit = {
    val newPath = getNewPath()
    writer = OrcFile.createWriter(newPath, OrcFile.writerOptions(fileSystem.getConf).inspector(inspector))
  }

  override def write(element: T) = {
    if (writer == null)
      initWriter()
    writer.addRow(element)
  }

  override def flush() = {
    if (writer == null)
      throw new IllegalStateException("Writer is not open")
    val before = writer.getRawDataSize
    writer.writeIntermediateFooter()
    val after = writer.getRawDataSize
    println(s"###################################$before ==> $after###################################")
    writer.getRawDataSize
  }

  override def getPos = flush()

  override def close() = {
    if (writer != null) writer.close()
  }

  private def getNewPath(): Path = {
    var newPath: Path = null
    synchronized {
      newPath = new Path(basePath.getParent, getRandomPartName)
      while (fileSystem.exists(newPath)) {
        newPath = new Path(basePath.getParent, getRandomPartName)
      }
    }
    newPath
  }

  private def getRandomPartName(): String = {
    val suffix = math.abs(Random.nextLong())
    s"part_${suffix}.orc"
  }
}
```

### 执行类实现
```
package com.dev.flink.stream.hive

import java.util.Properties
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.streaming.connectors.fs.bucketing.{BucketingSink, DateTimeBucketer}
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer010
import org.apache.hadoop.conf.Configuration
import org.apache.flink.api.scala._
import org.json.JSONObject
import scala.collection.convert.WrapAsJava._

object HiveDemoOnSink {
  def main(args: Array[String]): Unit = {
    val properties = new Properties()
    properties.setProperty("bootstrap.servers", "hadoop03:9092")
    properties.setProperty("group.id", "test")
    properties.setProperty("auto.offset.reset", "latest")

    val consumer010 = new FlinkKafkaConsumer010[String](
      "test",
      //      List("test1","test2"),
      new JsonDeserializationSchema(),
      properties
    ).setStartFromEarliest()

    val senv = StreamExecutionEnvironment.getExecutionEnvironment
    senv.enableCheckpointing(500)


    val dataStream = senv.addSource(consumer010)
    
    val configuration = new Configuration()
    configuration.set("fs.defaultFS", "hdfs://hadoop01:8020")
    val bucketingSink = new BucketingSink[Message]("/user/hive/warehouse/user_test_orc").setBucketer(
      new DateTimeBucketer[Message]("'c_date='yyyy-MM-dd")
    ).setWriter(
      new OrcWriter[Message](classOf[Message])
    ).setBatchSize(1024 * 10).setFSConfig(configuration)

    // 写入Hdfs
    val ds = dataStream.map(data => {
      val json = new JSONObject(data.toString)
      val topic = json.get("topic").toString
      val partition = json.get("partition").toString.toInt
      val offset = json.get("offset").toString.toInt
      new Message(topic, partition, offset, json.toString())
    })

    ds.print()

    ds.addSink(bucketingSink)
    senv.execute()
  }
}
```
### Hive表创建语句
```
CREATE TABLE user_test_orc(
topic string,
partition int,
offset int,
msg string)
PARTITIONEED BY (c_date string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.ql.io.orc.OrcSerde'
STORED AS INPUTFORMAT 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat';
```

---

## 注意
> 本地IDEA运行无效,打包到集群上运行.
> 
> 这只是将数据写入HDFS上,相当于往Hive在Hdfs上的目录底下直接上传格式化好的文件,这个时候查询Hive表,是不会出现数据的.
> 
> 需要执行 **msck repair table tableName;** 命令修复分区.
> 
> 或者执行 **alter table tableName add partition(分区字段='值');** 添加分区

---

## 瑕疵
> 需要人为修复或者脚本修复Hive的分区,完美方案应该将这种修复放入代码实现.
