---
title: Flink实时写入Hive以ORC格式
date: 2020-06-16 17:58:29
categories: 大数据
tags: flink
---

> 请注意版本问题,Flink使用的`orc-core`过新,对于老版本的hive并不支持,可以通过重写OrcFile类以支持低版本

<!-- more -->

## Orc格式
```
Stripe:
    index data
    group of row data
    stripe footer
FileFooter:
    辅助信息,文件中包含的所有Stripe信息
    每个Stripe含有的数据行数,每一行的数据类型
    列级别的聚合操作(count,min,max,sum)
PostScript:
    包含压缩参数和压缩页脚大小
    
Stripe:
    MAGIC
    stripe1{
        data
        index
        footer
    },
    stripe2{
        data
        index
        footer
    },
    ...
    metadata
    footer
    PostScript + size(PostScript)
```
### DynamicIntArray和DynamicByteArray
```
动态数组,两者一个存Int,一个存Byte
static final int DEFAULT_CHUNKSIZE = 8192;
static final int INIT_CHUNKS = 128;
chunk初始化128个,每个size大小为8192
增删改查操作需要根据index,计算出对应的chunk和在该chunk内的偏移量来操作数据
public int get(int index) {
    if (index >= this.length) {
        throw new IndexOutOfBoundsException("Index " + index + " is outside of 0.." + (this.length - 1));
    } else {
        int i = index / this.chunkSize;// 对应的chunk
        int j = index % this.chunkSize;// 偏移量
        return this.data[i][j];
    }
}
```
### OrcFile写入数据
```
# WriterImpl.addRowBath入口
TreeWriter 写数据
RowIndexEntry 管理
MemoryManager 内存管理
Stripe 生成

# useDictionaryEncoding是否使用字典压缩
使用:
    this.dictionary.add(val) 使用红黑树存储当前字符串的bytes值
    this.rows.add(i) 元素存储在dictionary中的offset
不使用:直接写入OutputStream
    this.directStreamOutput.write();
    this.directLengthOutput.write();

```

---

## 使用
使用方式与1.10parquet的使用方式类似
### Vectorizer
```java
import org.apache.flink.orc.vector.Vectorizer;
import org.apache.hadoop.hive.ql.exec.vector.VectorizedRowBatch;
import org.apache.hadoop.hive.ql.exec.vector.BytesColumnVector;
import java.io.IOException;

/**
 * @author XiaShuai on 2020/6/15.
 */
public class DemoVectorizer extends Vectorizer<Demo> {

    public DemoVectorizer(String schema) {
        super(schema);
    }

    @Override
    public void vectorize(Demo demo, VectorizedRowBatch vectorizedRowBatch) throws IOException {
        int id = vectorizedRowBatch.size++;
        System.out.println(vectorizedRowBatch.size);
        for (int i = 0; i < 3; ++i) {
            BytesColumnVector vector = (BytesColumnVector) vectorizedRowBatch.cols[i];
            byte[] bytes = demo.platform().getBytes();
            vector.setVal(id, bytes, 0, bytes.length);
        }
    }
}
```
### Main
```scala
import java.nio.ByteBuffer
import java.util.Properties

import com.alibaba.fastjson.JSON
import org.apache.flink.api.common.serialization.SimpleStringSchema
import org.apache.flink.orc.writer.OrcBulkWriterFactory
import org.apache.flink.runtime.state.filesystem.FsStateBackend
import org.apache.flink.streaming.api.CheckpointingMode
import org.apache.flink.streaming.api.functions.sink.filesystem.StreamingFileSink
import org.apache.flink.streaming.api.scala.{StreamExecutionEnvironment, _}
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer
import org.apache.hadoop.conf.Configuration
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.flink.core.fs.Path


/**
  * @author XiaShuai on 2020/6/15.
  */
object OrcFileWriteDemo {
  def main(args: Array[String]): Unit = {
    val READ_TOPIC = "topic"
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.enableCheckpointing(60000L, CheckpointingMode.EXACTLY_ONCE)
    env.setStateBackend(new FsStateBackend("file:///job/flink/ck/Orc"))
    val props = new Properties()
    props.put("bootstrap.servers", "hosts:9092")
    props.put("group.id", "xs_test3")
    props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer")
    props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer")

    val producerProps = new Properties()
    producerProps.setProperty(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "skuldcdhtest1.ktcs:9092")
    producerProps.setProperty(ProducerConfig.RETRIES_CONFIG, "3")
    // 如果下面配置的是exactly-once的语义 这里必须配置为all
    producerProps.setProperty(ProducerConfig.ACKS_CONFIG, "all")


    val student = env.addSource(new FlinkKafkaConsumer(
      READ_TOPIC, //这个 kafka topic 需要和上面的工具类的 topic 一致
      new SimpleStringSchema, props).setStartFromLatest()
    ).map(x => {
      ...
      Demo("","","")
    }).setParallelism(1)

    val schema: String = "struct<platform:string,event:string,dt:string>"
    val writerProperties: Properties = new Properties()
    writerProperties.setProperty("orc.compress", "ZLIB")

    val vectorizer = new DemoVectorizer(schema)
    val writerFactory = new CustomOrcBulkWriterFactory(vectorizer, writerProperties, new Configuration())
    val sink = StreamingFileSink.forBulkFormat(new Path("F:\\test\\Demo\\Flink11\\src\\main\\resources"),
      writerFactory
    ).build()

    student.addSink(sink).setParallelism(1)
    env.execute("write hdfs")
  }
}

case class Demo(platform: String, event: String, dt: String)
```

---

## 解决低版本支持问题
[Flink-1.11使用的OrcVersion](https://github.com/apache/orc/blob/ce4329f396658648796f5b78716f8e1836f139ec/java/core/src/java/org/apache/orc/OrcFile.java#L258)
[Hive-2.1.1使用的OrcVersion](https://github.com/apache/hive/blob/03599216cfc01fc464f1c9a4fa89e81c45327ea5/orc/src/java/org/apache/orc/OrcFile.java#L156)
```java
# 主要原因为Orc在新版本后使用的WriterVersion为ORC_517
# 导致低版本的Hive解析不了
# 自实现OrcFile类,修改回旧版本
static {
    CURRENT_WRITER = WriterVersion.HIVE_13083;
    memoryManager = null;
}
```