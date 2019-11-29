---
title: Flink出现Could not forward element to next operator问题
date: 2019-11-29 16:09:08
categories: 大数据
tags: flink
---

> 解决问题 Caused by: org.apache.flink.streaming.runtime.tasks.ExceptionInChainedOperatorException: Could not forward element to next operator

<!-- more -->

## 字面意思
无法将元素转发到下一个运算符

---

## 出现原因
这个异常一般是数据源端，出现脏数据，存在null值导致的。

---

## 解决办法
```
判断空值,赋默认值
case when datetime is null
then timestamp '1970-01-01 00:00:00' 
else `datetime` end
```