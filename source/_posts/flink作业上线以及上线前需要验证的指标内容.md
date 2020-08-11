---
title: flink技术选型相关
date: 2020-08-10 10:28:04
categories: 大数据
tags: flink
---

> 公司的相关需求越来越重视对毫秒级数据的处理,flink刚好在这方面暂有不可替代的优势;使得在技术选型上有着重要的地位

<!-- more -->
#### 数据源处理
```
根据业务的不同,实时数据源选取kafka,但是数据内容分为两块内容:
1.研发将实时日志数据打点至kafka上,数据格式json形式
2.使用debezium监控mysql的binlog,实时将mysql变更的数据捕获至kafka;数据格式json形式,并且使用before和after的形式来区分数据更变之前和更变之后的数据内容
```
方式2进行简单代码公共方法提取:
```
方式2进行简单区分:
import com.etiantian.bigdata.flink.graph.MapPoint
import org.json.JSONObject

import scala.util.Try

/**
  * 对数据分成多种形式处理
  * 0 表示只有key的形式
  * 1 表示有value，但是只有before    删除
  * 2 表示有value，但是只有after     添加
  * 3 表示有value，并且before和after都存在   更改
  */
class OptTypeMap extends MapPoint[String,(String,Int)] {
  override def process(stream: String): (String, Int) = {
    val x = new JSONObject(stream)
    var value = new JSONObject()
    var flag = 0
    if (Try(new JSONObject(x.get("value").toString.toLowerCase)).isSuccess) {
      value = new JSONObject(x.get("value").toString.toLowerCase)
      if (Try(value.getJSONObject("before")).isSuccess)
        if (Try(value.getJSONObject("after")).isSuccess)
          flag = 3
        else
          flag = 1
      else
        flag = 2
    }
    (stream, flag)
  }
}
```

#### 选取语义使用exactly once
```
一个sender发送一条message到recevier;根据receiver出现fail时sender如何处理fail,可以降message delivery分为三种语义:
1.at most once: 对于一条message,receiver最多收到一次
sender把massage发送给receiver;无论receiver是否收到message,sender都不再重发message
2.at least once : 对于一条message,receiver最少收到一次
sender把message发送给receiver;当receiver在规定时间内没有回复ack或回复了error信息,那么sender重发这条message给receiver,知道sender收到receiver的ack
3.exactly once:对于一条message,receiver确保只收到一次
选取原因:
根据公司业务需求对准确的数据量的要求性比较高,最后选用了exactly once;其他语义也进行了测试,确定了确实有数据量变多或者变少的情况

exactly once模式:
flink会持续对整个系统做snapslot,然后把global state存储到master node或HDFS;当系统出现failure,flink会停止数据处理,然后把系统恢复到最近的一次checkpoint

flink的snapslot算法:
为了消去记录channel state,process在接收到第一个barrier后不会马上做snapslot
而是等待接受其他上游channel的barrier
在等待期间,process会把barrier已到的channel的record放入input buffer
当所有上游channel的barrier到齐后,process才记录自身state,之后向所有下游channel发送barrier
因为先到的barrier会等待后到的barrier,所有barrier相当于同时到达process;因此,该process的上游channel的state都是空集,避免了去记录channel的state
```

#### 一般关注的指标点
```
1.作业状态: 作业是否出故障,作业是否存活,作业是否稳定运行
可参考监控脚本的相关文章
[https://jxeditor.github.io/2020/08/10/shell%E8%84%9A%E6%9C%AC%E7%9B%91%E6%8E%A7flink%E9%A1%B9%E7%9B%AE%E6%98%AF%E5%90%A6%E6%AD%A3%E5%B8%B8%E8%BF%90%E8%A1%8C/]
2.作业性能:作业的处理延迟,数据倾斜问题是否存在,性能瓶颈情况(技术选型必须测试内容)
1) flink接收kafka的数据性能情况的压力测试(每秒上万没有问题)
2) flink读取或者写入hbase的数据性能情况测试
分为客户端方式和批处理读写方式
i:客户端,每秒的处理速度5000条左右
ii:批处理方式:5-7w左右
3.业务逻辑:上游数据质量,新上的逻辑是否存在问题,数据是否存在丢失(新作业上线必须测试的内容)
```

