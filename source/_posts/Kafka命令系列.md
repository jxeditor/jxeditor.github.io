---
title: Kafka命令系列
date: 2018-03-25 15:54:58
categories: 大数据
tags: kafka
---

> 介绍常用的命令

<!-- more -->

```sh
创建topic
kafka-topics --create --zookeeper hadoop03:2181 --replication-factor 1 --partitions 1 --topic test

控制台启动生产者
kafka-console-producer --broker-list hadoop03:9092 --topic test

控制台消費
kafka-console-consumer --bootstrap-server hadoop03:9092 --topic test --from-beginning

删除topic
kafka-topics --delete --zookeeper hadoop03:2181 --topic test

查看topic
kafka-topics --zookeeper hadoop03:2181 --list

查看特定topic
kafka-topics --zookeeper hadoop03:2181 --topic test --describe
分区数量,备份因子,以及各分区的Leader,Replica信息

查看消费组列表
kafka-consumer-groups --bootstrap-server hadoop03:9092 --list

查看特定消费组
kafka-consumer-groups --bootstrap-server hadoop03:9092 --group groupName --describe
分区ID,最近一次提交的offset,最拉取的生产消息offset,消费offset与生产offset之间的差值

修改分区数
kafka-topics --alter --zookeeper hadoop03:2181 --topic test --partitions 6

修改topic副本数
vi ~/kafka_add_replicas.json
{"topics":
    [{"topic":"prod_log_simul"}],
    "version": 1
}
kafka-reassign-partitions --zookeeper hadoop01:2181 --topics-to-move-json-file ~/kafka_add_replicas.json --broker-list "0,1,2" --generate
vi ~/topic-reassignment.json
{
    "version":1,
    "partitions":[
        {
            "topic":"test",
            "partition":2,
            "replicas":[0,1,2]
            },
        {
            "topic":"test",
            "partition":1,
            "replicas":[0,1,2]
        },
        {
            "topic":"test",
            "partition":0,
            "replicas":[0,1,2]
        }
    ]
}
kafka-reassign-partitions --zookeeper hadoop01:2181 --reassignment-json-file ~/topic-reassignment.json --execute
查看分配进度
kafka-reassign-partitions --zookeeper hadoop01:2181 --reassignment-json-file ~/topic-reassignment.json --verify
```