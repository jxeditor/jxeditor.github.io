---
title: Kafka的概念性知识整合
date: 2018-01-25 10:38:27
categories: 大数据
tags: 
    - kafka
    - interview
---

> 主要围绕Kafka组件,文件存储机制以及常用命令的介绍

<!-- more -->

## Kafka简介
```
Kafka最初由Linkedin公司开发的分布式、分区的、多副本的、多订阅者的消息系统。
它提供了类似于JMS的特性，但是在设计实现上完全不同，此外它并不是JMS规范的实现。
Kafka对消息保存是根据Topic进行归类，发送消息者称为Producer；消息接受者称为Consumer；此外Kafka集群有多个Kafka实例组成，每个实例(server)称为Broker。
无论是Kafka集群，还是producer和consumer都依赖于zookeeper来保证系统可用性集群保存一些meta信息

# 注意
kafka的0.8版本之后，producer不在依赖zookeeper保存meta信息，而是producer自己保存meta信息。
```

---

## 概念介绍
```
Broker：
    消息中间件处理节点，一个Kafka节点就是一个Broker，一个或者多个Broker可以组成一个Kafka集群；
Topic：
    主题是对一组消息的抽象分类，比如例如page view日志、click日志等都可以以topic的形式进行抽象划分类别。
    在物理上，不同Topic的消息分开存储，逻辑上一个Topic的消息虽然保存于一个或多个broker上但用户只需指定消息的Topic即可使得数据的生产者或消费者不必关心数据存于何处；
Partition：
    每个主题又被分成一个或者若干个分区（Partition）。
    每个分区在本地磁盘上对应一个文件夹，分区命名规则为主题名称后接"—"连接符，之后再接分区编号，分区编号从0开始至分区总数减-1；
LogSegment：
    每个分区又被划分为多个日志分段（LogSegment）组成，日志段是Kafka日志对象分片的最小单位；
    LogSegment算是一个逻辑概念，对应一个具体的日志文件（".log"的数据文件）和两个索引文件（".index"和".timeindex"，分别表示偏移量索引文件和消息时间戳索引文件）组成；
Offset：
    每个partition中都由一系列有序的、不可变的消息组成，这些消息被顺序地追加到partition中。
    每个消息都有一个连续的序列号称之为offset—偏移量，用于在partition内唯一标识消息（并不表示消息在磁盘上的物理位置）；
Message：
    消息是Kafka中存储的最小最基本的单位，即为一个commit log，由一个固定长度的消息头和一个可变长度的消息体组成；
```

---

## Kafka的Consumer及其offset
```
根据Kafka-API的版本不同,offset位置不一样,老版本维护在ZK中,新版本则是在Kafka的Topic中

# offset的更新方式
自动提交:
    设置enable.auto.commit=true，更新的频率根据参数[auto.commit.interval.ms]来定。
    这种方式也被称为[at most once]，fetch到消息后就可以更新offset，无论是否消费成功。
手动提交:
    设置enable.auto.commit=false，这种方式称为[at least once]。
    fetch到消息后，等消费完成再调用方法[consumer.commitSync()]，手动更新offset；
    如果消费失败，则offset也不会更新，此条消息会被重复消费一次。

# 注意
一个Topic可以被多个ConsumerGroup分别消费,但是每个ConsumerGroup中只能有一个Consumer消费此消息.
一个ConsumerGroup内的Consumer只能消费不同的Partition,即一个Partition只能被一个Consumer消费.
```

---

