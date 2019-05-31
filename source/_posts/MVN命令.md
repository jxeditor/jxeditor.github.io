---
title: MVN命令
date: 2019-05-31 18:45:52
categories: 命令
tags: mvn
---
## 1.安装包
```
# 能够下载到jar包的情况
1. 首先下载Maven无法加载的jar包
2. 执行mvn命令
mvn install:install-file
-DgroupId=com.oracle    # groupId
-DartifactId=ojdbc14 #artifactId
-Dversion=10.2.0.4.0    # 版本号
-Dpackaging=jar # 打包方式
-Dfile=已下载的jar位置

# 只能下载到工程文件的情况
1. 首先下载源代码
2. 进入工程目录<与src同级目录>
3. 执行mvn命令
mvn install -Dmaven.test.skip=true
```

<!-- more -->

---

## 2.项目打包
```
mvn clear package
```
