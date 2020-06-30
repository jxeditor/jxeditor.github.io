---
title: Shell远程执行命令
date: 2017-01-07 09:51:36
categories: 运维
tags: shell
---

> 解决经常远程其他节点执行脚本的问题,需要ssh免密登陆

<!-- more -->

## 命令行
```sh
ssh root@node01 "cd /home ; touch abc.txt"
```

---

## 脚本
```sh
#!/bin/bash
ssh user@remoteNode > /dev/null 2>&1 << eeooff
cd /home
touch abcdefg.txt
exit
eeooff

# eeooff之间是目标服务器执行的命令,eeooff可以改成其他的
# 使用> /dev/null 2>&1 重定向是为了不打印目标服务器的日志
```

---

## 带密码远程执行
```sh
# 有时候服务器之间并没有配置免密,需要输入密码才能访问
yum install -y sshpass
sshpass -p "password" ssh root@ip "df -h"
```