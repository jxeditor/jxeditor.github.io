---
title: SparkSQL源码概览
date: 2020-05-06 09:47:45
categories: 大数据
tags: spark
---

> SparkSQL内核剖析读后总结

<!-- more -->

## SparkSQL引擎:Catalyst
```
InternalRow(数据行)
TreeNode(执行树)
AbstractDataType(类型)
```

---

## 编译器
```
ANTLR4文法解析,通过调用SQLBase.g4文件对SQL进行解析
生成AST语法树

涉及到的类
ParserInterface
    AbstractSqlParser->AstBuilder->SqlBaseBaseVisitor
        CatalystSqlParser
        SparkSqlParser->SparkSqlAstBuilder
        
整体语法树生成使用访问者模式
SQL各种语法对应以Context结尾
SingleStatementContext
    QuerySpecificationContext
        NamedExpressionSeqContext(列名)
        FromClauseContext(表名)
        BooleanDefaultContext(where条件)
        AggregationContext(groupby分组)
    QueryOrganizationContext
        SortItemContext(排序)
```

---

## 逻辑计划/物理计划
```
都继承QueryPlan父类
    输入输出
    基本属性
    字符串
    规范化
    表达式操作
    约束

LogicalPlan
    UnresolvedLogicalPlan(未解析的逻辑计划)
    AnalyzedLogicalPlan(解析的逻辑计划)
    OptimizerLogicalPlan(优化的逻辑计划)
        LeafNode(关系,内存/Hive/RDD)
        UnaryNode(排序/重分区/数据转换/过滤等)
        BinaryNode(连接/集合/CoGroup)

Analyzed和Optimizer都是去获取对应的规则
    进行生成/解析与优化
    
经过QueryPlanner实现逻辑计划到物理计划的转变
    SparkStreategies
        SparkPlanner

PhysicalPlan
    LeafExecNode
    UnaryExecNode
    BinaryExecNode
```