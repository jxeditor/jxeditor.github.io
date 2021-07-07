---
title: Alluxio实操Bilibili视频观看
date: 2021-07-06 15:22:02
categories: 大数据
tags: alluxio
---

> 对alluxio进行深入了解

<!-- more -->

## 元数据存储
```
元数据(文件系统树,文件权限,文件块位置)
    Alluxio大部分元数据存储于主节点上

存储方式
    ROCKS: 基于RocksDB的磁盘元数据存储
        内存磁盘混合使用,默认高速缓存大小(1000w inode),大约10GB内存
        缓存采用LRU策略进行异步替换
        元数据存储方式 alluxio.master.metastore=ROCKS
        RocksDB写入数据的本地目录 aliuxio.master.metastore.dir=filepath
        对inode缓存大小的硬性限制 alluxio.master.metastore.inode.cache.max.size=10000000
        刷新到RocksDB的批处理大小 alluxio.master.metastore.inode.cache.evict.batch.size=1000
        移出缓存的最大缓存大小比率 alluxio.master.metastore.inode.cache.high.water.mark.ratio=0.85
        移出的最大高速缓存大小比率 alluxio.master.metastore.inode.cache.low.water.mark.ratio=0.8
    HEAP: 基于堆上的元数据存储(默认)
        32GB的Master内存,可以支持约4000w个文件

元数据切换
    切换元数据类型,需要格式化Alluxio日志,擦除Alluxio元数据
    切换后保存现有数据需要执行日志备份和还原
    步骤:
        备份日志生成备份文件 alluxio fsadmin backup
        停止Masters alluxio-stop.sh stop masters
        元数据配置更新
        格式化masters alluxio formatMaster
        重启master alluxio-start.sh -i ${BACKUP_PATH} master
```

---

## 挂载
```
提供两种挂载方式
    启动前
        提前配置,直接挂载在根目录下
        始终有一个根挂载点
    启动后
        可挂载在根目录下的任何目录
        0或N个挂载点
```

---

## 配置项
```
Common Configuration(通用配置)
    alluxio.debug=false
    alluxio.logs.dir=${ALLUXIO_HOME}/logs
    alluxio.logserver.logs.dir=${ALLUXIO_HOME}/logs
    alluxio.logserver.port=45600
    alluxio.job.master.rpc.port=20001
    alluxio.job.worker.rpc.port=30001
Master Configuration(主节点配置)
    alluxio.master.embedded.joumal.port=19200
    alluxio.master.metastore=HEAP
    alluxio.master.metastore.dir=${ALLUXIO_HOME}/metastore
    alluxio.master.mount.table.root.ufs=${ALLUXIO_HOME}/underFSStorage
    alluxio.master.mount.table.root.readonly=false
    alluxio.master.rpc.port=19998
    alluxio.master.tieredstore.global.level0.alias=MEM
    alluxio.master.tieredstore.global.level1.alias=SSD
    alluxio.master.tieredstore.global.level2.alias=HDD
Worker Configuration(工作节点配置)
    alluxio.worker.memory.size=1GB(整个操作系统的2/3)
    alluxio.worker.tieredstore.level0.alias=MEM
    alluxio.worker.tieredstore.level0.dirs.path=/mnt/ramdisk
    alluxio.worker.web.port=30000
    alluxio.worker.tieredstore.level0.watermark.high.ratio=0.95
    alluxio.worker.tieredstore.level0.watermark.low.ratio=0.7
User Configuration(用户配置)
    alluxio.user.block.size.bytes.default=64MB
    alluxio.user.file.buffer.bytes=8MB
Resource Manager Configuration(资源管理配置)
    alluxio.integration.master.resource.cpu=1
    alluxio.integration.master.resource.mem=1024MB
    alluxio.integration.worker.resource.cpu=1
    alluxio.integration.worker.resource.mem=1024MB
Security Configuration(安全配置)
    alluxio.security.authentication.type=SIMPLE
    alluxio.security.authentication.permission.enabled=true
    alluxio.security.authentication.permission.supergroup=supergroup
```

---

