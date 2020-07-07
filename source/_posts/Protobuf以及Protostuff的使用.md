---
title: Protobuf以及Protostuff的使用
date: 2020-07-07 16:03:06
categories: 教程
tags: learn
---

> 继Kryo序列化操作之后，另外两种序列化方法

<!-- more -->

## Protobuf
### 获取Protoc工具
[下载地址](https://github.com/protocolbuffers/protobuf/releases)
### 自定义Proto文件
```
// proto3版本协议
syntax = "proto3";  

// 编译生成的包名
option java_package = "com.example.protobuf";  
// 编译生成的类名
option java_outer_classname = "PersonFactory";  

// 类
message Person{  
     int32 id = 1;  
     string name = 2;  
     int32 age = 3;  
     Addr addr = 4;  
}  

// 类
message Addr{   
     string contry = 1;  
     string city = 2;  
}  
```
### 生成Java文件
```sh
protoc.exe --proto_path=./ --java_out=./ ./PersonFactory.proto
```
### Pom文件
```xml
<dependency>
    <groupId>com.google.protobuf</groupId>
    <artifactId>protobuf-java</artifactId>
    <version>3.7.1</version>
</dependency>
```
### 代码测试
```java
package com.example.protobuf;

import com.google.protobuf.ByteString;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

/**
 * @author XiaShuai on 2020/7/7.
 */
public class ProtobufDemo {
    public static void main(String[] args) throws Exception {
        // Person构造器
        PersonFactory.Person.Builder personBuilder = PersonFactory.Person.newBuilder();
        personBuilder.setAge(10);
        personBuilder.setId(1);
        personBuilder.setName("test");

        PersonFactory.Addr.Builder addrBuilder = PersonFactory.Addr.newBuilder();
        addrBuilder.setCity("beijing");
        addrBuilder.setContry("china");

        personBuilder.setAddr(addrBuilder);

        PersonFactory.Person person = personBuilder.build();

        // 序列化/反序列化,方式1,byte[]
        byte[] bytes = person.toByteArray(); // 序列化
        PersonFactory.Person dePerson01 = PersonFactory.Person.parseFrom(bytes);// 反序列化
        System.out.println(dePerson01.toString());

        // 序列化/反序列化,方式2,ByteString
        ByteString byteString = person.toByteString();// 序列化
        PersonFactory.Person dePerson02 = PersonFactory.Person.parseFrom(byteString);// 反序列化
        System.out.println(dePerson02.toString());

        // 序列化/反序列化,方式3,InputStream
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        person.writeDelimitedTo(byteArrayOutputStream);// 序列化
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
        PersonFactory.Person dePerson03 = PersonFactory.Person.parseDelimitedFrom(byteArrayInputStream);// 反序列化
        System.out.println(dePerson03.toString());
    }
}
```

---

## Protostuff
### Pom文件
```xml
<dependency>
    <groupId>io.protostuff</groupId>
    <artifactId>protostuff-core</artifactId>
    <version>1.5.9</version>
</dependency>
<dependency>
    <groupId>io.protostuff</groupId>
    <artifactId>protostuff-runtime</artifactId>
    <version>1.5.9</version>
</dependency>
<dependency>
    <groupId>io.protostuff</groupId>
    <artifactId>protostuff-api</artifactId>
    <version>1.5.9</version>
</dependency>
```
### 测试代码
```java
package com.example.protostuff;

import io.protostuff.LinkedBuffer;
import io.protostuff.ProtostuffIOUtil;
import io.protostuff.runtime.RuntimeSchema;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * @author XiaShuai on 2020/7/7.
 */
public class ProtostuffDemo {
    public static void main(String[] args) throws Exception {
        List<String> list = new ArrayList<String>();
        list.add("a");
        list.add("b");
        Person person = new Person(1, "111", list);
        RuntimeSchema<Person> schema = RuntimeSchema.createFrom(Person.class);

        // 序列化/反序列化,方式1,byte[]
        byte[] bytes = ProtostuffIOUtil.toByteArray(person, schema, LinkedBuffer.allocate(LinkedBuffer.DEFAULT_BUFFER_SIZE)); // 序列化
        System.out.println(bytes.length);
        Person dePerson1 = schema.newMessage();
        ProtostuffIOUtil.mergeFrom(bytes, dePerson1, schema); // 反序列化
        System.out.println(dePerson1.toString());

        // 序列化/反序列化,方式2,InputStream
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        ProtostuffIOUtil.writeDelimitedTo(byteArrayOutputStream, person, schema, LinkedBuffer.allocate(LinkedBuffer.DEFAULT_BUFFER_SIZE)); // 序列化
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
        Person dePerson2 = schema.newMessage();
        ProtostuffIOUtil.mergeDelimitedFrom(byteArrayInputStream, dePerson2, schema); // 反序列化
        System.out.println(dePerson2);
    }
}

class Person {
    int age;
    List<String> more;
    private String name;

    public Person() {
    }

    public Person(int age, String name, List<String> more) {
        this.age = age;
        this.name = name;
        this.more = more;
    }

    public int getAge() {
        return age;
    }

    public void setAge(int age) {
        this.age = age;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<String> getMore() {
        return more;
    }

    public void setMore(List<String> more) {
        this.more = more;
    }

    @Override
    public String toString() {
        return "Person{" +
                "age=" + age +
                ", name='" + name + '\'' +
                ", more=" + more +
                '}';
    }
}
```