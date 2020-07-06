---
title: Flink中使用Kryo序列化与反序列化
date: 2020-05-25 09:03:48
categories: 大数据
tags: flink
---

> 并没有涉及Flink的本身使用的序列化器的改动,只是flink使用的kryo依赖等级过低

<!-- more -->

## 前因
```
着手将Spark的实时项目重构成Flink项目
在对于数据的清洗时,原项目是将Json格式的数据转换为实体类
最后对其进行Kryo序列化发送给Kafka
在重构时,为了新老项目能够使用同一个数据源
新项目也采用同样的方式
结果发现Kryo使用的一些冲突
```

---

## 引用
```xml
<!-- 使用kryo-shaded,不要使用kryo包 -->
<dependency>
    <groupId>com.esotericsoftware</groupId>
    <artifactId>kryo-shaded</artifactId>
    <version>4.0.2</version>
</dependency>
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-scala_${scala.2.11.version}</artifactId>
    <exclusions>
        <exclusion>
            <groupId>com.esotericsoftware.kryo</groupId>
            <artifactId>kryo</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

---

## 冲突
```
在使用Kryo包时,其实在引用flink-scala-2.11包时,其内部含有Kryo包(等级过低,需要排除)
如果直接引用Kryo包会导致项目编译通过,运行时报错,最终可能导致数据丢失
建议使用kryo-shaded包,很好的兼容了两者的异同
```
---

## 注意
```
1.代码区别
    由于我是纯scala实现的实体类,并且其中有Map数据结构
    为了使其能够兼顾老项目的Java实体类
    需要应用util.HashMap[lang.String,lang.String]
2.Kryo使用
    setRegistrationRequired(false)
    setReferences(false)
    register(Class)
    序列化分为两种
        一种是序列化后带有ID信息,那么反序列化时就需要提供对应的信息才能进行反序列化(默认这种模式是关闭的)
        一种是不带ID信息,直接进行序列化
3.实体类
    实体类需要保证字段顺序与Hive表中的顺序保持一致
    该bug在flink-1.11.0中有得到修复
```

---
    
## 代码

还有线程池的实现但是因为版本问题,这里没有使用-[传送门](https://www.programcreek.com/java-api-examples/index.php?api=com.esotericsoftware.kryo.pool.KryoPool)
```scala
package com.skuld.util

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}

import com.esotericsoftware.kryo.Kryo
import com.esotericsoftware.kryo.io.{Input, Output}
import java.util

import com.skuld.entry.EventGame


/**
  * Kryo序列化
  * @author XiaShuai on 2020/5/14.
  */
object KryoUtils {

  /**
    * 30k
    */
  private val OUTPUT_BUFFER_SIZE = 1024 * 30
  /**
    * 60k
    */
  private val OUTPUT_MAX_BUFFER_SIZE = 1024 * 60

  private lazy val kryo = create

  /**
    * 线程安全，设计为软引用 softReferences，默认不指定容量
    * 根据实际情况调整
    */
  def create: Kryo = {
    val kryo = new Kryo
    kryo.setRegistrationRequired(false)
    kryo.setReferences(false)
    kryo.register(classOf[util.HashMap[_, _]])
    kryo.register(classOf[Array[_]])
    kryo
  }

  def serialize[T](`object`: T): Array[Byte] = {
    try {
      val baos = new ByteArrayOutputStream()
      val output = new Output(OUTPUT_BUFFER_SIZE, OUTPUT_MAX_BUFFER_SIZE)
      output.setOutputStream(baos)
      try {
        kryo.writeObject(output, `object`)
        output.flush()
        output.getBuffer
      } finally {
        if (output != null) output.close()
      }
    }
  }

  def deserialize[T](pvBytes: Array[Byte], tClass: Class[T]): T = {
    try {
      val byteArrayInputStream = new ByteArrayInputStream(pvBytes)
      val input = new Input(byteArrayInputStream)
      try {
        input.setBuffer(pvBytes)
        kryo.readObject(input, tClass)
      } finally {
        if (input != null) input.close()
      }
    }
  }
}
```