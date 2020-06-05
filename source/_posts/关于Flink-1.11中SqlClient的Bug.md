---
title: 关于Flink-1.11中SqlClient的Bug
date: 2020-06-03 09:44:47
categories: 大数据
tags: flink
---

> 在使用SqlClient时出现的一些问题整理

<!-- more -->

## CatalogName或DBName获取不到
### 问题描述
```
使用use catalog name或use name会报错
Flink SQL> use catalog hive;
[ERROR] Could not execute SQL statement. Reason:
org.apache.flink.table.catalog.exceptions.CatalogException: A catalog with name [`hive`] does not exist.
```
### 解决
[FLINK-18055](https://issues.apache.org/jira/projects/FLINK/issues/FLINK-18055)
```
出现这种问题的原因是SqlCommanParser类中
name被``包裹着,但是这种写法不识别
operands = new String[]{String.format("`%s`", ((UseCatalogOperation) operation).getCatalogName())};
operands = new String[]{String.format("`%s`.`%s`", op.getCatalogName(), op.getDatabaseName())};

目前的解决方案去掉``,个人感觉并没有很好的解决``的问题
operands = new String[]{((UseCatalogOperation) operation).getCatalogName()};
operands = new String[]{((UseDatabaseOperation) operation).getDatabaseName()};

看1.10版本能够知道使用的是正则
USE_CATALOG(
    "USE\\s+CATALOG\\s+(.*)",
    SINGLE_OPERAND),
USE(
    "USE\\s+(?!CATALOG)(.*)",
    SINGLE_OPERAND)

SqlClient的一些语句使用并没有符合SQL的标准规范
use catalog hive;可以使用,但是use catalog `hive`;就不能被识别

优化为
在现有的基础上使用StringUtils.strip()方法
operands = new String[]{StringUtils.strip(((UseCatalogOperation) operation).getCatalogName(),"`")}

或者切回1.10版本模式修改正则,让其符合SQL的命名规范
USE_CATALOG(
    "USE\\s+CATALOG\\s+`?(\\w+)*`?",
    SINGLE_OPERAND),
USE(
    "USE\\s+(?!CATALOG)`?(\\w+)*`",
    SINGLE_OPERAND)
```