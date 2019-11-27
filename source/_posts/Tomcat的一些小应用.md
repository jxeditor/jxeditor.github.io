---
title: Tomcat的一些小应用
date: 2018-06-18 07:53:01
categories: 搭建
tags: 
    - tomcat
---

> Tomcat的修改

<!-- more -->

## CMD启动乱码
```
# 修改tomcat的config目录下的logging.properties文件
java.util.logging.ConsoleHandler.encoding = UTF-8
改为
java.util.logging.ConsoleHandler.encoding = GBK
```

---

## 自动重新加载
```
# 修改tomcat/conf/context.xml文件
# 加上reloadable="true"
<Context reloadable="true">
```

---

## 开启manager
```
# 修改tomcat/conf/tomcat-users.xml文件
<role rolename="manager-gui"/>
<role rolename="admin-gui"/>
<role rolename="manager-script"/>
<user username="admin" password="admin" roles="admin-gui,manager-gui,manager-script"/>
```

## 设置Tomcat展开目录
```
# 打开Tomcat所在安装目录,打开到conf配置文件下,打开web.xml文件
# 修改listings属性,将其设定为true
<init-param>
    <param-name>listings</param-name>
    <param-value>false</param-value>
</init-param>
# 重启Tomcat服务
```