#### sink落地
```
主要落地有:s3,hbase,es
1.s3主要用于实时仓库处理
2.hbase主要用于flink的中间表,相当于维表方式;除了共享课直接提供接口的方式进行调用
3.es主要提供给搜索系统,实时报表展示和用户行为轨迹
```

#### 存储s3的方式
方式一:SimpleStringEncoder
```
flink1.11之前一般使用两种方式:
方式一:SimpleStringEncoder
按照行以文本的方式写到文件中,每行一条记录;一般来说文本存储方式无压缩
一般将dataStream清洗成字符串拼接的方式;使用withBucketAssigner进行自定义分区
```
```
val builder = StreamingFileSink.forRowFormat(
//              new Path("E:\\\\aa\\\\flink"),new SimpleStringEncoder[String]("UTF-8"))
        new Path(config.getProperty("s3.all.path")),new SimpleStringEncoder[String]("UTF-8"))
      builder.withBucketAssigner(new BucketAssigner[String,String] {
        override def getBucketId(data: String, context: BucketAssigner.Context): String = {
          s"c_date=${data.split("\\|")(4)}"
        }
        override def getSerializer: SimpleVersionedSerializer[String] = SimpleVersionedStringSerializer.INSTANCE
      }).withRollingPolicy(
        DefaultRollingPolicy.builder()
          .withRolloverInterval(TimeUnit.MINUTES.toMillis(5))     //至少5分钟的数据
          .withInactivityInterval(TimeUnit.MINUTES.toMillis(30))   //最近30分钟未收到新的记录
          .withMaxPartSize(1024*1024*1024)   //文件大小达到1G
          .build()
      )

      result.filter(!_.split("\\|")(0).equals("null")).addSink(builder.build())
```
方式二:CustomParquetAvroWriters(自定义函数)
```
parquet,使用gzip压缩,体积较小,运算效率较高;采用二进制的存储方式
使用方式自定义相关类,进行引用调用的方式
```
```
import org.apache.avro.Schema;
import org.apache.avro.generic.GenericData;
import org.apache.avro.generic.GenericRecord;
import org.apache.avro.reflect.ReflectData;
import org.apache.avro.specific.SpecificData;
import org.apache.avro.specific.SpecificRecordBase;
import org.apache.flink.formats.parquet.ParquetBuilder;
import org.apache.flink.formats.parquet.ParquetWriterFactory;
import org.apache.parquet.avro.AvroParquetWriter;
import org.apache.parquet.hadoop.ParquetWriter;
import org.apache.parquet.hadoop.metadata.CompressionCodecName;
import org.apache.parquet.io.OutputFile;

import java.io.IOException;

public class CustomParquetAvroWriters {
    private CustomParquetAvroWriters() {
    }

    public static <T extends SpecificRecordBase> ParquetWriterFactory<T> forSpecificRecord(Class<T> type, CompressionCodecName compressionCodecName) {
        final String schemaString = SpecificData.get().getSchema(type).toString();
        final ParquetBuilder<T> builder = (out) -> createAvroParquetWriter(schemaString, SpecificData.get(), out, compressionCodecName);
        return new ParquetWriterFactory<>(builder);
    }

    //compressionCodecName 压缩算法
    public static ParquetWriterFactory<GenericRecord> forGenericRecord(Schema schema, CompressionCodecName compressionCodecName) {
        final String schemaString = schema.toString();
        final ParquetBuilder<GenericRecord> builder = (out) -> createAvroParquetWriter(schemaString, GenericData.get(), out, compressionCodecName);
        return new ParquetWriterFactory<>(builder);
    }

    //compressionCodecName 压缩算法
    public static <T> ParquetWriterFactory<T> forReflectRecord(Class<T> type, CompressionCodecName compressionCodecName) {
        final String schemaString = ReflectData.get().getSchema(type).toString();
        final ParquetBuilder<T> builder = (out) -> createAvroParquetWriter(schemaString, ReflectData.get(), out, compressionCodecName);
        return new ParquetWriterFactory<>(builder);
    }

    //compressionCodecName 压缩算法
    private static <T> ParquetWriter<T> createAvroParquetWriter(
            String schemaString,
            GenericData dataModel,
            OutputFile out,
            CompressionCodecName compressionCodecName) throws IOException {
        final Schema schema = new Schema.Parser().parse(schemaString);

        return AvroParquetWriter.<T>builder(out)
                .withSchema(schema)
                .withDataModel(dataModel)
                .withCompressionCodec(compressionCodecName)//压缩算法
                .build();

    }
}
```
应用自定义类(将dataStream的数据清洗成Option(对象内容))
```
val result = dataStream.map(x => {
      val data = x.getMsg.asInstanceOf[Tuple3[Long, String, String]]
      val key = data._1
      val c_time = data._2
      var c_date = ""
      val yes_day = LocalDate.now().plusDays(-1).toString
      if (c_time.substring(0,10) >= yes_day){
        c_date = c_time.substring(0,10)
      }else
        c_date = yes_day
      val file_path = data._3
      if (key != 0 && c_time != "" && file_path != "" && c_date != ""){
        Option(DeleteFileInfo(key,c_time,file_path,c_date))
//        key + "|" + c_time + "|" + file_path + "|" + c_date
      }else
        Option.empty
    })
    
val sink = StreamingFileSink
      .forBulkFormat(new Path(config.getProperty("s3.delete.path")), CustomParquetAvroWriters.forReflectRecord(classOf[DeleteFileInfo],CompressionCodecName.SNAPPY))
      .withBucketAssigner(new BucketAssigner[DeleteFileInfo, String] {
        override def getBucketId(element: DeleteFileInfo, context: BucketAssigner.Context): String = {
          s"c_date=${element.c_date}"
        }

        override def getSerializer: SimpleVersionedSerializer[String] = {
          SimpleVersionedStringSerializer.INSTANCE
        }
      })
      .build()

    result.filter(x=> x!= None).map(x=>x.get).addSink(sink)
```

