---
title: CentOS的一些小问题
date: 2016-07-24 09:24:25
categories: 运维
tags: os
---

> 记录CentOS上发生的一些稀奇古怪的事情

<!-- more -->

## 自制yum仓库
```
# 挂载镜像的仓库
mkidr /mnt/iso
mount -o loop *.iso /mnt/iso
vi /etc/yum.repos.d/file.repo
[base]
name=rhel6repo
baseurl=file:///mnt/iso
enabled=1
gpgckeck=0
gpgkey=file:///mnt/iso/RPM-GPG-KEY-redhat-release

yum clean all

# 自制仓库
yum install --downloadonly --downloaddir=/temp/ mysql-community-server
yum install createrepo -y

createrepo /temp/

此时已经可以使用file:///temp/的形式添加本地仓库

# 内网仓库
yum install httpd
cd /var/www/html/
mkdir centos/6/os/x86_64/
# 用mv移动会出现403问题
cp -r /temp/* /var/www/html/centos/6/os/x86_64/
vi  client.repo
[client]
name=httpServer
baseurl=http://192.168.3.201/centos/$releasever/os/$basearch
gpgcheck=0
```

---

## not in the sudoers file
```bash
# 解决not in the sudoers file
chmod u+w /etc/sudoers
gedit /etc/sudoers

# Allow root to ruan any commands anywhere
xx ALL=(ALL)  ALL

chmod u-w /etc/sudoers
```

---

## 主机能ping通虚拟机,虚拟机不能ping通主机
```
主机防火墙开启,禁ping
```

---

## 动态获取IP
```
vi /etc/sysconfig/network-scripts/ifcfg-eth0

DEVICE=eth0
BOOTPROTO=dhcp
# HWADDR=00:0C:29:77:C3:65
IPV6INIT=yes
ONBOOT=yes
TYPE=Ethernet
# UUID=2e3a08e6-714a-4bbc-a78b-71e435d281e6

# 重启网络服务
/etc/init.d/network restart
或者service network restart
# 自动获取IP地址命令
dhclient
```

---

## XShell上传下载
```
yum install lrzsz
```
