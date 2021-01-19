---
title: 关于Flink平台化设计的一些想法
date: 2021-01-13 15:34:37
categories: 大数据
tags: flink
---

> 基于阿里云的实时计算平台的一点想法,以最快的速度弄出一个架子

<!-- more -->

## 功能点
```
任务提交
任务运行
任务监控
任务调度
```

---

## 任务提交
### 方案一(submitJar)
这方面可以考虑一下无邪的一个方案[flink-sql-submit](https://github.com/wuchong/flink-sql-submit)
```
思路
    将web页面写好的FlinkSQL代码,配置参数等信息,存储起来
    通过公共提交Jar(以下统称submitJar)去获取这些信息,并通过flink run命令进行提交
    这样最基本的功能,任务能跑起来的点是实现了的

优化
    最主要是基于submitJar做优化
    1.配置属性的使用
        需要对Flink可配置项进行一系列梳理,最好自实现一个Configuration封装类
    2.UDF加载功能
        使用方式: create function test as 'com.test.flink.UpperUDF' LANGUAGE SCALA
        其中一个点,对于UDF加载应该在页面上有配置项,用于submitJar感知需不需要去加载UDF
        
```

### 方案二(Nest)
主要是参考Hue,Zeppelin和SqlClient的想法
```
思路
    对于SqlClient,是利用了Executor获取执行环境配置,然后使用TableEnvironment去执行任务
    我们可以在Web项目中同样使用Executor,创建好环境,而在Flink1.12中jobName是可以通过pipeline.name设置的
    最终的目的就是实现一个嵌套在网页上的编辑器实现在线运行
```

---

## 任务运行

这一块目前感觉改动基于submitJar不太好改,只是在使用阿里平台时,可以获取任务的执行计划,并且可以自定义更改每个Oprator的配置
```
思路
    通过flink info submitJar获取执行计划(submitJar需要先将SQL信息集成进去,是个问题)
    SQL最终其实也是转换成DataStream去执行,针对DataStream对每一个Oprator进行参数配置(并行度等)

主要的问题是如何将submitJar+SQL集成起来生成一个jar
```

---

## 任务监控

可操作性很大,PushGateway+Prometheus+Grafana这3件套基本可以满足要求
```
思路
    起初时,可以使用Flink自身的WebUI作为监控查看端
    逐步的使用开源组件进行替换,最后自己实现监控UI
```

---

## 任务调度

调度在实时任务方面,好像意义不是太大,一般实时任务启动之后基本不用做额外的操作
```
从老到新,可以试试这几个组件
Celery
    纯Python命令行队列调用,配合crontab管理公司作业调度,未尝不可
Azkaban
    轻量级,批量工作流任务调度,简单上手快,目前大部分公司都是这种
DolphinScheduler
    应该是最新的一款调度组件,特色在于分布式,去中心化,可视化DAG,还没有尝过鲜
```