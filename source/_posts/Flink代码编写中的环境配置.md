---
title: Flink代码编写中的环境配置
date: 2020-04-21 21:54:31
categories: 大数据
tags: flink
---

> 在使用Env时可以配置调优的参数

<!-- more -->

## OptimizerConfigOptions(优化配置)
### BATCH_STREAMING
```sh
# 聚合阶段策略
TABLE_OPTIMIZER_AGG_PHASE_STRATEGY 默认值AUTO
    AUTO: 聚合阶段没有特殊的执行器
    TWO_PHASE: 强制使用具有localAggregate和globalAggregate的两阶段聚合;如果聚合调用不支持将优化分为两个阶段，则我们仍将使用一个阶段的聚合
    ONE_PHASE: 强制使用只有CompleteGlobalAggregate的一个阶段聚合
    
# 重用sub-plans
TABLE_OPTIMIZER_REUSE_SUB_PLAN_ENABLED 默认值true
    如果为true,优化器将尝试找出重复的sub-plans并重用它们

# 重用源表
TABLE_OPTIMIZER_REUSE_SOURCE_ENABLED 默认值true
    如果为true,优化器将尝试找出重复的表源并重用它们,只有当TABLE_OPTIMIZER_REUSE_SUB_PLAN_ENABLED为true工作
    
# 谓词下推
TABLE_OPTIMIZER_SOURCE_PREDICATE_PUSHDOWN_ENABLED 默认值true
    如果为true,优化器将把谓词下推到FilterableTableSource中

# 联接排序
TABLE_OPTIMIZER_JOIN_REORDER_ENABLED 默认值false
    在优化器中启用联接重新排序
```

---

### BATCH
```sh
# 联接广播字节大小
TABLE_OPTIMIZER_BROADCAST_JOIN_THRESHOLD 默认值1048576L
    配置执行联接时将广播给所有工作节点的表的最大字节大小.通过将此值设置为-1来禁用广播
```

---

### STREAMING
```sh
# 拆分聚合
TABLE_OPTIMIZER_DISTINCT_AGG_SPLIT_ENABLED 默认值false
    告诉优化器是否将不同聚合(例如COUNT(distinct col),SUM(distinct col))拆分为两个级别.
    第一个聚合由一个额外的key进行洗牌,该key使用distinct_key的hashcode和bucket的数量进行计算.
    当不同的聚合中存在数据倾斜时,这种优化非常有用,并提供了扩展作业的能力

# 拆分聚合桶数
TABLE_OPTIMIZER_DISTINCT_AGG_SPLIT_BUCKET_NUM 默认值1024
    在拆分不同聚合时配置存储桶数
    该数字在第一级聚合中用于计算一个bucket key 'hash_code（distinct_key）%bucket_NUM'
    它在拆分后用作另一个组key
```

---

## ExecutionConfigOptions(执行配置)
### BATCH_STREAMING
```sh
# 最大异步查找JOIN数
TABLE_EXEC_ASYNC_LOOKUP_BUFFER_CAPACITY 默认值100
    异步查找联接可以触发的最大异步i/o操作数

# 异步操作超时时间
TABLE_EXEC_ASYNC_LOOKUP_TIMEOUT 默认值3 min
    异步操作完成的异步超时
```

---

### BATCH
```sh
# 排序后限制大小
TABLE_EXEC_SORT_DEFAULT_LIMIT 默认值-1
    当用户未在order by之后设置限制时的默认限制
    -1表示忽略此配置

# 外部合并排序的最大扇入
TABLE_EXEC_SORT_MAX_NUM_FILE_HANDLES 默认值128
    外部合并排序的最大扇入
    它限制每个操作员的文件句柄数
    如果太小,可能会导致中间合并
    但如果太大,会造成同时打开的文件太多,消耗内存,导致随机读取
    
# 合并已排序的溢出文件
TABLE_EXEC_SORT_ASYNC_MERGE_ENABLED 默认值true
    是否异步合并已排序的溢出文件
   
# 压缩溢出数据
TABLE_EXEC_SPILL_COMPRESSION_ENABLED 默认值true
    是否压缩溢出的数据
    目前我们只支持sort和hash agg以及hash join运算符的压缩溢出数据
    
# 压缩内存
TABLE_EXEC_SPILL_COMPRESSION_BLOCK_SIZE 默认值64 kb
    溢出数据时用于压缩的内存大小
    内存越大,压缩比越高,但作业将消耗更多的内存资源
    
# GroupWindow聚合元素限制
TABLE_EXEC_WINDOW_AGG_BUFFER_SIZE_LIMIT 默认值100000
    设置组窗口agg运算符中使用的窗口元素缓冲区大小限制

# 禁用运算符
TABLE_EXEC_DISABLED_OPERATORS 无默认值
    主要用于测试,运算符名称的逗号分隔列表,每个名称表示一种禁用的运算符
    可以禁用的运算符包括
        NestedLoopJoin
        ShuffleHashJoin
        BroadcastHashJoin
        SortMergeJoin
        HashAgg
        SortAgg
    默认情况下,不禁用任何运算符

# shuffle执行模式
TABLE_EXEC_SHUFFLE_MODE 默认值batch
    设置执行shuffle模式,只能设置batch或pipeline
    batch: 作业将逐步运行
    pipeline: 作业将以流模式运行,但当发送方持有资源等待向接收方发送数据时,接收方等待资源启动可能会导致资源死锁
```

---

