---
title: HBase知识点整理
date: 2018-01-31 09:06:07
categories: 大数据
tags: hbase
---

> 整理一下HBase经常会问到的知识性的问题

<!-- more -->

## HBase的特点是什么?
```
HBase一个分布式的基于列式存储的数据库，基于Hadoop的 hdfs存储，zookeeper进行管理。

HBase适合存储半结构化或非结构化数据，对于数据结构字段不够确定或者杂乱无章很难按一个概念去抽取的数据。

HBase中值为null的记录不会被存储。

基于的表包含rowkey，时间戳，和列族。新写入数据时，时间戳更新，同时可以查询到以前的版本。

HBase是主从架构。HMaster作为主节点，HRegionServer 作为从节点。
```

---

## HBase如何导入,导出数据?
```
使用MapReduce Job方式，根据HbaseAPI编写java脚本，将文本文件用文件流的方式截取，然后存储到多个字符串数组中.
在put方法下，通过对表中的列族进行for循环遍历列名，用if判断列名后进行for循环.
调用put.add的方法对列族下每一个列进行设值，每个列族下有几个了就赋值几次！没有表先对先创建表。

# 导入数据
hbase org.apache.hadoop.hbase.mapreduce.Driver import tablename hdfspath
hbase org.apache.hadoop.hbase.mapreduce.Import tablename hdfspath

# 导出数据
hbase org.apache.hadoop.hbase.mapreduce.Driver export tablename hdfspath
hbase org.apache.hadoop.hbase.mapreduce.Export tablename hdfspath
```

---

## HBase的存储结构?
```
HBase中的每张表都通过行键(rowkey)按照一定的范围被分割成多个子表（HRegion）.

默认一个HRegion超过256M就要被分割成两个，由HRegionServer管理，管理哪些HRegion由Hmaster分配。

HRegion存取一个子表时，会创建一个HRegion对象，然后对表的每个列族（Column Family）创建一个store实例.

每个store都会有0个或多个StoreFile与之对应，每个StoreFile都会对应一个HFile.

HFile就是实际的存储文件，因此，一个HRegion还拥有一个MemStore实例。
```

---

## HBase和Hive有什么区别？Hive与HBase的底层存储是什么？Hive是产生的原因是什么？HBase是为了弥补Hadoop的什么缺陷?
```
a.共同点
hbase与hive都是架构在hadoop之上的。都是用hadoop作为底层存储.

b.区别
Hive是建立在Hadoop之上为了减少MapReducejobs编写工作的批处理系统
HBase是为了支持弥补Hadoop对实时操作的缺陷的项目

想象你在操作RMDB数据库，如果是全表扫描，就用Hive+Hadoop，如果是索引访问，就用HBase+Hadoop。

Hive query就是MapReduce jobs可以从5分钟到数小时不止，HBase是非常高效的，肯定比Hive高效的多。

Hive本身不存储和计算数据，它完全依赖于HDFS和 MapReduce，Hive中的表纯逻辑。

Hive借用Hadoop的MapReduce来完成一些Hive中的命令的执行.

HBase是物理表，不是逻辑表，提供一个超大的内存hash表，搜索引擎通过它来存储索引，方便查询操作。

HBase是列存储。

HDFS作为底层存储，HDFS是存放文件的系统，而HBase负责组织文件。

Hive需要用到HDFS存储文件，需要用到MapReduce计算框架。
```

---

## 解释下HBase实时查询的原理?
```
实时查询，可以认为是从内存中查询，一般响应时间在1秒内。

HBase的机制是数据先写入到内存中，当数据量达到一定的量（如 128M），再写入磁盘中.

在内存中，是不进行数据的更新或合并操作的，只增加数据.

这使得用户的写操作只要进入内存中就可以立即返回，保证了HBase I/O的高性能。
```

---

## 列簇怎么创建比较好?
```
rowKey最好要创建有规则的rowKey，即最好是有序的。

HBase中一张表最好只创建一到两个列族比较好，因为HBase不能很好的处理多个列族。
```

---

## 描述HBase的rowKey的设计原则
```
a.rowkey长度原则
rowkey是一个二进制码流，可以是任意字符串，最大长度64kb.
实际应用中一般为10-100bytes，以 byte[]形式保存，一般设计成定长。
建议越短越好，不要超过16个字节， 原因如下：
    数据的持久化文件HFile中是按照KeyValue存储的，如果rowkey过长会极大影响HFile的存储效率.
    MemStore将缓存部分数据到内存，如果rowkey字段过长，内存的有效利用率就会降低.
    系统不能缓存更多的数据，这样会降低检索效率.

b.rowkey散列原则
如果rowkey按照时间戳的方式递增，不要将时间放在二进制码的前面.
建议将rowkey的高位作为散列字段，由程序随机生成，低位放时间字段.
这样将提高数据均衡分布在每个RegionServer，以实现负载均衡的几率。
如果没有散列字段，首字段直接是时间信息，所有的数据都会集中在一个RegionServer上.
这样在数据检索的时候负载会集中在个别的RegionServer 上，造成热点问题，会降低查询效率。

c.rowkey唯一原则
必须在设计上保证其唯一性，rowkey是按照字典顺序排序存储的.
因此，设计rowkey的时候，要充分利用这个排序的特点.
将经常读取的数据存储到一块，将最近可能会被访问的数据放到一块。
```

---

