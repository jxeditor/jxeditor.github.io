---
title: GreenPlum编译安装单机版
date: 2021-04-12 17:37:48
categories: 搭建
tags: greenplum
---

> 网上教程过于零散,而且有不正确的地方

<!-- more -->

## 准备工作
### 基本情况
```
CentOS7
GP_6X_STABLE
1 master 1 primary 1 mirror
```

### 环境配置
```
yum install -y net-tools # 需要ifconfig与netstat命令

systemctl stop firewalld # 关闭防火墙

systemctl disable firewalld # 禁用防火墙

hostnamectl set-hostname master # 修改主机名

vi /etc/hosts # 配置主机域名
192.168.157.168    master

vi /etc/selinux/config # 关闭selinux
SELINUX=disabled

setenforce 0

vi /etc/sysctl.conf # 修改内核(可不修改) 
net.ipv4.ip_forward = 0 
net.ipv4.conf.default.accept_source_route = 0 
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_tw_recycle = 1 
net.ipv4.tcp_max_syn_backlog = 4096 
net.ipv4.conf.all.arp_filter = 1
net.ipv4.ip_local_port_range = 1025 65535
net.core.netdev_max_backlog= 10000 
net.core.rmem_max = 2097152
net.core.wmem_max = 2097152
net.core.somaxconn = 2048
kernel.sysrq = 1 
kernel.core_uses_pid = 1 
kernel.msgmni = 2048 
kernel.msgmax = 65536
kernel.msgmnb = 65536 
kernel.shmmni = 4096 
kernel.shmmax = 500000000 
kernel.shmall = 4000000000 
kernel.sem = 250 64000 100 512 
vm.overcommit_memory = 2

vi /etc/security/limits.conf # 修改文件描述符文件(可不修改)
* soft nofile 65536
* hard nofile 65536
* soft nproc 131072
* hard nproc 131072
```

---

## 编译安装启动
```
cd /opt/gpdb-6X_STABLE
./README.CentOS.bash
sudo ln -sf /usr/bin/cmake3 /usr/local/bin/cmake
sudo yum install -y centos-release-scl
sudo yum install -y devtoolset-7-toolchain
echo 'source scl_source enable devtoolset-7' >> ~/.bashrc
./configure --with-perl --with-python --with-libxml --with-gssapi --prefix=/usr/local/gpdb
make -j8
make -j8 install
## 编译完成

useradd gpadmin # 创建gpadmin用户并授权
passwd gpadmin
chown -R gpadmin /usr/local/gpdb
chgrp -R gpadmin /usr/local/gpdb

su gpadmin # 切换gpadmin用户,创建数据目录
mkdir -p /data/gpdata/master 
mkdir -p /data/gpdata/primary
mkdir -p /data/gpdata/mirror 

vi .bashrc # 设置gpadmin用户的环境变量
source /usr/local/gpdb/greenplum_path.sh
export MASTER_DATA_DIRECTORY=/data/gpdata/master/gpseg-1
export PGPORT=5432
export PGUSER=gpadmin
export PGDATABASE=gpdb

source .bashrc # 使环境变量生效

vi /home/gpadmin/seg_hosts # 添加节点服务器文件
master

ssh-keygen # 配置免密
ssh-copy-id master
gpssh-exkeys -f /home/gpadmin/seg_hosts

cp /usr/local/gpdb/docs/cli_help/gpconfigs/gpinitsystem_config /home/gpadmin/initGreenplum # 复制配置文件

vi initGreenplum 修改配置文件
declare -a DATA_DIRECTORY=(/data/gpdata/primary)
MASTER_HOSTNAME=master
MASTER_DIRECTORY=/data/gpdata/master
MASTER_PORT=5432
MIRROR_PORT_BASE=7000
DATABASE_NAME=gpdb
declare -a MIRROR_DATA_DIRECTORY=(/data/gpdata/mirror)
MACHINE_LIST_FILE=/home/gpadmin/seg_hosts

gpinitsystem -c /home/gpadmin/initGreenplum # 初始化GP数据库
gpstart -a # 启动GP
psql # 进入命令行
```

---

## 远程连接GP
```
vi /data/gpdata/master/gpseg-1/pg_hba.conf
# 添加对应的IP地址即可
```