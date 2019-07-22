---
title: Hive自连接与窗口分析函数的妙用
date: 2019-07-22 14:46:02
categories: 大数据
tags: hive
---

> 对于HQL的窗口函数,大家可能都不陌生,尤其一些求topN等等.本人在网上就看到一些很神奇的列子.

<!-- more -->
# 基本需求
> 有一张demo表,有id(用户),date(月份),pv(访问量)三个字段,针对表中数据实现相对应的业务需求
```
name    date        pv
A       2015-01     5
A       2015-01     15
B       2015-01     5
A       2015-01     8
B       2015-01     25
A       2015-01     5
A       2015-02     4
A       2015-02     6
A       2015-02     4
B       2015-02     10
B       2015-02     5
A       2015-03     16
A       2015-03     22
B       2015-03     23
B       2015-03     10
B       2015-03     11
```
**需求:** 
求每个用户截止每月为止的最大单月访问次数和累计到该月的总访问次数

---

# 实现
## 自连接方式
```sql
select a.name,a.date,a.pv,max(b.pv),sum(b.pv)
from
(
    select name,date,sum(pv) pv
    from demo
    group by name,date
) a
join
(
    select name,date,sum(pv) pv
    from demo
    group by name,date
) b
on a.name=b.name
where a.date >= b.date
group by a.name,a.date,a.pv;
```
## 窗口函数方式
```sql
select a.name,a.date,a.pv,
sum(a.pv) over (partition by a.name order by a.date) sumpv,
max(a.pv) over (partition by a.name order by a.date) maxpv
from
(
    select name,date,sum(pv) pv
    from demo
    group by name,date
) a;
```
**实测: **
两种方式对应的job数为6:1

---