## Kafka数据存储机制
```
# a.Kafka中分区/副本的日志文件存储分析
创建Topic指定分区及副本
    ./kafka-topics.sh --create --zookeeper 192.168.3.111:2181 --replication-factor 3 --partitions  3 --topic test-01
查询Topic状态
    ./kafka-topics.sh --describe --zookeeper 192.168.3.111:2181 --topic test-01
在Producer产生信息后,可以查看Kafka的config/server.properties配置文件中log.dirs指定的日志数据存储目录下存在三个分区目录
同时在每个分区目录下存在很多对应的日志数据文件和日志索引文件文件
    分区目录文件
        drwxr-x--- 2 root root 4096 Jul 26 19:35 test-01-0
        drwxr-x--- 2 root root 4096 Jul 24 20:15 test-01-1
        drwxr-x--- 2 root root 4096 Jul 24 20:15 test-01-2
    分区目录中的日志数据文件和日志索引文件
        -rw-r----- 1 root root 512K Jul 24 19:51 00000000000000000000.index
        -rw-r----- 1 root root 1.0G Jul 24 19:51 00000000000000000000.log
        -rw-r----- 1 root root 768K Jul 24 19:51 00000000000000000000.timeindex
        -rw-r----- 1 root root 512K Jul 24 20:03 00000000000022372103.index
        -rw-r----- 1 root root 1.0G Jul 24 20:03 00000000000022372103.log
        -rw-r----- 1 root root 768K Jul 24 20:03 00000000000022372103.timeindex
        -rw-r----- 1 root root 512K Jul 24 20:15 00000000000044744987.index
        -rw-r----- 1 root root 1.0G Jul 24 20:15 00000000000044744987.log
        -rw-r----- 1 root root 767K Jul 24 20:15 00000000000044744987.timeindex
        -rw-r----- 1 root root  10M Jul 24 20:21 00000000000067117761.index
        -rw-r----- 1 root root 511M Jul 24 20:21 00000000000067117761.log
        -rw-r----- 1 root root  10M Jul 24 20:21 00000000000067117761.timeindex
可以看出，每个分区在物理上对应一个文件夹，分区的命名规则为主题名后接"—"连接符，之后再接分区编号，分区编号从0开始，编号的最大值为分区总数减1。
每个分区又有1至多个副本，分区的副本分布在集群的不同代理上，以提高可用性。
从存储的角度上来说，分区的每个副本在逻辑上可以抽象为一个日志（Log）对象，即分区副本与日志对象是相对应的。

# b.Kafka中日志索引和数据文件的存储结构
在Kafka中，每个Log对象又可以划分为多个LogSegment文件，每个LogSegment文件包括一个日志数据文件和两个索引文件（偏移量索引文件和消息时间戳索引文件）。
其中，每个LogSegment中的日志数据文件大小均相等（该日志数据文件的大小可以通过在Kafka Broker的config/server.properties配置文件的中的"log.segment.bytes"进行设置。
默认为1G大小（1073741824字节），在顺序写入消息时如果超出该设定的阈值，将会创建一组新的日志数据和索引文件）。
Kafka将日志文件封装成一个FileMessageSet对象，将偏移量索引文件和消息时间戳索引文件分别封装成OffsetIndex和TimerIndex对象。
Log和LogSegment均为逻辑概念，Log是对副本在Broker上存储文件的抽象，而LogSegment是对副本存储下每个日志分段的抽象，日志与索引文件才与磁盘上的物理存储相对应；
执行下面命令即可将日志数据文件内容dump出来
    ./kafka-run-class.sh kafka.tools.DumpLogSegments --files /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.log --print-data-log > 00000000000022372103_txt.log
        Dumping /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.log
        Starting offset: 22372103
        offset: 22372103 position: 0 CreateTime: 1532433067157 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 5d2697c5-d04a-4018-941d-881ac72ed9fd
        offset: 22372104 position: 0 CreateTime: 1532433067159 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 0ecaae7d-aba5-4dd5-90df-597c8b426b47
        offset: 22372105 position: 0 CreateTime: 1532433067159 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 87709dd9-596b-4cf4-80fa-d1609d1f2087
        ......
        ......
        offset: 22372444 position: 16365 CreateTime: 1532433067166 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 8d52ec65-88cf-4afd-adf1-e940ed9a8ff9
        offset: 22372445 position: 16365 CreateTime: 1532433067168 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 5f5f6646-d0f5-4ad1-a257-4e3c38c74a92
        offset: 22372446 position: 16365 CreateTime: 1532433067168 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 51dd1da4-053e-4507-9ef8-68ef09d18cca
        offset: 22372447 position: 16365 CreateTime: 1532433067168 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 80d50a8e-0098-4748-8171-fd22d6af3c9b
        ......
        ......
        offset: 22372785 position: 32730 CreateTime: 1532433067174 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: db80eb79-8250-42e2-ad26-1b6cfccb5c00
        offset: 22372786 position: 32730 CreateTime: 1532433067176 isvalid: true keysize: 4 valuesize: 36 magic: 2 compresscodec: NONE producerId: -1 producerEpoch: -1 sequence: -1 isTransactional: false headerKeys: [] key: 1 payload: 51d95ab0-ab0d-4530-b1d1-05eeb9a6ff00
        ......
        ......
同样地，dump出来的具体偏移量索引内容
    ./kafka-run-class.sh kafka.tools.DumpLogSegments --files /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.index --print-data-log > 00000000000022372103_txt.index
        Dumping /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.index
        offset: 22372444 position: 16365
        offset: 22372785 position: 32730
        offset: 22373467 position: 65460
        offset: 22373808 position: 81825
        offset: 22374149 position: 98190
        offset: 22374490 position: 114555
        ......
        ......
dump出来的时间戳索引文件内容
    ./kafka-run-class.sh kafka.tools.DumpLogSegments --files /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.timeindex --print-data-log > 00000000000022372103_txt.timeindex
        Dumping /apps/svr/Kafka/kafkalogs/kafka-topic-01-0/00000000000022372103.timeindex
        timestamp: 1532433067174 offset: 22372784
        timestamp: 1532433067191 offset: 22373466
        timestamp: 1532433067206 offset: 22373807
        timestamp: 1532433067214 offset: 22374148
        timestamp: 1532433067222 offset: 22374489
        timestamp: 1532433067230 offset: 22374830
        ......
        ......
由上面dump出来的偏移量索引文件和日志数据文件的具体内容可以分析出来，偏移量索引文件中存储着大量的索引元数据，日志数据文件中存储着大量消息结构中的各个字段内容和消息体本身的值。
索引文件中的元数据postion字段指向对应日志数据文件中message的实际位置（即为物理偏移地址）。

# c.Kafka消息字段以及各个字段说明
offset: 消息偏移量
message size: 消息总长度
CRC32: CRC32编码校验和
attributes:表示为独立版本、或标识压缩类型、或编码类型
magic: 表示本次发布Kafka服务程序协议版本号
key length: 消息Key的长度
key: 消息Key的实际数据
valuesize: 消息的实际数据长度
playload: 消息的实际数据
```