## 高可用实现
```
方式一:
    使用基于RAFT的内部复制状态机来存储文件系统日志
    并选择Master节点
    无需依赖外部服务
方式二:
    利用外部ZK进行Leader选举,并利用共享存储进行共享日志

需要配置
主节点主机名 alluxio.master.hostname=master01
配置Alluxio的根路径 alluxio.master.mount.table.root.ufs=hdfs://master01:9000/alluxio
使用ZK复制选举 alluxio.zookeeper.enabled=true
配置ZK地址 alluxio.zookeeper.address=master01:2181,slave02:2181,slave03:2181
指定日志类型为UFS alluxio.master.journal.type=UFS
指定日志路径 alluxio.master.journal.folder=hdfs://master01:9000/alluxio/journal
Leader选举端口 alluxio.master.embedded.journal.addresses=slave02:19200,slave07:19200
Worker节点内存大小 alluxio.worker.memory.size=32GB
```

---

## 存储管理及配置
```
单层存储
alluxio.worker.memory.size=16GB
alluxio.worker.tieredstore.level0.dirs.path=/mnt/ramdisk,/mnt/ssd1,/mnt/hdd
alluxio.worker.tieredstore.level0.dirs.mediumtype=MEM,SSD,HDD
alluxio.worker.tieredstore.level0.dirs.quota=16GB,100GB,100GB

多层存储
alluxio.worker.tieredstore.levels=2
alluxio.worker.tieredstore.level0.alias=MEM
alluxio.worker.tieredstore.level0.dirs.path=/mnt/ramdisk
alluxio.worker.tieredstore.level0.dirs.mediumtype=MEM
alluxio.worker.tieredstore.level0.dirs.quota=100GB
alluxio.worker.tieredstore.level0.watermark.high.ratio=0.9
alluxio.worker.tieredstore.level0.watermark.low.ratio=0.7

alluxio.worker.tieredstore.level1.alias=HDD
alluxio.worker.tieredstore.level1.dirs.path=/mnt/hdd1,/mnt/hdd2,/mnt/hdd3
alluxio.worker.tieredstore.level1.dirs.mediumtype=HDD,HDD,HDD
alluxio.worker.tieredstore.level1.dirs.quota=2TB,5TB,500GB
alluxio.worker.tieredstore.level1.watermark.high.ratio=0.9
alluxio.worker.tieredstore.level1.watermark.low.ratio=0.7

I/O选项
    读取方式
        CACHE_PROMOTE: 默认
            数据在Alluxio,移动到最高层存储
            不在Alluxio,从UFS读取数据并写入到最高层存储
        CACHE:
            数据在Alluxio,直接读取
            不在Alluxio,从UFS读取数据并写入到最高层存储
        NO_CACHE:
            数据直接从UFS读取,不存入Alluxio
    写入方式
        CACHE_THROUGH:
            数据同步写入Alluxio和UFS
        MUST_CACHE:
            数据仅写入Alluxio
        THROUGH:
            数据仅写入UFS
        ASYNC_THROUGH:
            数据写入Alluxio后,异步写入UFS
            alluxio.user.file.replication.durable,数据同步写入多个Alluxio Worker,异步写入UFS

定位策略
    alluxio.user.block.write.location.policy.class
    LocalFirstPolicy: 本地Worker优先(默认策略)
        优先本地节点,容量不够,从存活worker中随机选择
    MostAvailableFirstPolicy: 最大可用容量优先
        选择最大可用容量的节点
    RoundRobinPolicy: 循环遍历策略
        循环方式选择下一可用节点,跳过无足够容量的节点
    SpecificHostPolicy: 指定主机策略
        选择特定主机上的Worker,不能设置为默认策略
    自定义策略
        继承alluxio.client.block.policy.BlockLocationPolicy
        使用ASYNC_THROUGH写类型,一个文件的所有blocks必须写入统一个worker

数据回收
    Worker存储满时,会为新数据释放空间
        异步回收,每个worker存在一个周期性的空间存储线程
        利用率达到上限,进行数据回收直到利用率降到下限
        存储每层都有回收的上限和下限使用率
        alluxio.worker.tieredstore.level0.watermark.high.ratio=0.9
        alluxio.worker.tieredstore.level0.watermark.low.ratio=0.75
    回收策略(alluxio.worker.evictor.class)
        Greedy: 释放任意块,直到释放所需的大小
        LRU: 默认,释放最近最少使用的块,直到释放所需的大小
        LRFU: 根据最近使用和最不频繁使用的可配置权重释放块,直到释放所需的大小为止
        PartialLRU: 基于最近最少使用的释放,但将选择具有最大可用空间的存储目录,仅从那里释放,直到释放所需的大小为止

数据生命周期
    free
        从Alluxio缓存中删除数据,但不删除UFS上的数据
        alluxio fs free DATA_PATH
    load
        将数据从UFS加载到Alluxio缓存
        alluxio fs load DATA_PATH
    persist
        将Alluxio存储中的数据写回到UFS
        alluxio fs persist DATA_PATH
    TTL(alluxio.master.ttl.checker.interval=10m)
        定期(默认1h)检查文件是否达到了TTL过期
        设置TTL
            alluxio fs setTtl DATA_PATH 86400000
        指定一天后释放空间
            alluxio fs setTtl --action free DATA_PATH 86400000
    锁定/解锁文件
        防止被回收,确保重要文件一直存储在Alluxio中
        alluxio fs pin DATA_PATH
        alluxio fs unpin DATA_PATH

副本控制
    被动副本: Alluxio根据实际情况调整副本数
    主动副本: 用户控制副本数的上下限
        alluxio.user.file.replication.min: 最小副本数
            默认0,当文件不再使用可以被回收
            配置大于0时
                读取时,多个客户端要读取文件,提供更好的性能
                写入时,确保节点故障时数据持久性
        alluxio.user.file.replication.max: 最小副本数
            默认-1,无限制
            超过限制时,移出多余副本数
    设置副本数
        alluxio fs setReplication -min 3 -max 5 DATA_PATH
        alluxio fs setReplication -max -1 DATA_PATH
    检查文件副本数
        alluxio fs stat DATA_PATH
```

