---
title: HBase的工作原理
date: 2017-11-23 08:50:29
categories: 大数据
tags: hbase
---

> Hbase工作原理介绍

<!-- more -->

## 系统架构
```
# Client
包含访问HBase的接口，Client维护着一些cache来加快对HBase的访问，比如Region的位置信息。

# Zookeeper
保证任何时候，集群中只有一个Master
存贮所有Region的寻址入口，root表在哪台服务器上。
实时监控Region Server的状态，将Region server的上线和下线信息实时通知给Master
存储HBase的schema,包括有哪些table，每个table有哪些column family

# Master
为Region Server分配Region
负责Region Server的负载均衡
发现失效的Region Server并重新分配其上的Region
HDFS上的垃圾文件回收
处理schema更新请求

# Region Server
Region Server维护Master分配给它的Region，处理对这些Region的IO请求
Region Server负责切分在运行过程中变得过大的Region

# 注意
可以看到，Client访问HBase上数据的过程并不需要Master参与（寻址访问Zookeeper和Region Server，数据读写访问Region Server），Master仅仅维护者table和region的元数据信息，负载很低。
```

---

## 物理存储
```
# Table的存储方式
Table中的所有行都按照row key的字典序排列。
Table在行的方向上分割为多个Region。
Region按大小分割的，每个表一开始只有一个Region，随着数据不断插入表，Region不断增大，当增大到一个阀值的时候，Region就会等分会两个新的Region。当Table中的行不断增多，就会有越来越多的Region。
Region是Hbase中分布式存储和负载均衡的最小单元。最小单元就表示不同的Region可以分布在不同的Region Server上。但一个Region是不会拆分到多个Region Server上的。
Region虽然是分布式存储的最小单元，但并不是物理存储的最小单元。
事实上，Region由一个或者多个Store组成，每个Store保存一个column family。
每个Strore又由一个MemStore和0至多个StoreFile组成。如上图

# MemStore & StoreFile
一个Region由多个Store组成，每个Store包含一个列族的所有数据
Store包括位于内存的MemStore和位于硬盘的StoreFile
写操作先写入MemStore,当MemStore中的数据量达到某个阈值，Region Server启动flashcache进程写入StoreFile,每次写入形成单独一个StoreFile
当StoreFile大小超过一定阈值后，会把当前的Region分割成两个，并由Master分配给相应的Region Server，实现负载均衡
客户端检索数据时，先在MemStore找，找不到再找StoreFile
StoreFile以HFile格式保存在HDFS上。

# HFile
Data Block段: 保存表中的数据，这部分可以被压缩
Meta Block段(可选的): 保存用户自定义的kv对，可以被压缩。
File Info段: Hfile的元信息，不被压缩，用户也可以在这一部分添加自己的元信息。
Data Block Index段: Data Block的索引。每条索引的key是被索引的block的第一条记录的key。
Meta Block Index段(可选的): Meta Block的索引。
Trailer: 
    这一段是定长的。保存了每一段的偏移量，读取一个HFile时，会首先 读取Trailer，Trailer保存了每个段的起始位置(段的Magic Number用来做安全check).
    然后，DataBlock Index会被读取到内存中，这样，当检索某个key时，不需要扫描整个HFile，而只需从内存中找到key所在的block，通过一次磁盘io将整个 block读取到内存中，再找到需要的key。
    DataBlock Index采用LRU机制淘汰。
HFile的Data Block，Meta Block通常采用压缩方式存储，压缩之后可以大大减少网络IO和磁盘IO，随之而来的开销当然是需要花费cpu进行压缩和解压缩。
目标HFile的压缩支持两种方式：Gzip，Lzo。

# HLog(WAL Log)
HLog记录数据的所有变更,一旦数据修改，就可以从log中进行恢复
每个Region Server维护一个HLog,而不是每个Region一个。这样不同Region(来自不同table)的日志会混在一起.
这样做的目的是不断追加单个文件相对于同时写多个文件而言，可以减少磁盘寻址次数，因此可以提高对table的写性能。
带来的麻烦是，如果一台Region Server下线，为了恢复其上的Region，需要将Region Server上的log进行拆分，然后分发到其它Region Server上进行恢复。
```

---

## 寻址机制
```
# 两个关键表
ROOT表 & META表

# 假设我们要从Table里面插寻一条RowKey是RK10000的数据
a.从META表里面查询哪个Region包含这条数据
b.获取管理这个Region的RegionServer地址
c.连接这个RegionServer, 查到这条数据

# 系统如何找到某个RK
a.第一层是保存Zookeeper里面的文件，它持有ROOT Region的位置
b.ROOT Region是META表的第一个Region,其中保存了META表其它Region的位置,通过ROOT Region，我们就可以访问META表的数据
c.META是第三层，它是一个特殊的表，保存了HBase中所有数据表的Region位置信息

# 注意
ROOT Region永远不会被split，保证了最需要三次跳转，就能定位到任意Region
META表每行保存一个Region的位置信息，RK采用表名加表的最后一行编码而成。
为了加快访问，META表的全部Region都保存在内存中。
Client会将查询过的位置信息保存缓存起来，缓存不会主动失效，因此如果Client上的缓存全部失效，则需要进行最多6次网络来回，才能定位到正确的Region(其中三次用来发现缓存失效，另外三次用来获取位置信息)。
```

