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

---

# Kryo序列化
```
对于Flink无法序列化的类型,默认会交给Kryo处理,如果Kryo仍然无法处理
    1.强制使用Avro来代替Kryo
        env.getConfig().enableForceAvro();
    2.为Kryo增加自定义的Serializer以增强Kryo的功能
        env.getConfig().addDefaultKryoSerializer(clazz,serializer);

禁用Kryo
    env.getConfig().disableGenericTypers();
```

---

# Flink通信层的序列化
```
Flink的Task之间如果需要跨网络传输数据记录,那么就需要将数据序列化之后写入NetworkBufferPool,然后下层的Task读出之后再进行反序列操作,最后进行逻辑处理

为了使得记录以及时间能够被写入Buffer随后在消费时在从Buffer中读出,Flink提供了数据记录序列化器(Record)
```