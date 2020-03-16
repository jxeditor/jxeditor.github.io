---
title: HBase的基本命令
date: 2017-11-23 15:58:31
categories: 大数据
tags: 
    - hbase
    - interview
---

> 记录Hbase常用的命令以及对性能帮助大的命令.

<!-- more -->

## 基本Shell命令
```
# 进入hbase命令行
./hbase shell 

# 显示hbase中的表
list 

# 创建user表，包含info、data两个列族
create 'user', 'info1', 'data1'
create 'user', {NAME => 'info', VERSIONS => '3'} 

# 向user表中插入信息，row key为rk0001，列族info中添加name列标示符，值为zhangsan
put 'user', 'rk0001', 'info:name', 'zhangsan' 

# 向user表中插入信息，row key为rk0001，列族info中添加gender列标示符，值为female
put 'user', 'rk0001', 'info:gender', 'female' 

# 向user表中插入信息，row key为rk0001，列族info中添加age列标示符，值为20
put 'user', 'rk0001', 'info:age', 20 

# 向user表中插入信息，row key为rk0001，列族data中添加pic列标示符，值为picture
put 'user', 'rk0001', 'data:pic', 'picture' 

# 获取user表中row key为rk0001的所有信息
get 'user', 'rk0001' 

# 获取user表中row key为rk0001，info列族的所有信息
get 'user', 'rk0001', 'info' 

# 获取user表中row key为rk0001，info列族的name、age列标示符的信息
get 'user', 'rk0001', 'info:name', 'info:age' 

# 获取user表中row key为rk0001，info、data列族的信息
get 'user', 'rk0001', 'info', 'data'
get 'user', 'rk0001', {COLUMN => ['info', 'data']} 
get 'user', 'rk0001', {COLUMN => ['info:name', 'data:pic']} 

# 获取user表中row key为rk0001，列族为info，版本号最新5个的信息
get 'user', 'rk0001', {COLUMN => 'info', VERSIONS => 2}
get 'user', 'rk0001', {COLUMN => 'info:name', VERSIONS => 5}
get 'user', 'rk0001', {COLUMN => 'info:name', VERSIONS => 5, TIMERANGE => [1392368783980, 1392380169184]} 

# 获取user表中row key为rk0001，cell的值为zhangsan的信息
get 'user', 'rk0001', {FILTER => "ValueFilter(=, 'binary:zhangsan')"} 

# 获取user表中row key为rk0001，列标示符中含有a的信息get 'user', 'rk0001', {FILTER => "(QualifierFilter(=,'substring:a'))"} 
put 'user', 'rk0002', 'info:name', 'fanbingbing'
put 'user', 'rk0002', 'info:gender', 'female'
put 'user', 'rk0002', 'info:nationality', '中国'
get 'user', 'rk0002', {FILTER => "ValueFilter(=, 'binary:中国')"}  

# 查询user表中的所有信息
scan 'user' 

# 查询user表中列族为info的信息
scan 'user', {COLUMNS => 'info'}
scan 'user', {COLUMNS => 'info', RAW => true, VERSIONS => 5}
scan 'persion', {COLUMNS => 'info', RAW => true, VERSIONS => 3}

# 查询user表中列族为info和data的信息
scan 'user', {COLUMNS => ['info', 'data']}
scan 'user', {COLUMNS => ['info:name', 'data:pic']}  

# 查询user表中列族为info、列标示符为name的信息
scan 'user', {COLUMNS => 'info:name'} 

# 查询user表中列族为info、列标示符为name的信息,并且版本最新的5个
scan 'user', {COLUMNS => 'info:name', VERSIONS => 5} 

# 查询user表中列族为info和data且列标示符中含有a字符的信息scan 'user', {COLUMNS => ['info', 'data'], FILTER => "(QualifierFilter(=,'substring:a'))"} 

# 查询user表中列族为info，rk范围是[rk0001, rk0003)的数据
scan 'user', {COLUMNS => 'info', STARTROW => 'rk0001', ENDROW => 'rk0003'} 

# 查询user表中row key以rk字符开头的
scan 'user',{FILTER=>"PrefixFilter('rk')"} 

# 查询user表中指定范围的数据
scan 'user', {TIMERANGE => [1392368783980, 1392380169184]} 

# 删除数据删除user表row key为rk0001，列标示符为info:name的数据
delete 'people', 'rk0001', 'info:name'

# 删除user表row key为rk0001，列标示符为info:name，timestamp为1392383705316的数据
delete 'user', 'rk0001', 'info:name', 1392383705316  

# 清空user表中的数据
truncate 'user'  

# 修改表结构首先停用user表（新版本不用）
disable 'user' 

# 添加两个列族f1和f2
alter 'people', NAME => 'f1'
alter 'user', NAME => 'f2'

# 启用表
enable 'user'  

# 删除一个列族
alter 'user', NAME => 'f1', METHOD => 'delete' 
alter 'user', 'delete' => 'f1' 

# 添加列族f1同时删除列族f2
alter 'user', {NAME => 'f1'}, {NAME => 'f2', METHOD => 'delete'} 

# 将user表的f1列族版本号改为5
alter 'people', NAME => 'info', VERSIONS => 5

# 删除表
disable 'user'
drop 'user'
```

---

## major_compact
```
# 合并文件,清除删除,过期,多余版本的数据,提高读写数据的效率
# HBase中实现了两种Compaction的方式
Minor: 操作只用来做部分文件的合并操作以及包括minVersion=0并且设置ttl的过期版本清理，不做任何删除数据、多版本数据的清理工作。
Major: 操作是对Region下的HStore下的所有StoreFile执行合并操作，最终的结果是整理合并出一个文件。

# 使用的时机<major_compact是很重的后台操作>
业务低峰时段执行
优先考虑含有TTL的表
storefile短期内增加比较多
表中storefile平均大小比较小
```