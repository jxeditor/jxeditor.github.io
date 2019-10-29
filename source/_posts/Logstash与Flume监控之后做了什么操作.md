---
title: Logstash与Flume监控之后做了什么操作
date: 2017-10-29 09:49:30
categories: 大数据
tags: elk
---

> 对于Flume与Logstash重启后的操作

<!-- more -->

## Logstash
### 监控变化
```
# Logstash主要是通过input插件来进行监控
# File插件中的sincedb_path
第一次读取新文件不会有.sincedb,所以默认会根据start_position去读,如果start_position是end,则从最后读,如果start_position是begin,则从开始读
不是第一次读取文件,则会有.sincedb文件,无论start_position是什么,都会根据.sincedb文件去读.
```
### Logstash持久化数据
```
# 在config/logstash.yml中进行配置以下内容
queue.type: persisted
path.queue: /usr/share/logstash/data #队列存储路径；如果队列类型为persisted，则生效
queue.page_capacity: 250mb #队列为持久化，单个队列大小
queue.max_events: 0 #当启用持久化队列时，队列中未读事件的最大数量，0为不限制
queue.max_bytes: 1024mb #队列最大容量
queue.checkpoint.acks: 1024 #在启用持久队列时强制执行检查点的最大数量,0为不限制
queue.checkpoint.writes: 1024 #在启用持久队列时强制执行检查点之前的最大数量的写入事件，0为不限制
queue.checkpoint.interval: 1000 #当启用持久队列时，在头页面上强制一个检查点的时间间隔
```

---

## Flume
### 监控变化
```
# 监控文件的情况下
会将监控文件重命名以.COMPLETE结尾,然后将文件中的数据上传到目标位置
如果是HDFS,则会在HDFS上创建个临时文件filename.tmp,上传成功后重命名HDFS上的临时文件,将后缀.tmp去掉就可以了.
```
### Flume持久化数据
```
# 根据Flume的架构原理,Flume采用FileChannel是不可能丢失数据的
# 唯一有可能丢失数据则是Channel采用了MemoryChannel
    在agent宕机时导致数据在内存中丢失
    Channel存储数据已满,导致Source不再写入数据,造成未写入的数据丢失

# 根据FileChannel的配置确定持久化数据存放位置以及每个Log文件的大小
dataDirs
maxFileSize

# 但是请注意数据重复的问题
```