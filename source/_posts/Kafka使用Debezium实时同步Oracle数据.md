---
title: Kafka使用Debezium实时同步Oracle数据
date: 2021-04-23 13:03:20
categories: 大数据
tags: kafka
---

> 实时同步Oracle数据到Kafka必要操作,附带connect操作

<!-- more -->
# LogMiner支持
## 准备数据库
### Oracle LogMiner配置
```
# 默认Oracle数据库已经安装完毕
sqlplus / as sysdba
startup;
CONNECT sys/top_secret AS SYSDBA
alter system set db_recovery_file_dest_size = 10G;
# 注意目录必须存在
alter system set db_recovery_file_dest = '/opt/oracle/oradata/recovery_area' scope=spfile;
shutdown immediate
startup mount
alter database archivelog;
alter database open;
archive log list
exit
# 在特定表进行配置,减少Oracle REDO日志信息量
ALTER TABLE dbname.tablename ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
```
### 创建连接器的LogMiner用户
```
sqlplus / as sysdba
CREATE TABLESPACE logminer_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/logminer_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
# 切换PDB
alter session set container=ORCLPDB1;
# 启动PDB
alter pluggable database open;
CREATE TABLESPACE logminer_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/ORCLPDB1/logminer_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
exit;

sqlplus / as sysdba
CREATE USER c##dbzuser IDENTIFIED BY dbz DEFAULT TABLESPACE logminer_tbs QUOTA UNLIMITED ON logminer_tbs CONTAINER=ALL;

GRANT CREATE SESSION TO c##dbzuser CONTAINER=ALL;
GRANT SET CONTAINER TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$DATABASE to c##dbzuser CONTAINER=ALL;
GRANT FLASHBACK ANY TABLE TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ANY TABLE TO c##dbzuser CONTAINER=ALL;
GRANT SELECT_CATALOG_ROLE TO c##dbzuser CONTAINER=ALL;
GRANT EXECUTE_CATALOG_ROLE TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ANY TRANSACTION TO c##dbzuser CONTAINER=ALL;
GRANT LOGMINING TO c##dbzuser CONTAINER=ALL;
GRANT CREATE TABLE TO c##dbzuser CONTAINER=ALL;
GRANT LOCK ANY TABLE TO c##dbzuser CONTAINER=ALL;
GRANT ALTER ANY TABLE TO c##dbzuser CONTAINER=ALL;
GRANT CREATE SEQUENCE TO c##dbzuser CONTAINER=ALL;
GRANT EXECUTE ON DBMS_LOGMNR TO c##dbzuser CONTAINER=ALL;
GRANT EXECUTE ON DBMS_LOGMNR_D TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOG TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOG_HISTORY TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOGMNR_LOGS TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOGMNR_CONTENTS TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOGMNR_PARAMETERS TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$LOGFILE TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$ARCHIVED_LOG TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$ARCHIVE_DEST_STATUS TO c##dbzuser CONTAINER=ALL;

# 开启归档(不开启数据库级别,会报错表定义已修改,读取不到表)
ALTER DATABASE ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
exit;
```

---

## 部署连接器
### 下载Oracle工具Jar
```
wget https://download.oracle.com/otn_software/linux/instantclient/211000/instantclient-basic-linux.x64-21.1.0.0.0.zip

unzip instantclient-basic-linux.x64-21.1.0.0.0.zip
mv instantclient_21_1 /opt/instant_client

# 复制ojdbc.jar和xstreams.jar到Kafka的libs下
cp instant_client/ojdbc8.jar /opt/kafka/libs/
cp instant_client/xstreams.jar /opt/kafka/libs/

# 创建环境变量指向客户端目录
LD_LIBRARY_PATH=/opt/instant_client/
```
### 启动KafkaConnect
```
./bin/connect-distributed.sh /opt/kafka/config/connect-distributed.properties

# 访问Web
http://192.168.6.128:8083/
```
### 添加Connector
```
# 查看Oracle的service.name
show parameter service_names;
# 查看Oracle的SID
SELECT instance_name FROM v$instance;

# Post请求(使用CDB)
curl -i -X POST -H 'Content-type':'application/json' -d '{"name":"test","config":{"connector.class":"io.debezium.connector.oracle.OracleConnector","tasks.max":"1","database.server.name":"ORCLCDB","database.hostname":"192.168.6.128","database.port":"1521","database.user":"c##dbzuser","database.password":"dbz","database.dbname":"ORCLCDB","database.history.kafka.bootstrap.servers":"localhost:9092","database.history.kafka.topic":"test.schema","table.include.list":"C##XS.test","decimal.handling.mode":"string"}}' http://192.168.6.128:8083/connectors
```
### 查看同步数据
```
# 创建表的DDL数据
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic test --from-beginning

# 创建table需要指定非系统用户登录
create table test (
    id  varchar2(50) primary key,
    phone number(11) unique
);
ALTER TABLE C##XS.test ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS

insert into test(id,phone) values('XS',13400000002);

# 同步到数据后Kafka的topic为ORCLCDB.C__XS.test
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic ORCLCDB.C__XS.test --from-beginning
```

