---
title: GP的外部表应用
date: 2021-04-13 19:04:29
categories: 大数据
tags: greenplum
---

> 对GP外部表使用做一些整理,以及基于gpfdist,gpfdists以及gphdfs进行演示

<!-- more -->

## 外部表
### 介绍
```
允许用户像访问标准数据库表一样的访问外部表

GP提供两种类型的外部表
    可读外部表:数据装载,不允许数据修改
    可写外部表:数据卸载,从数据库表中选择记录输出到文件/命令管道/可执行程序(MR),只允许INSERT操作

可读外部表分类
    常规:访问静态文件
    WEB:访问动态数据源

创建外部表定义时,必须指定文件格式和文件位置
    TEXT类型对所有协议有效。
    逗号分隔的CSV对于gpfdist和file协议有效
    自定义格式适合于gphdfs
```

### 外部表创建
```
# 创建单文件服务的可读外部表
CREATE EXTERNAL TABLE demo (id int,name text)
LOCATION('gpfdist://hostname:port/demo.txt')
FORMAT 'TEXT' (DELIMITER '|' NULL '');

# 创建多文件服务的可读外部表
CREATE EXTERNAL TABLE demo (id int,name text)
LOCATION('gpfdist://hostname:port1/demo.txt','gpfdist://hostname:port2/demo.txt')
FORMAT 'TEXT' (DELIMITER '|' NULL '');

# 带错误数据日期的多文件服务
CREATE EXTERNAL TABLE demo (id int,name text)
LOCATION('gpfdist://hostname:port1/demo.txt','gpfdist://hostname:port2/demo.txt')
FORMAT 'CSV' (DELIMITER ',' )
LOG ERRORS INTO err_customer SEGMENT REJECT LIMIT 2;
# 查看错误日志
select * from err_customer;

# 创建可写外部表
CREATE WRITABLE EXTERNAL TABLE output (LIKE input)
LOCATION('gpfdist://localhost:port/output.out')
FORMAT 'TEXT' (DELIMITER '|' NULL '')
DISTRIBUTED BY (id);
insert into output select * from input ;

# 将外部表装载到数据表
CREATE TABLE new AS SELECT * FROM demo；

# 创建WEB外部表(有两种方式URL和OS)
查询优化器不允许重复扫描WEB表的数据

# URL(URL的数量对应并行访问WEB表的segment实例)
CREATE EXTERNAL WEB TABLE demo (name text,date date,amount float4,category text,description text )
LOCATION(
'http://WEB_URL/file1.csv',
'http://WEB_URL/file2.csv'
)
FORMAT 'CSV' (HEADER);
# OS(在一个或多个segment上指定执行SHELL命令或脚本,输出结果作为WEB表访问的数据)
CREATE EXTERNAL WEB TABLE tb_ext_wb01 (output text)
EXECUTE 'hostname'
FORMAT 'TEXT';
```

---

## GPFDIST
### 介绍
```
在外部表指定文件的所有主机上运行GP文件分发程序
指向一个给定的目录,并行的为所有segment实例提供外部数据文件服务
如果文件使用了gzip或者bzip2压缩,gpfdist会自动解压
可以使用多个gpfdist来提升外部表的扫描性能
可以使用通配符或者C风格的模式匹配多个文件

注意:
    实际应用中,一般会把gpfdist部署在ETL文件服务器上,在这个服务器上启动一个或者多个gpfdist
    一般指定文件数据的父目录,因为大部分是很多数据文件使用同一个gpfdist,路径细写就不能使用同一个gpfdist(开启gpfdist进程时指定文件根目录,定义外部表时指定子目录)
    gpfdist进程取决于网络带宽
```

### 配置参数
```
# 控制节点并行度
gp_external_max_segs(最大多少segment实例访问同一个gpfdist文件分发程序)
```

### 启动与停止
```
# 启动gpfdist,必须指定其提供文件服务的目录以及运行的端口(默认8080)
gpfdist -d /var/load_files -p 9190 -l /home/gpadmin/log &

# 同一台主机启动多个gpfdist服务,只需要指定不同的目录和端口即可
gpfdist -d /var/load_files1 -p 9191 -l /home/gpadmin/log &
gpfdist -d /var/load_files2 -p 9192 -l /home/gpadmin/log2 &

# 停止gpfdist(通过kill命令)
```

### 故障诊断
```
# 确保segment可以访问gpfdist网络(利用wget命令测试连接性)
wget http://hostname:post/filename
# 需要确保CREATE EXTERNAL TABLE定义了hostname,port以及gpfdist的文件名
```

### 使用操作
```
# 创建文件服务目录
su gpadmin
cd ~
mkdir load_files
# 启动文件服务
gpfdist -d /home/gpadmin/load_files -p 9190 -l /home/gpadmin/log &

# 准备外部数据
cd /home/gpadmin/load_files
vi demo.txt
1|XS
2|JKS
3|JF

# 创建单文件服务的可读外部表
psql
CREATE EXTERNAL TABLE demo (id int,name text)
LOCATION('gpfdist://master:9190/demo.txt')
FORMAT 'TEXT' (DELIMITER '|' NULL '');

# 查看数据
SELECT * FROM demo;
 id | name
----+------
  1 | XS
  2 | JKS
  3 | JF
(3 rows)
```

---

## gpdists
### 介绍
```
gpfdists是gpfdist的安全版本
开启的加密通信并确保文件与GP之间的安全认证

使用file://协议,外部文件必须存放在segment主机上
指定符合segment实例数量的URL将并行工作来访问外部表
每个segment主机外部文件数量不能超过segment实例数量
pg_max_external_files用来确定每个外部表中允许有多少个外部文件
```

---

## gphdfs
### 介绍
```
该协议指定一个HDFS包含通配符的路径
在GP连接到HDFS文件时,所有数据将从HDFS数据节点被并行读取到GP的segment实例快速处理
每个segment实例只读取一组Hadoop数据块
对于写,每个segment实例只写giant实例包含的数据
```

### 使用
```
# 保证gpadmin用户可以访问hdfs
# 修改master配置参数
gpconfig -c gp_hadoop_target_version -v "hadoop2"
gpconfig -c gp_hadoop_home -v "/home/hadoop/hadoop"
# 重启后检查配置参数
gpstop -M fast -ra
gpconfig -s gp_hadoop_target_version
gpconfig -s gp_hadoop_home

# 验证
hdfs dfs -ls /

# 设置权限
psql gpdb
#写权限
GRANT INSERT ON PROTOCOL gphdfs TO gpadmin;
#读权限
GRANT SELECT ON PROTOCOL gphdfs TO gpadmin;
#所有权限
GRANT ALL ON PROTOCOL gphdfs TO gpadmin;

create external table test
(
       id int,
       name text
)
LOCATION ('gphdfs://master:9000/test.txt')
FORMAT 'TEXT' (delimiter '\t');
```