---
title: Spark Shell异常Job in state DEFINE instead of RUNNING
date: 2019-11-24 13:53:35
categories: 大数据
tags: spark
---

> Spark-Shell测试把数据写入Hbase遇到异常

<!-- more -->

## 异常分析
**现象**
```
从日志报错分析,Job状态不对
```
**原因**
```
在Spark shell模式下
每运行一行代码其都会输出这个对象
所以在初始化job的时候会调用其toString方法来打印出这个对象
但是在toString方法的实现里面会对其状态进行检查
确保job实例是JobState.RUNNING状态
但是这个时候job的状态是JobState.DEFINE
所以会导致异常
```

---

## 解决办法
### 解决方法一：
不要再spark-shell中执行上面代码，使用spark-submit来提交执行代码，这样就不会检查状态

### 解决方法二：
使用`lazy`来初始化定义对象，这样会只有job对象被真正使用的时候才会初始化
```
lazy val job = Job.getInstance(sc.hadoopConfiguration)lazy val job = Job.getInstance(jobConf)
```

### 解决方法三：
将Job对象封装到类里面，这样就不会调用Job的toString方法，这样就可以避免出现异常
```
class JobWrapper(sc:SparkContext){ val job = Job.getInstance(sc.hadoopConfiguration); }
val jobWrapper = new JobWrapper(sc)
FileInputFormat.setInputPaths(jobWrapper.job, paths)
```