---
title: Flink的RestAPI使用
date: 2020-01-14 09:11:25
categories: 大数据
tags: flink
---

> 最近社区在进行Flink平台化开发,提供支持

<!-- more -->

## Rest API
```
# 默认就是8081,可以自己改
vi flink-conf.yaml
rest.port: 8081

# Web访问
http://cdh04:8081/#/overview
```

---

## CRUL操作
```
# 关闭集群
curl -X DELETE http://cdh04:8081/v1/cluster

# 查看WebUI配置信息
curl http://cdh04:8081/v1/config

# 查看通过WebUI上传集群的jar包
curl http://cdh04:8081/v1/jars

# 上传jar包
curl -X POST -H "Expect:" -F "jarfile=@/usr/local/flink-1.9.1/examples/streaming/SocketWindowWordCount.jar" http://cdh04:8081/v1/jars/upload

# 删除已上传的jar
curl -X DELETE http://cdh04:8081/v1/jars/f2dc6af3-dabd-46b7-8f79-b0973586182d_SocketWindowWordCount.jar

# 查看jar的执行计划
curl http://cdh04:8081/v1/jars/24b3d9d6-8c5e-4d1b-a1e3-8609e82e2681_SocketWindowWordCount.jar/plan
curl http://cdh04:8081/v1/jars/24b3d9d6-8c5e-4d1b-a1e3-8609e82e2681_SocketWindowWordCount.jar/plan?programArg=--hostname,cdh04,--port,9999
program-args(用programArg代替)
programArg    programArg=--hostname,cdh04,--port,9999
entry-class   org.apache.flink.streaming.examples.socket.SocketWindowWordCount
parallelism   4

# 启动jar
curl -X POST http://cdh04:8081/v1/jars/24b3d9d6-8c5e-4d1b-a1e3-8609e82e2681_SocketWindowWordCount.jar/run?programArg=--hostname,cdh04,--port,9999
program-args(用programArg代替)
programArg    programArg=--hostname,cdh04,--port,9999
entryClass   org.apache.flink.streaming.examples.socket.SocketWindowWordCount
parallelism   4
allowNonRestoredState(无法从保存点启动作业时是否拒绝提交作业)    true/false
savepointPath(保存点)    hdfs://path

# 查看JM的配置信息
curl http://cdh04:8081/v1/jobmanager/config

# 查看JM监控指标信息
curl http://cdh04:8081/v1/jobmanager/metrics
curl http://cdh04:8081/v1/jobmanager/metrics?get=Status.JVM.ClassLoader.ClassesUnloaded

# 查看所有的任务以及状态
curl http://cdh04:8081/v1/jobs

# 查看任务监控指标信息
curl http://cdh04:8081/v1/jobs/metrics
curl http://cdh04:8081/v1/jobs/metrics?get=downtime
get
agg
jobs

# 查看所有的任务概述信息
curl http://cdh04:8081/v1/jobs/overview

# 查看指定任务细节
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c

# 取消某个任务
curl -X PATCH http://cdh04:8081/v1/jobs/de67c4a9559ad0328f593da82b7b0819
curl -X PATCH http://cdh04:8081/v1/jobs/de67c4a9559ad0328f593da82b7b0819?mode=cancel
curl -X GET http://cdh04:8081/v1/jobs/096ba3e7f51889568da14f5bcac2e98a/yarn-cancel

# 返回作业累计器
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/accumulators

# 返回作业检查点统计信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/checkpoints

# 返回检查点配置
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/checkpoints/config

# 返回检查点的详细信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/checkpoints/details/:checkpointid

# 返回任务及其子任务的检查点统计信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/checkpoints/details/:checkpointid/subtasks/:vertexid

# 返回作业的配置
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/config

# 返回作业不可恢复的异常
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/exceptions

# 返回作业执行的结果
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/execution-result

# 返回作业指标信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/metrics
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/metrics?get=lastCheckpointExternalPath

# 返回作业的数据流计划
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/plan

# 触发作业的缩放
curl -X PATCH http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/rescaling
{"errors":["Rescaling is temporarily disabled. See FLINK-12312."]}

# 返回重新调整操作的状态
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/rescaling/:triggerid

# 触发保存点
curl -X POST http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/savepoints

# 返回保存点操作的状态
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/savepoints/:triggerid

# 停止具有保存点的作业
curl -X POST http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/stop

# 返回任务的详细信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid

# 返回任务的用户定义的累加器
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/accumulators

# 返回作业的背压信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/backpressure

# 任务指标信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/metrics
get

# 返回任务的所有子任务的所有用户定义的累加器
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/accumulators

# 提供对聚合子任务指标信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/metrics
get
agg
subtasks

# 返回子任务当前或最新执行尝试的详细信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/:subtaskindex

# 返回子任务执行尝试的详细信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/:subtaskindex/attempts/:attempt

# 返回子任务执行尝试的累加器
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/:subtaskindex/attempts/:attempt/accumulators

# 子任务指标信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasks/:subtaskindex/metrics
get

# 返回任务的所有子任务的时间相关信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/subtasktimes

# 返回任务管理器汇总的任务信息
curl http://cdh04:8081/v1/jobs/275bc5b3f2791ea2131fdb87835cb21c/vertices/:vertexid/taskmanagers

# 返回Flink群集的概述
curl http://cdh04:8081/v1/overview

# 触发对保存点的处置
curl -X POST http://cdh04:8081/v1/savepoint-disposal

# 返回保存点处置操作的状态
curl http://cdh04:8081/v1/savepoint-disposal/:triggerid

# 返回所有任务管理器的概述
curl http://cdh04:8081/v1/taskmanagers

# 任务管理器指标信息
curl http://cdh04:8081/v1/taskmanagers/metrics
get
agg
taskmanagers

# 返回任务管理器的详细信息
curl http://cdh04:8081/v1/taskmanagers/26250ba72b84e947dbbb8629f31740bd

# 指定任务管理器指标信息
curl http://cdh04:8081/v1/taskmanagers/26250ba72b84e947dbbb8629f31740bd/metrics
get
```

