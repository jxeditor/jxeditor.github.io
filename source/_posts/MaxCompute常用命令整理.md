---
title: MaxCompute常用命令整理
date: 2020-08-03 19:55:56
categories: 大数据
tags: alibaba
---

> 整理日常开发中会使用到的一些命令

<!-- more -->

## 下载
```sh
# 下载表数据
tunnel download tableName/partitionKey=partitionValue result.csv

# 下载查询结果
tunnel download instance://instanceID result.csv
```