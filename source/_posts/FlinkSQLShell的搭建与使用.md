---
title: FlinkSQL的搭建与使用
date: 2019-12-05 16:05:28
categories: 大数据
tags: flink
---

> 用于Flink1.9以上版本

<!-- more -->

## 环境描述
- Flink1.9客户端
- CDH集群(hive-1.1.0)

---

## 注意事项
```
目前FlinkSQL通过测试的Hive版本只有1.2.1和2.3.4
但是其他版本经过我的测试,发现也是可以使用的
jar包需要导入对应版本的
```

---

## 修改配置文件
```
catalogs:
# catalogs 名称
  - name: hive
# catalog连接类型
    type: hive
# hive 安装路径下conf目录路径
    hive-conf-dir: /etc/hive/conf.cloudera.hive
# hive 版本号
    hive-version: 1.2.1
    property-version: 1
# use catalog 后 默认连接的数据库名
    default-database: default
```

---

## 拷贝依赖包
```
需要以下依赖包-我的是CDH的
flink-connector-hive_2.11-1.9.1.jar
flink-hadoop-compatibility_2.11-1.9.1.jar
flink-shaded-hadoop-2-uber-2.6.5-7.0.jar
hadoop-common-2.6.0-cdh5.15.1.jar
hadoop-mapreduce-client-common-2.6.0-cdh5.15.1.jar
hive-common-1.2.1.jar
hive-exec-1.2.1.jar
hive-metastore-1.2.1.jar
libfb303-0.9.3.jar
libthrift-0.9.3.jar
mysql-connector-java-5.1.48-bin.jar
antlr-runtime-3.4.jar
```

---

## 使用
```
./bin/sql-client.sh embedded
use catalog hive;
show tables;
```

---

## TableAPI的使用
```scala
# 记录一下坑
1.TableAPI目前不支持HiveStreamTableSink,所以写不进去,可以读
2.CDH集群一定要注意引用的pom是CDH版本的

# 测试代码
object HiveDemoOnTable {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    val tEnv = StreamTableEnvironment.create(env)

    val ds1 = env.socketTextStream("hadoop01", 9999, '\n')

    val hiveCatalog = new HiveCatalog("test", "default",
      "hive_conf", "1.2.1")
    tEnv.registerCatalog("test", hiveCatalog)
    tEnv.useCatalog("test")

    val table = tEnv.sqlQuery("select `topic`,`partition`,`offset`,msg,`c_date` from user_test_orc")

    table.insertInto("user_test_orc")

    env.execute("test")
  }

    //  case class Order(user: Int, product: String, amount: Int)
    case class Order(topic: String, partition: Integer, offset: Integer, msg: String, c_date: String)
}
```