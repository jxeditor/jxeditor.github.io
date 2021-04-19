---
title: GP与Kafka联动应用
date: 2021-04-16 17:08:04
categories: 大数据
tags: 
    - greenplum
    - kafka
---

> 利用Greenplum Streaming Server(GPSS)实现kafka到gp的过程

<!-- more -->

## 准备工作
### 安装[GPSS](https://network.pivotal.io/products/greenplum-streaming-server#/releases/866955/file_groups/3395)
```
# 安装GPSS插件(GP5.10之后支持)
# 下载GPSS安装包
https://network.pivotal.io/products/greenplum-streaming-server#/releases/866955/file_groups/3395

# 保证GP数据库启动(下列安装方式3选1)
# 安装GPSS gppkg(安装升级GP数据库集群中所有主机的GPSS)
su gpadmin
gppkg -i gpss-gpdb6-1.3.6-rhel7-x86_64.gppkg

# 安装GPSS Tarball(用于安装包括GP数据库的单个ETL服务器上安装升级GPSS)
tar xzvf gpss-gpdb6-1.3.6-rhel7-x86_64.tar.gz
cd gpss-gpdb6-1.3.6-rhel7-x86_64
./install_gpdb_component

# 安装GPSS ETL RPM(用于未安装GP数据库专用ETL服务器上安装升级GPSS)
sudo yum install gpss-gpdb6-1.3.6-rhel7-x86_64.rpm
psql
./usr/local/gpss/gpss_path.sh

# 加载组件
psql
CREATE EXTENSION gpss;

# 注意:会报libstdc++.so.6: version `CXXABI_1.3.9' not found
网上下载libstdc++.so.6.0.26,映射到libstdc++.so.6
cp libstdc++.so.6.0.26 /usr/lib64/
cd /usr/lib64/
chmod 755 libstdc++.so.6.0.26
rm -rf libstdc++.so.6
ln -s libstdc++.so.6.0.26 libstdc++.so.6
```

### 配置加载文件
```
# 加载Kafka CSV数据
# "123","09","456.78"

vi firstload_cfg.yaml
DATABASE: testdb
USER: gpadmin
HOST: gpmaster
PORT: 5432
KAFKA:
   INPUT:
     SOURCE:
        BROKERS: localhost:9092
        TOPIC: topic_for_gpkafka
     COLUMNS:
        - NAME: cust_id
          TYPE: int
        - NAME: __IGNORED__
          TYPE: int
        - NAME: expenses
          TYPE: decimal(9,2)
     FORMAT: csv
     ERROR_LIMIT: 125
   OUTPUT:
     TABLE: data_from_kafka
     MAPPING:
        - NAME: customer_id
          EXPRESSION: cust_id
        - NAME: expenses
          EXPRESSION: expenses
        - NAME: tax_due
          EXPRESSION: expenses * .0725
   COMMIT:
     MINIMAL_INTERVAL: 2000

# 加载Kafka JSON数据
# { "cust_id": 123, "month": 9, "amount_paid":456.78 }

vi simple_jsonload_cfg.yaml
DATABASE: testdb
USER: gpadmin
HOST: gpmaster
PORT: 5432
KAFKA:
   INPUT:
     SOURCE:
        BROKERS: localhost:9092
        TOPIC: topic_json
     FORMAT: json
     ERROR_LIMIT: 10
   OUTPUT:
     TABLE: single_json_column
   COMMIT:
     MINIMAL_INTERVAL: 1000

# 加载Kafka JSON数据(带映射)
# { "cust_id": 123, "month": 9, "amount_paid":456.78 }

vi jsonload_cfg.yaml
DATABASE: testdb
USER: gpadmin
HOST: gpmaster
PORT: 5432
KAFKA:
   INPUT:
     SOURCE:
        BROKERS: localhost:9092
        TOPIC: topic_json_gpkafka
     COLUMNS:
        - NAME: jdata
          TYPE: json
     FORMAT: json
     ERROR_LIMIT: 10
   OUTPUT:
     TABLE: json_from_kafka
     MAPPING:
        - NAME: customer_id
          EXPRESSION: (jdata->>'cust_id')::int
        - NAME: month
          EXPRESSION: (jdata->>'month')::int
        - NAME: amount_paid
          EXPRESSION: (jdata->>'expenses')::decimal
   COMMIT:
     MINIMAL_INTERVAL: 2000
     
