---
title: 将SBT的依赖转换为Maven目录结构的依赖
date: 2019-12-06 08:38:44
categories: 编译
tags:
    - maven
    - sbt
---

> 如果不联网的话,需要写程序对ivy仓库目录进行刷新

<!-- more -->

## 实现过程
```
# 主要是使用了mvn命令,ivy仓库中的original结尾文件与maven仓库中pom文件内容一致
# 遍历ivy仓库中以original结尾的文件,执行命令
mvn -f 文件.original dependency:list

# windows系统下需要加dependency参数
# Linux系统下不需要
```

---

## 扩展
```
dependency:tree # 显示依赖树
dependency:list # 显示依赖
dependency:copy-dependencies # 赋值依赖jar到目标文件 一般与-DoutputDirectory=/libs一起使用
dependency:resolve 打印出已解决依赖的列表 


```