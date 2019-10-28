---
title: Flume的使用
date: 2017-11-18 15:15:03
categories: 大数据
tags: elk
---

> Flume配置文件与使用介绍

<!-- more -->

## 端口监听
```
# 创建配置文件
vi netcat-logger.conf
a1.sources = r1
a1.sinks = k1
a1.channels = c1
a1.sources.r1.type = netcat
a1.sources.r1.bind = localhost
a1.sources.r1.port = 44444
a1.sinks.k1.type = logger
a1.channels.c1.type = memory
a1.channels.c1.capacity = 1000
a1.channels.c1.transactionCapacity = 100
a1.sources.r1.channels = c1
a1.sinks.k1.channel = c1

# 启动服务
bin/flume-ng agent --conf conf --conf-file conf/netcat-logger.conf --name a1 -Dflume.root.logger=INFO,console

# 启动监听端口
telnet localhost 44444

# 传入数据
$ telnet localhost 44444
Trying 127.0.0.1...
Connected to localhost.localdomain (127.0.0.1).
Escape character is '^]'.
Hello world! <ENTER>
OK
```

---

## 文件夹<往文件夹内放文件,不要生成文件>
```
# 创建配置文件
vi spool-logger.conf
a1.sources = r1
a1.sinks = k1
a1.channels = c1
# Describe/configure the source
a1.sources.r1.type = spooldir
#被监视的文件夹
a1.sources.r1.spoolDir = /home/hadoop/flumespool
a1.sources.r1.fileHeader = true
a1.sinks.k1.type = logger
a1.channels.c1.type = memory
a1.channels.c1.capacity = 1000
a1.channels.c1.transactionCapacity = 100
a1.sources.r1.channels = c1
a1.sinks.k1.channel = c1

# 启动服务
bin/flume-ng agent -c ./conf -f ./conf/spool-logger.conf -n a1 -Dflume.root.logger=INFO,console

# 传入数据
mv xxxFile.log /home/hadoop/flumeSpool/
```

---

## tail命令toHDFS
```
# 创建配置文件
vi tail-hdfs.conf
a1.sources = r1
a1.sinks = k1
a1.channels = c1
#exec 指的是命令
# Describe/configure the source
a1.sources.r1.type = exec
#F根据文件名追中, f根据文件的nodeid追中
a1.sources.r1.command = tail -F /home/hadoop/log/test.log
a1.sources.r1.channels = c1
#下沉目标
a1.sinks.k1.type = hdfs
a1.sinks.k1.channel = c1
#指定目录, flum帮做目的替换
a1.sinks.k1.hdfs.path = /flume/events/%y-%m-%d/%H%M/
#文件的命名, 前缀
a1.sinks.k1.hdfs.filePrefix = events-
#10 分钟就改目录
a1.sinks.k1.hdfs.round = true
a1.sinks.k1.hdfs.roundValue = 10
a1.sinks.k1.hdfs.roundUnit = minute
#文件滚动之前的等待时间(秒)
a1.sinks.k1.hdfs.rollInterval = 3
#文件滚动的大小限制(bytes)
a1.sinks.k1.hdfs.rollSize = 500
#写入多少个event数据后滚动文件(事件个数)
a1.sinks.k1.hdfs.rollCount = 20
#5个事件就往里面写入
a1.sinks.k1.hdfs.batchSize = 5
#用本地时间格式化目录
a1.sinks.k1.hdfs.useLocalTimeStamp = true
#下沉后, 生成的文件类型，默认是Sequencefile，可用DataStream，则为普通文本
a1.sinks.k1.hdfs.fileType = DataStream
a1.channels.c1.type = memory
a1.channels.c1.capacity = 1000
a1.channels.c1.transactionCapacity = 100
a1.sources.r1.channels = c1
a1.sinks.k1.channel = c1

# 启动服务
bin/flume-ng agent -c conf -f conf/tail-hdfs.conf -n a1

# 传入数据
mkdir /home/hadoop/log
while true
do
echo 111111 >> /home/hadoop/log/test.log
sleep 0.5
done
```

---

## tail命令toAVRO
```
# 第一台服务器
# 创建配置文件
vi tail-avro.conf
a1.sources = r1
a1.sinks = k1
a1.channels = c1
a1.sources.r1.type = exec
a1.sources.r1.command = tail -F /home/hadoop/flumelog/test.log
a1.sources.r1.channels = c1
# 绑定的不是本机, 是另外一台机器的服务地址, sink端的avro是一个发送端, avro的客户端, 往Hatsune-01这个机器上发
a1.sinks = k1
a1.sinks.k1.type = avro
a1.sinks.k1.channel = c1
a1.sinks.k1.hostname = 主机名
a1.sinks.k1.port = 4141
a1.sinks.k1.batch-size = 2
a1.channels.c1.type = memory
a1.channels.c1.capacity = 1000
a1.channels.c1.transactionCapacity = 100
a1.sources.r1.channels = c1
a1.sinks.k1.channel = c1

# 启动服务
bin/flume-ng agent -c conf -f conf/tail-avro.conf -n a1

# 第二台服务器
# 创建配置文件
vi avro-hdfs.conf
a1.sources = r1
a1.sinks = k1
a1.channels = c1
# source中的avro组件是接收者服务, 绑定本机
a1.sources.r1.type = avro
a1.sources.r1.channels = c1
a1.sources.r1.bind = 0.0.0.0
a1.sources.r1.port = 4141
a1.sinks.k1.type = hdfs
a1.sinks.k1.channel = c1
#指定目录, flum帮做目的替换
a1.sinks.k1.hdfs.path = /flume/events/%y-%m-%d/%H%M/
#文件的命名, 前缀
a1.sinks.k1.hdfs.filePrefix = events-
#10 分钟就改目录
a1.sinks.k1.hdfs.round = true
a1.sinks.k1.hdfs.roundValue = 10
a1.sinks.k1.hdfs.roundUnit = minute
#文件滚动之前的等待时间(秒)
a1.sinks.k1.hdfs.rollInterval = 3
#文件滚动的大小限制(bytes)
a1.sinks.k1.hdfs.rollSize = 500
#写入多少个event数据后滚动文件(事件个数)
a1.sinks.k1.hdfs.rollCount = 20
#5个事件就往里面写入
a1.sinks.k1.hdfs.batchSize = 5
#用本地时间格式化目录
a1.sinks.k1.hdfs.useLocalTimeStamp = true
#下沉后, 生成的文件类型，默认是Sequencefile，可用DataStream，则为普通文本
a1.sinks.k1.hdfs.fileType = DataStream
a1.channels.c1.type = memory
a1.channels.c1.capacity = 1000
a1.channels.c1.transactionCapacity = 100
a1.sources.r1.channels = c1
a1.sinks.k1.channel = c1

# 启动服务
bin/flume-ng agent -c conf -f conf/avro-hdfs.conf -n a1
```