#### sink存储至hbase
```
一般使用hbase的内容有两种方式:
方式一:客户端调用的方式
方式二:批数据存储的方式
调用次数比较多,一般使用common-jar的形式上传到公司的maven仓库,全公司只要引用maven地址就可以直接调用
```
方式一:客户端调用(hbase-util自定义可直接作为调用工具)
```
package com.etiantian.bigdata

import java.util.Properties
import java.util.concurrent.{ExecutorService, Executors}

import org.apache.hadoop.conf.Configuration
import org.apache.hadoop.hbase.client._
import org.apache.hadoop.hbase.io.ImmutableBytesWritable
import org.apache.hadoop.hbase.mapreduce.TableOutputFormat
import org.apache.hadoop.hbase.util.Bytes
import org.apache.hadoop.hbase.{HBaseConfiguration, HColumnDescriptor, HTableDescriptor, TableName}
import org.apache.hadoop.mapreduce.Job
import scala.collection.convert.wrapAsJava._

object HbaseUtil {
  @transient private var hbaseConn:Connection = null
  private val hbaseConf: Configuration = HBaseConfiguration.create()
  private val replaceToken = "#S%P#"

  def init(properties: Properties):Unit = {
    hbaseConf.set("hbase.zookeeper.quorum", properties.getProperty("hbase.zookeeper.quorum"))
    hbaseConf.set("hbase.zookeeper.property.clientPort", properties.getProperty("hbase.zookeeper.property.clientPort"))
    synchronized {
      if (hbaseConn == null) {
        println("##########################  init hbase properties and connection synchronized  ##########################")
        hbaseConn = ConnectionFactory.createConnection(
          hbaseConf, Executors.newFixedThreadPool(properties.getOrDefault("hbase.poolSize", "8").toString.toInt)
        )
      }
    }
  }

  def getConn(): Connection = {
    hbaseConn
  }

  private def getTable(tableName: String): Table = {
    getConn.getTable(getTableName(tableName))
  }

  private def getAdmin(): Admin = {
    getConn().getAdmin
  }

  /**
    * Change the method to createJob
    * @param tableName
    * @param family
    * @return
    */
  @Deprecated
  def create(tableName: TableName, family: String) = {
    hbaseConf.set(TableOutputFormat.OUTPUT_TABLE, tableName.toString)

    val job = Job.getInstance(hbaseConf)
    job.setOutputKeyClass(classOf[ImmutableBytesWritable])
    job.setOutputValueClass(classOf[Put])
    job.setOutputFormatClass(classOf[TableOutputFormat[ImmutableBytesWritable]])

    job
  }

  def createJob(tableName: TableName, family: String) = {
    hbaseConf.set(TableOutputFormat.OUTPUT_TABLE, tableName.toString)

    val job = Job.getInstance(hbaseConf)
    job.setOutputKeyClass(classOf[ImmutableBytesWritable])
    job.setOutputValueClass(classOf[Put])
    job.setOutputFormatClass(classOf[TableOutputFormat[ImmutableBytesWritable]])

    job
  }

  private def getTableName(tableName: String): TableName = TableName.valueOf(tableName)

  def tableExists(tableName: String): Boolean = {
    getAdmin.tableExists(getTableName(tableName))
  }

  def createTable(tableName: String, family: String*): Unit = {
    if (!tableExists(tableName)) {
      val descriptor = new HTableDescriptor(getTableName(tableName))
      family.foreach(x => {
        val hColumnDescriptor = new HColumnDescriptor(x)
        descriptor.addFamily(hColumnDescriptor)
      })

      getAdmin.createTable(descriptor)
    }
  }

  def createTable(tableName: String, family: Seq[String], splits: Seq[String]): Unit = {
    if (!tableExists(tableName)) {
      val descriptor = new HTableDescriptor(getTableName(tableName))
      family.foreach(x => {
        val hColumnDescriptor = new HColumnDescriptor(x)
        descriptor.addFamily(hColumnDescriptor)
      })

      val splitsArray = splits.map(Bytes.toBytes).toArray

      getAdmin.createTable(descriptor, splitsArray)
    }
  }

  def truncTable(tableName: String, preserveSplits: Boolean): Unit = {
    val admin = getAdmin
    admin.disableTable(getTableName(tableName))
    admin.truncateTable(getTableName(tableName), preserveSplits)
  }

  def truncTable(tableName: String): Unit = {
    truncTable(tableName, false)
  }

  def dropTable(tableName: String): Unit = {
    val admin = getAdmin
    admin.disableTable(getTableName(tableName))
    admin.deleteTable(getTableName(tableName))
  }

  def getValueByKey(tableName: String, key: String): Result = {
    val table = getTable(tableName)
    table.get(new Get(Bytes.toBytes(key)))
  }

  def getColumnValue(result: Result, family: String, column: String): String = {
    val bytesValue = result.getValue(Bytes.toBytes(family), Bytes.toBytes(column))
    if (bytesValue == null) null else Bytes.toString(bytesValue)
  }

  def getColumnValue(tableName: String, key: String, family: String, column: String): String = {
    val result = getValueByKey(tableName, key)
    getColumnValue(result, family, column)
  }

  def insert(tableName: String, put: Put): Unit = {
    val table = getTable(tableName)
    table.put(put)
  }

  def insert(tableName: String, putList: List[Put]): Unit = {
    val table = getTable(tableName)
    table.put(putList)
  }

  def insert(tableName: String, key: String, family: String, column: String, value: String): Unit = {
    val put = new Put(Bytes.toBytes(key))
    put.addColumn(Bytes.toBytes(family), Bytes.toBytes(column), if (value == null) null else Bytes.toBytes(value))
    insert(tableName, put)
  }

  def deleteRow(tableName: String, key: String): Unit = {
    getTable(tableName).delete(new Delete(Bytes.toBytes(key)))
  }

  def deleteRowList(tableName: String, keyList: List[String]): Unit = {
    getTable(tableName).delete(keyList.map(key =>new Delete(Bytes.toBytes(key))))
  }

  def deleteMulti(tableName: String, delList: List[Delete]): Unit = {
    getTable(tableName).delete(delList)
  }
  /**
    * 插入并替换原有行
    */
  def replaceRow(tableName: String, put: Put): Unit = {
    deleteRow(tableName, Bytes.toString(put.getRow))
    insert(tableName, put)
  }

  def columnPlus(tableName: String, key: String, family: String, column: String, plusNum: Long): Long = {
    var columnVal = getColumnValue(tableName, key, family, column).toLong
    columnVal += plusNum
    insert(tableName, key, family, column, columnVal.toString)
    columnVal
  }

  def columnPlus(tableName: String, key: String, family: String, column: String): Long = {
    columnPlus(tableName, key, family, column, 1)
  }

  def insertList[T](tableName: String, key: String, family: String, column: String, values: List[T], separator: String): Unit = {
    val put = new Put(Bytes.toBytes(key))
    put.addColumn(Bytes.toBytes(family), Bytes.toBytes(column), if (values == null) null else {
      Bytes.toBytes(values.map(x => {
        x.toString.replaceAll(separator, replaceToken)
      }).mkString(separator))
    })
    insert(tableName, put)
  }

  def insertList[T](tableName: String, key: String, family: String, column: String, values: List[T]): Unit = {
    insertList[T](tableName, key, family, column, values, ",")
  }

  def getList[T](tableName: String, key: String, family: String, column: String, separator: String): List[T] = {
    val value = getColumnValue(tableName, key, family, column)
    if (value != null && !value.equals("")) value.split(separator).map(_.replaceAll(replaceToken, separator).asInstanceOf[T]).toList else null
  }

  def getList[T](tableName: String, key: String, family: String, column: String): List[T] = {
    getList[T](tableName, key, family, column, ",")
  }

  def addToList[T](tableName: String, key: String, family: String, column: String, t: T, separator: String): Unit = {
    val newValue = t.toString.replaceAll(separator, replaceToken)
    val value = getColumnValue(tableName, key, family, column)
    if (value != null && !value.equals(""))
      insert(tableName, key, family, column, value + separator + newValue)
    else
      insert(tableName, key, family, column, newValue)
  }

  def addToList[T](tableName: String, key: String, family: String, column: String, t: T): Unit = {
    addToList[T](tableName, key, family, column, t, ",")
  }

  /**
    * 添加到list中，list 会去重
    */
  def addUniqueToList[T](tableName: String, key: String, family: String, column: String, t: T, separator: String): Unit = {
    val newValue = t.toString.replaceAll(separator, replaceToken)
    val value = getColumnValue(tableName, key, family, column)
    if (value != null && !value.equals("")) {
      val list = value.split(separator).toList :+ newValue
      insertList(tableName, key, family, column, list.distinct, separator)
    }
    else
      insert(tableName, key, family, column, newValue)
  }

  /**
    * 添加到list中，list 会去重
    */
  def addUniqueToList[T](tableName: String, key: String, family: String, column: String, t: T): Unit = {
    addUniqueToList(tableName, key, family, column, t, ",")
  }

  def removeFromList[T](tableName: String, key: String, family: String, column: String, t: T, separator: String): Unit = {
    val newValue = t.toString.replaceAll(separator, replaceToken)
    val value = getColumnValue(tableName, key, family, column)
    if (value != null && !value.equals("")) {
      insertList(
        tableName,
        key,
        family,
        column,
        value.split(separator).filter(!_.equals(newValue)).toList,
        separator
      )
    }
  }

  def removeFromList[T](tableName: String, key: String, family: String, column: String, t: T): Unit = {
    removeFromList[T](tableName, key, family, column, t, ",")
  }
}

```

