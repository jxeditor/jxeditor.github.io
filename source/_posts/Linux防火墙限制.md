---
title: Linux防火墙限制
date: 2016-05-31 21:16:39
categories: 运维
tags: os
---

> 防火墙

<!-- more -->

## 防火墙的限制
### 1. 限制只允许指定IP访问指定端口
```
-A INPUT -m state --state NEW -m tcp -p tcp -s 127.0.0.1 --dport 22,3306,8080 -j ACCEPT
```

---

### 2. 白名单设置
```
#定义白名单变量名
-N whitelist
#设置白名单ip段
-A whitelist -s 120.25.122.0 -j ACCEPT
-A whitelist -s 120.25.122.1 -j ACCEPT

#系统远程连接及数据库端口规定白名单ip才可访问
-A INPUT -p tcp -m state --state NEW -m tcp --dport 22 -j whitelist
-A INPUT -p tcp -m state --state NEW -m tcp --dport 1521 -j whitelist
-A INPUT -p tcp -m state --state NEW -m tcp --dport 8080 -j whitelist
-A INPUT -p tcp -m state --state NEW -m tcp --dport 3306 -j whitelist
```

---

### 3. 保存防火墙设置
```
service iptables save
service iptables restart
```