### STREAMING
```sh
# Source空闲超时时间
TABLE_EXEC_SOURCE_IDLE_TIMEOUT 默认值-1 ms
    当一个源在超时时间内没有接收到任何元素时,它将被标记为临时空闲
    这允许下游任务在水印空闲时无需等待来自此源的水印就可以推进其水印
    
# 默认并行度
TABLE_EXEC_RESOURCE_DEFAULT_PARALLELISM 默认值-1
    为所有要与并行实例一起运行的运算符(如聚合,联接,筛选器)设置默认并行度
    此配置的优先级高于StreamExecutionEnvironment的并行性
    实际上,此配置会覆盖StreamExecutionEnvironment的并行性
    值-1表示未设置默认并行性,然后它将回退以使用StreamExecutionEnvironment的并行性
    
# 小批量优化
TABLE_EXEC_MINIBATCH_ENABLED 默认值false
    指定是否启用小批量优化
    MiniBatch是一种缓冲输入记录以减少状态访问的优化
    这在默认情况下是禁用的
    要启用此功能,用户应将此配置设置为true
    注意: 如果启用了小批量,则必须设置'table.exec.mini batch.allow latency'和'table.exec.mini batch.size'

# 最大延迟
TABLE_EXEC_MINIBATCH_ALLOW_LATENCY 默认值-1 ms
    最大延迟可用于小批量缓冲输入记录
    MiniBatch是一种缓冲输入记录以减少状态访问的优化
    当达到最大缓冲记录数时,将以允许的延迟间隔触发MiniBatch
    注意: 如果TABLE_EXEC_MINIBATCH_ENABLED设置为true,则其值必须大于零

# MiniBatch最大输入记录数
TABLE_EXEC_MINIBATCH_SIZE 默认值-1L
    可以为MiniBatch缓冲的最大输入记录数
    MiniBatch是一种缓冲输入记录以减少状态访问的优化
    当达到最大缓冲记录数时,将以允许的延迟间隔触发MiniBatch
    注意: MiniBatch当前仅适用于非窗口聚合,如果TABLE_EXEC_MINIBATCH_ENABLED设置为true,则其值必须为正
```

---

### 不被包括的配置
```sh
# 从Flink1.10开始,这被解释为一个权重提示,而不是绝对的内存需求
# 用户不需要更改这些经过仔细调整的权重提示

# 外部缓冲区大小
TABLE_EXEC_RESOURCE_EXTERNAL_BUFFER_MEMORY 默认值10 mb
    设置"排序合并联接","嵌套联接"和"OVER"窗口中使用的外部缓冲区内存大小
    注意: 内存大小只是一个权重提示,它会影响任务中单个操作员可以应用的内存权重
    实际使用的内存取决于运行环境

# 哈希聚合managed内存大小
TABLE_EXEC_RESOURCE_HASH_AGG_MEMORY 默认值128 mb
    设置哈希聚合运算符的managed内存大小
    注意: 内存大小只是一个权重提示,它会影响任务中单个操作员可以应用的内存权重
    实际使用的内存取决于运行环境

# 哈希联接managed内存大小
TABLE_EXEC_RESOURCE_HASH_JOIN_MEMORY 默认值128 mb
    设置哈希联接运算符的managed内存,它定义了下限
    注意: 内存大小只是一个权重提示,它会影响任务中单个操作员可以应用的内存权重
    实际使用的内存取决于运行环境

# 排序缓冲区大小
TABLE_EXEC_RESOURCE_SORT_MEMORY 默认值128 mb
    设置排序运算符的managed缓冲区内存大小
    注意: 内存大小只是一个权重提示,它会影响任务中单个操作员可以应用的内存权重
    实际使用的内存取决于运行环境
```

---

## 常用的配置
### RelNodeBlock
```sh
# 在构造公共子图时禁用union all节点作为断点
table.optimizer.union-all-as-breakpoint-disabled 默认false

# 当为true时,优化器将尝试通过摘要找出重复的子计划来构建优化块(又称公共子图),每个优化块都将独立优化
table.optimizer.reuse-optimize-block-with-digest-enabled 默认false
```

---

### WindowEmitStrategy
```sh
# WaterMark到达窗口结束前的发射策略(提前)
table.exec.emit.early-fire.enabled 默认false

# WaterMark到达窗口结束前的发射间隔时间
table.exec.emit.late-fire.delay

# WaterMark到达窗口结束后的发射策略(延迟)
table.exec.emit.late-fire.enabled 默认false

# WaterMark到达窗口结束后的发射间隔时间
table.exec.emit.late-fire.delay
```

---

## 使用
```scala
// BATCH
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inBatchMode().build()
val tEnv = TableEnvironment.create(settings)

// STREAMING
val env = StreamExecutionEnvironment.getExecutionEnvironment
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
val tEnv = StreamTableEnvironment.create(env, settings)

tEnv.getConfig.getConfiguration.setBoolean(OptimizerConfigOptions.TABLE_OPTIMIZER_JOIN_REORDER_ENABLED, true)
tEnv.getConfig.getConfiguration.setBoolean(OptimizerConfigOptions.TABLE_OPTIMIZER_REUSE_SOURCE_ENABLED, false)
tEnv.getConfig.getConfiguration.setLong(OptimizerConfigOptions.TABLE_OPTIMIZER_BROADCAST_JOIN_THRESHOLD, 10485760L)
tEnv.getConfig.getConfiguration.setInteger(ExecutionConfigOptions.TABLE_EXEC_RESOURCE_DEFAULT_PARALLELISM, 1)
tEnv.getConfig.getConfiguration.setInteger(ExecutionConfigOptions.TABLE_EXEC_SORT_DEFAULT_LIMIT, 200)
tEnv.getConfig.addConfiguration(GlobalConfiguration.loadConfiguration)
```