--- 

## 读写过程
```
# 读请求过程
客户端通过Zookeeper以及ROOT表和META表找到目标数据所在的Region Server
联系Region Server查询目标数据
Region Server定位到目标数据所在的Region，发出查询请求
Region先在MemStore中查找，命中则返回
如果在MemStore中找不到，则在StoreFile中扫描（可能会扫描到很多的StoreFile--bloomfilter）

# 写请求过程
Client向Region Server提交写请求
Region Server找到目标Region
Region检查数据是否与schema一致
如果客户端没有指定版本，则获取当前系统时间作为数据版本
将更新写入WAL log
将更新写入MemStore
判断MemStore的是否需要flush为StoreFile

# 注意
数据在更新时首先写入HLog(WAL log)和内存(MemStore)中，MemStore中的数据是排序的，当MemStore累计到一定阈值时，就会创建一个新的MemStore，并 且将老的MemStore添加到flush队列，由单独的线程flush到磁盘上，成为一个StoreFile。
于此同时，系统会在Zookeeper中记录一个redo point，表示这个时刻之前的变更已经持久化了。
当系统出现意外时，可能导致内存(MemStore)中的数据丢失，此时使用Log(WAL log)来恢复checkpoint之后的数据。
StoreFile是只读的，一旦创建后就不可以再修改。因此Hbase的更新其实是不断追加的操作。
当一个Store中的StoreFile达到一定的阈值后，就会进行一次合并(minor_compact, major_compact),将对同一个key的修改合并到一起，形成一个大的StoreFile，当StoreFile的大小达到一定阈值后，又会对 StoreFile进行split，等分为两个StoreFile。
```

---

## Region管理
```
# Region分配
任何时刻，一个Region只能分配给一个Region Server。Master记录了当前有哪些可用的Region Server。以及当前哪些Region分配给了哪些Region Server，哪些Region还没有分配。
当需要分配的新的Region，并且有一个Region Server上有可用空间时，Master就给这个Region Server发送一个装载请求，把Region分配给这个Region Server。Region Server得到请求后，就开始对此Region提供服务。

# Region Server上线
Master使用Zookeeper来跟踪Region Server状态。当某个Region Server启动时，会首先在Zookeeper上的server目录下建立代表自己的znode，并获得该znode的独占锁。
由于Master订阅了server目录上的变更消息，当server目录下的文件出现新增或删除操作时，Master可以得到来自Zookeeper的实时通知。因此一旦Region Server上线，Master能马上得到消息。

# Region Server下线
当Region Server下线时，它和Zookeeper的会话断开，Zookeeper而自动释放代表这台server的文件上的独占锁。而Master不断轮询server目录下文件的锁状态。
如果Master发现某个Region Server丢失了它自己的独占锁，(或者Master连续几次和Region Server通信都无法成功),Master就是尝试去获取代表这个Region Server的读写锁，一旦获取成功，就可以确定：
    Region Server和Zookeeper之间的网络断开了。
    Region Server挂了。
无论哪种情况，Region Server都无法继续为它的Region提供服务了，此时Master会删除server目录下代表这台Region Server的znode数据，并将这台Region Server的Region分配给其它还活着的同志。
如果网络短暂出现问题导致Region Server丢失了它的锁，那么Region Server重新连接到zookeeper之后，只要代表它的文件还在，它就会不断尝试获取这个文件上的锁，一旦获取到了，就可以继续提供服务。
```

---

## Master工作机制
```
# Master上线
Master启动进行以下步骤:
    从Zookeeper上获取唯一一个代表Active Master的锁，用来阻止其它Master成为Master。
    扫描Zookeeper上的server父节点，获得当前可用的Region Server列表。
    和每个Region Server通信，获得当前已分配的Region和Region Server的对应关系。
    扫描META Region的集合，计算得到当前还未分配的Region，将他们放入待分配Region列表。
 
# Master下线
由于Master只维护表和Region的元数据，而不参与表数据IO的过程，Master下线仅导致所有元数据的修改被冻结(无法创建删除表，无法修改表的schema，无法进行Region的负载均衡，无法处理Region 上下线，无法进行Region的合并，唯一例外的是Region的split可以正常进行，因为只有Region Server参与)，表的数据读写还可以正常进行。
因此Master下线短时间内对整个NBase集群没有影响。从上线过程可以看到，Master保存的信息全是可以冗余信息（都可以从系统其它地方收集到或者计算出来），因此，一般HBase集群中总是有一个Master在提供服务，还有一个以上 的Master在等待时机抢占它的位置。
```