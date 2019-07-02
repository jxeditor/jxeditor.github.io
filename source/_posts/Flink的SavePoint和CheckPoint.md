---
title: Flink的SavePoint和CheckPoint
date: 2019-07-02 09:53:01
categories: 大数据
tags: 
    - flink
---
> 最初的目的是为了处理Flink流程序异常退出,如何恢复数据

<!-- more -->

## 1.配置文件
```
vi /usr/local/flink-1.7.2/conf/flink-conf.yaml

state.checkpoints.dir: hdfs://namenode-host:port/flink-checkpoints
state.checkpoints.dir: hdfs:///flink/checkpoints

state.savepoints.dir: hdfs://namenode-host:port/flink-checkpoints
state.savepoints.dir: hdfs:///flink/savepoints

# 没有指定上述两个目录,执行命令时需要手动指定
```

---

## 2.CheckPoint
### 用处
- CheckPoint主要用于自动故障恢复.
- 由Flink自动创建,拥有和发布,不需要用户区交互.
- 当作业被cancel之后,CheckPoint会被删除,除非设置了**ExternalizedCheckpoint**的保留机制.

### 配置
```
vi /usr/local/flink-1.7.2/conf/flink-conf.yaml
# 设置CheckPoint默认保留数量
state.checkpoints.num-retained: 20
```

### 代码
```scala
senv.enableCheckpointing(500)
// 设置checkpoint保存目录
senv.setStateBackend(new FsStateBackend("hdfs:///flink/checkpoints"))
val conf = senv.getCheckpointConfig
// 取消作业时删除检查点.
conf.enableExternalizedCheckpoints(ExternalizedCheckpointCleanup.DELETE_ON_CANCELLATION)
// 取消作业时保留检查点.
conf.enableExternalizedCheckpoints(ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION)
```

---

## 3.SavePoint
### 用处
- SavePoint是通过CheckPoint机制为Streaming Job创建的一致性快照.
- 需要手动触发,这点与CheckPoint有区别.
- SavePoint由用户拥有,创建和删除,在作业停止之后仍然保存.
- 一般用于Flink版本升级,业务迁移,集群迁移,数据不允许丢失的情况

### 命令
```bash
# 触发SavePoint
## Flink not on Yarn
flink savepoint 1a32cab47537102d70e3a1a885fc431c hdfs:///flink/savepoints
## Flink on Yarn
flink savepoint 1a32cab47537102d70e3a1a885fc431c hdfs:///flink/savepoints  -yid application_1562025913394_0001

# 查看list
## Flink not on Yarn
flink list
## Flink on Yarn
flink list yarn-cluster -yid application_1562025913394_0001

# cancel触发savepoint
## Flink not on Yarn
flink cancel -s hdfs:///flink/savepoints 1a32cab47537102d70e3a1a885fc431c
## Flink on Yarn
flink cancel -s hdfs:///flink/savepoints 1a32cab47537102d70e3a1a885fc431c yarn-cluster -yid application_1562025913394_0001

# 使用savepoint
## Flink not on Yarn
flink run -s hdfs:///flink/savepoints -m valid1.jar
## Flink on Yarn
flink run -s hdfs:///flink/savepoints -m yarn-cluster valid1.jar

# 删除savepoint
## Flink not on Yarn
flink savepoint -d hdfs:///flink/savepoints
## Flink on Yarn
flink savepoint -d hdfs:///flink/savepoints yarn-cluster -yid application_1562025913394_0001
```

---

## 4.疑惑
如果Flink有自定义的变量值,那么从检查点恢复,这个变量值是初始的,还是程序当前的值.