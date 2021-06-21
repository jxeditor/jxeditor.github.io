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
    WithQuery: 一个With语句
    
MetaData API
    提供对元数据操作的接口
    不同的Connector对其元数据操作抽象成了统一的接口ConnectorMetadata

词法与语法分析
    利用ANTLR4编写SQL语法,语义规则定在presto-parser的SqlBase.g4文件(IDEA可以利用ANTLR插件查看语法图)
    SQLQueryManager.createQuery()
    SQLParser.createStatement().invokeParser()
    SqlBaseLexer和SqlBaseParser
        通过ANTLR4编译SqlBase.g4生成的的类
    CaseInsensitiveStream
        使SQL语句大小写不敏感
    parser.addParserListener(new PostProcessor())
        解析时异常处理
            exitUnquotedIdentifier
                未用引号括起来的标识符有@或:等符号则抛出异常
            exitBackQuotedIdentifier
                如果标识符用反引号括起来则抛出异常
            exitDigitIdentifier
                如果标识符是以数字开头则抛出异常
            exitQuotedIdentifier
                对于双引号引起来的标识符,去除双引号
            exitNonReserved
                将非保留关键字替换成标识符
    lexer和parser的removeErrorListeners和addErrorListener
        重写错误发生时的处理
    parser.getInterpreter().setPredictionMode(PredictionMode.SLL)
    tree=parseFunction.apply(parser)
        首先使用SLL模式进行语法预策,不保证对语法错误SQL的正确处理
    parser.getInterpreter().setPredictionMode(PredictionMode.LL)
    tree=parseFunction.apply(parser)
        抛出异常时使用LL模式进行语法预策,确保SQL解析结果是正确的
    AstBuilder
        语法分析(访问者设计模式)
    visit(context.statement())
        根据SQL类型调用对应的visit*方法

获取QueryExecution
    QueryExecutionFactory
        DataDefinitionExecutionFactory(DDL操作)
            CreateTable
            RenameTable
            RenameColumn
            DropTable
            CreateView
            DropView
            SetSession
            ResetSession
        SQLQueryExecutionFactory(非DDL操作)
            Query
            Explain
            ShowColumns
            ShowPartitions
            ShowFunctions
            ShowTables
            ShowSchemas
            ShowCatalogs
            Use
            ShowSession
            CreateTableAsSelect
            Insert
            Delete
    QueryExecution
        DataDefinitionExecution
        SqlQueryExecution
    SqlQueryQueueManager.submit
        将QueryExecution与配置的查询队列规则进行匹配
        匹配成功且队列未满,则加入
        查询队列按FIFO规则调度查询
    start()
        DataDefinitionExecution
            调用绑定的DataDefinitionTask的execute方法
        SqlQueryExecution
            analyzeQuery() 生成查询执行计划
            doAnalyzeQuery()
            analyzer.analyze(statement) SQL语义分析
            logicalPlanner.plan(analysis) 语义分析结构生成查询执行计划

语义分析
    Analyzer(同样的访问者设计模式)
        构造StatementAnalyzer对Statement进行分析
        分析结构存入Analysis中并返回
    StatementAnalyzer
        针对不同的Statement实现类进行语义分析
    TupleDescriptor
        列描述符,包含一系列的Field,一个Field表示对一个字段的描述
        每个Field包含字段名name,字段别名relationAlias,字段类型type,字段是否隐藏hidden
        Select/Show语句,返回取到的每一列,Insert/Delete/CreateTableAs语句返回只有列,表示操作行数
    TupleAnalyzer
        对Query中的Relation进行分析
        Unnest: 将Array和Map展开
        Table: 对Table进行分析,是否With,是否View,是否Table存在,构造TupleDescriptor
        AliasedRelation: 带别名的Relation
        SampledRelation: 对表进行抽样
        TableSubquery: 子查询操作
        QuerySpecification: 
            分析From子语句
            分析Where子语句
            分析Select子语句
            分析GroupBy子语句
            分析OrderBy子语句
            分析Having子语句
            分析聚合操作
            分析窗口函数
            获取输出的列描述符
        Union: 合并操作
        Intersect: 暂不支持
        Except: 暂不支持
        Join: 连接操作
        Values: 获取元素类型,最终返回列描述符
    ExpressionAnalyzer
        表达式进行分析

