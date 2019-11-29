---
title: Win10系统专业版激活
date: 2019-11-29 14:56:21
categories: 运维
tags: os
---

> 激活专业版Win10以达到使用远程连接功能

<!-- more -->

## 激活Win10
```
# 有效的kms服务器
zh.us.to 有效
kms.03k.org 有效
kms.chinancce.com 有效
kms.shuax.com 有效
kms.dwhd.org 有效
kms.luody.info 有效
kms.digiboy.ir 有效
kms.lotro.cc 有效
ss.yechiu.xin 有效
www.zgbs.cc 有效
cy2617.jios.org 有效

# 右键开始图标,选择[windows powershell(管理员)]

# 安装秘钥
slmgr /ipk W269N-WFGWX-YVC9B-4J6C9-T83GX

# 设置kms服务器
slmgr /skms zh.us.to

# 激活系统
slmgr /ato

# 查看激活状态
slmgr /xpr
```