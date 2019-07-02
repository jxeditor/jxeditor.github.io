---
title: Flink读写Hbase之写
date: 2019-06-03 15:59:01
categories: 大数据
tags: 
    - flink
    - hbase
---
> 主要对Flink写入HBase数据做一个整理,方便快速进行业务代码开发,只针对于具体的方法操作,并不涉及Flink搭建

---
## 主要方式(4种)
- 通过env.addSink(new RichSinkFunction)的形式
- 通过自定义HBaseUtil操作类的形式
- 通过env.output(new OutputFormat)的形式
- 通过env.output(new HadoopOutputFormat)的形式

---

<!-- more -->

## RichSinkFunction
```scala
wordCounts.addSink(new RichSinkFunction[(String, String)] {
    var conn: Connection = null
    var table: Table = null
    var mutator: BufferedMutator = null

    override def open(parameters: Configuration): Unit = {
        val tableName = TableName.valueOf(TABLE_NAME)
        val conf: org.apache.hadoop.conf.Configuration = HBaseConfiguration.create()
        conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
        conf.set("hbase.zookeeper.property.clientPort", "2181")
        conn = ConnectionFactory.createConnection(conf)
        table = conn.getTable(tableName)
        mutator = conn.getBufferedMutator(new BufferedMutatorParams(tableName).writeBufferSize(10 * 1024 * 1024))
    }

    override def invoke(value: (String, String), context: SinkFunction.Context[_]): Unit = {
        val time1 = System.currentTimeMillis()
        val put = new Put(Bytes.toBytes(value._1))
        // put.addColumn(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count"), Bytes.toBytes(value._2.toString().replace("---", "")))
        put.addColumn(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count"), Bytes.toBytes(value._2 + "---"))
        mutator.mutate(put)
        // 输出数据
        mutator.flush()
        val time2 = System.currentTimeMillis()
        println(time2 - time1)
    }

    override def close(): Unit = {
        try {
            if (table != null) table.close()
            if (mutator != null) mutator.close()
            if (conn != null) conn.close()
        } catch {
            case e: Exception => println(e.getMessage)
        }
    }
})
```

---
## HBaseUtil
```scala
object HbaseUtil {
  var conn: Connection = null
  var tables: HashMap[String, Table] = new HashMap[String, Table]

  def initConn() {
    if (conn == null || conn.isClosed) {
      println("----  Init Conn  -----")
      val conf = HBaseConfiguration.create()
      conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
      conf.set("hbase.zookeeper.property.clientPort", "2181")
      conn = ConnectionFactory.createConnection(conf)
    }
  }

  def getConn() = {
    initConn
    conn
  }

  def getTable(tablename: String) = {
    if (!getConn().getAdmin.tableExists(TableName.valueOf(tablename))) {
      conn.getAdmin.createTable(
        new HTableDescriptor(
          TableName.valueOf(tablename)
        ).addFamily(
          new HColumnDescriptor("info")
        ))
    }
    tables.getOrElse(tablename, {
      initConn
      conn.getTable(TableName.valueOf(tablename))
    })
  }

  def put(tableName: String, p: Put) {
    getTable(tableName)
      .put(p)
  }

  def get(tableName: String, get: Get, cf: String, column: String) = {
    val r = getTable(tableName)
      .get(get)
    if (r != null && !r.isEmpty()) {
      new String(r.getValue(cf.getBytes, column.getBytes))
    } else null
  }

  //  接受配置文件
  /**
    * 用于直接建立HBase连接
    *
    * @param properties
    * @return
    */
  def getConf(properties: Properties) = {
    val conf = HBaseConfiguration.create()
    conf.set("hbase.zookeeper.quorum", properties.getProperty("hbase.zookeeper.quorum"))
    conf.set("hbase.zookeeper.property.clientPort", properties.getProperty("hbase.zookeeper.property.clientPort"))
    conf.set("hbase.master", properties.getProperty("hbase.master"))
    conf
  }

  /**
    * 获取连接
    *
    * @param conf
    * @return
    */
  def getConn(conf: Configuration) = {
    if (conn == null || conn.isClosed) {
      conn = ConnectionFactory.createConnection(conf)
    }
    conn
  }

  /**
    * 获取表,没有表则创建
    *
    * @param conn
    * @param tableName
    * @return
    */
  def getTable(conn: Connection, tableName: String) = {
    createTable(conn, tableName)
    conn.getTable(TableName.valueOf(tableName))
  }

  /**
    * 创建表
    *
    * @param conn
    * @param tableName
    */
  def createTable(conn: Connection, tableName: String) = {
    if (!conn.getAdmin.tableExists(TableName.valueOf(tableName))) {
      val tableDescriptor = new HTableDescriptor(TableName.valueOf(tableName))
      tableDescriptor.addFamily(new HColumnDescriptor("info".getBytes()))
      conn.getAdmin.createTable(tableDescriptor)
    }
  }

  /**
    * 提交数据
    *
    * @param conn
    * @param tableName
    * @param data
    */
  def putData(conn: Connection, tableName: String, data: Put) = {
    getTable(conn, tableName).put(data)
  }

  /**
    * 对表直接进行批量写入时使用
    *
    * @param conf
    * @param tableName
    * @return
    */
  def getNewJobConf(conf: Configuration, tableName: String) = {
    conf.set("hbase.defaults.for.version.skip", "true")
    conf.set(org.apache.hadoop.hbase.mapreduce.TableOutputFormat.OUTPUT_TABLE, tableName)
    conf.setClass("mapreduce.job.outputformat.class", classOf[org.apache.hadoop.hbase.mapreduce.TableOutputFormat[String]], classOf[org.apache.hadoop.mapreduce.OutputFormat[String, Mutation]])
    new JobConf(conf)
  }
}

// main
// 输入数据
wordCounts.map(x => {
  val put = new Put((x._1).getBytes)
  put.addColumn("info".getBytes, "count".getBytes, x._2.toString.getBytes)
  // 输出数据
  HbaseUtil.put("test.demo_", put)
})
```