执行计划生成
    LogicalPlanner
        针对上述的SQL语句分析结果,生成逻辑执行计划
    执行计划节点
        AggregationNode: 聚合操作
        DeleteNode: DELETE操作
        DistinctLimitNode: 处理去重限制行操作
        ExchangeNode: 不同Stage之间交换数据的节点
        FilterNode: 过滤操作
        IndexJoinNode: Index Join操作
        IndexSourceNode: 与IndexJoin配和使用执行数据源读取操作
        JoinNode: Join操作
        LimitNode: Limit操作
        MarkDistinctNode: 聚合内去重操作
        OutputNode: 输出最终结果
        ProjectNode: 列映射操作
        RemoteSourceNode: 分布式执行计划中不同Stage之间交换数据
        RowNumberNode: 窗口函数row_number
        SampleNode: 抽样函数
        SemiJoinNode: 处理执行计划生成过程中的SemiJoin
        SortNode: 排序
        TableCommitNode: 对CreateTableAs/Insert/Delete操作进行commit
        TableScanNode: 读取表数据
        TableWriterNode: 向目的表写入数据
        TopNNode:采用高效TopN算法(orderby limit)
        TopNRowNumberNode: row_number后取前N条数据
        UnionNode: 合并
        UnnestNode: Unnest操作
        ValuesNode: 处理Values语句
        WindowNode: 窗口函数
    RelationPlanner
        处理Relation类型的SQL语句生成的执行计划
    QueryPlanner
        Query
        QuerySpecification

执行计划优化
    ImplementSampleAsFilter
        将BERNOULLI抽样的SampleNode改写为FilterNode
    CanonicalizeExpressions
        将表达式进行标准化
    SimplifyExpressions
        将表达式进行简化和优化处理
    UnaliasSymbolReferences
        去除ProjectNode中无意义映射
    PruneRedundantProjections
        去除多余的ProjectNode
    SetFlatteningOptimizer
        合并能合并的UnionNode
    LimitPushDown
        将Limit条件进行下推
    PredicatePushDown
        将过滤条件进行下推
    MergeProjections
        将连续的ProjectNode进行合并
    ProjectionPushDown
        将UnionNode之上的ProjectNode下推到UnionNode之下
    IndexJoinOptimizer
        将Join优化成IndexJoin
    CountConstantOptimizer
        将count(constant)改写为count(*),Presto中,count(constant)和count(*)等效,count(*)取表行数更容易根据不同数据源进行优化
    WindowFilterPushDown
        处理row_number排序取N条结果
    HashGenerationOptimizer
        提前对Hash值进行计算
    PruneUnreferencedOutputs
        去除ProjectNode中不在最终输出的列
    MetadataQueryOptimizer
        分区字段进行聚合操作,改为表元数据的查询
    SingleDistinctOptimizer
        将单一的Distinct聚合优化为GroupBy
    BeginTableWrite
        根据SQL语句类型构造CreateHandle/InsertHandle,用于TableWriterNode后续操作
    AddExchanges
        生成分布式执行计划
    PickLayout
        选取最适合的TableLayout(表的组织结构)
    
执行计划分段
    Source: 读取数据
    Fixed: 分散到多个节点处理
    Single: 汇总所有处理结果
    Coordinator_only: 对Insert和CreateTable进行commit
```

### 查询调度
```
生成调度执行器
    SqlQueryExecution.analyzeQuery方法生成subPlan
    根据subPlan,SqlQueryExecution.planDistribution调用DistributedExecutionPlanner.plan获得Stage执行计划:StageExecutionPlan
        StageExecutionPlan维护了子Stage执行计划集合
        最上层为outputStage,用于最终结果输出
    outputStage及其他参数共同组成SqlStageExecution所需的成员变量
    SqlStageExecution本身的构造方法中,通过递归的方式构造子Stage对象