---

## 数据文件
```
# a.日志数据文件
Kafka将生产者发送给它的消息数据内容保存至日志数据文件中，该文件以该段的基准偏移量左补齐0命名，文件后缀为“.log”。
分区中的每条message由offset来表示它在这个分区中的偏移量，这个offset并不是该Message在分区中实际存储位置，而是逻辑上的一个值（Kafka中用8字节长度来记录这个偏移量），但它却唯一确定了分区中一条Message的逻辑位置，同一个分区下的消息偏移量按照顺序递增（这个可以类比下数据库的自增主键）。
另外，从dump出来的日志数据文件的字符值中可以看到消息体的各个字段的内容值。

# b.偏移量索引文件
如果消息的消费者每次fetch都需要从1G大小（默认值）的日志数据文件中来查找对应偏移量的消息，那么效率一定非常低，在定位到分段后还需要顺序比对才能找到。
Kafka在设计数据存储时，为了提高查找消息的效率，故而为分段后的每个日志数据文件均使用稀疏索引的方式建立索引，这样子既节省空间又能通过索引快速定位到日志数据文件中的消息内容。
偏移量索引文件和数据文件一样也同样也以该段的基准偏移量左补齐0命名，文件后缀为“.index”。
从上面dump出来的偏移量索引内容可以看出，索引条目用于将偏移量映射成为消息在日志数据文件中的实际物理位置，每个索引条目由offset和position组成，每个索引条目可以唯一确定在各个分区数据文件的一条消息。
其中，Kafka采用稀疏索引存储的方式，每隔一定的字节数建立了一条索引，可以通过"index.interval.bytes"设置索引的跨度；
有了偏移量索引文件，通过它，Kafka就能够根据指定的偏移量快速定位到消息的实际物理位置。
具体的做法是，根据指定的偏移量，使用二分法查询定位出该偏移量对应的消息所在的分段索引文件和日志数据文件。
然后通过二分查找法，继续查找出小于等于指定偏移量的最大偏移量，同时也得出了对应的position（实际物理位置），根据该物理位置在分段的日志数据文件中顺序扫描查找偏移量与指定偏移量相等的消息。

# c.时间戳索引文件
这种类型的索引文件是Kafka从0.10.1.1版本开始引入的的一个基于时间戳的索引文件，它们的命名方式与对应的日志数据文件和偏移量索引文件名基本一样，唯一不同的就是后缀名。
从上面dump出来的该种类型的时间戳索引文件的内容来看，每一条索引条目都对应了一个8字节长度的时间戳字段和一个4字节长度的偏移量字段，其中时间戳字段记录的是该LogSegment到目前为止的最大时间戳，后面对应的偏移量即为此时插入新消息的偏移量。
另外，时间戳索引文件的时间戳类型与日志数据文件中的时间类型是一致的，索引条目中的时间戳值及偏移量与日志数据文件中对应的字段值相同（ps：Kafka也提供了通过时间戳索引来访问消息的方法）。
```