---

## 监控与运维
```
ValidateConf
    检查配置设置完整性
        alluxio validateConf
Fsadmin
    管理员命令行操作
        alluxio fsadmin backup(备份元数据)
        alluxio fsadmin doctor(检查配置参数中不一致的情况)
        alluxio fsadmin getBlockInfo 33554432(提供BlockID的块信息和文件路径)
        alluxio fsadmin journal quorum info -domain MASTER|JOB_MASTER(获取MASTER|JOB_MASTER的选举集群的当前状态)
        alluxio fsadmin journal quorum remove -domain MASTER|JOB_MASTER -address Member_Address(移出选举集群中的一个成员)
        alluxio fsadmin journal checkpoint(创建日志检查点)
        alluxio fsadmin ufs pathConf list(查看路径包含默认的配置)
        alluxio fsadmin ufs pathConf show DATA_PATH(查看具体路径的默认配置)
        alluxio fsadmin ufs pathConf add --property K=V DATA_PATH(添加特定路径的默认配置)
        alluxio fsadmin ufs pathConf remove -keys K1,K2 DATA_PATH(移除特定路径默认配置)
        alluxio fsadmin report(生成alluxio集群总体健康状况报告)
        alluxio fsadmin ufs --mode readOnly hdfs://mac:9000/(更新已挂载的底层存储系统属性,URI路径必须是根节点不能带目录)
```

---

## 日志服务
```
alluxio-env.sh
    ALLUXIO_LOGSERVER_LOGS_DIR: 存储路径(${ALLUXIO_HOME}/logs)
    ALLUXIO_LOGSERVER_HOSTNAME: 服务器主机名
    ALLUXIO_LOGSERVER_PORT: 监听的端口,默认45600

alluxio-start.sh logserver
alluxio-stop.sh logserver
```

---

## 指标配置
```
metrics.properties

基于CodaHale指标库的可配置指标系统
接收器:
    ConsoleSink: 输出指标值到控制台
    CSVSink: 以一定时间间隔将指标数据导出到CSV文件
    JmxSink: 注册JMX控制台中查看的指标
    GraphiteSink: 发送指标到Graphite服务器
    MetricsServlet: 在WebUI添加Servlet,以JSON格式提供指标数据

指标实例
    Client
    Master
    Worker
```

---

## 孤立块
```
没有相应的文件,但因系统故障仍然占用系统资源
    孤立块在启动/定期检查期间被删除
启动时块完整性检查
    alluxio.master.startup.block.integrity.check.enabled=true
周期性的块完整性检查
    alluxio.master.periodic.block.integrity.check.repair=true(默认false)
    alluxio.master.periodic.block.integrity.check.interval=1hr
```

---