查询调度过程
    NodeScheduler: 分配Task给Node
        NodeManager: 获取存活的节点列表
            com.facebook.presto.server.CoordinatorModule进行注册和绑定
            InternalNodeManager: 新增获取所有节点列表,刷新节点信息
        NodeMap: 存储Presto的节点信息
            NodeManager.getActiveDatasourceNodes获取
        NodeSchedulerConfig: 配置了调度的相关参数
        NodeSelector: 提供各个Stage中Task分配节点的算法
            SingleStage节点选择策略:随机从存活节点列表中选择一个
            FixedStage节点选择策略:
                在所有存活节点列表中获取参数query.initial-hash-partitions值指定的节点个数(候选节点Candidates)
                总活跃节点小于指定节点个数,获选节点与总活跃节点数一致
                根据是否允许计算节点可分配多个Task任务(node-scheduler.multiple-tasks-per-node-enabled),允许则从获选节点中再次选取,直到达到指定值,否则只能是活跃节点数
            SourceStage节点选择策略
                选择节点个数根据Table的Split数决定
                SqlStageExecution.scheduleSourcePartitionedNodes获取SourceSplit
                计算出当前阶段每个节点的排队Split个数
                判断是否本地性调度策略(node-scheduler.location-aware-scheduling-enabled)
                是,根据本地性进行节点选择,否则随机选取
                开不开本地,都将先选出一批候选节点(node-scheduler.min-candidates决定个数)
    NodeTaskMap: 保存当前Stage分配的Task和Node的映射列表
        并且对每个Task注册状态监听器,确保Task完成后移除
    RemoteTaskFactory: 生成RemoteTask的工厂类
    StageStateMachine: Stage状态监听器       
```

### 查询执行
```
提交查询阶段
    提交查询
    生成查询执行计划
    查询调度
    查询执行

查询执行逻辑
    SqlQueryExecution(Query)
    SqlStageExecution(Stage)
    SqlTaskExecution(Task)

Task调度
    SourceTask调度(assignSplits)
        根据Split的本地性,生成Node与Split的对应关系
        根据对应关系,在指定的Node上启动SourceTask处理Splits
    FixedTask调度(scheduleFixedNodeCount)
        将Join操作两边数据集分解成initial-hash-partitions个数的数据子集
        将Hash值相同的行分布相同的Worker上进行Join计算
    SingleTask调度(scheduleFixedNodeCount)
        将上游Stage所有输出汇集到一个Worker节点进行汇总计算
        与FixedTask调度逻辑一致,只是Task只有一个
    Coordinator_OnlyTask调度
        执行DDL/DML/CreateTableAsSelect,运行Task在Coordinator上
        只有一个Task,和SingleTask的区别,SingleTask选取随机节点,Coordinator_OnlyTask选取Coordinator节点

Task执行
    创建Task
        scheduleTask,HttpRemoteTask->start()->HttpClient--发送RESTful请求-->TaskResource-->SQLTaskExecution
    更新Task
        SqlStageExecution.assignSplits() 根据TaskId查找对应的addSplits方法
        SqlTaskManager.updateTask() RESTful服务更新Task请求
     运行Task
         TaskExecutor
             启动多个线程,并加入线程池,每个Split处理都由Runner类完成
         PrioritizedSplitRunner
             调用时间片处理Split
         DriverSplitRunner
             接收运行时间段限制
         Driver
             封装了对Split的所有操作
```

### 队列
```
配置
    $PRESTO_HOME/etc/queues.json
    query.queue-config-file=etc/queues.json

队列定义
   queues
       queuename: 队列名称
       maxConcurrent: 队列最大并发数量
       maxQueued: 队列同时接收提交查询请求的最大数量
   rules
       user: 用户名
       source: SQL来源
       session: session参数定义
       queues: 队列列表,可多个

队列加载
    com.facebook.presto.execution.QueryQueueManager
    com.facebook.presto.execution.SqlQueryQueueManager
    在CoordinatorModule中绑定
    未配置队列,系统自动构建global和big队列
        big: 最大并发度10,最大排队并发度500
        global: 最大并发度1000,最大排队并发度5000
    QueryQueueRule: 规则信息组装

队列匹配
    SqlQueryQueueManager.submit() 获取查询请求的session,匹配规则信息,满足则返回队列
    getOrCreateQueues() 获取或创建QueryQueue对象列表
    QueryQueue 负责异步提交查询并维护该队列的容量值
```