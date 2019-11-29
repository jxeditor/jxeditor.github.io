---
title: CDH安装Kafka组件
date: 2019-06-01 08:18:24
categories: 搭建
tags: 
    - kafka
    - cdh
---

> 在CDH下搭建kafka组件

<!-- more -->

## 查看CDH与Kafka对应版本关系
[传送门](https://docs.cloudera.com/documentation/enterprise/release-notes/topics/rn_consolidated_pcm.html#pcm_kafka)

---

## 下载CDH版本Kafka的parcel包
[传送门](http://archive.cloudera.com/kafka/parcels/latest/)
需要`.parcel`文件,对应`.sha1`文件以及`manifest.json`文件

**注意:** `el*`代表Red Hat Enterprise Linux版本

---

## 修改文件
`.sha1`后缀改为`.sha`
打开`manifest.json`文件,找到对应Kafka版本的hash值
赋值hash值,替换sha文件的hash值
将修改后的三个文件拷贝到/opt/cloudera/parcel-repo/目录下,manifest.json相同,则重命名之前的

---

## 下载CSD包
[传送门](http://archive.cloudera.com/csds/kafka/)
复制到/opt/cloudera/csd/目录下

---

## Web页面进行新增服务
检查更新parcel包
添加Kafka服务