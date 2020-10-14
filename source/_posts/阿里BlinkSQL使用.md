---
title: 阿里BlinkSQL使用
date: 2020-10-14 11:37:33
categories: 大数据
tags: flink
---

> 现公司使用的都是阿里云组件,并无自建大数据环境,与开源还是有一定的区别,DataStream兼容Flink1.5版本
> [传送门](https://help.aliyun.com/document_detail/62515.html?spm=a2c4g.11186623.6.703.1dbd4706FtJCkK)

<!-- more -->

## 源表
### 源表支持
```
DataHub源表
Oracle数据库源表
日志服务SLS源表
Hologres源表
MQ源表
Kafka源表
TableStore源表
全量MaxCompute源表
增量MaxCompute源表
```

---

## 结果表
### 结果表支持
```
MySQL结果表
Hologres结果表
Oracle结果表
DataHub结果表
日志服务SLS结果表
MQ结果表
TableStore结果表
RDS结果表
MaxCompute结果表
HBase结果表
ElasticSearch结果表
时间序列数据库结果表
Kafka结果表
HybridDB For MySQL结果表
RDS SQL Server结果表
Redis结果表
MongoDB结果表
PostgreSQL结果表
自定义结果表
InfluxDB结果表
Phoenix5结果表
```

---

## 维表
### 维表支持
```
Hologres维表
TableStore维表
HBase维表
RDS维表
MaxCompute维表
Redis维表
Phoenix5维表
ElasticSearch维表
MySQL维表
```