---
title: Flink实时维表Join
date: 2019-12-24 15:25:03
categories: 大数据
tags: flink
---

> 维表是一张实时变化的表,流表需要去Join维表,如何实现这种需求

<!-- more -->

官网上有这样的例子,只是没有详细去看,还是学的不认真
[传送门](https://ci.apache.org/projects/flink/flink-docs-release-1.9/dev/table/streaming/joins.html)

## Joins in Continuous Queries(Join连续查询)
### Regular Joins(定期Join)
```sql
SELECT * FROM Orders
INNER JOIN Product
ON Orders.productId = Product.id
```

---

### Time-windowed Joins(时间窗口Join)
```sql
SELECT *
FROM
  Orders o,
  Shipments s
WHERE o.id = s.orderId AND
      o.ordertime BETWEEN s.shiptime - INTERVAL '4' HOUR AND s.shiptime
```

---

### Join with a Temporal Table Function(时间表函数连接)
重点需要知道TemporalTable如何创建
```sql
Order订单表,RatesHistory汇率表
想要获取不同时间的不同汇率比

SELECT * FROM Orders;

rowtime amount currency
======= ====== =========
10:15        2 Euro
10:30        1 US Dollar
10:32       50 Yen
10:52        3 Euro
11:04        5 US Dollar

SELECT * FROM RatesHistory;

rowtime currency   rate
======= ======== ======
09:00   US Dollar   102
09:00   Euro        114
09:00   Yen           1
10:45   Euro        116
11:15   Euro        119
11:49   Pounds      108
```

**时间表函数/时间表创建**:
```scala
# 定义时间表函数
val env = StreamExecutionEnvironment.getExecutionEnvironment
val tEnv = StreamTableEnvironment.create(env)

val ratesHistoryData = new mutable.MutableList[(String, Long)]
ratesHistoryData.+=(("US Dollar", 102L))
ratesHistoryData.+=(("Euro", 114L))
ratesHistoryData.+=(("Yen", 1L))
ratesHistoryData.+=(("Euro", 116L))
ratesHistoryData.+=(("Euro", 119L))

val ratesHistory = env
  .fromCollection(ratesHistoryData)
  .toTable(tEnv, 'r_currency, 'r_rate, 'r_proctime.proctime)

tEnv.registerTable("RatesHistory", ratesHistory)

// 在TableAPI中使用
val rates = ratesHistory.createTemporalTableFunction('r_proctime, 'r_currency) 
// 在SQL中使用
tEnv.registerFunction("Rates", rates)

# 定义时间表,只被Blink支持
val env = StreamExecutionEnvironment.getExecutionEnvironment
val tEnv = TableEnvironment.getTableEnvironment(env)

val rates = new HBaseTableSource(conf, "Rates")
rates.setRowKey("currency", String.class)
rates.addColumn("fam1", "rate", Double.class)

tEnv.registerTableSource("Rates", rates)
```

**实现**:
```sql
# 不使用时间表
SELECT
  SUM(o.amount * r.rate) AS amount
FROM Orders AS o,
  RatesHistory AS r
WHERE r.currency = o.currency
AND r.rowtime = (
  SELECT MAX(rowtime)
  FROM RatesHistory AS r2
  WHERE r2.currency = o.currency
  AND r2.rowtime <= o.rowtime);

# 使用时间表
SELECT
  o.amount * r.rate AS amount
FROM
  Orders AS o,
  LATERAL TABLE (Rates(o.rowtime)) AS r
WHERE r.currency = o.currency
```

---

### Join with a Temporal Table(时间表连接)
```sql
# 不是任何表都可以作为时间表,作为时间表的只能是LookupableTableSource
# LookupableTableSource只被Blink支持
# 仅在SQL中支持,而在Table API中尚不支持
# Flink当前不支持事件时间时间表连接

SELECT
  o.amout, o.currency, r.rate, o.amount * r.rate
FROM
  Orders AS o
  JOIN LatestRates FOR SYSTEM_TIME AS OF o.proctime AS r
  ON r.currency = o.currency;

SELECT
  SUM(o_amount * r_rate) AS amount
FROM
  Orders
  JOIN LatestRates FOR SYSTEM_TIME AS OF o_proctime
  ON r_currency = o_currency;
```

---

## 实际需求 
MySQL中维表实时变化,流表需要进行维表join
```scala
package com.test.flink.stream.mysql

import org.apache.flink.api.java.io.jdbc.{JDBCOptions, JDBCTableSource}
import org.apache.flink.api.scala._
import org.apache.flink.streaming.api.scala.{DataStream, StreamExecutionEnvironment}
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.table.api.scala.{StreamTableEnvironment, _}
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2019-12-24 13:41
 * @Description:
 */
object DoubleStreamJDBCDemo {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    val settings = EnvironmentSettings.newInstance()
      .useBlinkPlanner()
      .inStreamingMode()
      .build()
    val tEnv = StreamTableEnvironment.create(env, settings)
    val jdbcOptions = JDBCOptions.builder()
      .setDriverName("com.mysql.jdbc.Driver")
      .setDBUrl("jdbc:mysql://localhost:3306/world?autoReconnect=true&failOverReadOnly=false&useSSL=false")
      .setUsername("root")
      .setPassword("123456")
      .setTableName("test")
      .build()
    val tableSchema = TableSchema.builder()
      .field("uid", DataTypes.INT())
      .build()
    val jdbcTableSource = JDBCTableSource.builder.setOptions(jdbcOptions).setSchema(tableSchema).build
    tEnv.registerTableSource("sessions", jdbcTableSource)

    val ds = env.socketTextStream("eva", 9999, '\n')
    val demo: DataStream[Demo] = ds.flatMap(_.split(" ")).map(x => {
      Demo(x.toInt, "test")
    })
    val table = tEnv.sqlQuery("SELECT * FROM sessions")

    tEnv.registerDataStream("demoTable", demo, 'user, 'result, 'proctime.proctime)

    val result = tEnv.sqlQuery("select * from demoTable a left join sessions FOR SYSTEM_TIME AS OF a.proctime AS b ON `a`.`user` = `b`.`uid`")
    tEnv.toRetractStream[Row](result).print
    tEnv.toAppendStream[Order](table).print
    tEnv.execute("")
  }

  case class Order(user: Int)
  case class Demo(user: Int, result: String)
}
```