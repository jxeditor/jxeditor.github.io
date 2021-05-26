---
title: Mac通过Brew安装组件出现环境问题
date: 2021-05-26 16:09:32
categories: 教程
tags: learn
---

> Brew使用过程中的问题,自己修改下Ruby脚本就好

<!-- more -->

## 问题描述
```
Java环境的问题,因为Mac中使用了Brew安装了openjdk版本的Java
又安装了Oracle版本的Java,最终导致Java版本依赖错误
#
# A fatal error has been detected by the Java Runtime Environment:
#
#  Internal Error (sharedRuntime.cpp:531), pid=20268, tid=7171
#  Error: ShouldNotReachHere()
#
# JRE version: OpenJDK Runtime Environment (16.0+14) (build 16+14)
# Java VM: OpenJDK 64-Bit Server VM (16+14, mixed mode, tiered, compressed oops, g1 gc, bsd-aarch64)
# No core dump will be written. Core dumps have been disabled. To enable core dumping, try "ulimit -c unlimited" before starting Java again
#
# An error report file with more information is saved as:
# /opt/homebrew/Cellar/kafka/2.7.0/bin/hs_err_pid20268.log
#
# If you would like to submit a bug report, please visit:
#   https://bugreport.java.com/bugreport/crash.jsp
#
```

---

## 解决方案
```sh
# 以kafka为例
brew edit kafka

# depends_on "openjdk"
# 替换成Oracle版本Java
bin.env_script_all_files(libexec/"bin", Hash["JAVA_HOME" => "/Library/Java/JavaVirtualMachines/jdk1.8.0_281.jdk/Contents/Home"])

brew uninstall kafka
brew install kafka
```

---

## 注意
```
这里可以尝试学习下Ruby.^-^
没有太搞懂Language::Java.java_home_env是调用了哪里
百度也没有找到相关资料
```