```
调用方式:
val properties = new Properties()
properties.setProperty("hbase.zookeeper.quorum", conf.getProperty("hbase.zookeeper.quorum"))
properties.setProperty("hbase.zookeeper.property.clientPort", conf.getProperty("hbase.zookeeper.port"))

HbaseUtil.init(properties)

val props = columns.split(",").toList
val rowkey = content.get(key).toString
val put = new Put(rowkey.getBytes)
props.map(prop => {
              if (content.has(prop) && !key.contains(prop)) {
                opt match {
                  case 1 => {
                    put.addColumn(famliy.getBytes, prop.getBytes, null)
                    HbaseUtil.insert(newTable, put)
                  }
                  case 2 => {
                    put.addColumn(famliy.getBytes, prop.getBytes, content.get(prop).toString.getBytes)
                    HbaseUtil.insert(newTable, put)
                  }
                }
              }
})
```

方式二:批处理存储(主要重写了HBaseOutputFormat继承OutputFormat)
```
package com.etiantian.bigdata.common

import java.util.Properties

import org.apache.flink.api.common.io.OutputFormat
import org.apache.flink.configuration.Configuration
import org.apache.hadoop.hbase.client.{Connection, ConnectionFactory, Put, Table}
import org.apache.hadoop.hbase.{HBaseConfiguration, HConstants, TableName}

class HBaseOutputFormat(topic:String,zk:Properties) extends OutputFormat[Put] {
  var table: Table = null
  var conf: org.apache.hadoop.conf.Configuration = null
  var flinkConf: Configuration = new Configuration()
  var tableName: String = null
  var conn: Connection = null

  def setConfiguration(configuration: Configuration) = {
    flinkConf = configuration
  }

  def getConfig(field: String): Any = {
    if (flinkConf != null) flinkConf.getString(field, null) else null
  }

  override def configure(configuration: Configuration) = {
    configuration.addAll(flinkConf)
//    println("=================================="+ configuration+"============================")
    conf = HBaseConfiguration.create()
    conf.set(HConstants.ZOOKEEPER_QUORUM, configuration.getString("quorum",zk.getProperty("hbase.zookeeper.quorum")))
//    conf.set(HConstants.ZOOKEEPER_QUORUM, "cdh132,cdh133,cdh134")
    conf.set(HConstants.ZOOKEEPER_CLIENT_PORT, "2181")

    tableName = configuration.getString("tableName", topic)
  }

  override def writeRecord(it: Put) = {
    table.put(it)
  }

  override def close() = {
    if (table != null) table.close
    if (conn != null) conn.close
  }

  override def open(i: Int, i1: Int) = {
    conn = ConnectionFactory.createConnection(conf)
    table = conn.getTable(TableName.valueOf(tableName))
  }
}
```
实际应用
```
/* 创建hbase表
  * create 'aixueOnline', 'info',SPLITS => ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  * create 'accessLogTopic', 'info',SPLITS => ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  * create 'logTopic', 'info',SPLITS => ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  * 保留分区清除数据
  * truncate_preserve 'action_logs_test'
  * 修改属性:  7天过期
  * alter 'aixueOnline', NAME =>'info', TTL => 604800
  * alter 'accessLogTopic', NAME =>'info', TTL => 604800
  * alter 'logTopic',  NAME =>'info', TTL => 604800
  * /
import java.io.{File, FileInputStream}
import java.util
import java.util.Properties

import com.etiantian.bigdata.common.HBaseOutputFormat
import org.apache.flink.streaming.api.scala.{DataStream, StreamExecutionEnvironment}
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer010
import org.apache.hadoop.hbase.client.Put
import org.json.JSONObject
import org.apache.flink.api.scala._
import org.apache.flink.runtime.state.filesystem.FsStateBackend
import org.apache.flink.streaming.api.CheckpointingMode
import org.apache.flink.streaming.api.environment.CheckpointConfig.ExternalizedCheckpointCleanup

import scala.util.Random

val configFile = new File(args(0))
val conf = new Properties()
conf.load(new FileInputStream(configFile))
val properties = new Properties()
val hbaseConfig = new Properties()
hbaseConfig.setProperty("hbase.zookeeper.quorum", conf.getProperty("hbase.zookeeper.quorum"))
hbaseConfig.setProperty("hbase.zookeeper.property.clientPort", conf.getProperty("hbase.zookeeper.port"))

dataStream.filter(oneTopic(topic1,_)).map(writeToHBase(_)).writeUsingOutputFormat(new HBaseOutputFormat(topic1,hbaseConfig))
```