## 描述 Hbase 中 scan 和 get 的功能以及实现的异同
```
a.按指定RowKey获取唯一一条记录，get方法( org.apache.hadoop.hbase.client.Get)
Get的方法处理分两种:
    设置了ClosestRowBefore和没有设置的rowlock主要是用来保证行的事务性，即每个get是以一个row来标记的.
    一个row中可以有很多family和column。

b.按指定的条件获取一批记录，scan方法(org.apache.Hadoop.hbase.client.Scan)
实现条件查询功能使用的就是scan方式:
    scan可以通过setCaching与setBatch方法提高速度(以空间换时间);
    scan可以通过setStartRow与setEndRow来限定范围([start，end]start? 是闭区间，end 是开区间)。范围越小，性能越高;
    scan可以通过setFilter方法添加过滤器，这也是分页、多条件查询的基础。 
    
c.全表扫描，即直接扫描整张表中所有行记录。
```

---

## 请详细描述HBase中一个Cell的结构
```
HBase中通过row和columns确定的为一个存贮单元称为cell。
Cell：由{row key，column(=<family> + <label>)，version}是唯一确定的单元.
Cell中的数据是没有类型的，全部是字节码形式存贮。
```

---

## 简述HBase中compact用途是什么，什么时候触发，分为哪两种，有什么区别，有哪些相关配置参数?
```
a.compact的用途
在HBase中每当有memstore数据flush到磁盘之后，就形成一个storeFile.
当storeFile的数量达到一定程度后，就需要将storeFile文件来进行compaction操作。
Compact的作用：
    合并文件
    清除过期，多余版本的数据
    提高读写数据的效率

b.种类与区别
种类:
    minor
    major
区别:
    Minor操作只用来做部分文件的合并操作以及包括minVersion=0并且设置ttl的过期版本清理，不做任何删除数据、多版本数据的清理工作。
    Major操作是对Region下的HStore下的所有StoreFile执行合并操作，最终的结果是整理合并出一个文件。
```

---

## 简述HBase Filter的实现原理是什么？结合实际项目经验，写出几个使用Filter的场景。
```
HBase为筛选数据提供了一组过滤器，通过这个过滤器可以在 HBase中的数据的多个维度（行，列，数据版本）上进行对数据的筛选操作，也就是说过滤器最终能够筛选的数据能够细化到具体的一个存储单元格上（由行键，列名，时间戳定位）。
RowFilter、PrefixFilter。HBase的filter是通过scan设置的，所以是基于scan的查询结果进行过滤。
过滤器的类型很多，但是可以分为两大类<比较过滤器，专用过滤器>。
过滤器的作用是在服务端判断数据是否满足条件，然后只将满足条件的数据返回给客户端。
如在进行订单开发的时候，我们使用rowkeyfilter过滤出某个用户的所有订单。
```

---

## HBase内部是什么机制？
```
在HBase中无论是增加新行还是修改已有的行，其内部流程都是相同的。
HBase接到命令后存下变化信息，或者写入失败抛出异常。默认情况下，执行写入时会写到两个地方：预写式日志（write-ahead log，也称HLog）和MemStore。
HBase的默认方式是把写入动作记录在这两个地方，以保证数据持久化。
只有当这两个地方的变化信息都写入并确认后，才认为写动作完成。

MemStore是内存里的写入缓冲区，HBase中数据在永久写入硬盘之前在这里累积。
当MemStore填满后，其中的数据会刷写到硬盘，生成一个HFile。HFile是HBase使用的底层存储格式。
HFile对应于列族，一个列族可以有多个HFile，但一个HFile不能存储多个列族的数据。
在集群的每个节点上，每个列族有一个MemStore。
大型分布式系统中硬件故障很常见，HBase也不例外。

设想一下，如果MemStore还没有刷写，服务器就崩溃了，内存中没有写入硬盘的数据就会丢失。
HBase的应对办法是在写动作完成之前先写入WAL。
HBase集群中每台服务器维护一个WAL来记录发生的变化。
WAL是底层文件系统上的一个文件。
直到WAL新记录成功写入后，写动作才被认为成功完成。
这可以保证HBase和支撑它的文件系统满足持久性。

大多数情况下，HBase使用Hadoop分布式文件系统（HDFS）来作为底层文件系统。
如果HBase服务器宕机，没有从MemStore里刷写到HFile的数据将可以通过回放WAL来恢复。
你不需要手工执行。Hbase的内部机制中有恢复流程部分来处理。
每台HBase服务器有一个WAL，这台服务器上的所有表（和它们的列族）共享这个WAL。
你可能想到，写入时跳过WAL应该会提升写性能。但我们不建议禁用WAL，除非你愿意在出问题时丢失数据。

注意：
    不写入WAL会在RegionServer故障时增加丢失数据的风险。
    关闭WAL，出现故障时HBase可能无法恢复数据，没有刷写到硬盘的所有写入数据都会丢失。
```

---

## HBase宕机如何处理？
```
宕机分为HMaster宕机和HRegisoner宕机.
如果是HRegisoner宕机，HMaster会将其所管理的region重新分布到其他活动的RegionServer上，由于数据和日志都持久在HDFS中，该操作不会导致数据丢失。
所以数据的一致性和安全性是有保障的。

如果是HMaster宕机，HMaster没有单点问题，HBase中可以启动多个HMaster，通过Zookeeper的Master Election机制保证总有一个Master运行。
即ZooKeeper会保证总会有一个HMaster在对外提供服务。
```