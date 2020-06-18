---
title: Flink源码解析之一StreamGraph生成
date: 2020-05-09 16:05:08
categories: 大数据
tags: flink
---

> 在之前的文章中介绍过FlinkSQL底层是怎么实现的，以及Flink的一些概念性知识。一直想整理Flink执行层面的源码，但是因为过于庞大，不知道如何下手，只能一步一步来。

<!-- more -->

## 结构
```
StreamGraph
    JobGraph
        ExecutionGraph
            物理执行图

Executor
    ExecutorBase
        BatchExecutor
        StreamExecutor
    StreamExecutor

Planner
    PlannerBase
        BatchPlanner
        StreamPlanner
    StreamPlan
```

---

## 任务的创建流程
### 入口实例
```scala
// 这里我们还是以FlinkSQL举例
val env = StreamExecutionEnvironment.getExecutionEnvironment
val settings = EnvironmentSettings.newInstance().useBlinkPlanner().inStreamingMode().build
val tEnv = StreamTableEnvironment.create(env, settings)

......

// 生成JobExecutionResult
tEnv.execute("job name")
```
### 结构流程
```scala
TableEnvironment接口
StreamTableEnvironment接口
StreamTableEnvironmentImpl类
StreamTableEnvironmentImpl又继承自TableEnvironmentImpl类

// 可以看到StreamTableEnvironment实例真正创建是在StreamTableEnvironmentImpl中实现
def create(executionEnvironment: StreamExecutionEnvironment): StreamTableEnvironment = {
    create(
      executionEnvironment,
      EnvironmentSettings.newInstance().build())
}
def create(
      executionEnvironment: StreamExecutionEnvironment,
      settings: EnvironmentSettings)
    : StreamTableEnvironment = {
    StreamTableEnvironmentImpl.create(executionEnvironment, settings, new TableConfig)
}

// StreamTableEnvironmentImpl
def create(
      executionEnvironment: StreamExecutionEnvironment,
      settings: EnvironmentSettings,
      tableConfig: TableConfig)
    : StreamTableEnvironmentImpl = {

    if (!settings.isStreamingMode) {
      throw new TableException(
        "StreamTableEnvironment can not run in batch mode for now, please use TableEnvironment.")
    }

    // temporary solution until FLINK-15635 is fixed
    val classLoader = Thread.currentThread.getContextClassLoader

    // Module管理器
    val moduleManager = new ModuleManager

    // Catalog管理器
    val catalogManager = CatalogManager.newBuilder
      .classLoader(classLoader)
      .config(tableConfig.getConfiguration)
      .defaultCatalog(
        settings.getBuiltInCatalogName,
        new GenericInMemoryCatalog(
          settings.getBuiltInCatalogName,
          settings.getBuiltInDatabaseName))
      .executionConfig(executionEnvironment.getConfig)
      .build

    // 内置函数
    val functionCatalog = new FunctionCatalog(tableConfig, catalogManager, moduleManager)

    // Executor配置
    val executorProperties = settings.toExecutorProperties
    val executor = lookupExecutor(executorProperties, executionEnvironment)

    // Planner配置
    val plannerProperties = settings.toPlannerProperties
    val planner = ComponentFactoryService.find(classOf[PlannerFactory], plannerProperties)
      .create(
        plannerProperties,
        executor,
        tableConfig,
        functionCatalog,
        catalogManager)

    new StreamTableEnvironmentImpl(
      catalogManager,
      moduleManager,
      functionCatalog,
      tableConfig,
      executionEnvironment,
      planner,
      executor,
      settings.isStreamingMode
    )
}
```
### execute
> 使用Java代码查看了,Scala源码包没下载下来

