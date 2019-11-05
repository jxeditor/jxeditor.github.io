---
title: 使用Spark2.0的坑
date: 2019-10-15 14:17:09
categories: 大数据
tags: spark
---

> 从Spark1转换到Spark2,总体逻辑可能没有什么变化,但是小细节会有很多坑

<!-- more -->

## 连接MySQL报No suitable driver
```scala
// 注册临时表
df.registerTempTable("demo")
val prop = new java.util.Properties
prop.setProperty("user","root")
prop.setProperty("password","123456")
prop.setProperty("driver","com.mysql.jdbc.Driver")
prop.setProperty("url","jdbc:mysql://127.0.0.1:3306/test")
sqlContext.sql("select name,age,sex from demo")
.write
.mode(org.apache.spark.sql.SaveMode.Append)
.jdbc(prop.getProperty("url"),"demo",prop) 
```

---

## Spark生成一个空的DataFrame
```
# 在1中可以直接用null,2中就不可以了
var df:DataFrame = null

# 生成一个无列的空DataFrame
var df = spark.emptyDataFrame

# 生成一个有列的空DataFrame
val schema = StructType(
  Seq(
    StructField("lie1", StringType, true),
    StructField("lie2", StringType, true),
    StructField("lie3", StringType, true)))
val df = spark.createDataFrame(sc.emptyRDD[Row], schema)
```

---

## 写Hive速度极其慢
```
使用insertinto,字段顺序与hive表字段顺序不一致导致
修改顺序后,速度正常
```