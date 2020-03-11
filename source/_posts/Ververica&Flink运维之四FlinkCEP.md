---
title: Ververica&Flink运维之四FlinkCEP
date: 2019-08-31 14:23:41
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# [传送门](https://files.alicdn.com/tpsservice/94d409d9679d1b46034f7d00161d99a7.pdf)

---

# 什么是CEP
```
CEP:复杂事件处理
异常行为检测 -> 运维维修 -> 无翻台 -> 运维报障
策略营销 -> 规划行程 -> 下单 -> 未被接单
运维监控 -> 流量抖动 -> 等待5min -> 流量抖动
```

---

# 使用场景
```
风控检测
    对用户异常行为模式,数据异常流向实时检测
策略营销
    向特定行为的用户进行实时的精准营销
运维监控
    监控设备运行参数,灵活配置多指标的发生规则
```

---

# 如何使用CEP
```
流程
    定义事件模式
    匹配结果处理

构成
    Pattern
        next/notNext
        followedBy/noFollowedBy
        followedByAny
            Pattern
                next/notNext
                followedBy/noFollowedBy
                followedByAny
                    Pattern
```