```java
1.将Operation转换为Transformation
2.将生成对应jobName的StreamGraph

// TableEnvironmentImpl
public JobExecutionResult execute(String jobName) throws Exception {
    // 将Operation转换为Transformation,并添加到StreamExecutionEnvironment,Operation怎么来的可以参考之前的文章
	translate(bufferedModifyOperations);
	bufferedModifyOperations.clear();
    // 调用StreamExecutionEnvironment.execute
	return execEnv.execute(jobName);
}
// 转换
private void translate(List<ModifyOperation> modifyOperations) {
    // 怎么转换的之前文章有说明,这里其实就已经将SQL转为DataStream了
	List<Transformation<?>> transformations = planner.translate(modifyOperations);
    // 添加Transformation
	execEnv.apply(transformations);
}
// 添加进StreamExecutionEnvironment
public void apply(List<Transformation<?>> transformations) {
	transformations.forEach(executionEnvironment::addOperator);
}
// StreamExecutionEnvironment
public void addOperator(Transformation<?> transformation) {
	Preconditions.checkNotNull(transformation, "transformation must not be null.");
	this.transformations.add(transformation);
}

// StreamExecutionEnvironment
public JobExecutionResult execute(String jobName) throws Exception {
	Preconditions.checkNotNull(jobName, "Streaming Job name should not be null.");
    // 到这里应该可以很清晰了,这此处生成了StreamGraph
    // 然后通过调用execute生成JobExecutionResult
	return execute(getStreamGraph(jobName));
}
public StreamGraph getStreamGraph(String jobName) {
	return getStreamGraph(jobName, true);
}
public StreamGraph getStreamGraph(String jobName, boolean clearTransformations) {
    // 生成StreamGraph
	StreamGraph streamGraph = getStreamGraphGenerator().setJobName(jobName).generate();
	if (clearTransformations) {
		this.transformations.clear();
	}
	return streamGraph;
}
```
#### getStreamGraphGenerator
```java
// 将Transformation传给StreamGraph构造器
private StreamGraphGenerator getStreamGraphGenerator() {
	if (transformations.size() <= 0) {
		throw new IllegalStateException("No operators defined in streaming topology. Cannot execute.");
	}
	return new StreamGraphGenerator(transformations, config, checkpointCfg)
		.setStateBackend(defaultStateBackend)
		.setChaining(isChainingEnabled)
		.setUserArtifacts(cacheFile)
		.setTimeCharacteristic(timeCharacteristic)
		.setDefaultBufferTimeout(bufferTimeout);
}
```
#### generate
```java
public StreamGraph generate() {
    streamGraph = new StreamGraph(executionConfig, checkpointConfig, savepointRestoreSettings);
    streamGraph.setStateBackend(stateBackend);
    streamGraph.setChaining(chaining);
    streamGraph.setScheduleMode(scheduleMode);
    streamGraph.setUserArtifacts(userArtifacts);
    streamGraph.setTimeCharacteristic(timeCharacteristic);
    streamGraph.setJobName(jobName);
    streamGraph.setBlockingConnectionsBetweenChains(blockingConnectionsBetweenChains);

    alreadyTransformed = new HashMap<>();

    for (Transformation<?> transformation: transformations) {
        // transformation设置进StreamGraph,对转换树每个Transformation进行转换
        transform(transformation);
    }

    final StreamGraph builtStreamGraph = streamGraph;

    alreadyTransformed.clear();
    alreadyTransformed = null;
    streamGraph = null;

    return builtStreamGraph;
}

// 对具体的一个Transformation进行转换
// 生成StreamGraph中的StreamNode和StreamEdge
// 返回值为Transformation的id集合
private Collection<Integer> transform(Transformation<?> transform) {
    // 跳过已经转换过的Transformation
    if (alreadyTransformed.containsKey(transform)) {
        return alreadyTransformed.get(transform);
    }

    LOG.debug("Transforming " + transform);
    // 设置最大并行度
    if (transform.getMaxParallelism() <= 0) {

        // if the max parallelism hasn't been set, then first use the job wide max parallelism
        // from the ExecutionConfig.
        int globalMaxParallelismFromConfig = executionConfig.getMaxParallelism();
        if (globalMaxParallelismFromConfig > 0) {
            transform.setMaxParallelism(globalMaxParallelismFromConfig);
        }
    }

    // call at least once to trigger exceptions about MissingTypeInfo
    // 为了触发MissingTypeInfo异常,字段类型
    transform.getOutputType();

    Collection<Integer> transformedIds;
    // 获取transformedIds,并且根据Transformation的类型设置节点
    if (transform instanceof OneInputTransformation<?, ?>) {
        transformedIds = transformOneInputTransform((OneInputTransformation<?, ?>) transform);
    } else if (transform instanceof TwoInputTransformation<?, ?, ?>) {
        transformedIds = transformTwoInputTransform((TwoInputTransformation<?, ?, ?>) transform);
    } else if (transform instanceof SourceTransformation<?>) {
        transformedIds = transformSource((SourceTransformation<?>) transform);
    } else if (transform instanceof SinkTransformation<?>) {
        transformedIds = transformSink((SinkTransformation<?>) transform);
    } else if (transform instanceof UnionTransformation<?>) {
        transformedIds = transformUnion((UnionTransformation<?>) transform);
    } else if (transform instanceof SplitTransformation<?>) {
        transformedIds = transformSplit((SplitTransformation<?>) transform);
    } else if (transform instanceof SelectTransformation<?>) {
        transformedIds = transformSelect((SelectTransformation<?>) transform);
    } else if (transform instanceof FeedbackTransformation<?>) {
        transformedIds = transformFeedback((FeedbackTransformation<?>) transform);
    } else if (transform instanceof CoFeedbackTransformation<?>) {
        transformedIds = transformCoFeedback((CoFeedbackTransformation<?>) transform);
    } else if (transform instanceof PartitionTransformation<?>) {
        transformedIds = transformPartition((PartitionTransformation<?>) transform);
    } else if (transform instanceof SideOutputTransformation<?>) {
        transformedIds = transformSideOutput((SideOutputTransformation<?>) transform);
    } else {
        throw new IllegalStateException("Unknown transformation: " + transform);
    }

    // need this check because the iterate transformation adds itself before
    // transforming the feedback edges
    if (!alreadyTransformed.containsKey(transform)) {
        alreadyTransformed.put(transform, transformedIds);
    }

    if (transform.getBufferTimeout() >= 0) {
        streamGraph.setBufferTimeout(transform.getId(), transform.getBufferTimeout());
    } else {
        streamGraph.setBufferTimeout(transform.getId(), defaultBufferTimeout);
    }

    if (transform.getUid() != null) {
        streamGraph.setTransformationUID(transform.getId(), transform.getUid());
    }
    if (transform.getUserProvidedNodeHash() != null) {
        streamGraph.setTransformationUserHash(transform.getId(), transform.getUserProvidedNodeHash());
    }

    if (!streamGraph.getExecutionConfig().hasAutoGeneratedUIDsEnabled()) {
        if (transform instanceof PhysicalTransformation &&
                transform.getUserProvidedNodeHash() == null &&
                transform.getUid() == null) {
            throw new IllegalStateException("Auto generated UIDs have been disabled " +
                "but no UID or hash has been assigned to operator " + transform.getName());
        }
    }

    if (transform.getMinResources() != null && transform.getPreferredResources() != null) {
        streamGraph.setResources(transform.getId(), transform.getMinResources(), transform.getPreferredResources());
    }

    streamGraph.setManagedMemoryWeight(transform.getId(), transform.getManagedMemoryWeight());

    return transformedIds;
}
```

