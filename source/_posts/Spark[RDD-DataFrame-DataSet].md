---
title: Spark[RDD-DataFrame-DataSet]
date: 2019-05-31 21:29:45
categories: 大数据
tags: 
    - spark
---

> Spark三类简述

<!-- more -->

### 一. Spark2.x创建Spark对象
```
val spark = SparkSession
            .builder
            .appName("")
            .enableHiveSupport()
            .getOrCreate()
```
---

### 二. RDD,DataFrame和DataSet
#### 1. RDD
**优缺点**
```
优点:
    编译时类型安全,编译时能检查出类型错误
    面向对象的编程风格,直接通过类名点的方式来操作数据
缺点:
    序列化和反序列化的性能开销,无论是集群间的通信还是IO操作都需要对对象的结构和数据进行序列化和反序列化
    GC的性能开销,频繁的创建和销毁对象,势必会增加GC
```

#### 2. DataFrame
**核心特征**
> **Schema:** 
    包含了以ROW为单位的每行数据的列的信息;Spark通过Schema就能够读懂数据,因此在通信和IO时只需要序列化和反序列化数据,不需要考虑结构部分

> **off_heap:** 
    Spark能够以二进制的形式序列化数据(不包含结构)到off-heap中,当要操作数据时,就直接操作off-heap内存

> **Tungsten:**
    新的执行引擎

> **Catalyst:** 
    新的语法解析框架

**优缺点**
```

优点:
    对外off-heap就像地盘,schema就像地图,spark有地图又有自己的地盘,就可以自己说了算,不再受jvm的限制,也就不再受GC的困扰,通过schema和off-heap,DataFrame解决了RDD的缺点
    对比RDD提升了计算效率,减少数据读取,底层计算优化
缺点:
    DataFrame解决了RDD的缺点,但是丢失了RDD的优点
    DataFrame不是类型安全的
    API也不是面向对象风格
总结:
    在效率上得到了优化,但是在代码编写上需要仔细
```

#### 3. DataSet
**核心特征(Encoder)**
> 编译时的类型安全检查,性能极大的提升,内存使用极大降低,减少GC,极大的减少了网络数据的传输,极大的减少采用scala和java编程代码的差异性

> DataFrame每一行对应一个Row,而DataSet的定义更加宽松,每一个record对应了一个任意的类型,DataFrame只是DataSet的一种特例

> 不同于Row是一个泛化的无类型JVM object,DataSet是由一系列的强类型JVM object组成的,Scala的case class或者java class定义.因此DataSet可以在变异时进行类型检查

> DataSet以Catalyst逻辑执行计划表示,并且数据以编码的二进制形式被存储,不需要反序列化就可以执行sorting,shuffle等操作

> DataSet创立需要一个显式的Encoder,把对象序列化为二进制