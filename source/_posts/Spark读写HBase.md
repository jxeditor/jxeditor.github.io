---
title: Spark读写HBase
date: 2018-07-03 13:53:01
categories: 大数据
tags: 
    - Spark
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