---
title: Flink批流统一操作外部存储
date: 2020-04-18 19:15:26
categories: 大数据
tags: flink
---

> 整理公司业务,对于Flink离线批处理进行学习与踩坑

<!-- more -->

# 批处理
## 数据Source
```scala
// 这里我统一使用Hive作为数据源,符合离线数仓实际

// 创建方式1: StreamTableEnv,写入hive不支持(insert into),只能使用(insert overwrite),可支持MySQL的写入
val env = StreamExecutionEnvironment.getExecutionEnvironment
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
val tEnv = StreamTableEnvironment.create(env, settings)

// 创建方式2: TableEnv,写入hive(insert into,overwrite皆可),写MySQL不支持
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inBatchMode().build()
val tEnv = TableEnvironment.create(settings)
val hiveCatalog = new HiveCatalog("test", "default",
  "hive_conf", "2.1.1")

// 注册HiveCatalog
tEnv.registerCatalog("test", hiveCatalog)
tEnv.useCatalog("test")

// 打印Catalog中拥有的表
tEnv.listTables().foreach(println)
```

---

## 数据Sink
### 写入Hive
```scala
// 创建方式1,2皆可,注意两者不同,1不可聚合

// 当结果表为Hive表时
tEnv.getConfig.setSqlDialect(SqlDialect.HIVE)

// 注意,因为使用的是HiveCatalog,对于Hive上的元数据它都有,所以我们直接使用就行
val src = tEnv.sqlQuery("SELECT * FROM default.test")
tEnv.sqlUpdate(s"INSERT INTO default.test1 SELECT id FROM $src")
tEnv.execute("insert into hive table")

注意,可能出现找不到HDFS块的报错
解决方式:
hiveCatalog.getHiveConf.set("dfs.client.use.datanode.hostname", "true")
```

### 写入Kafka
```scala
// 创建方式1,2皆可,1不可以进行聚合操作,2可以

// 注意,实际上的表是创建在Hive上的,所以不能重复创建
def createKafkaTable(): String = {
    """
      |CREATE TABLE demo1 (
      |    id VARCHAR COMMENT 'uid'
      |)
      |WITH (
      |    'connector.type' = 'kafka', -- 使用 kafka connector
      |    'connector.version' = 'universal',  -- kafka 版本
      |    'connector.topic' = 'test01',  -- kafka topic
      |    'connector.properties.0.key' = 'zookeeper.connect',  -- zk连接信息
      |    'connector.properties.0.value' = 'cdh04:2181',  -- zk连接信息
      |    'connector.properties.1.key' = 'bootstrap.servers',  -- broker连接信息
      |    'connector.properties.1.value' = 'cdh04:9092',  -- broker连接信息
      |    'connector.sink-partitioner' = 'fixed',
      |    'update-mode' = 'append',
      |    'format.type' = 'json',  -- 数据源格式为 json
      |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
      |)
    """.stripMargin
}

tEnv.sqlUpdate(createKafkaTable())
val src = tEnv.sqlQuery("SELECT * FROM default.test")
tEnv.sqlUpdate(s"INSERT INTO demo1 SELECT id FROM $src")
tEnv.execute("insert into kafka table")

// kafka数据
kafka-console-consumer --group demo --bootstrap-server cdh05:9092 --topic test01 --from-beginning
{"id":"test"}

注意,可能出现bootstrap.servers URL 不能解析的报错
初步判断是生产环境Kafka内网解析导致的
```

