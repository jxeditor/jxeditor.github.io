---
title: CentOS安装Oracle数据库
date: 2020-04-15 17:14:52
categories: 搭建
tags: oracle
---

> 快速搭建Oracle数据库

<!-- more -->

## 安装步骤
```
yum localinstall -y oracle-database-preinstall-19c-1.0-1.el7.x86_64.rpm
yum localinstall -y oracle-database-ee-19c-1.0-1.x86_64.rpm

# 修改字符集
vi /etc/init.d/oracledb_ORCLCDB-19c
export CHARSET=ZHS16GBK

# 等待初始化完成
/etc/init.d/oracledb_ORCLCDB-19c configure

passwd oracle
su oracle

vi /home/oracle/.bashrc
export ORACLE_HOME=/opt/oracle/product/19c/dbhome_1
export PATH=$PATH:$ORACLE_HOME/bin
export ORACLE_SID=ORCLCDB

sqlplus / as sysdba

# 创建自动启动pdb的触发器
CREATE TRIGGER open_all_pdbs
AFTER STARTUP ON DATABASE
BEGIN
EXECUTE IMMEDIATE 'alter pluggable database all open'
END open_all_pdbs;
/
```

---

## 使用操作
```
su oracle
sqlplus / as sysdba
startup

# 修改用户密码
select username from dba_users where account_status='OPEN';
alter user sys identified by 123456;
alter user system identified by 123456;

# 注意
有可能出现乱码的情况
select userenv('language') from dual;
查看字符集是否有问题
在.bashrc文件中添加
export NLS_LANG=AMERICAN_AMERICA.ZHS16GBK 

使用Navicat登陆时报错,需要下载对应版本的instantclient
Navicat->工具->选项->环境->OCI环境->指定对应版本的oci.dll
```