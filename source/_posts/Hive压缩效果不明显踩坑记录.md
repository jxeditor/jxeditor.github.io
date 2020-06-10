---
title: Hive压缩效果不明显踩坑记录
date: 2020-06-10 17:45:33
categories: 大数据
tags: hive
---

> 记录一下Hive的配置参数漏配的严重后果

<!-- more -->

## 前因
```
项目逻辑
    1.Spark实时任务每五分钟生成parquet格式的snappy压缩文件
    2.另有一个Spark离线任务对前一天生成的小文件进行合并

问题
    发现合并前小文件总大小要远远小于合并后的文件总大小
    足有两倍的差值
```

---

## 解决
```
建表时漏配置
    parquet.page.size
    parquet.dictionary.page.size
导致仍使用默认值1M,压缩效果极其不理想

由于表是外部表,删除表重新创建表,或修改表属性
ALTER TABLE tableName set TBLPROPERTIES ('parquet.page.size'='33554432');
ALTER TABLE tableName set TBLPROPERTIES ('parquet.dictionary.page.size'='33554432');
```