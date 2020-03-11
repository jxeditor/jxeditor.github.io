---
title: Ververica&Flink入门之六WindowTime
date: 2019-04-16 11:17:03
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Window示例
```
Keyed Windows
    stream
        .keyBy
        .window(必须: "assigner分配器")
        [.trigger](默认: "trigger触发器")
        [.evictor](默认没有: "evictor过滤")
        [.allowedLateness](默认为0: "最迟迟到时间")
        [.sideOutputLateData](默认没有: "迟到数据")
        .reduce/aggregate/fold/apply
        [getSideOutput]("获取迟到数据")
Non-Keyed Windows
    stream
        .windowAll
        [.trigger]
        [.evictor]
        [.allowedLateness]
        [.sideOutputLateData]
        .reduce/aggregate/fold/apply
        [getSideOutput]
```

---

# Window组件
```
Assigner
    负责将每条输入的数据分发到正确的window中
    一条数据可能同时分发到多个window中
    TumblingWindow,SlidingWindow,SessionWindow,GlobalWindow

Evictor
    主要用于做一些数据的自定义操作,可以在执行用户代码之前,也可以在执行用户代码之后
    通用Evictor:
        CountEvictor保留指定数量的元素
        DeltaEvictor通过执行用户给定的DeltaFunction以及预设的Threshold,判断是否删除一个元素
        TimeEvictor设定一个阈值interval,删除所有不在max_ts-interval范围内的元素,max_ts是窗口内时间戳的最大值
        
Trigger
    用来判断一个窗口是否需要被触发
    每个WindowAssigner都自带一个默认的Trigger
    如果默认的Trigger不能满足你的需求,则可以自定义一个类,继承自Trigger即可
    Trigger接口:
        onElement:每次往window增加一个元素的时候都会触发
        onEventTime:当Event-Time Timer被触发的时候会调用
        onProcessingTime:当Processing-Time Timer被触发的时候会调用
        onMerge:对两个Trigger的state进行merge操作
        clear:window销毁的时候被调用
    TriggerResult返回的选择:
        CONTINUE:不做任何事情
        FIRE:触发Window
        PURGE:清空整个Window的元素并销毁窗口
        FIRE_AND_PURGE:触发窗口,然后销毁窗口
```