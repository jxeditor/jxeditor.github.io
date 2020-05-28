---
title: Flink源码解析之二JobGraph生成
date: 2020-05-11 10:22:26
categories: 大数据
tags: flink
---

> 接着上一篇StreamGraph已经被生成出来了,根据Flink的四层图结构,接下来就是JobGraph的生成

<!-- more -->

StreamGraph和JobGraph都是在Client端生成的

## 结构
```
# PipelineExecutor类
PipelineExecutor
    AbstractJobClusterExecutor
    AbstractSessionClusterExecutor
        RemoteExecutor
    LocalExecutor
```

---

## 流程概览
```
StreamExecutionEnvironment.execute(JobName)->execute(StreamGraph)->executeAsync(StreamGraph)
    PipelineExecutor.execute()[有多种情况,这里选RemoteExecutor]
        ExecutorUtils.getJobGraph()->FlinkPipelineTranslationUtil.getJobGraph()
            ->FlinkPipelineTranslator.translateToJobGraph()[选StreamGraphTranslator]
                ->StreamGraph.getJobGraph()
                    ->StreamingJobGraphGenerator.createJobGraph()
```

---

## 流程解析
### StreamExecutionEnvironment入口
```java
// StreamExecutionEnvironment
public JobExecutionResult execute(String jobName) throws Exception {
	Preconditions.checkNotNull(jobName, "Streaming Job name should not be null.");
    // 拿到StreamGraph
	return execute(getStreamGraph(jobName));
}

// 触发程序执行,执行导致Sink操作的所有部分,打印结果或将结果转发到消息队列
public JobExecutionResult execute(StreamGraph streamGraph) throws Exception {
    // 获取JobClient
	final JobClient jobClient = executeAsync(streamGraph);
    // 这一块以后再深入了解
	try {
		final JobExecutionResult jobExecutionResult;
		if (configuration.getBoolean(DeploymentOptions.ATTACHED)) {
			jobExecutionResult = jobClient.getJobExecutionResult(userClassloader).get();
		} else {
			jobExecutionResult = new DetachedJobExecutionResult(jobClient.getJobID());
		}
		jobListeners.forEach(jobListener -> jobListener.onJobExecuted(jobExecutionResult, null));
		return jobExecutionResult;
	} catch (Throwable t) {
		jobListeners.forEach(jobListener -> {
			jobListener.onJobExecuted(null, ExceptionUtils.stripExecutionException(t));
		});
		ExceptionUtils.rethrowException(t);
		// never reached, only make javac happy
		return null;
	}
}

// 创建一个PipelineExecutor工厂类,选择并实例化适当的PipelineExecutor
public JobClient executeAsync(StreamGraph streamGraph) throws Exception {
	checkNotNull(streamGraph, "StreamGraph cannot be null.");
	checkNotNull(configuration.get(DeploymentOptions.TARGET), "No execution.target specified in your configuration file.");
        // 工厂类
	final PipelineExecutorFactory executorFactory =
		executorServiceLoader.getExecutorFactory(configuration);
	checkNotNull(
		executorFactory,
		"Cannot find compatible factory for specified execution.target (=%s)",
		configuration.get(DeploymentOptions.TARGET));
        // 内部实现JobGraph生成逻辑
	CompletableFuture<JobClient> jobClientFuture = executorFactory
		.getExecutor(configuration)
		.execute(streamGraph, configuration);
	try {
		JobClient jobClient = jobClientFuture.get();
		jobListeners.forEach(jobListener -> jobListener.onJobSubmitted(jobClient, null));
		return jobClient;
	} catch (Throwable t) {
		jobListeners.forEach(jobListener -> jobListener.onJobSubmitted(null, t));
		ExceptionUtils.rethrow(t);
		// make javac happy, this code path will not be reached
		return null;
	}
}
```
### AbstractSessionClusterExecutor执行器
```java
// 远程执行
// RemoteExecutor的父类,execute方法在这里被实现
public CompletableFuture<JobClient> execute(@Nonnull final Pipeline pipeline, @Nonnull final Configuration configuration) throws Exception {
        // 获取JobGraph
	final JobGraph jobGraph = ExecutorUtils.getJobGraph(pipeline, configuration);
	try (final ClusterDescriptor<ClusterID> clusterDescriptor = clusterClientFactory.createClusterDescriptor(configuration)) {
		final ClusterID clusterID = clusterClientFactory.getClusterId(configuration);
		checkState(clusterID != null);
		final ClusterClientProvider<ClusterID> clusterClientProvider = clusterDescriptor.retrieve(clusterID);
		ClusterClient<ClusterID> clusterClient = clusterClientProvider.getClusterClient();
                // 提交JobGraph,Client是如何将生成好的JobGraph提交给远程执行,就在这里实现了
		return clusterClient
				.submitJob(jobGraph)
				.thenApplyAsync(jobID -> (JobClient) new ClusterClientJobClientAdapter<>(
						clusterClientProvider,
						jobID))
				.whenComplete((ignored1, ignored2) -> clusterClient.close());
	}
}
```
### ExecutorUtils
```java
public static JobGraph getJobGraph(@Nonnull final Pipeline pipeline, @Nonnull final Configuration configuration) {
	checkNotNull(pipeline);
	checkNotNull(configuration);
        // Configuration公开的配置访问器
	final ExecutionConfigAccessor executionConfigAccessor = ExecutionConfigAccessor.fromConfiguration(configuration);
        // 获取JobGraph,并行度传递过去了
	final JobGraph jobGraph = FlinkPipelineTranslationUtil
			.getJobGraph(pipeline, configuration, executionConfigAccessor.getParallelism());
        // Jar,ClassPath,检查点设置
	jobGraph.addJars(executionConfigAccessor.getJars());
	jobGraph.setClasspaths(executionConfigAccessor.getClasspaths());
	jobGraph.setSavepointRestoreSettings(executionConfigAccessor.getSavepointRestoreSettings());
	return jobGraph;
}
```
### FlinkPipelineTranslationUtil
```java
public static JobGraph getJobGraph(
		Pipeline pipeline,
		Configuration optimizerConfiguration,
		int defaultParallelism) {
        // 将Pipeline转换为JobGraph,Flink支持不同PipelineAPI实现(这里使用StreamGraphTranslator)
	FlinkPipelineTranslator pipelineTranslator = getPipelineTranslator(pipeline);
	return pipelineTranslator.translateToJobGraph(pipeline,
			optimizerConfiguration,
			defaultParallelism);
}
```
### StreamGraphTranslator
```java
public JobGraph translateToJobGraph(
		Pipeline pipeline,
		Configuration optimizerConfiguration,
		int defaultParallelism) {
        checkArgument(pipeline instanceof StreamGraph,
			"Given pipeline is not a DataStream StreamGraph.");
        StreamGraph streamGraph = (StreamGraph) pipeline;
        // 直接调用StreamGraph.getJobGraph就可以获取JobGraph
        return streamGraph.getJobGraph(null);
}
```
### StreamingJobGraphGenerator入口
```java
StreamingJobGraphGenerator的成员变量都是为了辅助生成最终的JobGraph

public JobGraph getJobGraph(@Nullable JobID jobID) {
    // 可以看见JobGraph的入口函数是StreamingJobGraphGenerator.createJobGraph()
    return StreamingJobGraphGenerator.createJobGraph(this, jobID);
}
// StreamingJobGraphGenerator
public static JobGraph createJobGraph(StreamGraph streamGraph, @Nullable JobID jobID) {
        // 初始化StreamingJobGraphGenerator,再调用createJobGraph
	return new StreamingJobGraphGenerator(streamGraph, jobID).createJobGraph();
}

// 这里介绍下StreamingJobGraphGenerator中有什么成员
private final StreamGraph streamGraph; // StreamGraph,输入
private final Map<Integer, JobVertex> jobVertices; // id->JobVertex 
private final JobGraph jobGraph; // JobGraph,输出
private final Collection<Integer> builtVertices; // 已经构建的JobVertex集合
private final List<StreamEdge> physicalEdgesInOrder; // 保存StreamEdge的集合,在connect/setPhysicalEdges方法中使用
private final Map<Integer, Map<Integer, StreamConfig>> chainedConfigs; // 保存chain信息,部署时用来构建OperatorChain,startNodeId->(currentNodeId->StreamConfig)
private final Map<Integer, StreamConfig> vertexConfigs; // 所有节点的配置信息,id->StreamConfig
private final Map<Integer, String> chainedNames; // 保存每个节点的名字
private final Map<Integer, ResourceSpec> chainedMinResources;
private final Map<Integer, ResourceSpec> chainedPreferredResources;
private final Map<Integer, InputOutputFormatContainer> chainedInputOutputFormats;
private final StreamGraphHasher defaultStreamGraphHasher;
private final List<StreamGraphHasher> legacyStreamGraphHashers;
```
### createJobGraph
```java
首先为所有节点生成一个唯一的HashID,如果节点在多次提交没有改变(并行度,上下游)
那么该ID也不会改变,主要用于故障恢复
StreamNode.id是一个从1开始的静态计数变量,同样的Job可能会得到不一样的id
接着就是chaining处理,生成JobVertex,JobEdge
写入各种配置信息

private JobGraph createJobGraph() {
	preValidate();
	// make sure that all vertices start immediately
        // 设置调度模式,streaming模式下,所有节点一起启动
	jobGraph.setScheduleMode(streamGraph.getScheduleMode());
	// Generate deterministic hashes for the nodes in order to identify them across
	// submission iff they didn't change.
        // 广度优先遍历StreamGraph并且为每个StreamNode生成hashId
        // 保证如果提交的拓扑没有改变,则每次生成的hash一样
	Map<Integer, byte[]> hashes = defaultStreamGraphHasher.traverseStreamGraphAndGenerateHashes(streamGraph);
	// Generate legacy version hashes for backwards compatibility
	List<Map<Integer, byte[]>> legacyHashes = new ArrayList<>(legacyStreamGraphHashers.size());
	for (StreamGraphHasher hasher : legacyStreamGraphHashers) {
		legacyHashes.add(hasher.traverseStreamGraphAndGenerateHashes(streamGraph));
	}
	Map<Integer, List<Tuple2<byte[], byte[]>>> chainedOperatorHashes = new HashMap<>();
        // 最重要的函数,生成JobVertex,JobEdge等
        // 并尽可能的将多个节点chain在一起
	setChaining(hashes, legacyHashes, chainedOperatorHashes);
        // 将每个JobVertex的入边集合也序列化到该JobVertex的StreamConfig中
        // (出边集合已经在setChaining的时候写入了)
	setPhysicalEdges();
        // 根据group name,为每个JobVertex指定所属的SlotSharingGroup
        // 以及针对Iteration的头尾设置CoLocationGroup
        setSlotSharingAndCoLocation();
	setManagedMemoryFraction(
		Collections.unmodifiableMap(jobVertices),
		Collections.unmodifiableMap(vertexConfigs),
		Collections.unmodifiableMap(chainedConfigs),
		id -> streamGraph.getStreamNode(id).getMinResources(),
		id -> streamGraph.getStreamNode(id).getManagedMemoryWeight());
        // 配置CK
	configureCheckpointing();
        // 设置Savepoint恢复配置 
	jobGraph.setSavepointRestoreSettings(streamGraph.getSavepointRestoreSettings());
	JobGraphGenerator.addUserArtifactEntries(streamGraph.getUserArtifacts(), jobGraph);
	// set the ExecutionConfig last when it has been finalized
	try {
		jobGraph.setExecutionConfig(streamGraph.getExecutionConfig());
	}
	catch (IOException e) {
		throw new IllegalConfigurationException("Could not serialize the ExecutionConfig." +
				"This indicates that non-serializable types (like custom serializers) were registered");
	}
	return jobGraph;
}
```
### setChaining
```java
private void setChaining(Map<Integer, byte[]> hashes, List<Map<Integer, byte[]>> legacyHashes, Map<Integer, List<Tuple2<byte[], byte[]>>> chainedOperatorHashes) {
    // 从Source开始建立Node Chains
    // 递归创建所有JobVertex实例
    for (Integer sourceNodeId : streamGraph.getSourceIDs()) {
        createChain(sourceNodeId, sourceNodeId, hashes, legacyHashes, 0, chainedOperatorHashes);
    }
}

// 构建node chains,返回当前节点的物理出边
// startNodeId != currentNodeId时,说明currentNode是chain中的子节点
private List<StreamEdge> createChain(
			Integer startNodeId,
			Integer currentNodeId,
			Map<Integer, byte[]> hashes,
			List<Map<Integer, byte[]>> legacyHashes,
			int chainIndex,
			Map<Integer, List<Tuple2<byte[], byte[]>>> chainedOperatorHashes) {

    if (!builtVertices.contains(startNodeId)) {

        // 过渡用的出边集合,用来生成最终的JobEdge
        // 注意不包括chain内部的边
        List<StreamEdge> transitiveOutEdges = new ArrayList<StreamEdge>();

        List<StreamEdge> chainableOutputs = new ArrayList<StreamEdge>();
        List<StreamEdge> nonChainableOutputs = new ArrayList<StreamEdge>();

        StreamNode currentNode = streamGraph.getStreamNode(currentNodeId);

        // 将当前节点的出边分成chainable和nonChainable两类
        for (StreamEdge outEdge : currentNode.getOutEdges()) {
            if (isChainable(outEdge, streamGraph)) {
                chainableOutputs.add(outEdge);
            } else {
                nonChainableOutputs.add(outEdge);
            }
        }

        // 递归调用
        for (StreamEdge chainable : chainableOutputs) {
            transitiveOutEdges.addAll(
                    createChain(startNodeId, chainable.getTargetId(), hashes, legacyHashes, chainIndex + 1, chainedOperatorHashes));
        }

        for (StreamEdge nonChainable : nonChainableOutputs) {
            transitiveOutEdges.add(nonChainable);
            createChain(nonChainable.getTargetId(), nonChainable.getTargetId(), hashes, legacyHashes, 0, chainedOperatorHashes);
        }

        List<Tuple2<byte[], byte[]>> operatorHashes =
            chainedOperatorHashes.computeIfAbsent(startNodeId, k -> new ArrayList<>());

        byte[] primaryHashBytes = hashes.get(currentNodeId);
        OperatorID currentOperatorId = new OperatorID(primaryHashBytes);

        for (Map<Integer, byte[]> legacyHash : legacyHashes) {
            operatorHashes.add(new Tuple2<>(primaryHashBytes, legacyHash.get(currentNodeId)));
        }

        // 生成当前节点的显示名
        chainedNames.put(currentNodeId, createChainedName(currentNodeId, chainableOutputs));
        chainedMinResources.put(currentNodeId, createChainedMinResources(currentNodeId, chainableOutputs));
        chainedPreferredResources.put(currentNodeId, createChainedPreferredResources(currentNodeId, chainableOutputs));

        if (currentNode.getInputFormat() != null) {
            getOrCreateFormatContainer(startNodeId).addInputFormat(currentOperatorId, currentNode.getInputFormat());
        }

        if (currentNode.getOutputFormat() != null) {
            getOrCreateFormatContainer(startNodeId).addOutputFormat(currentOperatorId, currentNode.getOutputFormat());
        }

        // 如果当前节点是起始节点,则直接创建JobVertex并返回StreamConfig
        // 否则先创建一个空的StreamConfig
        // createJobVertex函数根据StreamNode创建对应的JobVertex,并返回空的StreamConfig
        StreamConfig config = currentNodeId.equals(startNodeId)
                ? createJobVertex(startNodeId, hashes, legacyHashes, chainedOperatorHashes)
                : new StreamConfig(new Configuration());

        // 设置JobVertex的StreamConfig,基本上是序列化StreamNode中的配置到StreamConfig中
        // 其中包括序列化器,StreamOperator,CK等相关配置
        setVertexConfig(currentNodeId, config, chainableOutputs, nonChainableOutputs);

        if (currentNodeId.equals(startNodeId)) {
            // 如果是chain起始节点(不是chain中的节点,也会被标记成chain start)
            config.setChainStart();
            config.setChainIndex(0);
            // 把物理出边写入配置,以便部署时使用
            config.setOperatorName(streamGraph.getStreamNode(currentNodeId).getOperatorName());
            config.setOutEdgesInOrder(transitiveOutEdges);
            config.setOutEdges(streamGraph.getStreamNode(currentNodeId).getOutEdges());

            // 将当前节点与所有出边相连
            for (StreamEdge edge : transitiveOutEdges) {
                // 通过StreamEdge构建出JobEdge,创建IntermediateDataset,用来将JobVertex和JobEdge相连
                connect(startNodeId, edge);
            }

            // 将chain中所有子节点的StreamConfig写入到headOfChain节点的CHAINED_TASK_CONFIG配置中
            config.setTransitiveChainedTaskConfigs(chainedConfigs.get(startNodeId));

        } else {
            // 如果是chain中的子节点
            chainedConfigs.computeIfAbsent(startNodeId, k -> new HashMap<Integer, StreamConfig>());

            config.setChainIndex(chainIndex);
            StreamNode node = streamGraph.getStreamNode(currentNodeId);
            config.setOperatorName(node.getOperatorName());
            // 将当前节点的StreamConfig添加到该chain的config集合中
            chainedConfigs.get(startNodeId).put(currentNodeId, config);
        }

        config.setOperatorID(currentOperatorId);

        if (chainableOutputs.isEmpty()) {
            config.setChainEnd();
        }
        return transitiveOutEdges;

    } else {
        return new ArrayList<>();
    }
}
```