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
# hbase已存在的表,需要使用外部表的形式创建
CREATE EXTERNAL TABLE hbase_hive_1(key int, value string)   
STORED BY 'org.apache.hadoop.hive.hbase.HBaseStorageHandler'   
WITH SERDEPROPERTIES ("hbase.columns.mapping" = ":key,cf1:val")   
TBLPROPERTIES ("hbase.table.name" = "xyz");  

# 复杂数据类型,hbase表test2中的字段为user:gid,user:sid,info:uid,info:level
CREATE EXTERNAL TABLE hive_test_2(key int,user map<string,string>,info map<string,string>)   
STORED BY 'org.apache.hadoop.hive.hbase.HBaseStorageHandler'   
WITH SERDEPROPERTIES ("hbase.columns.mapping" ="user:,info:")    
TBLPROPERTIES  ("hbase.table.name" = "test2");  
```