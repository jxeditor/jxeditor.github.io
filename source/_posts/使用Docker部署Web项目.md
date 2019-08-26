---
title: 使用Docker部署Web项目
date: 2019-08-26 16:00:52
categories: 搭建
tags: docker
---

> docker进行项目部署

<!-- more -->

## 安装docker以及加载镜像
```bash
# 本机使用的是CentOS6.5,docker存在很多bug
yum install docker-engine
# 有网情况
docker pull mysql
docker pull tomcat
# 没网情况
docker save -o ./images.tar images
docker load -i images.tar 或者 docker load < images.tar
```

---

## 制作镜像
```
vi Dockerfile
FROM tomcat:latest
MAINTAINER xs
COPY cas.war /usr/local/tomcat/webapps/
COPY wiki.war /usr/local/tomcat/webapps/

docker build -t demo:v1 .
```

---

## 启动容器
```bash
docker run --name dmysql01 --hostname dmysql01 --ip 172.17.0.3  -e MYSQL_ROOT_PASSWORD=123456 -v /root/dmysql01/data:/var/lib/mysql -d -p 13306:3306 mysql

# 需要知道mysql的IP地址
docker inspect dmysql01
# docker exec -it 容器ID /bin/bash
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '123456';

docker run --name myweb --add-host dmysql01:172.17.0.8 -v /root/docker/app/repository:/usr/local/tomcat/work/Catalina/localhost/wiki/extension/repository -d -p 18080:8080 demo:v1
```
