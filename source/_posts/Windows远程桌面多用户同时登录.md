---
title: Windows远程桌面多用户同时登录
date: 2020-03-12 12:53:17
categories: 系统
tags: 
    - os
    - tools
---

> 远程连接多用户同时操作

<!-- more -->

# 准备
Win 10系统设备一台,需要专业版
RDPWrap工具[下载链接](https://github.com/jxeditor/Software/blob/master/Win10%E5%A4%9A%E7%94%A8%E6%88%B7%E5%90%8C%E6%97%B6%E7%99%BB%E9%99%86.zip)

---

# 操作
```
a.以管理员身份运行install.bat
b.运行RDPconf.exe
    ListenerState可能是不支持
c.进入'替换'文件夹
d.将termsrv.dll复制到C:\Windows\System32\下
e.将termsrv.dll.mui复制到C:\Windows\System32\zh-CN\下
f.重启电脑,运行RDPConf.exe
    ListenerState为支持状态
```

---

# 注意
```
C:\Windows\System32\下文件提示没有权限
右键要操作的文件-属性->安全->高级->更改'所有者'
->高级->立即查找->Administrators->确定
->确定->更改权限
```