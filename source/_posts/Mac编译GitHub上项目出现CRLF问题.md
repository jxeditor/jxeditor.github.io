---
title: Mac编译GitHub上项目出现CRLF问题
date: 2021-04-27 08:54:13
categories: 编译
tags: learn
---

> 参数配置下

<!-- more -->

## 解决方式
```
# 设置拉取全局配置
git config --global core.autocrlf input
```