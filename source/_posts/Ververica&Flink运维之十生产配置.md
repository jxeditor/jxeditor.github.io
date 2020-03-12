---
title: Ververica&Flink运维之十生产配置
date: 2019-10-19 12:01:18
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 基础配置
```
#JM的IP地址
jobmanager.rpc.address: localhost

#JM的端口号
jobmanager.rpc.port: 6123

#JM JVM heap内存大小(任务提交阶段可以再设置)
jobmanager.heap.mb: 1024

#TM JVM heap内存大小(任务提交阶段可以再设置)
taskmanager.heap.mb: 2048

#每个TM提供的任务slots数量大小(任务提交阶段可以再设置)
taskmanager.numberOfTaskSlots: 2048

#Flink任务默认并行度(如果是Kafka按照Kafka分区数即可,p=slot*tm)
parallelism.default: 1

#Web的运行监视器端口
web.port: 8081

#将已完成的作业上传到的目录(用于帮助发现任务运行阶段日志信息)
jobmanager.archive.fs.dir: hdfs://nameservice/flink/flink-jobs/

#基于Web的HistoryServer的端口号
historyserver.web.port:8082

#以逗号分割的目录列表,将作业归档到目录中
historyserver.archive.fs.dir: hdfs://nameservice/flink/flink-jobs/

#刷新存档的作业目录的时间间隔(毫秒)
historyserver.archive.fs.refresh-interval:10000

#用于存储和检查点状态的存储类型:filesystem,hdfs,rocksdb
state.backend: rocksdb

#存储检查点的数据文件和元数据的默认目录
state.backend.fs.checkpointdir:hdfs://nameservice/flink/pointsdata/

#用于保存检查点的目录
state.checkpoints.dir: hdfs:///flink/checkpoints/

#savepoint的目录
state.savepoints.dir: hdfs:///flink/checkpoints/

#保留最近的检查点数量
state.checkpoints.num-retained: 20

#开启增量CK
state.backend.incremental: true

# 超时
akka.ask.timeout: 300s

#akka心跳间隔,用于检测失效的TM,误报减小此值
akka.watch.heartbeat.interval: 30s

#如果由于丢失或延迟的心跳信息而错误的将TM标记为无效,增加此值
akka.watch.hearbeat.pause: 120s

#网络缓冲区的最大内存大小
taskmanager.network.memeory.max: 4gb

#网络缓冲区的最小内存大小
taskmanager.network.memeory.min: 256mb

#用于网络缓冲区的JVM内存的分数.决定TM可以同时具有多少个流数据交换通道以及通道的缓冲程度
taskmanager.network.memory.fraction: 0.5

#hadoop配置文件地址
fs.hdfs.hadoopconf: /etc/ecm/hadoop-conf/

#任务失败尝试次数
yarn.application-attempts: 10

#高可用
high-availability: zookeeper
high-availability.zookeeper.path.root: /flink
high-availability.zookeeper.quorum: zk1,zk2,zk3
high-availability.storageDir: hdfs://nameservice/flink/ha/

#Metric收集
metrics.reporters: prom

#收集器
metrics.reporter.prom.class: org.apache.flink.metrics.prometheus.PrometheusReporter

#metric对外暴露端口
metrics.reporter.prom.port: 9250-9269
```

---

# Hadoop参数调优
```
#每个节点最大使用的vcore数,适当放大
yarn.nodemanager.resource.cpu-vcores: 64

#yarn-site.xml中设置container
yarn.shceduler.minimum-allocation-mb:最小可申请内存量,默认1024
yarn.shceduler.minimum-allocation-vcores:最小可申请CPU数,默认1
yarn.shceduler.maximum-allocation-mb:最大可申请内存量,默认8096
yarn.shceduler.maximum-allocation-vcores:最大可申请CPU数(也是TM最大可设置的Slot数)
```

---

# 延伸
```
发布到多个Yarn集群
    不同版本或集群bin/conf隔离不同路径,通过export实现多集群操作
    注意通过CK恢复的任务,需要设置CK到相对路径

CK在A集群,数据写往B集群
    Hadoop做多集群访问互通
```