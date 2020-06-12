---
title: Flink源码解析之四ExecutionGraph生成
date: 2020-05-28 14:14:08
categories: 大数据
tags: flink
---

> 介绍JobGraph被提交之后,JobManager如何接收到该请求,以及如何生成ExecutionGraph

<!-- more -->

## JobManager的启动
### JobSubmitHandler
```java
此处理程序可用于将作业提交到Flink集群
处理请求,调用submitJob,启动JobManagerRunner
@Override
protected CompletableFuture<JobSubmitResponseBody> handleRequest(@Nonnull HandlerRequest<JobSubmitRequestBody, EmptyMessageParameters> request, @Nonnull DispatcherGateway gateway) throws RestHandlerException {
    // 从request中获取上传的文件
    final Collection<File> uploadedFiles = request.getUploadedFiles();
    // 获取<名称,文件路径>
    final Map<String, Path> nameToFile = uploadedFiles.stream().collect(Collectors.toMap(
        File::getName,
        Path::fromLocalFile
    ));

    // 如果上传文件数量与名称对应数量不匹配报错
    if (uploadedFiles.size() != nameToFile.size()) {
        throw new RestHandlerException(
            String.format("The number of uploaded files was %s than the expected count. Expected: %s Actual %s",
                uploadedFiles.size() < nameToFile.size() ? "lower" : "higher",
                nameToFile.size(),
                uploadedFiles.size()),
            HttpResponseStatus.BAD_REQUEST
        );
    }

    // 获取请求体
    final JobSubmitRequestBody requestBody = request.getRequestBody();

    if (requestBody.jobGraphFileName == null) {
        throw new RestHandlerException(
            String.format("The %s field must not be omitted or be null.",
                JobSubmitRequestBody.FIELD_NAME_JOB_GRAPH),
            HttpResponseStatus.BAD_REQUEST);
    }

    // 加载JobGraph
    CompletableFuture<JobGraph> jobGraphFuture = loadJobGraph(requestBody, nameToFile);

    // 获取Jar
    Collection<Path> jarFiles = getJarFilesToUpload(requestBody.jarFileNames, nameToFile);

    // 获取artifacts
    Collection<Tuple2<String, Path>> artifacts = getArtifactFilesToUpload(requestBody.artifactFileNames, nameToFile);

    // 向BLOBServer上传信息
    CompletableFuture<JobGraph> finalizedJobGraphFuture = uploadJobGraphFiles(gateway, jobGraphFuture, jarFiles, artifacts, configuration);

    // Ack通信,向服务端提交任务
    CompletableFuture<Acknowledge> jobSubmissionFuture = finalizedJobGraphFuture.thenCompose(jobGraph -> gateway.submitJob(jobGraph, timeout));

    return jobSubmissionFuture.thenCombine(jobGraphFuture,
        (ack, jobGraph) -> new JobSubmitResponseBody("/jobs/" + jobGraph.getJobID()));
}

// 接下来依旧是Dispatcher中submitJob函数调用逻辑
// 详情可参考上一篇
```