---

## Transformation
### 种类
```
是对Operation的转换,通过之前的FlinkSQL源码分析
可以知道Operator其实就是SQL解析得来的
Transformation
    PhysicalTransformation
        OneInputTransformation
        SinkTransformation
        SourceTransformation
        TwoInputTransformation
    CoFeedbackTransformation
    FeedbackTransformation
    PartitionTransformation
    SelectTransformation
    SideOutputTransformation
    SplitTransformation
    UnionTransformation
```

## StreamGraph
### 组成
```java
StreamNode(节点)
StreamEdge(节点与节点的联系)

private Map<Integer, StreamNode> streamNodes; // 对应OneInputTransform,TwoInputTransform
private Set<Integer> sources; // 对应SourceTransformation
private Set<Integer> sinks; // 对应SinkTransformation
private Map<Integer, Tuple2<Integer, List<String>>> virtualSelectNodes; // 对应SplitTransformation,SelectTransformation,FeedbackTransformation,CoFeedbackTransformation
private Map<Integer, Tuple2<Integer, OutputTag>> virtualSideOutputNodes; // 对应FeedbackTransformation,CoFeedbackTransformation,SideOutputTransformation
private Map<Integer, Tuple3<Integer, StreamPartitioner<?>, ShuffleMode>> virtualPartitionNodes; // 对应FeedbackTransformation,CoFeedbackTransformation,PartitionTransformation
protected Map<Integer, String> vertexIDtoBrokerID;
protected Map<Integer, Long> vertexIDtoLoopTimeout;
private StateBackend stateBackend;
private Set<Tuple2<StreamNode, StreamNode>> iterationSourceSinkPairs;
```

