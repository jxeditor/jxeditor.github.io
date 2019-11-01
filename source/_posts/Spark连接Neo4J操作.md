---
title: Spark连接Neo4J操作
date: 2019-11-01 08:53:58
categories: 大数据
tags: 
- spark
- neo4j
---

> Spark对于Neo4J进行整合

<!-- more -->

> [Github](https://github.com/neo4j-contrib/neo4j-spark-connector/tree/master)

## 依赖
```
# 如果是Spark1的话使用1.0.0-RC1
<dependencies>
  <!-- list of dependencies -->
  <dependency>
    <groupId>neo4j-contrib</groupId>
    <artifactId>neo4j-spark-connector</artifactId>
    <version>2.4.0-M6</version>
  </dependency>
</dependencies>
<repositories>
  <!-- list of other repositories -->
  <repository>
    <id>SparkPackagesRepo</id>
    <url>http://dl.bintray.com/spark-packages/maven</url>
  </repository>
</repositories>
```

---

## Spark1连接Neo4J
```
val conf = new SparkConf().setAppName("InitSpark")
conf.set("spark.neo4j.bolt.url",properties.getProperty("bolt.url"))
conf.set("spark.neo4j.bolt.user",properties.getProperty("bolt.user"))
conf.set("spark.neo4j.bolt.password",properties.getProperty("bolt.password"))

# Neo4jDataFrame.withDataType(sqlContext: SQLContext, query: String, parameters: Seq[(String, Any)], schema: (String, DataType)*)
Neo4jDataFrame.withDataType(spark.sqlContext, query, Seq.empty, "id" -> LongType, "nodes" -> ArrayType.apply(LongType))
```

---

## Spark2连接Neo4J
```
val spark = SparkSession.builder()
    .appName("InitSpark")
    .config("spark.neo4j.bolt.url", properties.getProperty("bolt.url"))
    .config("spark.neo4j.bolt.user", properties.getProperty("bolt.user"))
    .config("spark.neo4j.bolt.password", properties.getProperty("bolt.password"))
    .config("spark.es.write.operation", "upsert")
    .config("spark.es.index.auto.create", "true")
    .config("spark.es.nodes", properties.getProperty("es.nodes"))
    .config("spark.es.port", properties.getProperty("es.port"))
    .config("spark.es.nodes.wan.only", "true")
    .config("spark.port.maxRetries", "100")
    .enableHiveSupport()
    .getOrCreate()
    
# Neo4jDataFrame.withDataType(sqlContext: SQLContext, query: String, parameters: Seq[(String, Any)], schema: (String, DataType)*)
Neo4jDataFrame.withDataType(spark.sqlContext, query, Seq.empty, "id" -> LongType, "nodes" -> StringType)
```

---

## 注意
```
# 在spark1中,Neo4J的语句是可以返回数组的
# 在Spark2中,Neo4J的语句返回数组后,schema不接受数组类型

# 解决方案:
Neo4J不返回数组,而是拼接字符串;
成功返回DataFrame之后再进行分割成List;
最后通过explode方法进行行转列.
```