### JobManagerRunnerImpl
```java
了解一下JobManagerRunnerImpl内做了什么
public JobManagerRunnerImpl(
        final JobGraph jobGraph,
        final JobMasterServiceFactory jobMasterFactory,
        final HighAvailabilityServices haServices,
        final LibraryCacheManager libraryCacheManager,
        final Executor executor,
        final FatalErrorHandler fatalErrorHandler) throws Exception {

    this.resultFuture = new CompletableFuture<>();
    this.terminationFuture = new CompletableFuture<>();
    this.leadershipOperation = CompletableFuture.completedFuture(null);

    // make sure we cleanly shut down out JobManager services if initialization fails
    try {
        this.jobGraph = checkNotNull(jobGraph);
        this.libraryCacheManager = checkNotNull(libraryCacheManager);
        this.executor = checkNotNull(executor);
        this.fatalErrorHandler = checkNotNull(fatalErrorHandler);

        checkArgument(jobGraph.getNumberOfVertices() > 0, "The given job is empty");

        // libraries and class loader first
        try {
            // 向BlobLibraryCacheManager注册Job
            libraryCacheManager.registerJob(
                    jobGraph.getJobID(), jobGraph.getUserJarBlobKeys(), jobGraph.getClasspaths());
        } catch (IOException e) {
            throw new Exception("Cannot set up the user code libraries: " + e.getMessage(), e);
        }

        // 获取类加载器
        final ClassLoader userCodeLoader = libraryCacheManager.getClassLoader(jobGraph.getJobID());
        if (userCodeLoader == null) {
            throw new Exception("The user code class loader could not be initialized.");
        }

        // high availability services next
        this.runningJobsRegistry = haServices.getRunningJobsRegistry();
        // 为Job获取Leader选举服务
        this.leaderElectionService = haServices.getJobManagerLeaderElectionService(jobGraph.getJobID());

        this.leaderGatewayFuture = new CompletableFuture<>();

        // now start the JobManager
        // 启动JobMaster
        this.jobMasterService = jobMasterFactory.createJobMasterService(jobGraph, this, userCodeLoader);
    }
    catch (Throwable t) {
        terminationFuture.completeExceptionally(t);
        resultFuture.completeExceptionally(t);

        throw new JobExecutionException(jobGraph.getJobID(), "Could not set up JobManager", t);
    }
}
```

---

