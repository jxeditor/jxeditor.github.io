---
title: Ververica&Flink入门之八TableAPI
date: 2020-04-26 10:08:41
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Table API & SQL
```
声明式,用户只关心做什么,不用关心怎么做
高性能,支持查询优化,可以获取更好的执行性能
流批统一,相同的逻辑,既可以流模式运行,也可以批模式运行
标准稳定,语义遵循SQL标准,不易变动
易理解,语义明确,所见即所得
```

---

# Table使用
```
# 获取一个Table
    注册对应的TableSource
        通过TableDescription来注册
        自定义Source
        DataStream
    调用TableEnv的scan方法获取Table对象

# 输出一个Table
    TableDescription
    自定义TableSink
    DataStream
    
# 操作Table
    select,filter,where
    groupBy,flatAggrgate
    join
    addColumns添加列
    addOrReplaceColumns替换列
    dropColumns删除列
    renameColumns重命名列
    withColumns选择范围列
    withoutColumns反选范围列
```

---

# 易用性
```
# Map
UDF,继承ScalarFunction
table.map(udf())
table.select(udf1(),udf2(),udf3())

# FlatMap
UDTF,继承TableFunction
table.flatMap(udtf())
table.joinLateral(udtf())

# Aggregate
UDAF,继承AggregateFunction
table.aggregate(agg())
table.select(agg1(),agg2()...)

# FlatAggregate
UD(TA)F,继承TableAggregateFunction
table.groupBy('a')
    .flatAggregate(flatAggFunc('e,'f) as ('a,'b,'c))
    .select('a,'c)
新增Agg,能输出多行

# AggregateFunction & TableAggregateFunction
AggregateFunction适合做最大值
TableAggregateFunction可以做TopN
```