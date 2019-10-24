---
title: Spark任务生成和提交过程之OnStandAlone
date: 2017-11-21 14:19:28
categories: 大数据
tags: spark
---

> 整理Spark任务生成和提交过程,最好能在脑海形成一个图

<!-- more -->

## Client OR Cluster
```
# Client
Client模式提交任务,直接启动Driver,会在客户端看到task的执行情况和结果.用于测试环境
# Cluster
Cluster模式提交任务,会在Worker节点随机选择一个节点启动Driver,用于生产环境
```

---

## 1.Application
```
# 提交命令<standalone>
spark-submit \
--class MainClass \
--master spark://hadoop01:7077 \
JAR
```

---

## 2.Driver端
```
a.调用SparkSubmit类,内部执行submit-->doRunMain-->通过反射获取应用程序的主类对象-->执行主类的main方法
b.构建SparkConf和SparkContext对象,在SparkContext入口类做了三件事:
    SparkEnv对象(创建ActorSystem对象)
    TaskScheduler(用来生成并发送task个Executor)
    DAGScheduler(用来划分Stage)
c.ClientActor将任务信息封装到ApplicationDescription对象里并且提交给Master
```

---

## 3.Master端
```
a.Master收到ClientActor提交的任务信息后,把任务信息存到内存中,然后又将任务信息放到队列中(waitingApps)
b.当开始执行这个任务信息时,调用scheduler方法,进行资源调度
c.将调度好的资源封装到LaunchExecutor并发送给对应的Worker
```

---

## 4.Worker端
```
a.Worker接收到Master发送过来的调度信息(LaunchExecutor)后,将信息封装成一个ExecutorRunner对象
b.封装成ExecutorRunner后,调用ExecutorRunner的start方法,开始启动CoarseGrainedExecutorBackend对象
c.Executor启动后向DriverActor反向注册
d.与DriverActor注册成功后,创建一个线程池(TreadPool),用来执行任务
```

## 5.Driver端
```
a.当所有Executor注册完成后,意味着作业环境准备好了,Driver端会结束与SparkContext对象的初始化
b.当Driver初始化完成后(sc实例创建完毕),会继续执行我们自己提交的App代码,当触发了Action的RDD算子时,就触发了一个Job,这是就会调用DAGScheduler对象进行Stage划分
c.DAGScheduler开始进行Stage划分
d.将划分好的Stage按照分区生成一个一个的task,并且封装到TaskSet对象,然后TaskSet提交到TaskScheduler
e.TaskScheduler接收到提交过来的TaskSet,拿到一个序列化器,对TaskSet序列化,将序列化好的TaskSet封装到LaunchExecutor并提交到DriverActor
f.把LaunchExecutor发送到Executor上
```

---

## 6.Worker端
```
a.Executor接收到DriverActor发送过来的任务(LaunchExecutor),会将其封装成TaskRunner,然后从线程池中获取线程来执行TaskRunner
b.TaskRunner拿到反序列化器,反序列化TaskSet,然后执行App代码,也就是对RDD分区上执行的算子和自定义函数
```