#### 存储es方式
```
可以分为dataStream和flink sql两种方式:
方式一:dataStream.addSink(new ElasticsearchSink进行重写process方法)

dataStream.addSink(new ElasticsearchSink(conf, addressList, new ElasticsearchSinkFunction[MsgContext] {
      override def process(t: MsgContext, runtimeContext: RuntimeContext, requestIndexer: RequestIndexer) = {
        val jsonXContentBuilder = JsonXContent.contentBuilder().startObject()
        val message = t.getMsg.asInstanceOf[Tuple9[String,String, String, String, String, String, String, String, String]]
        var schoolId = message._1
        val cDate = message._2
        val schoolName = message._3
        val cTime = message._4
        val province = message._5
        val city = message._6
        val actorTye = message._7
        val jid = message._8
        val district = message._9

        val processTime = LocalDateTime.now()
        jsonXContentBuilder.field("process_time", processTime)

        jsonXContentBuilder.field("c_time", cTime)
        jsonXContentBuilder.field("school_name", schoolName)
        jsonXContentBuilder.field("province", province)
        jsonXContentBuilder.field("city", city)
        jsonXContentBuilder.field("actor_type", actorTye)
        jsonXContentBuilder.field("school_id", schoolId)
        jsonXContentBuilder.field("jid", jid)
        jsonXContentBuilder.field("district", district)
        jsonXContentBuilder.endObject()


        //捕获es插入相同id时的异常
        val id = jid + "," + cDate
        val index = new UpdateRequest().index(
          "flink_count_action_user"
        ).`type`(
          "flink_count_action_user"
        ).id(id).docAsUpsert(true).doc(jsonXContentBuilder)
//          .create(true).id(id).source(jsonXContentBuilder)
        requestIndexer.add(index)
      }
    }, new ActionRequestFailureHandler {
      @throws(classOf[Throwable])
      override def onFailure(index: ActionRequest, failure: Throwable, i: Int, requestIndexer: RequestIndexer): Unit = {
        if (ExceptionUtils.findThrowable(failure, classOf[VersionConflictEngineException]).isPresent) {
          //          requestIndexer.add(index)
        }
        else {
          throw failure
        }
      }
    }))
  }
```

