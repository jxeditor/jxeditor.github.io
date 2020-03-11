---
title: Ververica&Flink入门之五客户端操作
date: 2019-04-12 11:31:24
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 交互方式
```
Scala Shell
SQL Client
Command Line
Restful
Web
```

---

# 命令行操作
```
# 完整说明
bin/flink -h

# 某命令的参数,如run
bin/flink run -h

# 查看任务列表(Standalone)
bin/flink list -m 127.0.0.1:8081

# 停止与取消
bin/flink stop -m 127.0.0.1:8081 d67420e52bd051fae2fddbaa79e046bb
cancel调用,立即调用作业算子的cancel方法,以尽快取消它们,如果算子在接到cancel调用后没有停止,Flink将开始定期中断算子线程的执行,直到所有算子停止为止
stop调用,是更优雅的停止正在运行流作业的方式,stop仅适用于Source实现了StoppableFunction接口的作业,当用户请求停止作业时,作业的所有Source都将接收stop方法调用,直到所有Source正常关闭时,作业才会正常结束,这种方式,使作业正常处理完所有作业

# 修改并行度
bin/flink modify -p 4 7752ea7b0e7303c780de9d86a5ded3fa

# 查看Flink任务执行计划(StreamGraph)
bin/flink info examples/streaming/TopSpeedWindowing.jar
粘贴Json内容到http://flink.apache.org/visualizer/

# Yarn单任务提交
Attach模式,批处理程序结束才退出,流处理客户端会一直等待不退出
bin/flink run -m yarn-cluster ./examples/batch/WordCount.jar
Detached模式,客户端提交完任务就退出
bin/flink run -yd -m yarn-cluster ./examples/streaming/TopSpeedWindowing.jar

# Yarn Session
Attach模式
bin/yarn-session.sh -tm 2048 -s 3
Detached模式
bin/yarn-session.sh -tm 2048 -s 3 -d

# Scala Shell
Local
bin/start-scala-shell.sh local
Yarn
bin/yarn-session.sh  -tm 2048 -s 3
bin/start-scala-shell.sh yarn -n 2 -jm 1024 -s 2 -tm 1024 -nm flink-yarn

# SQL Client
bin/sql-client.sh embedded
两种模式维护展示查询结果
table mode: 在内存中物化查询结果,并以分页table形式展示
changlog mode: 不会物化查询结果,而是直接对continuous query产生的添加和撤回(retractions)结果进行展示
SET execution.result-mode=table
SET execution.result-mode=changelog
```

---

# Flink保证Exactly-Once
```
分布式快照
Checkpoint Barrier
TwoPhaseCommitSinkFunction两阶段提交
```