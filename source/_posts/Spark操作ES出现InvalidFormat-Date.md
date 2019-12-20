---
title: Spark操作ES出现InvalidFormat:Date
date: 2018-12-12 10:42:57
categories: 大数据
tags:
    - elk
    - spark
---

> 读取ES出现时间解析错误

<!-- more -->

# 解决办法
```
# sparkconf中设置es.mapping.date.rich为false
conf.set("es.mapping.date.rich", "false");

# 在命令行提交时设置spark.es.mapping.date.rich为false
--conf spark.es.mapping.date.rich=false

# 可以不解析为date，直接返回string。

```