---
title: Flink读取Hive表并行度过高
date: 2020-05-26 17:40:34
categories: 大数据
tags: flink
---

> 基于Flink-1.10.0,此版本只能在flink-conf.yaml中控制source并行度

<!-- more -->

## 出现情况
```
读取Hive表,存在大量小文件,这时Source端的并行度不受全局并行度影响
并行度等于文件数量导致并行度过高
```

---

## 解决方式
```
在flink-conf.yaml中配置以下参数
    table.exec.hive.infer-source-parallelism=true (默认使用自动推断)
    table.exec.hive.infer-source-parallelism.max=1000 (自动推断的最大并发) 

Sink的并行度默认和上游的并行度相同,如果有Shuffle,使用配置的统一并行度

静等flink-1.11发布
```