```
方式二:使用flink sql直接存储的方式(insert into)
tenv.sqlUpdate(
      s"""
         |CREATE TABLE test_zsd_01 (
         | question_id BIGINT,
         | bodys STRING,
         | type BIGINT,
         | difficult BIGINT,
         | paper_type_id BIGINT,
         | status BIGINT
         |) WITH (
         | 'connector.type' = 'elasticsearch',
         | 'connector.version' = '6',
         | 'connector.hosts' = '$esHosts',
         | 'connector.index' = 'test_zsd',
         | 'connector.document-type' = 'test_zsd',
         | 'update-mode' = 'upsert',
         | 'format.type' = 'json',
         | 'connector.bulk-flush.max-actions'='1'
         |)
         |""".stripMargin)


    tenv.sqlUpdate(
      """
        | INSERT INTO test_zsd_01
        | select
        |question_id ,
        |LAST_VALUE(bodys) bodys,
        |LAST_VALUE(ques_type) ques_type,
        |LAST_VALUE(difficult) difficult,
        |LAST_VALUE(paper_type_id) paper_type_id,
        |LAST_VALUE(status) status from
        |(SELECT CAST(question_id as BIGINT) question_id,
        |bodys,
        |CAST(ques_type as BIGINT) ques_type,
        |CAST(difficult as BIGINT) difficult,
        |CAST(paper_type_id as BIGINT) paper_type_id,
        |CAST(status as BIGINT) status from result_table) aa group by question_id
      """.stripMargin)
```
