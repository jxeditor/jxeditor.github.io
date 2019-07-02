---
title: Docker的简单入门
date: 2019-05-31 15:20:25
categorys: 教程
tags: Docker
---
## 1.组成
- 镜像
- 容器
- 仓库

<!-- more -->

---

## 2.命令
```
- 获取镜像 :
docker pull 仓库名:标记名(eg:docker pull ubuntu:12.04)

- 使用镜像创建容器 :
docker run -t -i ubuntu:14.04 /bin/bash

- 查看当前运行的容器(加上-a查看所有容器) :
docker container ls

- 停止NAMES容器 :
docker container stop NAMES

- 删除NAMES容器 :
docker container rm NAMES

- 查看容器信息 :
docker container ps

- 查看容器输出信息 :
docker container logs NAMES

- 进入容器 :
docker attach NAMES

- 查看镜像 :
docker image ls

- 删除NAMES镜像 :
docker image rm NAMES

- 查看镜像仓库 :
docker search centos
```

---

## 3.创建镜像
```
- mkdir sinatra
- cd sinatra
- vi Dockerfile
# This is a comment
FROM ubuntu:14.04
MAINTAINER Docker jkillers <980813351@qq.com>
RUN apt-get -qq update
RUN gem install sinatra

- docker build -t="playcrab/sinatra:v1" .
 -t标记来添加tag,指定新的镜像的用户信息
 "."是Dockerfile所在目录(当前目录)
 一个镜像不能超过127层
 ADD命令复制本地文件到镜像
 EXPOSE命令向外部开放端口
 CMD描述容器启动后运行的程序

ADD myApp /var/www
EXPOSE httpd port
CMD ["/usr/sbin/apachectl","-D","FOREGROUND"]

- docker run -t -i playcrab/sinatra:v1 /bin/bash
```

---

## 4.导入导出上传移除镜像
> 导入镜像

```
先下载一个镜像在本地
docker load --input ubuntu_14.04.tar
docker load < ubuntu_14.04.tar
```
> 导出镜像

```
docker save -o ubuntu_14.04.tar ubuntu:14.04
```
> 上传镜像

```
docker push playcrab/sinatra
```
> 移除镜像

```
docker rmi playcrab/sinatra
在删除镜像之前要先删除依赖于这个镜像的容器
```

---

## 5.docker run容器的创建
```
docker run -t -i ubuntu:14.04 /bin/bash
 -t让Docker分配一个伪终端并绑定到容器的标准输出上
 -i让容器的标准输入保持打开
 交互模式下,用户可以通过所创建的终端来输入命令

docker run -d ubuntu:14.04 /bin/sh -c "while true; do echo hello world; sleep 1; done" 
 -d让Docker容器在后台以守护态的形式运行
 - 返回一个唯一ID
```
---

## 6.DockerFile
> #### 基本结构

- 基础镜像信息
- 维护者信息
- 镜像操作指令
- 容器启动时执行指令

> #### 指令

```
FROM:
    第一条指令必须是FROM指令,如果在同一个DockerFile文件中创建多个镜像,可以使用多个FROM指令
MAINTAINER:
    指定维护者信息
RUN:
    每条RUN指令将在当前镜像基础上执行指定命令,并提交为新的镜像.命令较长时可以使用\换行
CMD:
    指定启动容器时执行的命令,每个DockerFile只能有一条CMD命令.如果指定了多条,只有最后一条被执行
EXPOSE:
    Docker主机分配一个端口转发到指定的端口
ENV:
    指定环境变量,会被后续RUN指令使用.并在容器运行时保持
ADD:
    复制指定的<src>到容器的<dest>
COPY:
    复制指定的<src>到容器的<dest>
ENTRYPOINT:
    指定启动容器后执行的命令,每个DockerFile只能有一条ENTRYPOINT命令.如果指定了多条,只有最后一条被执行
VOLUME:
    创建可以从本地主机或其他容器挂载的挂载点,一般用来存放数据库和需要保持的数据等
USER:
    指定运行容器时的用户名或UID,后续的RUN也会使用指定用户
WORKDIR:
    为后续的RUN,CMD,ENTRYPOINT指令配置工作目录.可以使用多个WORKDIR指令,后续命令如果参数是相对路径,则会基于之前命令指定的路径
ONBUILD:
    配置当所创建的镜像作为其它新创建镜像的基础镜像时,所执行的操作指令
```

> #### 底层实现

- 名字空间(NameSpaces)
- 控制组(ControlGroups)
- Union文件系统(UnionFileSystems)
- 容器格式(ContainerFormat)

