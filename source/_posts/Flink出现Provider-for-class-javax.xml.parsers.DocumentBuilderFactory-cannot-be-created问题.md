---
title: Flink出现Provider for class javax.xml.parsers.DocumentBuilderFactory cannot be created问题
date: 2019-11-29 17:09:08
categories: 大数据
tags: flink
---

> 解决问题 Provider for class javax.xml.parsers.DocumentBuilderFactory cannot be created

<!-- more -->

## 问题原因
xml-apis冲突问题

---

## 解决办法
去除xml-apis依赖
```
<dependency>
    <groupId>org.apache.hadoop</groupId>
    <artifactId>hadoop-client</artifactId>
    <version>${hadoop.version}</version>
    <exclusions>
        <exclusion>
            <groupId>xml-apis</groupId>
            <artifactId>xml-apis</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```