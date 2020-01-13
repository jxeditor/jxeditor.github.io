---
title: CDH6.3版本安装搭建(联网)
date: 2020-01-10 09:49:44
categories: 搭建
tags: cdh
---

> 联网搭建最新版本的CDH,离线参考之前5.15.1版本安装,更为繁琐

<!-- more -->

# 离线版简介
```
# cm下载
https://archive.cloudera.com/cm6/
# cdh下载
https://archive.cloudera.com/cdh6/
```

---

# 联网版
## 环境准备
```
系统
centos7
jdk1.8
mysql
```

## 系统
```
# 关闭防火墙
systemctl stop firewalld.service
systemctl disable firewalld.service

# 修改hosts
vi /etc/hosts

# 修改主机名
vi /etc/hostname

# 更改host方式
mv /usr/bin/host /usr/bin/host.bak
```

---

## 操作命令
```
# 配置CM的仓库
yum install wget -y
wget https://archive.cloudera.com/cm6/6.3.1/redhat7/yum/cloudera-manager.repo -P /etc/yum.repos.d/
rpm --import https://archive.cloudera.com/cm6/6.3.0/redhat7/yum/RPM-GPG-KEY-cloudera

# 安装jdk
yum install oracle-j2sdk1.8
vi /etc/profile
export JAVA_HOME=/usr/java/jdk1.8.0_181-cloudera
export PATH=$PATH:$JAVA_HOME/bin
source /etc/profile
ln -s /usr/java/jdk1.8.0_181-cloudera /usr/java/default

# 安装mysql
wget http://repo.mysql.com/mysql-community-release-el7-5.noarch.rpm
rpm -ivh mysql-community-release-el7-5.noarch.rpm
yum install mysql-server
systemctl start mysqld
systemctl enable mysqld
/usr/bin/mysql_secure_installation
wget https://dev.mysql.com/get/Downloads/Connector-J/mysql-connector-java-5.1.46.tar.gz
tar zxvf mysql-connector-java-5.1.46.tar.gz
mkdir -p /usr/share/java/
cd mysql-connector-java-5.1.46
cp mysql-connector-java-5.1.46-bin.jar /usr/share/java/mysql-connector-java.jar

# scm库
CREATE DATABASE scm DEFAULT CHARACTER SET utf8 DEFAULT COLLATE utf8_general_ci;
GRANT ALL ON scm.* TO 'scm'@'%' IDENTIFIED BY '123456';

# hue库
CREATE DATABASE hue DEFAULT CHARACTER SET utf8 DEFAULT COLLATE utf8_general_ci;
GRANT ALL ON hue.* TO 'hue'@'%' IDENTIFIED BY '123456';

# hive库
CREATE DATABASE metastore DEFAULT CHARACTER SET utf8 DEFAULT COLLATE utf8_general_ci;
GRANT ALL ON metastore.* TO 'hive'@'%' IDENTIFIED BY '123456';

# oozie库
CREATE DATABASE oozie DEFAULT CHARACTER SET utf8 DEFAULT COLLATE utf8_general_ci;
GRANT ALL ON oozie.* TO 'oozie'@'%' IDENTIFIED BY '123456';

grant all privileges on *.* to 'root'@'cdh04' identified by '123456' with grant option;
flush privileges;
```

## 配置CM数据库
```
/opt/cloudera/cm/schema/scm_prepare_database.sh mysql scm scm
```

## 启动安装
```
# 注意要删除
```