---

# XSteam支持
## 准备数据库
### 创建连接器的XStream用户
```
# Admin用户
sqlplus / as sysdba
CREATE TABLESPACE xstream_adm_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/xstream_adm_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
# 切换PDB
alter session set container=ORCLPDB1;
# 启动PDB
alter pluggable database open;
CREATE TABLESPACE xstream_adm_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/ORCLPDB1/xstream_adm_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
exit;

sqlplus / as sysdba
CREATE USER c##dbzadmin IDENTIFIED BY dbz DEFAULT TABLESPACE xstream_adm_tbs QUOTA UNLIMITED ON xstream_adm_tbs CONTAINER=ALL;
GRANT CREATE SESSION, SET CONTAINER TO c##dbzadmin CONTAINER=ALL;

BEGIN
    DBMS_XSTREAM_AUTH.GRANT_ADMIN_PRIVILEGE(
        grantee                 => 'c##dbzadmin',
        privilege_type          => 'CAPTURE',
        grant_select_privileges => TRUE,
        container               => 'ALL'
    );
END;
/

# 连接用户
CREATE TABLESPACE xstream_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/xstream_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
alter session set container=ORCLPDB1;
CREATE TABLESPACE xstream_tbs DATAFILE '/opt/oracle/oradata/ORCLCDB/ORCLPDB1/xstream_tbs.dbf' SIZE 25M REUSE AUTOEXTEND ON MAXSIZE UNLIMITED;
exit;

sqlplus / as sysdba
CREATE USER c##dbzuser IDENTIFIED BY dbz DEFAULT TABLESPACE xstream_tbs QUOTA UNLIMITED ON xstream_tbs CONTAINER=ALL;

GRANT CREATE SESSION TO c##dbzuser CONTAINER=ALL;
GRANT SET CONTAINER TO c##dbzuser CONTAINER=ALL;
GRANT SELECT ON V_$DATABASE to c##dbzuser CONTAINER=ALL;
GRANT FLASHBACK ANY TABLE TO c##dbzuser CONTAINER=ALL;
GRANT SELECT_CATALOG_ROLE TO c##dbzuser CONTAINER=ALL;
GRANT EXECUTE_CATALOG_ROLE TO c##dbzuser CONTAINER=ALL;
exit;
```
### 创建XStream出站服务器
```
sqlplus / as sysdba
conn c##dbzadmin/dbz
DECLARE
  tables  DBMS_UTILITY.UNCL_ARRAY;
  schemas DBMS_UTILITY.UNCL_ARRAY;
BEGIN
    tables(1)  := NULL;
    schemas(1) := 'debezium';
  DBMS_XSTREAM_ADM.CREATE_OUTBOUND(
    server_name     =>  'dbzxout',
    table_names     =>  tables,
    schema_names    =>  schemas);
END;
/
exit;

# XStream用户连接到出站服务器(每个连接器需要唯一XStream出站服务器)
sqlplus / as sysdba
BEGIN
  DBMS_XSTREAM_ADM.ALTER_OUTBOUND(
    server_name  => 'dbzxout',
    connect_user => 'c##dbzuser');
END;
/
exit;
```

---

## 部署连接器
### 添加Connector
```
# Post请求
curl -i -X POST -H 'Content-type':'application/json' -d '{"name":"test","config":{"connector.class":"io.debezium.connector.oracle.OracleConnector","tasks.max":"1","database.server.name":"ORCLCDB","database.hostname":"192.168.6.128","database.port":"1521","database.user":"c##dbzuser","database.password":"dbz","database.dbname":"ORCLCDB","database.pdb.name":"ORCLPDB1","database.history.kafka.bootstrap.servers":"localhost:9092","database.history.kafka.topic":"test.schema","table.include.list":"C##XS.test","decimal.handling.mode":"string","database.connection.adapter":"xstream","database.out.server.name":"dbzxout"}}' http://192.168.6.128:8083/connectors
```

---

# 问题
## 启动连接器报表定义已修改,读取失败
```
# 需要提前开启归档
ALTER DATABASE ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
# 引生问题:如果一开始没有开启归档的表怎么实时同步
```

---

## Oracle归档日志过多解决(磁盘很大可以忽略)
```
# 由于连接器是依赖于Oracle的归档日志做的实时同步
# 存在归档日志撑爆磁盘的问题
#! /bin/bash
exec >> /home/oracle/log/del_arch`date +%F-%H`.log #记录脚本日志
$ORACLE_HOME/bin/rman target / <<EOF
#检查归档日志
crosscheck archivelog all;
#删除所有过期日志
delete noprompt expired archivelog all;
#删除一个小时前的归档日志
delete noprompt archivelog until time 'sysdate-1/24';
exit;
EOF
```