---

## 过期日志的处理
```
Kafka作为一个消息中间件，是需要定期处理数据的，否则磁盘就爆了。
Kafka日志管理器中会有一个专门的日志删除任务来周期性检测和删除不符合保留条件的日志分段文件，这个周期可以通过broker端参数log.retention.check.interval.ms来配置，默认值为300,000，即5分钟。
当前日志分段的保留策略有3种：基于时间的保留策略、基于日志大小的保留策略以及基于日志起始偏移量的保留策略。


# a.处理的机制
基于时间:
    根据数据的时间长短进行清理，例如数据在磁盘中超过多久会被清理（默认是168个小时）。
    日志删除任务会检查当前日志文件中是否有保留时间超过设定的阈值retentionMs来寻找可删除的的日志分段文件集合deletableSegments。
    retentionMs可以通过broker端参数log.retention.hours、log.retention.minutes以及log.retention.ms来配置，其中log.retention.ms的优先级最高，log.retention.minutes次之，log.retention.hours最低。
    默认情况下只配置了log.retention.hours参数，其值为168，故默认情况下日志分段文件的保留时间为7天。
基于日志大小：
    根据文件大小的方式给进行清理，例如数据大小超过多大时，删除数据（大小是按照每个partition的大小来界定的）。
    日志删除任务会检查当前日志的大小是否超过设定的阈值retentionSize来寻找可删除的日志分段的文件集合deletableSegments。
    retentionSize可以通过broker端参数log.retention.bytes来配置，默认值为-1，表示无穷大。
    注意log.retention.bytes配置的是日志文件的总大小，而不是单个的日志分段的大小，一个日志文件包含多个日志分段。
基于日志起始偏移量：
    一般情况下日志文件的起始偏移量logStartOffset等于第一个日志分段的baseOffset，但是这并不是绝对的，logStartOffset的值可以通过DeleteRecordsRequest请求、日志的清理和截断等操作修改。
    基于日志起始偏移量的删除策略的判断依据是某日志分段的下一个日志分段的起始偏移量baseOffset是否小于等于logStartOffset，若是则可以删除此日志分段。

# b.删除过期的日志的方式
删除日志分段时，首先会从日志文件对象中所维护日志分段的跳跃表中移除待删除的日志分段，以保证没有线程对这些日志分段进行读取操作。
然后将日志分段文件添加上“.deleted”的后缀，当然也包括日志分段对应的索引文件。
最后交由一个以“delete-file”命名的延迟任务来删除这些“.deleted”为后缀的文件，这个任务的延迟执行时间可以通过file.delete.delay.ms参数来设置，默认值为60000，即1分钟。
直接删除segment文件。后台会周期性的扫描，当满足设定的条件的数据就执行删除。
如果设置是按照大小的方式，删除segment是按照segment存在顺序进行删除，即先删除存在最久的那个segment。
```