--- 
## OutputFormat
```scala
val tableOuputFormat = new OutputFormat[Tuple2[String, String]] {
  var conn: Connection = null
  override def configure(configuration: Configuration): Unit = {
  }
  
  override def open(i: Int, i1: Int): Unit = {
    val conf: org.apache.hadoop.conf.Configuration = HBaseConfiguration.create()
    conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
    conf.set("hbase.zookeeper.property.clientPort", "2181")
    conn = ConnectionFactory.createConnection(conf)
  }
  
  override def writeRecord(it: Tuple2[String, String]): Unit = {
    val tableName = TableName.valueOf(TABLE_NAME)
    val put = new Put(Bytes.toBytes(it.f0))
    put.addColumn(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count"), Bytes.toBytes(it.f1 + "小猪猪"))
    conn.getTable(tableName).put(put)
  }
  
  override def close(): Unit = {
    try {
      if (conn != null) conn.close()
    } catch {
      case e: Exception => println(e.getMessage)
    }
  }
}
// 输入数据
val hbaseDs = env.createInput(tableInputFormat)
// 输出数据
hbaseDs.output(tableOutputFormat)
```

---
## HadoopOutputFormat
```scala
// 输入数据
val hbaseDs = env.createInput(tableInputFormat)
val hadoopOF = new HadoopOutputFormat[String, Mutation](new TableOutputFormat(), job)
println(hbaseDs.collect().length)
val ds = hbaseDs.map(x => {
  val put = new Put(x.f0.getBytes())
  put.addColumn(Bytes.toBytes(TABLE_CF), Bytes.toBytes("count"), Bytes.toBytes(x.f1 + "小猪猪"))
  (x.f0, put.asInstanceOf[Mutation])
})
// 输出数据
ds.output(hadoopOF)
```

---
## 优劣
> - 对于上述的四种方式,比较常见的是前三种,也是我在网上搜索Flink操作HBase数据出现次数较多的结果.
> - 但是根据实际的操作会发现,前三种方式写入HBase的速度,速度远远不如SparkRDD.saveAsNewAPIHadoopDataset操作.
> - 第四种方式是总结了Flink将数据转换成HFile的文件,然后进行Bulk Load操作.

** 如果你有更好的方式,欢迎和我联系 **















