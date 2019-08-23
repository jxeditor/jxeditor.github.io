---
title: Flink读写Hbase之读
date: 2019-06-03 14:53:01
categories: 大数据
tags: 
    - flink
    - hbase
---

> 主要对Flink读取HBase数据做一个整理,方便快速进行业务代码开发,只针对于具体的方法操作,并不涉及Flink搭建

<!-- more -->

---

## 主要方式(3种)
- 通过env.addSource(new RichSourceFunction)的形式
- 通过env.createInput(new TableInputFormat)的形式
- 通过env.createInput(new HadoopInputFormat)的形式

---

## RichSourceFunction
```scala
val dataStream = env.addSource(new RichSourceFunction[(String, String)] {
    var conn: Connection = null
    var table: Table = null
    var scan: Scan = null

    override def open(parameters: Configuration): Unit = {
        val tableName = TableName.valueOf(TABLE_NAME)
        val conf: org.apache.hadoop.conf.Configuration = HBaseConfiguration.create()
        conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
        conf.set("hbase.zookeeper.property.clientPort", "2181")
        conn = ConnectionFactory.createConnection(conf)
        table = conn.getTable(tableName)
        scan = new Scan()
        scan.addFamily(Bytes.toBytes(TABLE_CF))
    }

    override def run(sourceContext: SourceFunction.SourceContext[(String, String)]): Unit = {
        val rs = table.getScanner(scan)
        val iterator = rs.iterator()
        while (iterator.hasNext) {
            val result = iterator.next()
            val rowKey = Bytes.toString(result.getRow)
            val value = Bytes.toString(result.getValue(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count")))
            sourceContext.collect((rowKey, value))
        }
    }

    override def cancel(): Unit = {
    }

    override def close(): Unit = {
        try {
            if (table != null) table.close()
            if (conn != null) conn.close()
        } catch {
            case e: Exception => println(e.getMessage)
        }
    }
})
```

---

## TableInputFormat
```scala
val tableInputFormat = new TableInputFormat[Tuple2[String, String]] {
    val tuple2 = new Tuple2[String, String]
    override def getScanner: Scan = {
        scan
    }
    override def getTableName: String = TABLE_NAME
    override def mapResultToTuple(result: Result): Tuple2[String, String] = {
        val key = Bytes.toString(result.getRow)
        val value = Bytes.toString(result.getValue(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count")))
        tuple2.setField(key, 0)
        tuple2.setField(value, 1)
        tuple2
    }
    override def configure(parameters: Configuration): Unit = {
        val tableName = TableName.valueOf(TABLE_NAME)
        var conn: Connection = null
        val conf: org.apache.hadoop.conf.Configuration = HBaseConfiguration.create()
        conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
        conf.set("hbase.zookeeper.property.clientPort", "2181")
        conn = ConnectionFactory.createConnection(conf)
        table = conn.getTable(tableName).asInstanceOf[HTable]
        scan = new Scan()
        scan.addFamily(Bytes.toBytes(TABLE_CF))
    }
}

val hbaseDs = env.createInput(tableInputFormat)
```

---

## HadoopInputFormat
> 对于TableInputFormat的优化,但是有一定的缺点,只能是全量的读取HBase表,不能指定rowKey去读取

```scala
val conf = HBaseConfiguration.create()
conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
conf.set("hbase.zookeeper.property.clientPort", "2181")
conf.set("hbase.defaults.for.version.skip", "true")
conf.set("mapred.output.dir", "hdfs://hadoop01:8020/demo")
conf.set(org.apache.hadoop.hbase.mapreduce.TableOutputFormat.OUTPUT_TABLE, "test1")
conf.set(org.apache.hadoop.hbase.mapreduce.TableInputFormat.INPUT_TABLE, "test")
conf.setClass("mapreduce.job.outputformat.class",
  classOf[org.apache.hadoop.hbase.mapreduce.TableOutputFormat[String]],
  classOf[org.apache.hadoop.mapreduce.OutputFormat[String, Mutation]])

val job = Job.getInstance(conf)
val hadoopIF = new HadoopInputFormat(new TableInputFormat(), classOf[ImmutableBytesWritable], classOf[Result], job)
val value = env.createInput(hadoopIF)
```

---

## 遇到的问题
### 1.在使用第三种方式HadoopInputFormat时,本地Idea运行没有问题,打包到Flink集群上运行会出现问题
```
org.apache.flink.client.program.ProgramInvocationException: The main method caused an error.
	at org.apache.flink.client.program.PackagedProgram.callMainMethod(PackagedProgram.java:546)
	at org.apache.flink.client.program.PackagedProgram.invokeInteractiveModeForExecution(PackagedProgram.java:421)
	at org.apache.flink.client.program.ClusterClient.run(ClusterClient.java:427)
	at org.apache.flink.client.cli.CliFrontend.executeProgram(CliFrontend.java:813)
	at org.apache.flink.client.cli.CliFrontend.runProgram(CliFrontend.java:287)
	at org.apache.flink.client.cli.CliFrontend.run(CliFrontend.java:213)
	at org.apache.flink.client.cli.CliFrontend.parseParameters(CliFrontend.java:1050)
	at org.apache.flink.client.cli.CliFrontend.lambda$main$11(CliFrontend.java:1126)
	at java.security.AccessController.doPrivileged(Native Method)
	at javax.security.auth.Subject.doAs(Subject.java:422)
	at org.apache.hadoop.security.UserGroupInformation.doAs(UserGroupInformation.java:1692)
	at org.apache.flink.runtime.security.HadoopSecurityContext.runSecured(HadoopSecurityContext.java:41)
	at org.apache.flink.client.cli.CliFrontend.main(CliFrontend.java:1126)
Caused by: java.lang.RuntimeException: Could not load the TypeInformation for the class 'org.apache.hadoop.io.Writable'. You may be missing the 'flink-hadoop-compatibility' dependency.
	at org.apache.flink.api.java.typeutils.TypeExtractor.createHadoopWritableTypeInfo(TypeExtractor.java:2082)
	at org.apache.flink.api.java.typeutils.TypeExtractor.privateGetForClass(TypeExtractor.java:1701)
	at org.apache.flink.api.java.typeutils.TypeExtractor.privateGetForClass(TypeExtractor.java:1643)
	at org.apache.flink.api.java.typeutils.TypeExtractor.createTypeInfoWithTypeHierarchy(TypeExtractor.java:921)
	at org.apache.flink.api.java.typeutils.TypeExtractor.privateCreateTypeInfo(TypeExtractor.java:781)
	at org.apache.flink.api.java.typeutils.TypeExtractor.createTypeInfo(TypeExtractor.java:735)
	at org.apache.flink.api.java.typeutils.TypeExtractor.createTypeInfo(TypeExtractor.java:731)
	at com.dev.flink.stream.hbase.develop.HBaseDemoOnFormat$$anon$3.<init>(HBaseDemoOnFormat.scala:66)
	at com.dev.flink.stream.hbase.develop.HBaseDemoOnFormat$.main(HBaseDemoOnFormat.scala:66)
	at com.dev.flink.stream.hbase.develop.HBaseDemoOnFormat.main(HBaseDemoOnFormat.scala)
	at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.lang.reflect.Method.invoke(Method.java:498)
	at org.apache.flink.client.program.PackagedProgram.callMainMethod(PackagedProgram.java:529)
	... 12 more
```
**解决方式:**
```
# 将依赖包flink-hadoop-compatibility复制到Flink集群lib目录下
mv flink-hadoop-compatibility_2.11-1.6.4.jar  /usr/local/flink-1.7.2/lib/
```
