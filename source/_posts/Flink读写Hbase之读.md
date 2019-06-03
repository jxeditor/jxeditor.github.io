---
title: Flink读写Hbase之读
date: 2019-06-03 14:53:01
categories: 大数据
tags: 
    - flink
    - hbase
---
> 主要对Flink读取HBase数据做一个整理,方便快速进行业务代码开发,只针对于具体的方法操作,并不涉及Flink搭建

---
## 主要方式(2种)
- 通过env.addSource(new RichSourceFunction)的形式
- 通过env.createInput(new TableInputFormat)的形式

---
<!-- more -->

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
> 在进行写HBase时,因为速度不理想,所以对于Format这种方式有新的写法,但是读操作并没有去进行修改,如果有更好的形式,欢迎和我联系

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

