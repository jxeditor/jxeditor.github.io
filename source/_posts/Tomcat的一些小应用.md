---
title: Tomcat的一些小应用
date: 2019-06-18 07:53:01
categories: 搭建
tags: 
    - tomcat
---

## 自动重新加载
```
# 修改tomcat/conf/context.xml文件
# 加上reloadable="true"
<Context reloadable="true">
```

<!-- more -->

---

## 开启manager
```
# 修改tomcat/conf/tomcat-users.xml文件
<role rolename="manager-gui"/>
<role rolename="admin-gui"/>
<role rolename="manager-script"/>
<user username="admin" password="admin" roles="admin-gui,manager-gui,manager-script"/>
```