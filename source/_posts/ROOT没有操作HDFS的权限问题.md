---
title: ROOT没有操作HDFS的权限问题
date: 2017-01-13 12:05:37
categories: 大数据
tags: cdh
---

> 没有权限操作hdfs

<!-- more -->

## 解决办法
```
# 不能su hdfs的话,修改/etc/passwd中hdfs对应的/sbin/nologin,改为/bin/bash
su - hdfs
hdfs dfs -chown -R root:hdfs /
# 就可以了
```