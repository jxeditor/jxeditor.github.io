---
title: Github经常性连接不上解决方式
date: 2021-03-17 14:46:04
categories: 教程
tags: tools
---

> 平常开发经常性需要访问github代码,频繁连接不上github

<!-- more -->

## 解决方式
```sh
# 访问https://www.ipaddress.com/
# 找到目前github的IP映射
输入域名查询IP地址

# 修改本机的hosts文件
140.82.114.4	github.com
199.232.69.194	github.global.ssl.fastly.net
185.199.108.133	raw.githubusercontent.com

# ps.如果使用的是Mac本,可能需要添加更多的映射关系
```