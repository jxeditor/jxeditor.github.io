---
title: Spark任务生成和提交过程之OnYarn
date: 2017-11-21 14:38:48
categories: 大数据
tags: spark
---

> 整理Spark任务生成和提交过程,最好能在脑海形成一个图

<!-- more -->

## Client OR Cluster
```
# Client
Client模式提交任务,直接启动Driver,会在客户端看到task的执行情况和结果,用于测试环境
# Cluster
Cluster模式提交任务,会在某个NodeManager节点随机选择一个节点启动ApplicationMaster,AM启动Driver,用于生产环境
```

---

## Client模式
```
a.客户端启动后直接运行应用程序，直接启动Driver
b.Driver初始化并生成一系列Task
c.客户端将job发布到yarn上
d.RM为该job在某个NM分配一个AM
e.AM向RM申请资源，RM返回Executor信息
f.AM通过RPC启动相应的SparkExecutor
g.Driver向Executor分配task
h.Executor执行task并将结果写入第三方存储系统或者Driver端
```

---

## Cluster模式
```
a.客户端向yarn提交一个job
b.RM为该job在某个NM上分配一个AM，NM启动AM，AM启动Driver
c.AM启动后完成初始化作业，Driver生成一系列task
d.AM向RM申请资源，RM返回Executor信息
e.AM通过RPC启动相应的SparkExecutor
f.Driver向Executor分配task
g.Executor执行结果写入文件或返回Driver端

```