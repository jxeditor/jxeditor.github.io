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
kafka-topics --create --zookeeper hostname:2181 --replication-factor 1 --partitions 1 --topic topicname

控制台启动生产者
kafka-console-producer --broker-list hostname:9092 --topic topicname

控制台消費
kafka-console-consumer --bootstrap-server hostname:9092 --topic topicname --from-beginning

从指定分区的特定offset开始消费topic
kafka-console-consumer --bootstrap-server hostname:9092 --topic topicname --offset 1018277 --partition 0

删除topic
kafka-topics --delete --zookeeper hostname:2181 --topic test

查看topic
kafka-topics --zookeeper hostname:2181 --list

查看特定topic
kafka-topics --zookeeper hostname:2181 --topic test --describe
分区数量,备份因子,以及各分区的Leader,Replica信息

查看消费组列表
kafka-consumer-groups --bootstrap-server hostname:9092 --list

查看特定消费组
kafka-consumer-groups --bootstrap-server hostname:9092 --group groupName --describe
分区ID,最近一次提交的offset,最拉取的生产消息offset,消费offset与生产offset之间的差值

重设Kafka消费组的Offset
--to-earliest:重设0
--to-latest:重设为最新
--to-offset:重设到指定offset
--to-current:重设到当前offset
--shift-by:重设为减少指定大小的offset
--to-datetime:重设到指定时间最早offset
--by-duration:重设到30分钟之前最早offset
kafka-consumer-groups.sh --bootstrap-server hostname:9092 --group groupName --reset-offsets --all-topics --to-latest --execute

修改分区数
kafka-topics --alter --zookeeper hostname:2181 --topic topicname --partitions 6

修改topic副本数
vi ~/kafka_add_replicas.json
{"topics":
    [{"topic":"prod_log_simul"}],
    "version": 1
}
kafka-reassign-partitions --zookeeper hostname:2181 --topics-to-move-json-file ~/kafka_add_replicas.json --broker-list "0,1,2" --generate
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
kafka-reassign-partitions --zookeeper hostname:2181 --reassignment-json-file ~/topic-reassignment.json --execute
查看分配进度
kafka-reassign-partitions --zookeeper hostname:2181 --reassignment-json-file ~/topic-reassignment.json --verify
```