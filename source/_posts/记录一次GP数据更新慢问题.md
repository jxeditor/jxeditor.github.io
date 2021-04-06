---
title: 记录一次GP数据更新慢问题
date: 2021-03-29 16:47:58
categories: 大数据
tags: greenplum
---

> 使用GP进行ETL过程中发现插入速度正常,更新查询速度过慢,[传送门](https://blog.csdn.net/xfg0218/article/details/83031550)

<!-- more -->

## 问题产生原因
```
GP支持行存和列存,对于列存,虽然是AppendOnly,但也是可以进行删除更新操作
进行删除更新操作,并没有直接进行物理删除,而是通过BItMap进行标记
当一张列存存在大量删除更新操作,对于查询扫描的成本是很浪费的
PG可以通过Hot技术和AutoVacuum来避免和减少垃圾空间产生
但是GP没有自动回收功能,需要手动进行触发
```

---

## 解决方式
```
一.可删表情况下
根源上解决,删表重建,不使用列存方式

二.不可删表情况下
执行vacuum table,共享锁(但是需要膨胀率大于gp_append_only_compaction_threshold)
执行vacuum full table,DDL锁(很吃CPU和IO)
执行重分布,DDL
```

---

## 查看存储类型
```
# \timing  打开SQL执行时间
# select distinct relstorage from pg_class;
h = 堆表(heap),索引
a = append only row存储表
c = append only column存储表
x = 外部表(external table)
v = 视图
```

---

## 查看当前有哪些AO表
```
# select t2.nspname,t1.relname from pg_class t1,pg_namespace t2 where t1.relnamespace = t2.oid and relstorage in ('c','a');
```

---

## 查看AO表的膨胀率
```
# select * from gp_toolkit.__gp_aovisimap_compaction_info('tablename'::regclass);
gp_appendonly_compaction_threshold:AO压缩进程
content:对应gp_configuration.content,表示GP每个节点的唯一编号
datafile:数据文件编号
hidden_tupcount:已更新或删除记录数(不可见)
total_tupcount:总共记录数(包含更新删除记录)
percent_hidden:不可见记录占比,如果占比大于gp_appendonly_compaction_threshold,执行vacuum会收缩这个数据文件
compaction_possible:数据文件是否可以被收缩
```

---

## 检查系统中膨胀率超过N的AO表
```
# select * from (select t2.nspname, t1.relname, (gp_toolkit.__gp_aovisimap_compaction_info(t1.oid)).* from pg_class t1, pg_namespace t2 where t1.relnamespace=t2.oid and relstorage in ('c', 'a')) t where t.percent_hidden > 0.2;
```

---

## 查看膨胀数据的占用大小
```
# select pg_size_pretty(pg_relation_size('tablename'));
```