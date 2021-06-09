---
title: Presto笔录
date: 2021-06-09 14:31:16
categories: 大数据
tags: presto
---

> Presto技术内幕学习笔记

<!-- more -->

## 概述
### 特点
```
多数据源
支持SQL
扩展性
混合计算
高性能
流水线
```
### 基本概念
```
# 服务进程
1.Coordinator(所有工作通过StatementResource类提供)
    接收查询请求
    解析查询语句
    生成查询执行计划
    任务调度
    Worker管理

2.Worker
    数据处理
    Task的执行

# Presto模型
1.Connector
    Presto通过多样的Connector访问不同的数据源
    每种Connector都实现了Presto中标准的SPI接口
2.Catalog
    Catalog类似于MySQL中的数据库实例,Schema类似于DataBase
    属于比较常见的元数据管理类
3.Schema
    一个Catalog和一个Schema确定了表的集合
4.Table
    与传统数据库中的Table含义一致

# Presto查询执行模型
1.Statement
    指我们输入的SQL语句,支持符合ANSI标准的SQL语句
    为啥要和Query区分开来?
        Statement是用户输入的SQL语句,Presto执行输入的SQL语句时
        会根据SQL语句生成查询执行计划,进而生成可以执行的Query
        Query才是分布到所有Worker之间执行的实际查询操作
2.Query
    查询执行,一个查询执行可以在Presto集群中运行的查询
    由运行在各个Worker上且各自关联的Stage组成的
    一个查询由Stage,Task,Driver,Split,Operator和DataSource组成
3.Stage
    查询执行阶段,一个Stage代表Query的一部分,不会在Presto集群中实际运行
    Stage种类
        Coordinator_Only: 执行DDL/DML语句中最终的表结构创建或更改
        Single: 聚合子Stage的输出数据,并将最终数据输出给终端用户
        Fixed: 接受其子Stage产生的数据并在集群中对这些数据进行分布式聚合或分组计算
        Source: 这种类型的Stage用于直接连接数据源,从数据源读取数据
4.Exchange
    Presto的Stage通过Exchange来连接另一个Stage
    用于完成上下游Stage之间的数据交换
    Exchange种类
        OutputBuffer: 流向下游
        ExchangeClient: 读取上游
    注意,如果是Source类型的Stage,是直接通过SourceOperator来获取数据
5.Task
    Stage被分解为多个Task,每个Task处理一个或多个Split
6.Driver
    一个Task包含一个或多个Driver,一个Driver只处理一个Split,并生成相应的输出
    输出由Task收集并传给下游Stage的一个Task
7.Operator
    对一个Split的一种操作,过滤,加权,转换等
    Operator以Page为最小处理单位读取/产生数据
8.Split
    大数据集的一个小集
9.Page
    Presto处理中的最小数据单元
    一个Page对象包含多个Block对象
    多个Block横切的一行,是一行真实数据
```
### 整体架构
```
执行查询步骤
    1.客户端通过Http协议发送查询语句给Coordinator
    2.Coordinator接到SQL,对其进行解析
        生成查询计划,并根据查询计划依次生成
            SqlQueryExecution
            SqlStageExecution
            HttpRemoteTask
        Coordinator根据数据本地性生成对应的HttpRemoteTask
    3.Coordinator将Task分发到其需要处理的数据所在Worker上进行执行
        此过程中,HttpRemoteTask中HttpClient将创建/更新Task的请求发送给数据所在节点上TaskResource提供的RestFul接口
        接收到请求后在对应的Worker上启动SqlTaskExecution对象或更新对应的SqlTaskExecution对象需要处理的Split
    4.执行处于上游的SourceStage的Task,通过Connector从相应的数据源读取数据
    5.下游Stage的Task会读取上游输出结果,并在所在Worker的内存中进行后续计算
    6.Coordinator从分发Task之后,会持续从SingleStage中的Task获取计算结果
        缓存到Buffer中,直到计算结束
    7.Client从提交查询语句之后,会不停的从Coordinator中获取本次查询的计算结果
        每产生一部分,就会显示一部分结果
```

