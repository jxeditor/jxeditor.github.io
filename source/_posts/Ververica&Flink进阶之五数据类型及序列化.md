---
title: Ververica&Flink进阶之五数据类型及序列化
date: 2019-05-31 15:13:45
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 定制的序列化框架
```
基于JVM的数据分析引擎
大数据时代的JVM - 显式的内存管理
定制的序列化框架
```

---

# Flink的数据类型
```
基础类型
    所有Java的基础类型
数组
    基础类型构成的数组
    Object[]
复合类型
    Flink Java Tuple 1~25个字段
    Scala Tuple 1~22个字段
    Row
    POJO
辅助类型
    Option
    Either
    Lists
    Maps
泛型和其他类
    由Kryo提供序列化支持
```

---

# 应用场景
```
注册子类型
注册自定义序列化器
添加类型提示
手动创建TypeInfomation
```