---
title: GP中使用dblink操作
date: 2021-04-15 11:42:18
categories: 大数据
tags: greenplum
---

> 使用dblink操作GP数据库

<!-- more -->

## 准备工作
```
# 查看Greenplum的psql版本
select version();
PostgreSQL 9.4.24 (Greenplum Database 6.0.0-beta.1 build dev)

--- 我这个版本GP自带了dblink
# 对于自带dblink的高版本GP执行下面命令即可使用
psql
CREATE EXTENSION dblink;

--- 低版本操作
# 官网下载postgresql源码(如果没有带)
https://www.postgresql.org/ftp/source/

# 编译
cd /opt
tar -zxvf postgresql-*.tar.gz
cd postgresql-*/contrib/dblink
# 修改Makefile(忽略警告)
PG_CPPFLAGS = -I$(libpq_srcdir) -w
# 开始编译
make USE_PGXS=1 install

# 将生成的dblink.so文件复制到各个节点下
cp dblink.so /usr/local/gpdb/lib/postgresql/

# 加载dblink方法
psql -f dblink.sql gpdb
```

---

## 使用操作
```
# 设置连接
--- 本地可以简写,不需要hostaddr,port,user,password
select dblink_connect('localconn','dbname=gpdb');
--- 远程必须写全
select dblink_connect('disconn','hostaddr=192.168.157.128 port=5432 dbname=gpdb user=gpadmin password=123456');

# 执行查询操作
select * from dblink('localconn','select * from public.demo') as a(a int,b text);
select * from dblink('dbname=gpdb','select * from public.demo') as a(a int,b text);
insert into public.demo_load select * from dblink('dbname=gpdb','select * from public.demo') as a(a int,b text);
insert into public.demo_load select * from dblink('hostaddr=192.168.157.128 port=5432 dbname=gpdb user=gpadmin password=123456','select * from public.demo') as a(a int,b text);

# 注意
使用insert * from select时不能只使用dblink_connect设置好的连接,需要数据库连接串
```