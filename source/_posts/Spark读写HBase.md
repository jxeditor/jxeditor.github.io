---
title: Spark读写HBase
date: 2018-07-03 13:53:01
categories: 大数据
tags: 
    - spark
    - hbase
---
> 不考虑HbaseUtil这种方式

<!-- more -->
## 读取HBase
```scala
// 获得HBase的配置
val hbaseConf = HbaseUtil.getConf()
hbaseConf.set(org.apache.hadoop.hbase.mapreduce.TableOutputFormat.OUTPUT_TABLE, tableName)
val admin = new HBaseAdmin(hbaseConf)
if (!admin.isTableAvailable(tableName)){
    val tableDesc = new HTableDescriptor(TableName.valueOf(tableName))
    admin.createTable(tableDesc)
}

val hBaseRdd = sc.newAPIHadoopRDD(hbaseConf,classOf[TableInputFormat],classOf[org.apache.hadoop.hbase.io.ImmutableBytesWritable],classOf[org.apache.hadoop.hbase.client.Result])

val count = hBaseRdd.count()
hBaseRdd.foreach(x=>{
    val result = x._2
    // 获取行键
    val key = Bytes.toString(result.getRow)
    // 通过列簇和列名获取列
    val name = Bytes.toString(result.getValue("cf".getBytes,"name".getBytes))
})
```

---

## 写入HBase
```scala
// 获得HBase的配置
val hbaseConf = HbaseUtil.getConf()
messages.foreachRDD(rdd => {
  if (!rdd.isEmpty()) {
    HbaseUtil.getTable(hbaseConn, TABLE_NAME)
    val jobConf = HbaseUtil.getNewJobConf(hbaseConf, TABLE_NAME)
    // 先处理消息
    rdd.map(data => {
      val rowKey = data._2.toString
      val put = new Put(rowKey.getBytes())
      put.addColumn(TABLE_CF.getBytes(), "count".getBytes(), "1".getBytes())
      // 转成(Writable,Put)形式,调用spark函数写入HBase
      // saveAsHadoopDataset也是同理
      (new ImmutableBytesWritable(), put)
    }).saveAsNewAPIHadoopDataset(jobConf)
    // 再更新offsets
    km.updateZKOffsets(rdd)
  }
})
```

---

## HBaseUtil
```
object HbaseUtil {
    var conn: Connection = null
    var tables: HashMap[String, Table] = new HashMap[String, Table]
    def initConn() {
        if (conn == null || conn.isClosed) {
            println("----  Init Conn  -----")
            val conf = getConf()
            conn = ConnectionFactory.createConnection(conf)
        }
    }
    def getConn() = {
        initConn
        conn
    }
    def getConf() = {
        val conf = HBaseConfiguration.create()
        conf.set("hbase.zookeeper.quorum", HBASE_ZOOKEEPER)
        conf.set("hbase.zookeeper.property.clientPort", "2181")
        conf
    }
    def getTable(tablename: String) = {
        if (!getConn().getAdmin.tableExists(TableName.valueOf(tablename))) {
            conn.getAdmin.createTable(new HTableDescriptor(TableName.valueOf(tablename)).addFamily(new HColumnDescriptor("info")))
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
```