## ExecutionGroup的生成
### JobMaster
```java
// 入口DefaultJobMasterServiceFactory.createJobMasterService
@Override
public JobMaster createJobMasterService(
        JobGraph jobGraph,
        OnCompletionActions jobCompletionActions,
        ClassLoader userCodeClassloader) throws Exception {

return new JobMaster(
    rpcService,
    jobMasterConfiguration,
    ResourceID.generate(),
    jobGraph,
    haServices,
    slotPoolFactory,
    schedulerFactory,
    jobManagerSharedServices,
    heartbeatServices,
    jobManagerJobMetricGroupFactory,
    jobCompletionActions,
    fatalErrorHandler,
    userCodeClassloader,
    schedulerNGFactory,
    shuffleMaster,
    lookup -> new JobMasterPartitionTrackerImpl(
        jobGraph.getJobID(),
        shuffleMaster,
        lookup
    ));
}

// JobMaster.createScheduler
private SchedulerNG createScheduler(final JobManagerJobMetricGroup jobManagerJobMetricGroup) throws Exception {
    // 创建SchedulerNG
    return schedulerNGFactory.createInstance(
        log,
        jobGraph,
        backPressureStatsTracker,
        scheduledExecutorService,
        jobMasterConfiguration.getConfiguration(),
        scheduler,
        scheduledExecutorService,
        userCodeLoader,
        highAvailabilityServices.getCheckpointRecoveryFactory(),
        rpcTimeout,
        blobWriter,
        jobManagerJobMetricGroup,
        jobMasterConfiguration.getSlotRequestTimeout(),
        shuffleMaster,
        partitionTracker);
}
```
### SchedulerNGFactory
```java
SchedulerNGFactory
    DefaultSchedulerFactory
    LegacySchedulerFactory

// 分析DefaultSchedulerFactory
@Override
public SchedulerNG createInstance(
        final Logger log,
        final JobGraph jobGraph,
        final BackPressureStatsTracker backPressureStatsTracker,
        final Executor ioExecutor,
        final Configuration jobMasterConfiguration,
        final SlotProvider slotProvider,
        final ScheduledExecutorService futureExecutor,
        final ClassLoader userCodeLoader,
        final CheckpointRecoveryFactory checkpointRecoveryFactory,
        final Time rpcTimeout,
        final BlobWriter blobWriter,
        final JobManagerJobMetricGroup jobManagerJobMetricGroup,
        final Time slotRequestTimeout,
        final ShuffleMaster<?> shuffleMaster,
        final JobMasterPartitionTracker partitionTracker) throws Exception {

    // 根据JobGraph不同的调度模式获取SchedulingStrategyFactory
    // LAZY_FROM_SOURCES批处理
    // EAGER流处理
    final SchedulingStrategyFactory schedulingStrategyFactory = createSchedulingStrategyFactory(jobGraph.getScheduleMode());
    // 重启策略
    final RestartBackoffTimeStrategy restartBackoffTimeStrategy = RestartBackoffTimeStrategyFactoryLoader
        .createRestartBackoffTimeStrategyFactory(
            jobGraph
                .getSerializedExecutionConfig()
                .deserializeValue(userCodeLoader)
                .getRestartStrategy(),
            jobMasterConfiguration,
            jobGraph.isCheckpointingEnabled())
        .create();
    log.info("Using restart back off time strategy {} for {} ({}).", restartBackoffTimeStrategy, jobGraph.getName(), jobGraph.getJobID());

    // Slot分配策略
    final SlotProviderStrategy slotProviderStrategy = SlotProviderStrategy.from(
        jobGraph.getScheduleMode(),
        slotProvider,
        slotRequestTimeout);

    // 返回DefaultScheduler
    return new DefaultScheduler(
        log,
        jobGraph,
        backPressureStatsTracker,
        ioExecutor,
        jobMasterConfiguration,
        slotProvider,
        futureExecutor,
        new ScheduledExecutorServiceAdapter(futureExecutor),
        userCodeLoader,
        checkpointRecoveryFactory,
        rpcTimeout,
        blobWriter,
        jobManagerJobMetricGroup,
        slotRequestTimeout,
        shuffleMaster,
        partitionTracker,
        schedulingStrategyFactory,
        FailoverStrategyFactoryLoader.loadFailoverStrategyFactory(jobMasterConfiguration),
        restartBackoffTimeStrategy,
        new DefaultExecutionVertexOperations(),
        new ExecutionVertexVersioner(),
        new DefaultExecutionSlotAllocatorFactory(slotProviderStrategy));
}
```
### DefaultScheduler->SchedulerBase
```java
这里主要是分析其父类SchedulerBase

this.executionGraph = createAndRestoreExecutionGraph(jobManagerJobMetricGroup, checkNotNull(shuffleMaster), checkNotNull(partitionTracker));

// 创建,恢复ExecutionGraph
private ExecutionGraph createAndRestoreExecutionGraph(
		JobManagerJobMetricGroup currentJobManagerJobMetricGroup,
		ShuffleMaster<?> shuffleMaster,
		JobMasterPartitionTracker partitionTracker) throws Exception {
    // 创建ExecutionGraph
    ExecutionGraph newExecutionGraph = createExecutionGraph(currentJobManagerJobMetricGroup, shuffleMaster, partitionTracker);

    final CheckpointCoordinator checkpointCoordinator = newExecutionGraph.getCheckpointCoordinator();

    if (checkpointCoordinator != null) {
        // check whether we find a valid checkpoint
        if (!checkpointCoordinator.restoreLatestCheckpointedState(
            new HashSet<>(newExecutionGraph.getAllVertices().values()),
            false,
            false)) {

            // check whether we can restore from a savepoint
            tryRestoreExecutionGraphFromSavepoint(newExecutionGraph, jobGraph.getSavepointRestoreSettings());
        }
    }

    return newExecutionGraph;
}

private ExecutionGraph createExecutionGraph(
		JobManagerJobMetricGroup currentJobManagerJobMetricGroup,
		ShuffleMaster<?> shuffleMaster,
		final JobMasterPartitionTracker partitionTracker) throws JobExecutionException, JobException {

    // 失败策略
    final FailoverStrategy.Factory failoverStrategy = legacyScheduling ?
        FailoverStrategyLoader.loadFailoverStrategy(jobMasterConfiguration, log) :
        new NoOpFailoverStrategy.Factory();

    // buildGraph初始化ExecutionGraphBuilder
    return ExecutionGraphBuilder.buildGraph(
        null,
        jobGraph,
        jobMasterConfiguration,
        futureExecutor,
        ioExecutor,
        slotProvider,
        userCodeLoader,
        checkpointRecoveryFactory,
        rpcTimeout,
        restartStrategy,
        currentJobManagerJobMetricGroup,
        blobWriter,
        slotRequestTimeout,
        log,
        shuffleMaster,
        partitionTracker,
        failoverStrategy);
}
```
### ExecutionGraphBuilder
```java
// 将JobGraph构建成ExecutionGraph
public static ExecutionGraph buildGraph(
		@Nullable ExecutionGraph prior,
		JobGraph jobGraph,
		Configuration jobManagerConfig,
		ScheduledExecutorService futureExecutor,
		Executor ioExecutor,
		SlotProvider slotProvider,
		ClassLoader classLoader,
		CheckpointRecoveryFactory recoveryFactory,
		Time rpcTimeout,
		RestartStrategy restartStrategy,
		MetricGroup metrics,
		BlobWriter blobWriter,
		Time allocationTimeout,
		Logger log,
		ShuffleMaster<?> shuffleMaster,
		JobMasterPartitionTracker partitionTracker,
		FailoverStrategy.Factory failoverStrategyFactory) throws JobExecutionException, JobException {

    checkNotNull(jobGraph, "job graph cannot be null");

    final String jobName = jobGraph.getName();
    final JobID jobId = jobGraph.getJobID();

    // Job信息
    final JobInformation jobInformation = new JobInformation(
        jobId,
        jobName,
        jobGraph.getSerializedExecutionConfig(),
        jobGraph.getJobConfiguration(),
        jobGraph.getUserJarBlobKeys(),
        jobGraph.getClasspaths());

    // 历史记录中保留的先前执行尝试的最大次数。
    final int maxPriorAttemptsHistoryLength =
            jobManagerConfig.getInteger(JobManagerOptions.MAX_ATTEMPTS_HISTORY_SIZE);

    // 中间结果分区
    final PartitionReleaseStrategy.Factory partitionReleaseStrategyFactory =
        PartitionReleaseStrategyFactoryLoader.loadPartitionReleaseStrategyFactory(jobManagerConfig);

    // create a new execution graph, if none exists so far
    final ExecutionGraph executionGraph;
    try {
        // 创建新的ExecutionGraph
        executionGraph = (prior != null) ? prior :
            new ExecutionGraph(
                jobInformation,
                futureExecutor,
                ioExecutor,
                rpcTimeout,
                restartStrategy,
                maxPriorAttemptsHistoryLength,
                failoverStrategyFactory,
                slotProvider,
                classLoader,
                blobWriter,
                allocationTimeout,
                partitionReleaseStrategyFactory,
                shuffleMaster,
                partitionTracker,
                jobGraph.getScheduleMode());
    } catch (IOException e) {
        throw new JobException("Could not create the ExecutionGraph.", e);
    }

    // set the basic properties

    try {
        // 解析JobGraph生成Json形式的执行计划
        executionGraph.setJsonPlan(JsonPlanGenerator.generatePlan(jobGraph));
    }
    catch (Throwable t) {
        log.warn("Cannot create JSON plan for job", t);
        // give the graph an empty plan
        executionGraph.setJsonPlan("{}");
    }

    // initialize the vertices that have a master initialization hook
    // file output formats create directories here, input formats create splits

    final long initMasterStart = System.nanoTime();
    log.info("Running initialization on master for job {} ({}).", jobName, jobId);

    // 获取JobVertex,并在Master初始化
    for (JobVertex vertex : jobGraph.getVertices()) {
        String executableClass = vertex.getInvokableClassName();
        if (executableClass == null || executableClass.isEmpty()) {
            throw new JobSubmissionException(jobId,
                    "The vertex " + vertex.getID() + " (" + vertex.getName() + ") has no invokable class.");
        }

        try {
            vertex.initializeOnMaster(classLoader);
        }
        catch (Throwable t) {
                throw new JobExecutionException(jobId,
                        "Cannot initialize task '" + vertex.getName() + "': " + t.getMessage(), t);
        }
    }

    log.info("Successfully ran initialization on master in {} ms.",
            (System.nanoTime() - initMasterStart) / 1_000_000);

    // topologically sort the job vertices and attach the graph to the existing one
    // 获取从Source开始排序完成的DAG拓扑
    List<JobVertex> sortedTopology = jobGraph.getVerticesSortedTopologicallyFromSources();
    if (log.isDebugEnabled()) {
        log.debug("Adding {} vertices from job graph {} ({}).", sortedTopology.size(), jobName, jobId);
    }
    // 将JobGraph转化为ExecutionGraph操作
    executionGraph.attachJobGraph(sortedTopology);

    if (log.isDebugEnabled()) {
        log.debug("Successfully created execution graph from job graph {} ({}).", jobName, jobId);
    }

    // configure the state checkpointing
    // 配置CK
    JobCheckpointingSettings snapshotSettings = jobGraph.getCheckpointingSettings();
    if (snapshotSettings != null) {
        List<ExecutionJobVertex> triggerVertices =
                idToVertex(snapshotSettings.getVerticesToTrigger(), executionGraph);

        List<ExecutionJobVertex> ackVertices =
                idToVertex(snapshotSettings.getVerticesToAcknowledge(), executionGraph);

        List<ExecutionJobVertex> confirmVertices =
                idToVertex(snapshotSettings.getVerticesToConfirm(), executionGraph);

        CompletedCheckpointStore completedCheckpoints;
        CheckpointIDCounter checkpointIdCounter;
        try {
            int maxNumberOfCheckpointsToRetain = jobManagerConfig.getInteger(
                    CheckpointingOptions.MAX_RETAINED_CHECKPOINTS);

            if (maxNumberOfCheckpointsToRetain <= 0) {
                // warning and use 1 as the default value if the setting in
                // state.checkpoints.max-retained-checkpoints is not greater than 0.
                log.warn("The setting for '{} : {}' is invalid. Using default value of {}",
                        CheckpointingOptions.MAX_RETAINED_CHECKPOINTS.key(),
                        maxNumberOfCheckpointsToRetain,
                        CheckpointingOptions.MAX_RETAINED_CHECKPOINTS.defaultValue());

                maxNumberOfCheckpointsToRetain = CheckpointingOptions.MAX_RETAINED_CHECKPOINTS.defaultValue();
            }

            completedCheckpoints = recoveryFactory.createCheckpointStore(jobId, maxNumberOfCheckpointsToRetain, classLoader);
            checkpointIdCounter = recoveryFactory.createCheckpointIDCounter(jobId);
        }
        catch (Exception e) {
            throw new JobExecutionException(jobId, "Failed to initialize high-availability checkpoint handler", e);
        }

        // Maximum number of remembered checkpoints
        int historySize = jobManagerConfig.getInteger(WebOptions.CHECKPOINTS_HISTORY_SIZE);

        CheckpointStatsTracker checkpointStatsTracker = new CheckpointStatsTracker(
                historySize,
                ackVertices,
                snapshotSettings.getCheckpointCoordinatorConfiguration(),
                metrics);

        // load the state backend from the application settings
        final StateBackend applicationConfiguredBackend;
        final SerializedValue<StateBackend> serializedAppConfigured = snapshotSettings.getDefaultStateBackend();

        if (serializedAppConfigured == null) {
            applicationConfiguredBackend = null;
        }
        else {
            try {
                applicationConfiguredBackend = serializedAppConfigured.deserializeValue(classLoader);
            } catch (IOException | ClassNotFoundException e) {
                throw new JobExecutionException(jobId,
                        "Could not deserialize application-defined state backend.", e);
            }
        }

        final StateBackend rootBackend;
        try {
            rootBackend = StateBackendLoader.fromApplicationOrConfigOrDefault(
                    applicationConfiguredBackend, jobManagerConfig, classLoader, log);
        }
        catch (IllegalConfigurationException | IOException | DynamicCodeLoadingException e) {
            throw new JobExecutionException(jobId, "Could not instantiate configured state backend", e);
        }

        // instantiate the user-defined checkpoint hooks

        final SerializedValue<MasterTriggerRestoreHook.Factory[]> serializedHooks = snapshotSettings.getMasterHooks();
        final List<MasterTriggerRestoreHook<?>> hooks;

        if (serializedHooks == null) {
            hooks = Collections.emptyList();
        }
        else {
            final MasterTriggerRestoreHook.Factory[] hookFactories;
            try {
                hookFactories = serializedHooks.deserializeValue(classLoader);
            }
            catch (IOException | ClassNotFoundException e) {
                throw new JobExecutionException(jobId, "Could not instantiate user-defined checkpoint hooks", e);
            }

            final Thread thread = Thread.currentThread();
            final ClassLoader originalClassLoader = thread.getContextClassLoader();
            thread.setContextClassLoader(classLoader);

            try {
                hooks = new ArrayList<>(hookFactories.length);
                for (MasterTriggerRestoreHook.Factory factory : hookFactories) {
                    hooks.add(MasterHooks.wrapHook(factory.create(), classLoader));
                }
            }
            finally {
                thread.setContextClassLoader(originalClassLoader);
            }
        }

        final CheckpointCoordinatorConfiguration chkConfig = snapshotSettings.getCheckpointCoordinatorConfiguration();

        executionGraph.enableCheckpointing(
            chkConfig,
            triggerVertices,
            ackVertices,
            confirmVertices,
            hooks,
            checkpointIdCounter,
            completedCheckpoints,
            rootBackend,
            checkpointStatsTracker);
    }

    // create all the metrics for the Execution Graph
    // 创建监控指标
    metrics.gauge(RestartTimeGauge.METRIC_NAME, new RestartTimeGauge(executionGraph));
    metrics.gauge(DownTimeGauge.METRIC_NAME, new DownTimeGauge(executionGraph));
    metrics.gauge(UpTimeGauge.METRIC_NAME, new UpTimeGauge(executionGraph));
    // 注册监控
    executionGraph.getFailoverStrategy().registerMetrics(metrics);

    return executionGraph;
}

public void attachJobGraph(List<JobVertex> topologiallySorted) throws JobException {

    assertRunningInJobMasterMainThread();

    LOG.debug("Attaching {} topologically sorted vertices to existing job graph with {} " +
            "vertices and {} intermediate results.",
        topologiallySorted.size(),
        tasks.size(),
        intermediateResults.size());

    final ArrayList<ExecutionJobVertex> newExecJobVertices = new ArrayList<>(topologiallySorted.size());
    final long createTimestamp = System.currentTimeMillis();

    // 遍历JobVertex
    for (JobVertex jobVertex : topologiallySorted) {
        
        if (jobVertex.isInputVertex() && !jobVertex.isStoppable()) {
            this.isStoppable = false;
        }

        // create the execution job vertex and attach it to the graph
        ExecutionJobVertex ejv = new ExecutionJobVertex(
                this,
                jobVertex, // JobVertex
                1, // 并行度
                maxPriorAttemptsHistoryLength, // 历史记录中保留的先前执行尝试的最大次数
                rpcTimeout, // RPC通信的超时时间
                globalModVersion, // 全局恢复版本,每次全局恢复时都会递增
                createTimestamp); // 创建时间

        // 处理JobEdge,对每个JobEdge,获取对应的intermediateResults,并记录到本节点的输入上
        // 最后把每个ExecutorVertex和对应的intermediateResults关联起来
        ejv.connectToPredecessors(this.intermediateResults);

        ExecutionJobVertex previousTask = this.tasks.putIfAbsent(jobVertex.getID(), ejv);
        if (previousTask != null) {
            throw new JobException(String.format("Encountered two job vertices with ID %s : previous=[%s] / new=[%s]",
                jobVertex.getID(), ejv, previousTask));
        }

        for (IntermediateResult res : ejv.getProducedDataSets()) {
            IntermediateResult previousDataSet = this.intermediateResults.putIfAbsent(res.getId(), res);
            if (previousDataSet != null) {
                throw new JobException(String.format("Encountered two intermediate data set with ID %s : previous=[%s] / new=[%s]",
                    res.getId(), res, previousDataSet));
            }
        }

        this.verticesInCreationOrder.add(ejv);
        this.numVerticesTotal += ejv.getParallelism();
        newExecJobVertices.add(ejv);
    }

    // the topology assigning should happen before notifying new vertices to failoverStrategy
    executionTopology = new DefaultExecutionTopology(this);

    failoverStrategy.notifyNewVertices(newExecJobVertices);

    partitionReleaseStrategy = partitionReleaseStrategyFactory.createInstance(getSchedulingTopology());
}
```