## 性能调优
```
Master
    Master复责元数据管理
    SecondaryMaster复责CheckPoint日志和容错
    执行分布式存储元数据操作
    Master性能影响Client延迟

Master内存调优
    在JVM堆中存储所有元数据
    ~1KB/inode
    Master标准堆大小64GB(根据使用,可以扩大到512GB)
    注意,堆过大GC会非常慢,可以使用RocksDB存储元数据

MasterCPU调优
    Master是除I/O之外所有操作的中心点,必须能处理多并发请求
    Master在JVM之外几乎没有I/O
    更多的core会带来更好的性能
    JVMs GC消耗CPU时间(堆大代表更多的CPU,CPU被GC占住,Client可用的资源会更少)
    
Master高并发优化
    alluxio.master.rpc.executor.max.pool.size(默认:500)
    alluxio.master.rpc.executor.core.pool.size(默认:0)
    max值计算规则(client数量*每个client中的线程数量)
    增加core.pool.size会保证更多线程可用,但会使用更多的内存

心跳间隔和超时优化
    增加间隔以减少心跳检查的次数
        alluxio.master.worker.heartbeat.interval(Master和Worker进行心跳检查的间隔)
        alluxio.master.worker.timeout(Master和Worker之间的超时时长)
    
Journal存储介质优化,性能优化
    日志通过记录元数据的更改信息提供容错功能
        日志的存储介质会影响master的性能
        需要快速的写
    存储介质
        本地>分布式文件系统>对象存储
    Journal是批量刷新和保存
        alluxio.master.journal.flush.batch.time (等待批量日志写的时间)
        alluxio.master.journal.flush.timeout(刷入日志的超时日志)

UFS路径缓存优化
    底层存储路径缓存
        AlluxioMaster维护存储路径下的元数据
    加载缺失路径的三个选项(alluxio.user.file.metadata.load.type)
        NEVER: 从不访问UFS来加载路径
        ALWAYS: 始终访问UFS,只要UFS有变化就会加载
        ONCE: 只在启动时访问,之后不访问
    alluxio.master.ufs.path.cache.capacity(控制要存储在缓存中的UFS路径数)
    控制路径缓存线程池的大小
        增加现场数量可能会降低UFS路径缓存的过时程度
        会增加Master的工作,增加与UFS的并行交互,影响性能
        alluxio.master.ufs.path.cache.threads(路径缓存线程池的大小)

HDFS底层存储配置优化
    alluxio.underfs.hdfs.remote(DataNode和AlluxioWorker是否不在同一台节点上)
    当HDFS工作节点相对于AlluxioWorker节点处于远程时,设置为true,不从本地寻找数据,节省时间
    
Worker
    负责存储块数据
    管理自己存储的块的云数据信息
    在多种本地存储介质上存储块
    执行底层存储基于数据的操作
    
Worker系统配置优化
    需要访问快速I/O介质来减少瓶颈,高速存储加快读写,网络带宽加速数据传输
    对堆内存要求不高,4GB内存足够,数据在堆外存储

WorkerRPC线程数优化
    控制处理块读请求的最大线程数(在读取文件时出现连接拒绝操作,可以增加该值)
    alluxio.worker.network.block.reader.threads.max(读取一个块文件的最大并发线程数)
    
Worker心跳优化
    控制worker心跳回master的频率,频繁心跳容易导致master崩溃
    心跳超时可能意味着master/worker超负荷工作
    不是巨大的性能优化,只是减轻master的负荷
    alluxio.worker.filesystem.heartbeat.interval
    alluxio.worker.block.heartbeat.interval

Client存活时长优化
    Worker通过发送Keepalive pings检查连接的客户端健康状况
    alluxio.worker.network.keepalive.time(客户端发送最后一条消息后,worker发出keepalive连接前的最大等待时间)
    alluxio.worker.network.keepalive.timeout(keepalive发出后,worker决定client不再存活并关闭连接前的最大等待时间)
    
分层存储的回收优化
    设置高水位在合理的阈值之下,保证一个绝对的大小
    保持底和高水位不太接近,避免频繁触发回收

Client
    应用需要包含Alluxio Client依赖
    客户端对I/O行为和本地性控制最多

I/O选项
    读类型优化
        alluxio.user.file.readtype.default(指定读文件时的数据读取行为)
    写类型优化
        alluxio.user.file.writetype.default(指定写文件时的数据写入行为)

被动缓存优化
    当一个或多个副本已经存在于Alluxio存储时,被动缓存会导致数据在AlluxioWorker重新缓存
    alluxio.user.file.passive.cache.enabled=false(禁用被动缓存)
    当Client读取的数据不在本地Worker中时,设置为true会将remote的数据在本地缓存一份,这样会让所有Worker都包含同一份数据,减少Alluxio的存储量
    
网络配置优化
    alluxio.user.rpc.retry.max.duration(放弃重试前的最大持续时间)
    alluxio.user.rpc.retry.base.sleep(RPC重试的基础等待时间)
```