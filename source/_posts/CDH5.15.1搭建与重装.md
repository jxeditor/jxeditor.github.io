---
title: CDH5.15.1搭建与重装
date: 2019-05-31 21:22:16
categories: 搭建
tags: cdh
---

> 如何快速的搭建一套CDH,注意CentOS版本对应

<!-- more -->

## 系统环境[64位]
- 操作系统: Centos6
- Cloudera Manager: 5.15.1.4
- CDH: 5.15.1

--- 

## 下载地址
#### Clouder Manager下载地址
- [Clouder Manager el6 5.15.1](http://archive.cloudera.com/cm5/cm/5/cloudera-manager-el6-cm5.15.1_x86_64.tar.gz)

#### CDH安装包下载地址
- [CDH el6 5.15.1 ](http://archive.cloudera.com/cdh5/parcels/5.15.1.4/CDH-5.15.1-1.cdh5.15.1.p0.4-el6.parcel)
- [CDH el6 5.15.1 sha1](http://archive.cloudera.com/cdh5/parcels/5.15.1.4/CDH-5.15.1-1.cdh5.15.1.p0.4-el6.parcel.sha1)
- [ManiFest.json](http://archive.cloudera.com/cdh5/parcels/5.15.1.4/manifest.json)

#### JDK下载地址
- 使用1.6,1.7以外版本会警告
- [新版本下载](https://www.oracle.com/technetwork/java/javase/downloads/index.html)
- [老版本下载](https://www.oracle.com/technetwork/java/javase/archive-139210.html)

#### MySQL下载地址
- [MySQL yum仓库地址](https://repo.mysql.com/yum/)
- [MySQL连接器](https://dev.mysql.com/downloads/connector/j/)

---
## 环境配置
#### 1.网络配置
```
vi /etc/hosts
192.168.6.129	hadoop01
192.168.6.130	hadoop02
192.168.6.131	hadoop03
```

#### 2.免密配置
```bash
ssh-keygen -t rsa
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
scp ~/.ssh/authorized_keys root@hadoop02:~/.ssh/
scp ~/.ssh/authorized_keys root@hadoop03:~/.ssh/

# 或者
ssh-keygen
ssh-copy-id -i .ssh/id_rsa.pub root@hadoop01
ssh-copy-id -i .ssh/id_rsa.pub root@hadoop02
ssh-copy-id -i .ssh/id_rsa.pub root@hadoop03
```

#### 3.JDK配置
```bash
rpm -qa | grep java     # 查询
rpm -e --nodeps 包名    # 卸载
rpm -ivh 包名           # 安装

echo "JAVA_HOME=/usr/java/latest/" >> /etc/environment
# 或者
echo "export PATH=$PATH:/usr/java/latest/bin" >> /etc/profile
source /etc/profile

# 注意,无论哪种安装方法,一定保证/usr/java/default存在
mkdir /usr/java
ln -s /usr/local/jdk8 /usr/java/default
```

#### 4.MySQL配置
```
# CentOS7
wget http://repo.mysql.com/mysql-community-release-el7-5.noarch.rpm
rpm -ivh mysql-community-release-el7-5.noarch.rpm
# 继续
yum install mysql-server
chkconfig mysqld on
service mysqld start
mysqladmin -u root password '123456'
mysql -u root -p
create database hive DEFAULT CHARSET utf8 COLLATE utf8_general_ci;
create database hue DEFAULT CHARSET utf8 COLLATE utf8_general_ci;
create database oozie DEFAULT CHARSET utf8 COLLATE utf8_general_ci;
grant all privileges on *.* to 'root'@'hadoop01' identified by '123456' with grant option;
flush privileges;
```

#### 5.防火墙,SELinux以及Swap配置
```
service iptables stop   # 临时关闭
chkconfig iptables off  # 重启后永久生效

setenforce 0            # 临时关闭
vi /etc/selinux/config  # 重启后永久生效
SELINUX=disabled

echo 10 > /proc/sys/vm/swappiness
echo 10 > /proc/sys/vm/swappiness
vi /etc/sysctl.conf     # 重启后永久生效
vm.swappiness = 10

echo never > /sys/kernel/mm/transparent_hugepage/defrag
echo never > /sys/kernel/mm/transparent_hugepage/enabled
vi /etc/rc.local        # 重启后永久生效
# 将上述两条语句写入rc.local文件
```

#### 6.NTP时间同步
```bash
yum install ntp
chkconfig ntpd on
chkconfig --list        # ntpd其中2-5为on状态就代表成功

# 能联网情况下
ntpdate cn.pool.ntp.org
hwclock --systohc
service ntpd start

# 不能联网情况下
# 设置hadoop01为NTP服务器
vi /etc/ntp.conf        # 默认的server都关闭
restrict 127.0.0.1
restrict -6 ::1
restrict 192.168.1.0 mask 255.255.255.0 nomodify notrap
server 192.168.1.128 perfer
server 192.168.1.128
server 127.127.1.0
fudge 127.127.1.0 stratum 10

# NTP客户端设置
vi /etc/ntp.conf        # 默认的server都关闭
restrict 127.0.0.1
restrict -6 ::1
server 192.168.1.128
restrict 192.168.1.128 nomodify notrap noquery
server 127.127.1.0
fudge 127.127.1.0 stratum 10
```

---

## 开始安装
#### 1.安装Cloudera Manager Server 和Agent
```
tar -xzvf cloudera-manager*.tar.gz
mv cloudera /opt/
mv cm-5.15.1 /opt/

// 添加数据库连接
cp mysql-connector-java-5.1.47-bin.jar /opt/cm-5.15.1/share/cmf/lib/

// 主节点初始化CM数据库
/opt/cm-5.15.1/share/cmf/schema/scm_prepare_database.sh mysql cm -hlocalhost -uroot -p123456 --scm-host localhost scm scm scm

// 修改Agent配置,为主节点名
vi /opt/cm-5.15.1/etc/cloudera-scm-agent/config.ini
server_host=hadoop01

// 分发到其他节点
scp -r /opt/cm-5.15.1 root@hadoop02:/opt/
scp -r /opt/cm-5.15.1 root@hadoop03:/opt/

// 所有节点创建cloudera-scm用户
useradd --system --home=/opt/cm-5.15.1/run/cloudera-scm-server/ --no-create-home --shell=/bin/false --comment "Cloudera SCM User" cloudera-scm
```

#### 2.安装CDH
##### sha1要mv成sha,否则系统会重新下载
- CDH-5.15.1-1.cdh5.15.1.p0.4-el6.parcel
- CDH-5.15.1-1.cdh5.15.1.p0.4-el6.parcel.sha1
- manifest.json
```
mv CDH-5.15.1-1.cdh5.15.1.p0.4-el6.parcel* manifest.json /opt/cloudera/parcel-repo/

// 主节点
/opt/cm-5.15.1/etc/init.d/cloudera-scm-server start
// 所有节点
/opt/cm-5.15.1/etc/init.d/cloudera-scm-agent start
```

#### 3.配置CDH
##### 访问[http://hadoop01:7180](http://hadoop01:7180)进行配置
```bash
# 用户名密码均为admin
# 选择CM版本
# 选择Agent节点
# 选择Parcel包
# 耐心等待分配
# 检查主机正确性
# 选择所有服务
# 服务配置一般默认<zk默认只有1个节点可以调整>
# 进行数据库设置
cp mysql-connector-java-5.1.47-bin.jar /opt/cloudera/parcels/CDH-5.15.1-1.cdh5.15.1.p0.4/lib/hive/lib/
cp mysql-connector-java-5.1.47-bin.jar /var/lib/oozie/
# 测试连接
# hue测试不通过,缺少依赖
yum install libxml2-python krb5-devel cyrus-sasl-plain cyrus-sasl-gssapi cyrus-sasl-devel libxml2-devel libxslt-devel mysql mysql-devel openldap-devel python-devel python-simplejson sqlite-devel mod_ssl
# 耐心等待服务启动
# 安装完毕
```

---

## 测试与各端口
```bash
hdfs hadoop jar /opt/cloudera/parcels/CDH/lib/hadoop-mapreduce/hadoop-mapreduce-examples.jar pi 10 100

# CDH
http://hadoop01:7180

# Yarn
http://hadoop01:8088

# Hue
http://hadoop01:8888

# HDFS
http://hadoop01:50070

# JobHistory
http://hadoop01:19888

# HBase
http://hadoop01:60010
http://hadoop01:60030

# Spark
http://hadoop01:7077
http://hadoop01:8080
http://hadoop01:8081
http://hadoop01:4040
```

---

## 重装CDH
```
// 删除Agent的UUID
rm -rf /opt/cm-5.15.1/lib/cloudera-scm-agent/*

// 删除主节点CM数据库
drop database cm;

// 删除Agent节点namenode和datanode节点信息
rm -rf /dfs/nn/*
rm -rf /dfs/dn/*

// 重新初始化CM数据库
/opt/cm-5.15.1/share/cmf/schema/scm_prepare_database.sh mysql cm -hlocalhost -uroot -p123456 --scm-host localhost scm scm scm

// 执行Server和Agent脚本
/opt/cm-5.15.1/etc/init.d/cloudera-scm-server start
/opt/cm-5.15.1/etc/init.d/cloudera-scm-agent start

// 重新安装
http://hadoop01:7180

// 数据库连接
cp mysql-connector-java-5.1.47-bin.jar /var/lib/oozie/
cp mysql-connector-java-5.1.47-bin.jar /opt/cloudera/parcels/CDH-5.15.1-1.cdh5.15.1.p0.4/lib/hive/lib/
```

---

## 可能出现的问题
#### 部署
```
问题:
    首个失败：主机 hadoop03 (id=2) 上的客户端配置 (id=4) 已使用 127 退出，而预期值为 0。
解决:
    检查是否是java找不到,需要/usr/java/default
    如果不是,则检查是否是内存不足导致无法部署客户端配置
```

#### HDFS
```
1.Permission denied: user=root, access=WRITE, inode="/user":hdfs:supergroup:drwxr-xr-x
解决:
echo "export HADOOP_USER_NAME=hdfs" >> .bash_profile
source .bash_profile

2.WARN hdfs.DFSClient: Caught exception
解决:
不影响结果,暂时未找到办法
```
#### Hue
```
1.Can't Open /opt/cm-5.15.1/run/cloudera-scm-agent/process/65-hue-HUE_LOAD_BALANCER/supervisor.conf权限不足
解决:
chown hue:hue supervisor.conf
chmod 666 supervisor.conf

2./usr/sbin/httpd没有这个命令
解决:
yum install httpd.x86_64

3./usr/lib64/httpd/modules/mod_ssl.so没有这个文件
解决:
yum -y install mod_ssl

4.Could not start SASL: Error in sasl_client_start (-4) SASL(-4): no mechanism available: No worthy mechs found
解决:
yum install cyrus-sasl-plain cyrus-sasl-devel cyrus-sasl-gssapi
重启Hue
```