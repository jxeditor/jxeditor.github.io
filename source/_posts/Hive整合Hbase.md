---
title: Hive整合Hbase
date: 2017-08-30 10:52:41
categories: 大数据
tags: hive
---

> hive表数据依赖于hbase数据

<!-- more -->

## 创建表
```
CREATE TABLE hbase_hive_1(key int, value string)   
STORED BY 'org.apache.hadoop.hive.hbase.HBaseStorageHandler'   
WITH SERDEPROPERTIES ("hbase.columns.mapping" = ":key,cf1:val")   
TBLPROPERTIES ("hbase.table.name" = "xyz");  
```