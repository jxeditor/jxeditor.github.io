---
title: Flink业务方向遇到的问题与解决
date: 2021-03-17 15:07:21
categories: 大数据
tags: flink
---

> 记录在使用Flink的过程中遇到的一系列问题以及解决方式,来源于工作以及[社区](http://apache-flink.147419.n8.nabble.com/).

<!-- more -->

### 1.[FlinkSQL使用IF(condition,col,null)时出现Illegal use of 'NULL'?](http://apache-flink.147419.n8.nabble.com/Flink-sql-NULL-td8495.html)
```
IF(condition,col,cast(null as int))
不支持隐式类型,需要手动设置NULL的类型SQL才能通过编译.
```

---

### 2.[FlinkSQL的StatementSet执行顺序?](http://apache-flink.147419.n8.nabble.com/statement-td11143.html)
```
Source 1,2
statementSet.add(insert1)
statementSet.add(insert2)

情况1:
Sink1和Sink2通过Chain之后和Source处于同一物理节点
执行时每处理一条数据,先发送给其中1个Sink再发送给另一个,然后才处理下一条数据

情况2:
Sink1和Sink2,Source处于不同的物理节点,异步,每处理一条数据,通过网络发送给Sink1和Sink2
同时网络有Buffer,所以Sink1和Sink2收到数据的顺序完全不确定.

以上是基于Edgar调度进行执行,如果基于Lazy调度就是另一种模式,等Source完全处理完数据再发送
```