### 写入MySQL
```scala
// 只能使用创建方式1

def createMysqlTable(): String = {
    s"""
       |CREATE TABLE demo2 (
       |	`id` VARCHAR
       |) WITH (
       |	'connector.type' = 'jdbc',
       |	'connector.url' = 'jdbc:mysql://localhost:3306/test?useSSL=true&serverTimezone=UTC',
       |	'connector.table' = 'demo',
       |	'connector.driver' = 'com.mysql.cj.jdbc.Driver',
       |	'connector.username' = 'root',
       |	'connector.password' = '123456'
       |)
       |""".stripMargin
}

tEnv.sqlUpdate(createMysqlTable())
val src = tEnv.sqlQuery("SELECT * FROM default.test")
tEnv.sqlUpdate(s"INSERT INTO demo2 SELECT id FROM $src")
tEnv.execute("insert into mysql table")

注意,在进行字段变化,导致字段模糊的情况下
eg:
    val table = tEnv.sqlQuery(
        s"""
        |SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY index DESC) AS num
        |FROM  default.test
        |""".stripMargin
    ).filter("num = 1").select(
      "id,num"
    )
报错Table has a full primary keys if it is updated
解决方式:
    在后面加上.groupBy("id","num").select("id","num")

报错Conversion to relational algebra failed to preserve datatypes
解决方式:
    检查类型转换
```

---

# 流处理
## 数据Source
```scala
// 使用Kafka作为数据源
val env = StreamExecutionEnvironment.getExecutionEnvironment
env.setStreamTimeCharacteristic(TimeCharacteristic.EventTime)
env.setParallelism(4)
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
val tEnv = StreamTableEnvironment.create(env, settings)

def createKafkaSourceTable(): String = {
    """
    |CREATE TABLE test (
    |    business VARCHAR,
    |    database VARCHAR,
    |    es VARCHAR,
    |    ts BIGINT,
    |    rowtime as TO_TIMESTAMP(FROM_UNIXTIME(ts / 1000,'yyyy-MM-dd HH:mm:ss')),
    |    proctime as PROCTIME(),
    |    WATERMARK FOR rowtime as rowtime - INTERVAL '5' SECOND
    |)
    |WITH (
    |    'connector.type' = 'kafka', -- 使用 kafka connector
    |    'connector.version' = 'universal',  -- kafka 版本
    |    'connector.topic' = 'test01',  -- kafka topic
    |    'connector.properties.zookeeper.connect' = 'cdh04:2181',  -- zk连接信息
    |    'connector.properties.bootstrap.servers' = 'cdh04:9092',  -- broker连接信息
    |    'connector.properties.group.id' = 'kafkasql',
    |    'update-mode' = 'append',
    |    'connector.startup-mode' = 'earliest-offset',
    |    'format.type' = 'json',  -- 数据源格式为 json
    |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
    |)
    """.stripMargin
}

tEnv.sqlUpdate(createKafkaSourceTable)
```

---

## 数据Sink
### 写入Kakfa
```scala
def createKafkaSinkTable(): String = {
    """
    |CREATE TABLE demo1 (
    |    business VARCHAR COMMENT 'uid',
    |    pv BIGINT COMMENT 'pv',
    |    t_start TIMESTAMP(3) COMMENT '开始时间',
    |    t_end TIMESTAMP(3) COMMENT '结束时间'
    |)
    |WITH (
    |    'connector.type' = 'kafka', -- 使用 kafka connector
    |    'connector.version' = 'universal',  -- kafka 版本
    |    'connector.topic' = 'test01_sink',  -- kafka topic
    |    'connector.properties.0.key' = 'zookeeper.connect',  -- zk连接信息
    |    'connector.properties.0.value' = 'cdh04:2181',  -- zk连接信息
    |    'connector.properties.1.key' = 'bootstrap.servers',  -- broker连接信息
    |    'connector.properties.1.value' = 'cdh04:9092',  -- broker连接信息
    |    'connector.sink-partitioner' = 'fixed',
    |    'update-mode' = 'append',
    |    'format.type' = 'json',  -- 数据源格式为 json
    |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
    |)
    """.stripMargin
}

val query =
    """
    |SELECT business,COUNT(1) as pv,
    | HOP_START(rowtime, INTERVAL '5' second, INTERVAL '10' second) as t_start,
    | HOP_END(rowtime, INTERVAL '5' second, INTERVAL '10' second) as t_end
    |FROM test
    |GROUP BY business,HOP(rowtime, INTERVAL '5' second, INTERVAL '10' second)
        """.stripMargin
val res1 = tEnv.sqlQuery(query)

tEnv.sqlUpdate(
    s"""
    |INSERT INTO demo1
    |SELECT *
    |FROM $res1
    |""".stripMargin
)
```
