---
title: HBase的基本命令
date: 2019-10-24 15:58:31
categories: 大数据
tags: hbase
---

> 记录Hbase常用的命令以及对性能帮助大的命令.

<!-- more -->

## major_compact
```
# 合并文件,清除删除,过期,多余版本的数据,提高读写数据的效率
# HBase中实现了两种Compaction的方式
Minor: 操作只用来做部分文件的合并操作以及包括minVersion=0并且设置ttl的过期版本清理，不做任何删除数据、多版本数据的清理工作。
Major: 操作是对Region下的HStore下的所有StoreFile执行合并操作，最终的结果是整理合并出一个文件。

# 使用的时机<major_compact是很重的后台操作>
业务低峰时段执行
优先考虑含有TTL的表
storefile短期内增加比较多
表中storefile平均大小比较小
```