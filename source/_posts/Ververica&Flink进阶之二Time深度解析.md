---
title: Ververica&Flink进阶之二Time深度解析
date: 2019-05-23 17:40:50
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 时间语义
```
当你的应用遇到某些问题要从上一个checkpoint或者savepoint进行重放,是不是希望结果完全相同
如果希望结果完全相同,就只能用Event Time
如果接受结果不同,则可以用Processing Time

Processing Time
    对于Processing Time,因为我们是使用的是本地节点的时间(假设这个节点的时钟同步没有问题)
    我们每一次取到的Processing Time肯定都是递增的
    递增就代表着有序,所以说我们相当于拿到的是一个有序的数据流

Event Time
    而用Event Time的时候因为时间是绑定在每一条的记录上的
    由于网络延迟,程序内部逻辑,或者其他一些分布式系统的原因
    数据的时间可能会存在一定程度的乱序
    在Event Time场景下,我们把每一个记录所包含的时间称作Record Timestamp
    如果Record Timestamp所得到的时间序列存在乱序
    我们就需要去处理这种情况
```

---

# WaterMark生成
```
一个watermark本质上就代表了这个watermark所包含的timestamp数值
表示以后到来的数据已经再也没有小于或等于这个时间的了

# WaterMark生成
SourceFunction生成
    collectWithTimestamp,发送一条数据
        第一个参数就是我们要发送的数据
        第二个参数就是这个数据对应的时间戳
    emitWaterMark去产生一条watermark
        表示接下来不会再有时间戳小于等于这个数值记录
DataStreamAPI指定
    DataStream.assignTimestampsAndWatermarks能接收不同的timestamp和watermark生成器
    
生成器可以分为两类,定期生成器,特殊记录生成器
两者的区别主要有三个方面
    首先定期生成是现实时间驱动的,这里的"定期生成"主要是指watermark(因为timestamp是每一条数据都需要有的)
    即定期会调用生成逻辑去产生一个watermark
    而根据特殊记录生成是数据驱动的,即是否生成watermark不是由现实时间来决定
    而是当看到一些特殊的记录就表示接下来可能不会有符合条件的数据再发过来了
    这个时候相当于每一次分配Timestamp之后都会调用用户实现的watermark生成方法
    用户需要在生成方法中去实现watermark的生成逻辑
```

---

# WaterMark传播
```
广播
Long.MAX_VALUE
单输入取其大,多输入取其小(最小化其最大值)

局限
没有区分逻辑上的单流和多流,强制同步时钟
```

---

# ProcessFunction
```
获取记录的Timestamp或当前的ProcessTime
获取算子时间(WaterMark)
注册Timer并提供回调逻辑
    registerEventTimeTimer()
    registerProcessingTimeTimer()
    onTimer()
```

---

# WaterMark处理
```
更新算子时间
便利计时器队列触发回调
将WaterMark发送至下游
```

---

# Table指定时间列
```
Processing Time
    DataStream
        tEnv.fromDataStream(stream,"f1,f2,f3.proctime")
    TableSource
        TableSource实现DefinedProctimeAttributes接口

Event Time
    DataStream(原始DS必须有Timestamp及WaterMark)
        tEnv.fromDataStream(stream,"f1,f2,f3.rowtime")
        tEnv.fromDataStream(stream,"f1,f2.rowtime,f3")
    TableSource(数据中存在类型为long或timestamp的时间字段)
        TableSource实现DefinedProctimeAttributes接口
```

---

# 时间列和Table操作
```
Over窗口聚合
Group By窗口聚合
时间窗口连接
排序
```