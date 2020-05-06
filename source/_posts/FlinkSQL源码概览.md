---
title: FlinkSQL源码概览
date: 2020-05-05 17:47:47
categories: 大数据
tags: flink
---

> 基于Flink的Demo,从代码层深入源码,逐层逐层剖析

<!-- more -->

## FlinkSQL引擎: Calcite
```
RelNode(可以看做对整体数据处理的一个语法树)
    Converter(RelNode之间转换)

RexNode(行表达式,对一行数据处理的语法树)

RelOptCluster(查询优化过程中相关关系表达式的环境)
    FlinkRelOptCluster
    
RelOptPlanner(查询优化器,根据给定的规则集和成本模型,将关系表达式转换为语义等价的关系表达式)
    AbstractRelOptPlanner
        HepPlanner
        VolcanoPlanner
            HiveVolcanoPlanner

RelOptCost(优化器成本模型会依赖)

RelOptRule(规则匹配使用)
    ConverterRule(规则之间的转换)

RelTrait(表示特性定义中关系表达式特性的表现形式)
    Convention(代表一个单一的数据源)
    RelMultipleTrait
        RelCollation
        RelDistribution

RelTraitDef
    ConventionTraitDef(代表数据源)
    RelCollationTraitDef(定义参与排序的字段)
    RelDistributionTraitDef(定义数据在物理存储上的分布方式)
```

---

## FlinkSQL解析阶段
```
Calcite使用JavaCC做SQL,JavaCC根据Parser.jj文件生成一系列java代码
生成的代码会将SQL转换为AST的数据结构(SqlNode,未经过验证)

调用SqlToOperationConverter的convert函数将SqlNode转换为Operator

    这期间SqlNode经过语法检查validate函数,生成经过验证的SqlNode
    调用SqlToOperationConverter的convertSqlQuery函数,将SqlNode转换为RelRoot
    RelRoot里面包含RelNode信息,RelNode可以看做是初始逻辑计划

进行Optimizer优化,查看源码可以知道,在执行writeToAppendSink时才进行优化操作
生成OptimizerPlan
    这个过程中包含规则的匹配:(从逻辑计划转换为物理计划)
        先基于Calcite Rules去优化
        后基于Flink定制Rules去优化
        optimizeConvertSubQueries
        optimizeExpandPlan
        decorrelateQuery
        optimizeNormalizeLogicalPlan
        optimizeLogicalPlan
        optimizeLogicalRewritePlan
        optimizePhysicalPlan
        
最后将OptimizerPlan转换为DataStream进行输出
RelNode->DataStreamNode->translateToPlan->DataStream

生成DataStream时会使用到CodeGen
e.g:
    node.translateToPlan之后调用DataStreamScan的translateToPlan函数
    DataStreamScan调用接口StreamScan的convertToInternalRow函数
    generateConversionProcessFunction
        generateFunction(生成Function)
    GeneratedFunction
```

---

## 结合Demo测试
```
# 打印出SQL的AST语法树,优化好的逻辑计划以及物理计划
tEnv.explain(result)
```