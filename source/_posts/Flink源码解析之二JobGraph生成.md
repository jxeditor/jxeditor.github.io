---
title: Flink源码解析之二JobGraph生成
date: 2020-05-11 10:22:26
categories: 大数据
tags: flink
---

> 接着上一篇StreamGraph已经被生成出来了,根据Flink的四层图结构,接下来就是JobGraph的生成

<!-- more -->

## 结构
```
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
public JobGraph getJobGraph(@Nullable JobID jobID) {
	// 可以看见JobGraph的入口函数是StreamingJobGraphGenerator.createJobGraph()
    return StreamingJobGraphGenerator.createJobGraph(this, jobID);
}
// StreamingJobGraphGenerator
public static JobGraph createJobGraph(StreamGraph streamGraph, @Nullable JobID jobID) {
    // 初始化StreamingJobGraphGenerator,再调用createJobGraph
	return new StreamingJobGraphGenerator(streamGraph, jobID).createJobGraph();
}
```
### createJobGraph
```java
private JobGraph createJobGraph() {
	preValidate();
	// make sure that all vertices start immediately
	jobGraph.setScheduleMode(streamGraph.getScheduleMode());
	// Generate deterministic hashes for the nodes in order to identify them across
	// submission iff they didn't change.
	Map<Integer, byte[]> hashes = defaultStreamGraphHasher.traverseStreamGraphAndGenerateHashes(streamGraph);
	// Generate legacy version hashes for backwards compatibility
	List<Map<Integer, byte[]>> legacyHashes = new ArrayList<>(legacyStreamGraphHashers.size());
	for (StreamGraphHasher hasher : legacyStreamGraphHashers) {
		legacyHashes.add(hasher.traverseStreamGraphAndGenerateHashes(streamGraph));
	}
	Map<Integer, List<Tuple2<byte[], byte[]>>> chainedOperatorHashes = new HashMap<>();
	setChaining(hashes, legacyHashes, chainedOperatorHashes);
	setPhysicalEdges();
	setSlotSharingAndCoLocation();
	setManagedMemoryFraction(
		Collections.unmodifiableMap(jobVertices),
		Collections.unmodifiableMap(vertexConfigs),
		Collections.unmodifiableMap(chainedConfigs),
		id -> streamGraph.getStreamNode(id).getMinResources(),
		id -> streamGraph.getStreamNode(id).getManagedMemoryWeight());
	configureCheckpointing();
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