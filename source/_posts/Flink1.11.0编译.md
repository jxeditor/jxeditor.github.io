---
title: Flink1.11.0编译
date: 2020-06-01 17:05:12
categories: 大数据
tags: flink
---

> 等不及官网出包了,自己动手编译

<!-- more -->

## 依赖
[flink-release-1.11.0](https://github.com/apache/flink/archive/release-1.11.zip)
[flink-shade-1.11.0](https://archive.apache.org/dist/flink/flink-shaded-11.0/flink-shaded-11.0-src.tgz)

---

## Hadoop版本
```sh
hadoop version
Hadoop 3.0.0-cdh6.2.0
```

---

## 文件修改
```
# flink-shade
修改pom.xml文件增加仓库
<repositories>
    <repository>
        <id>cloudera</id>
        <url>https://repository.cloudera.com/artifactory/cloudera-repos/</url>
    </repository>
    <repository>
        <id>mvnrepository</id>
        <url>https://mvnrepository.com</url>
    </repository>
</repositories>

# flink-release
修改pom.xml文件增加仓库
<repositories>
    <repository>
        <id>cloudera</id>
        <url>https://repository.cloudera.com/artifactory/cloudera-repos/</url>
    </repository>
    <repository>
        <id>mvnrepository</id>
        <url>https://mvnrepository.com</url>
    </repository>
</repositories>

# 本地Maven的settings文件
注释<mirror>模块
```

---

## 编译
```sh
# flink-shade
mvn clean install -DskipTests -Dhadoop.version=3.0.0-cdh6.2.0

# flink-release
mvn clean install -DskipTests -Pvendor-repos -Dhadoop.version=3.0.0-cdh6.2.0 -Dmaven.javadoc.skip=true -Dcheckstyle.skip=true

# 注意可能会有报错
```

---

## 错误
```
问题1:
[ERROR] Failed to execute goal org.apache.rat:apache-rat-plugin:0.12:check (default) on project flink-parent: Too many files with unapproved license: 2 See RAT report in: F:\test\flink-release-1.11\target\rat.txt -> [Help 1]
解决:
mvn clean install -DskipTests -Pvendor-repos -Dhadoop.version=3.0.0-cdh6.2.0 -Dmaven.javadoc.skip=true -Dcheckstyle.skip=true -Drat.skip=true

问题2:
[ERROR] Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.6:npm (npm install) on project flink-runtime-web_2.11: Failed to run task: 'npm ci --cache-max=0 --no-save' failed. org.apache.commons.exec.ExecuteException: Process exited with an error: -4048 (Exit value: -4048) -> [Help 1]
解决:
先删除flink-runtime-web\web-dashboard下的node_modules文件夹
使用了淘宝源,删除它
npm install -g mirror-config-china --registry=https://registry.npm.taobao.org/
npm config get registry
npm config rm registry
npm info express
删除node_modules文件夹
cache clean --force
npm update
重新打包
```

---

## 部署
```
打包成功后,在flink-dist目录下会有部署文件
flink-dist/target/flink-1.11-SNAPSHOT-bin/flink-1.11-SNAPSHOT
```