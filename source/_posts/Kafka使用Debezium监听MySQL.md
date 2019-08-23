---
title: Kafka使用Debezium监听MySQL
date: 2019-06-04 13:59:01
categories: 大数据
tags: 
    - kafka
---

> Kafka组件使用

<!-- more -->

## 理解Kafka Connect
- 先建立一个Connect,这个Connect可以配置一些参数,确定信息的一些格式
- http://192.168.142.128:8083/
- 然后在这个Connect的基础上建立一系列的Connector,可以确定数据源,以及一系列对数据的变更
- PUT http://192.168.142.128:8083/connectors/c_name/config

---

## Kafka
> 使用的是CDH安装的parcels

```bash
# Kafka目录
/opt/cloudera/parcels/KAFKA/
# Kafka配置目录
/opt/cloudera/parcels/KAFKA/etc/kafka/conf.dist/
# 将配置目录中的配置文件复制一份
cp -r /opt/cloudera/parcels/KAFKA/etc/kafka/conf.dist/* /opt/cloudera/parcels/KAFKA/config 
# 使用CDH的kafka自带的bin目录下并不会包含connect-*的shell脚本
cp -r /opt/cloudera/parcels/KAFKA/lib/kafka/bin/connect-* /opt/cloudera/parcels/KAFKA/bin
# 修改config/connect-distributed.properties
plugin.path=/opt/connectors (存放debezium插件的位置)
bootstrap.servers=hadoop01:9092,hadoop02:9092,hadoop03:9092
```

---
## Debezium
> 只是一个插件,去官网下载对应的MySQL插件就行,将包解压到/opt/connectors 

---
## MySQL
确保MySQL开启了binlog日志功能和query日志
```sql
SHOW VARIABLES LIKE '%log_bin%';
SHOW VARIABLES LIKE '%binlog%'; 
```
开启binlog
```bash
vi /etc/my.cnf
    [client]
    default-character-set=utf8mb4

    [mysqld]
    character-set-client-handshake=FALSE
    character-set-server=utf8mb4
    collation-server=utf8mb4_unicode_ci
    init_connect='SET NAMES utf8mb4'
    server-id=1
    log-bin=/usr/local/mysql/data/my-bin
    binlog_rows_query_log_events=ON

    [mysql]
    default-character-set=utf8mb4
service mysqld restart
```

---
## 启动Kafka Connect
```bash
./bin/connect-distributed.sh etc/kafka/conf.dist/connect-distributed.properties
```
访问Web: http://192.168.142.128:8083/

---
## 添加connector
使用Postman的put功能

链接: http://192.168.142.128:8083/connectors/test2/config
```json
body-raw-JSON(application/JSON)
{
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    // 设置数据源	                    
    "database.hostname": "hadoop01",
    "database.port": "3306",
    "database.user": "root",
    "database.password": "123456",
    "database.server.id": "1",
    "database.server.name": "demo",
    "database.whitelist": "test1",
    "database.history.kafka.bootstrap.servers": "hadoop01:9092",
    "database.history.kafka.topic": "dbhistory",
    "database.history.store.only.monitored.tables.ddl": "true",
    "database.history.skip.unparseable.ddl": "true",
    // 去除字段,多个字段用逗号分隔
    "transforms": "dropField",
    "transforms.dropField.type":"org.apache.kafka.connect.transforms.ReplaceField$Value",
    "transforms.dropField.blacklist":"source",
    // 监听sql语句	                    
    "include.query": "true",
    "include.schema.events": "false",
    "include.schema.changes": "false",
    "decimal.handling.mode": "string",	                    
    "snapshot.mode": "schema_only"
}
```

---
## 消费Kafka
topic的组成为:serverName.dbName.tableName
```bash
kafka-console-consumer --bootstrap-server hadoop01:9092 --topic demo.test1.demo
```

---
## 遇到的一些问题
> 刚开始我本身并没有对Connect进行修改,所以导致后面的数据格式是一个shcema+payload,这种数据可以说非常完美,因为本身我们是需要对schema的信息进行传递的,但是我想进一步简化数据,监听数据其实我只需要payload内的数据就可以了

### 1.如何去除schema
```bash
# 修改connect-distributed.properties
key.converter=org.apache.kafka.connect.json.JsonConverter
value.converter=org.apache.kafka.connect.json.JsonConverter
key.converter.schemas.enable=false
value.converter.schemas.enable=false
```

### 2.如何去除payload的一些不需要的数据
修改config的PUT请求,上面的PUT请求中有例子

### 3.日志打印过多的INFO
```bash
# 修改connect-log4j.properties
log4j.rootLogger=WARN, stdout
```

### 4.后台启动connect
```bash
./bin/connect-distributed.sh -daemon config/connect-distributed.properties
```