---

## 源码结构说明
```
presto-base-jdbc: 提供访问各种RDBMS数据源数据的途径
presto-cassandra: 提供对Cassandra中数据的查询和分析
presto-cli: 通过命令行访问Presto集群的途径
presto-client: 提供提交查询时使用的客户端,Session参数等
presto-docs: Presto的相关文档
presto-example-http: 读取通过Http发送以逗号分隔的数据
presto-hive: 读取Hive数据的连接器
presto-hive-*: 读取不同版本的hive数据
presto-jdbc: 提供presto jdbc驱动,Java程序通过该JDBC驱动访问Presto集群,进行数据查询计算
presto-kafka: 访问Kafka数据的连接器
presto-server: 说明子工程的依赖关系
presto-ml: 机器学习计算
presto-mysql: 访问MySQL的连接器
presto-orc: ORC文件读取的优化
presto-parser: 提供SQL语句的文法和语法分析
presto-postgresql: 提供访问PostgreSQL的连接器
presto-raptor: 提供访问每台节点操作系统中数据的连接器
presto-main: Presto集群各节点Presto服务启动所需要的jar包
presto-spi: 面向模块工程
presto-tests: Presto测试类
```

---

## RESTful框架
### Statement服务接口
```
处理与SQL语句相关的请求
    接受提交的SQL语句createQuery()
    获取查询执行结果getQueryResults()
    取消查询cancelQuery()
实现类
    StatementResource
```
### Query服务接口
```
处理查询执行请求
    SQL语句的提交createQuery()
    获取查询执行的结果getQueryInfo()
    取消查询cancelQuery()
实现类
    QueryResource
```
### Stage服务接口
```
处理Stage相关的请求
    取消或结束一个指定的Stage,cancelStage()
实现类
    StageResource
```
### Task服务接口
```
处理Task相关的请求
    Task创建,更新createOrUpdateTask()
    状态查询getTaskInfo()
    结果查询getResults()
实现类
    TaskResource
```

---

## 源码解析
### 提交查询
```
Presto客户端启动类com.facebook.presto.cli.Presto
没有使用--help等参数,则运行console.run()
根据是否指定execute或file参数,有两种处理方式
    直接提交SQL
    启动Cli终端解析用户输入,提交SQL
com.facebook.presto.Console中的executeCommand()方法对输入SQL解析并执行
    初始执行com.facebook.presto.cli.QueryRunner.startQuery()
    后续循环发送请求从而分批获取查询结果com.facebook.presto.cli.Query.renderOutput()
怎么循环获取查询结果
    com.facebook.presto.cli.Query.renderQueryOutput()
    com.facebook.presto.cli.Query.printInitialStatusUpdates()
    com.facebook.presto.cli.Query.waitForData()
    最终调用StatementClient的advance方法,向Coordinator发起nextResultUri的请求
```
### 生成查询执行计划
```
# 基础概念
Node
    Approximate: 近似查询
    ExplainOption: Explain语句的可选参数
        ExplainFormat: Explain语句输出结果的格式
        ExplainType: Explain语句的类型
            LOGICAL: 逻辑执行计划
            DISTRIBUTED: 分布式执行计划
    Expression: SQL语句中的表达式
    FrameBound: 窗口函数中滑动窗口的可选参数
    Relation: 多个节点间的关系
        Join
        Union
        ......
    Select: 查询语句Select部分
    SelectItem: Select语句中的列类型
        AllColumns: 选取所有列
        SingleColumn: 单一列
    SortItem: 排序的某一列及其类型
    Statement: Presto能使用的所有类型的SQL语句
        CreateTable
        CreateView
        Insert
        ......
    TableElement: 建表语句中描述表的每一列,列名与类型
    Window: 窗口函数
    WindowFrame: 窗口函数中滑动窗口的可选参数
    With: 一个查询中所有的With语句

MetaData API

StatementResource.createQuery()
SQLQueryManager.createQuery()


```