# 加载Kafka Avro数据
# 1    { "cust_id": 123, "year": 1997, "expenses":[456.78, 67.89] }
# Avro数据生产者
kafka-avro-console-producer \
    --broker-list localhost:9092 \
    --topic topic_avrokv \
    --property parse.key=true --property key.schema='{"type" : "int", "name" : "id"}' \
    --property value.schema='{ "type" : "record", "name" : "example_schema", "namespace" : "com.example", "fields" : [ { "name" : "cust_id", "type" : "int", "doc" : "Id of the customer account" }, { "name" : "year", "type" : "int", "doc" : "year of expense" }, { "name" : "expenses", "type" : {"type": "array", "items": "float"}, "doc" : "Expenses for the year" } ], "doc:" : "A basic schema for storing messages" }'

vi avrokvload_cfg.yaml
DATABASE: testdb
USER: gpadmin
HOST: gpmaster
PORT: 5432
VERSION: 2
KAFKA:
   INPUT:
     SOURCE:
        BROKERS: localhost:9092
        TOPIC: topic_avrokv
     VALUE:
        COLUMNS:
          - NAME: c1
            TYPE: json
        FORMAT: avro
        AVRO_OPTION:
          SCHEMA_REGISTRY_ADDR: http://localhost:8081
     KEY:
        COLUMNS:
          - NAME: id
            TYPE: json
        FORMAT: avro
        AVRO_OPTION:
          SCHEMA_REGISTRY_ADDR: http://localhost:8081
     ERROR_LIMIT: 0
   OUTPUT:
     TABLE: avrokv_from_kafka
     MAPPING:
        - NAME: id
          EXPRESSION: id
        - NAME: customer_id
          EXPRESSION: (c1->>'cust_id')::int
        - NAME: year
          EXPRESSION: (c1->>'year')::int
        - NAME: expenses
          EXPRESSION: array(select json_array_elements(c1->'expenses')::text::float)
   COMMIT:
     MINIMAL_INTERVAL: 2000
```

### Kafka命令
```
# 创建Topic
kafka-topics.sh --create \
    --zookeeper localhost:2181 --replication-factor 1 --partitions 1 \
    --topic topic_json_gpkafka

# 启动生产者生产数据
kafka-console-producer.sh \
    --broker-list localhost:9092 \
    --topic topic_json_gpkafka < sample_data.json

# 启动消费者消费数据
kafka-console-consumer.sh \
    --bootstrap-server localhost:9092 --topic topic_json_gpkafka \
    --from-beginning
```

### 创建目标表
```
# CSV
CREATE TABLE data_from_kafka(customer_id int8, expenses decimal(9,2),tax_due decimal(7,2));

# JSON
CREATE TABLE single_json_column(value json);

# JSON映射
CREATE TABLE json_from_kafka(customer_id int8,month int4,amount_paid decimal(9,2));

# Avro
CREATE TABLE avrokv_from_kafka(id json,customer_id int,year int,expenses decimal(9,2)[]);
```

---

## 一次性使用
```
# 创建好加载配置文件,以及目标表
gpkafka load --quit-at-eof custom_load_cfg.yml

# 注意
GP-Kafka集成要求Kafka版本0.11或以上,确保exactly-once
可以利用下面代码,使用低版本Kafka,但是会失去exactly-once
PROPERTIES:
      api.version.request: false
      broker.version.fallback: 0.8.2.1
```

---

## 启动常驻任务
```
# 启动GPSS侦听端口和文件服务端口
vi gpsscfg_ex.json
{
    "ListenAddress": {
        "Host": "localhost",
        "Port": 5019
    },
    "Gpfdist": {
        "Host": "localhost",
        "Port": 8319
    }
}
gpss gpsscfg_ex.json --log-dir ./gpsslogs & 

# 将Kafka数据加载作业提交到在端口号5019上运行的GPSS实例
gpsscli submit --name kafkademo --gpss-port 5019 ./firstload_cfg.yaml

# 列出所有GPSS作业
gpsscli list --all --gpss-port 5019

# 开启kafademo任务
gpsscli start kafkademo --gpss-port 5019

# 停止kafademo任务
gpsscli stop orders1 --gpss-port 5019
```