---

## Transformation如何装载进StreamGraph的
```java
在StreamGraphGenerator的generate方法中,对所有的Transformation进行转换

// 以SourceTransformation为例
private <T> Collection<Integer> transformSource(SourceTransformation<T> source) {
    String slotSharingGroup = determineSlotSharingGroup(source.getSlotSharingGroup(), Collections.emptyList());

    // streamGraph添加Source节点
    streamGraph.addSource(source.getId(),
            slotSharingGroup,
            source.getCoLocationGroupKey(),
            source.getOperatorFactory(),
            null,
            source.getOutputType(),
            "Source: " + source.getName());
    if (source.getOperatorFactory() instanceof InputFormatOperatorFactory) {
        // 设置InputFormat
        streamGraph.setInputFormat(source.getId(),
                ((InputFormatOperatorFactory<T>) source.getOperatorFactory()).getInputFormat());
    }
    int parallelism = source.getParallelism() != ExecutionConfig.PARALLELISM_DEFAULT ?
        source.getParallelism() : executionConfig.getParallelism();
    streamGraph.setParallelism(source.getId(), parallelism);
    streamGraph.setMaxParallelism(source.getId(), source.getMaxParallelism());
    return Collections.singleton(source.getId());
}

// StreamGraph
public <IN, OUT> void addSource(Integer vertexID,
	@Nullable String slotSharingGroup,
	@Nullable String coLocationGroup,
	StreamOperatorFactory<OUT> operatorFactory,
	TypeInformation<IN> inTypeInfo,
	TypeInformation<OUT> outTypeInfo,
	String operatorName) {
    // 创建StreamNode,并设置序列化
	addOperator(vertexID, slotSharingGroup, coLocationGroup, operatorFactory, inTypeInfo, outTypeInfo, operatorName);
    // 添加节点ID
	sources.add(vertexID);
}

public <IN, OUT> void addOperator(
			Integer vertexID,
			@Nullable String slotSharingGroup,
			@Nullable String coLocationGroup,
			StreamOperatorFactory<OUT> operatorFactory,
			TypeInformation<IN> inTypeInfo,
			TypeInformation<OUT> outTypeInfo,
			String operatorName) {

    // 添加StreamNode
    if (operatorFactory.isStreamSource()) {
        addNode(vertexID, slotSharingGroup, coLocationGroup, SourceStreamTask.class, operatorFactory, operatorName);
    } else {
        addNode(vertexID, slotSharingGroup, coLocationGroup, OneInputStreamTask.class, operatorFactory, operatorName);
    }

    // 序列化
    TypeSerializer<IN> inSerializer = inTypeInfo != null && !(inTypeInfo instanceof MissingTypeInfo) ? inTypeInfo.createSerializer(executionConfig) : null;

    TypeSerializer<OUT> outSerializer = outTypeInfo != null && !(outTypeInfo instanceof MissingTypeInfo) ? outTypeInfo.createSerializer(executionConfig) : null;

    setSerializers(vertexID, inSerializer, null, outSerializer);

    if (operatorFactory.isOutputTypeConfigurable() && outTypeInfo != null) {
        // sets the output type which must be know at StreamGraph creation time
        operatorFactory.setOutputType(outTypeInfo, executionConfig);
    }

    if (operatorFactory.isInputTypeConfigurable()) {
        operatorFactory.setInputType(inTypeInfo, executionConfig);
    }

    if (LOG.isDebugEnabled()) {
        LOG.debug("Vertex: {}", vertexID);
    }
}

// 添加节点
protected StreamNode addNode(Integer vertexID,
	@Nullable String slotSharingGroup,
	@Nullable String coLocationGroup,
	Class<? extends AbstractInvokable> vertexClass,
	StreamOperatorFactory<?> operatorFactory,
	String operatorName) {
	if (streamNodes.containsKey(vertexID)) {
		throw new RuntimeException("Duplicate vertexID " + vertexID);
	}
	StreamNode vertex = new StreamNode(
		vertexID,
		slotSharingGroup,
		coLocationGroup,
		operatorFactory,
		operatorName,
		new ArrayList<OutputSelector<?>>(),
		vertexClass);
    // 装载入streamNodes中
	streamNodes.put(vertexID, vertex);
	return vertex;
}
```
