---
title: Ververica&Flink进阶之九Connector分享
date: 2019-06-27 15:47:34
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 预定义的Source和Sink
```
基于文件的Source
    readTextFile(path)
    readFile(fileInputFormat,path)
基于文件的Sink
    writeAsText
    writeAsCsv
基于Socket的Source
    socketTextStream
基于Socket的Sink
    writeToSocket
基于Collections,Iterators的Source
    fromCollection
    fromElements
标准输出,标准错误
    print
    printToError
```

---

# Bundled Connectors
```
Apache Kafka(source/sink)
Apache Cassandra(sink)
Amazon Kinesis Streams(source/sink)
ElasticSearch(sink)
Hadoop FileSystem(sink)
RabbitMQ(source/sink)
Apache NiFi(source/sink)
Twitter Streaming API(source)
```

---

# Apache Bahir中的连接器
```
Apache ActiveMQ(source/sink)
Apache Flume(sink)
Redis(sink)
Akka(sink)
Netty(source)
```

---

# Async I/O
```
使用connector并不是数据输入输出Flink的唯一方式
在Map,FlatMap中使用Async I/O方式读取外部数据库等
```

---

# Flink Kafka Consumer反序列化数据
```
将kafka中二进制数据转化为具体的java,scala对象
DeserializationSchema,T deserialize(byte[] message)
KeyedDeserializationSchema,T deserialize(byte[] messageKey,byte[] message,String topic,int partition,long offset):对于访问kafka key/value

常用
SimpleStringSchema:按字符串方式进行序列化,反序列化
TypeInformationSerializationSchema:基于Flink的TypeInformation来创建schema
JsonDeserializationSchema:使用jackson反序列化json格式消息,并返回ObjectNode,可以使用.get("property")方法来访问字段
```

---

# Flink Kafka Consumer消费起始位置
```
setStartFromGroupOffsets(默认)
    从Kafka记录的group.id的位置开始读取,如果没有根据anto.offset.reset设置
setStratFromEarliest
    从Kafka最早的位置读取
setStartFromLatest
    从Kafka最新数据开始读取
setStartFromTimestamp(long)
    从时间戳大于或等于指定时间戳的位置开始读取
setStartFromSpecificOffsets
    从指定的分区的offset位置开始读取,如指定的offsets中不存在某个分区,该分区从group offset位置开始读取

注意
    作业故障从CK自动恢复,以及手动做SP时,消费的位置从保存状态中恢复,与该配置无关
```

---

# Flink Kafka Consumer Topic Partition自动发现
```
原理:
    内部单独的线程获取kafka meta信息进行更新
flink.partition-discovery.interval-millis:发现时间间隔.默认false,设置为非负值开启

分区发现
    消费的Source Kafka Topic进行partition扩容
    新发现的分区,从earliest位置开始读取
Topic发现
    支持正则表达式描述topic名字
Pattern topicPattern = java.util.regex.Pattern.compile("topic[0-9]");
FlinkKafkaConsumer010<String> consumer = new FlinkKafkaConsumer010(topicPattern,new SimpleStringSchema(),properties);
```

---

# Flink Kafka Consumer Commit Offset方式
```
CK关闭
    依赖kafka客户端的auto commit定期提交offset
    需设置enable.anto.commit,auto.commit.interval.ms参数到consumer properties

CK开启
    Offset自己在ck state中管理和容错,提交Kafka仅作为外部监视消费进度
    通过setCommitOffsetsOnCheckpoints控制,CK成功之后,是否提交offset到kafka
```

---

# Flink Kafka Consumer时间戳提取/水位生成
```
per Kafka Partition WaterMark
    assignTimestampsAndWatermarks,每个partition一个assigner,水位为对个partition对齐后值
    不在KafkaSource生成WaterMark,会出现扔掉部分数据情况
```

---

# Flink Kafka Producer Producer分区
```
Producer分区
    FlinkFixedPartitioner(默认):parallellnstanceld % partitions.length
    Partitioner设置为null:round-robin kafka partitioner,维持过多链接
    Custom Partitioner:自定义分区
```

---

# Flink Kafka Producer Producer容错
```
Kafka 0.9 and 0.10
    setLogFailuresOnly:默认false.写失败时,是否打印失败log,不抛异常
    setFlushOnCheckpoint:默认true.ck时保证数据写到kafka
    at-least-once语义:setLogFailuresOnly(false)+setFlushOnCheckPoint(true)

Kafka 0.11
    FlinkKafkaProducer011,两阶段提交Sink结合Kafka事务,保证端到端精准一次
```