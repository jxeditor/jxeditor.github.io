---
title: MySQL大数据迁移
date: 2018-10-06 09:46:59
categories: 大数据
tags: mysql
---

> 记录一下MySQL在面临短时间进行跨多版本升级,数据如何进行迁移的问题

<!-- more -->

## 现状
```
使用的是MySQL5.1的版本
升级至5.7版本
数据上T级别
5.1分区仅支持1024个,分区即将用尽,线上目前正在使用
```

---

## 已使用的方案
```
因为比较急,需要赶在国庆假期之前弄好
采取了mysqldump的方式,在当天数据计算完毕之后,进行dump成sql文件,耗时4-5小时
然后进行load进新版本的MySQL中,耗时7-8小时<其中包括出错时间>

其实这也是一种方式,但其实并不适用于那种时时刻刻都有数据写入MySQL的业务情景
只是恰好我们只是存当天报表任务的指标数据
所以可以使用直接dump
```

---

## 合理方案[Canal](https://github.com/alibaba/canal)
```
# canal原理
使用canal进行对mysql的binlog进行解析
模拟MySQL slave的交互协议，伪装自己为MySQL slave，向MySQL master发送dump协议
MySQL master收到dump请求，开始推送binary log给slave(即canal)
canal解析binary log对象(原始为byte流)

# 过程
只需要旧MySQL执行flush logs命令,生成新的binary log文件
同时canal开始同步数据到新MySQL
这时新MySQL的数据应该与旧数据库的一致
将流量切到新MySQL

# 注意
使用flush logs相当于确定一个时间点,这个时间点之前的数据同步好,那么新数据库的数据一定与旧数据库一致
接着就是切流量的数据同步了
```
