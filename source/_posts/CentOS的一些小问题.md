---
title: CentOS的一些小问题
date: 2016-07-24 09:24:25
categories: 运维
tags: os
---

> 记录CentOS上发生的一些稀奇古怪的事情

<!-- more -->

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