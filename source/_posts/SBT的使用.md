---
title: SBT的使用
date: 2019-08-19 14:54:51
categories: 编译
tags: sbt
---

# 项目开发环境
## IDEA+Scala+Sbt

> IDEA与Scala的安装不进行细说，主要记录下Sbt的安装过程

<!-- more -->

- 去官网下载Sbt.msi，我的是1.2.8，傻瓜式安装，安装目录路径不能有空格
- 安装成功后，进入安装目录的 conf/ 文件夹
- 编辑sbtconfig.txt
```
-Dsbt.global.base=安装目录/.sbt
-Dsbt.repository.config=安装目录/repositories
-Dsbt.boot.directory=安装目录/.sbt/boot
-Dsbt.ivy.home=安装目录/.ivy2
```
- 创建repositories文件
- 编辑repositories
```
[repositories]
local
maven-local: file:////D:/.m2/repository/
maven-repo1: http://nexus.dev.com/repository/maven-public/
```

- IDEA设置sbt的Launcher为Custom，不使用IDEA自带的sbt
- IDEA设置sbt的VM parameters,目录路径有空格则会报错
```
-Dsbt.global.base=安装目录/.sbt
-Dsbt.repository.config=安装目录/repositories
-Dsbt.boot.directory=安装目录/.sbt/boot
-Dsbt.ivy.home=安装目录/.ivy2
```

**注意** 因为第一次执行Sbt时是需要联网下载依赖的，如果本地仓库比较全面当然没有问题；
如果本地仓库没有，需要准备一台能联网的机器，repositories文件配置国内镜像，可以提高速度；
然后拷贝.ivy2和.sbt文件夹。

**镜像**
```
my-maven-repo01: https://maven.aliyun.com/repository/apache-snapshots
my-maven-repo02: https://maven.aliyun.com/repository/central
my-maven-repo03: https://maven.aliyun.com/repository/google
my-maven-repo04: https://maven.aliyun.com/repository/gradle-plugin
my-maven-repo05: https://maven.aliyun.com/repository/jcenter
my-maven-repo06: https://maven.aliyun.com/repository/spring
my-maven-repo07: https://maven.aliyun.com/repository/spring-plugin
my-maven-repo08: https://maven.aliyun.com/repository/public
my-maven-repo09: https://maven.aliyun.com/repository/releases
my-maven-repo10: https://maven.aliyun.com/repository/snapshots
my-maven-repo11: https://maven.aliyun.com/repository/grails-core
my-maven-repo12: https://maven.aliyun.com/repository/mapr-public
my-maven-repo13: https://repo.typesafe.com/typesafe/ivy-releases/
my-maven-repo14: https://repo.scala-sbt.org/scalasbt/sbt-plugin-releases/
my-maven-repo15: https://oss.sonatype.org/content/repositories/releases/
my-maven-repo16: https://oss.sonatype.org/content/repositories/snapshots/
```

## Sbt的基本使用
```
# 启动项目
sbt projectID/run

# 打包项目
sbt projectID/assembly
```

**注意** 使用IDEA的Run进行作业,需要先对项目进行编译,也就是先执行sbt projectID/run