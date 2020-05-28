---
title: Flink源码解析之三JobGraph提交
date: 2020-05-28 10:29:26
categories: 大数据
tags: flink
---

> 在Client端生成的两个Graph都已经生成完毕,这时候需要实现客户端到服务端的一个过渡

<!-- more -->

## 前提介绍
### JobClient
```
JobClient(接口)
    ClusterClientJobClientAdapter
        AbstractJobClusterExecutor
        ClusterClientJobClientAdapter
        RemoteExecutor
    PerJobMiniClusterJobClient
        LocalExecutor
    
getJobID
getJobStatus
cancel
stopWithSavepoint 待savePoint停止任务
triggerSavepoint 触发savePoint
getAccumulators 获取作业累加器
getJobExecutionResult 获取作业结果
```
### JobManagers
```
在服务端,也称Master
    协调分布式计算,负责调度任务,协调CK,协调故障恢复等
    每一个Job至少有一个JobManager,高可用部署下会有多个JobManagers,其中一个作为leader,其余处于standby状态
```
### TaskManagers
```
在服务端,也称Worker
    执行dataflow中的tasks(subtasks),并且缓存和交换数据streams
    每一个Job至少会有一个TaskManager
```

---

## 提交过程
### 入口
```java
此处仅分析AbstractSessionClusterExecutor
AbstractSessionClusterExecutor.execute()进行JobGraph生成,并获取Client进行提交

@Override
public CompletableFuture<JobClient> execute(@Nonnull final Pipeline pipeline, @Nonnull final Configuration configuration) throws Exception {
    // 生成JobGraph
    final JobGraph jobGraph = ExecutorUtils.getJobGraph(pipeline, configuration);

    // 生成Cluster描述
    try (final ClusterDescriptor<ClusterID> clusterDescriptor = clusterClientFactory.createClusterDescriptor(configuration)) {
        // 获取ClusterID
        final ClusterID clusterID = clusterClientFactory.getClusterId(configuration);
        checkState(clusterID != null);
        
        // 根据ClusterID获取ClusterClient
        final ClusterClientProvider<ClusterID> clusterClientProvider = clusterDescriptor.retrieve(clusterID);
        
        ClusterClient<ClusterID> clusterClient = clusterClientProvider.getClusterClient();
        return clusterClient
                // 提交任务,此处submitJob对应两种实现
                // MiniClusterClient
                // RestClusterClient
                .submitJob(jobGraph)
                .thenApplyAsync(jobID -> (JobClient) new ClusterClientJobClientAdapter<>(
                        clusterClientProvider,
                        jobID))
                // 运行完成
                .whenComplete((ignored1, ignored2) -> clusterClient.close());
    }
}
```
### MiniClusterClient
```java
本地微型集群
根据JobGraph的信息,提取jar,生成JobFile
并通过BlobClient上传到Cluster

@Override
public CompletableFuture<JobID> submitJob(@Nonnull JobGraph jobGraph) {
    return miniCluster.submitJob(jobGraph).thenApply(JobSubmissionResult::getJobID);
}

MiniCluster
public CompletableFuture<JobSubmissionResult> submitJob(JobGraph jobGraph) {
    final CompletableFuture<DispatcherGateway> dispatcherGatewayFuture = getDispatcherGatewayFuture();
    // 获取Cluster地址信息
    final CompletableFuture<InetSocketAddress> blobServerAddressFuture = createBlobServerAddress(dispatcherGatewayFuture);
    // 提交jar并设置JobFile
    final CompletableFuture<Void> jarUploadFuture = uploadAndSetJobFiles(blobServerAddressFuture, jobGraph);
    final CompletableFuture<Acknowledge> acknowledgeCompletableFuture = jarUploadFuture
        .thenCombine(
            dispatcherGatewayFuture,
            // 最后交由Dispatcher类进行提交JobGraph
            (Void ack, DispatcherGateway dispatcherGateway) -> dispatcherGateway.submitJob(jobGraph, rpcTimeout))
        .thenCompose(Function.identity());
    return acknowledgeCompletableFuture.thenApply(
        (Acknowledge ignored) -> new JobSubmissionResult(jobGraph.getJobID()));
}

// 提交JobFile信息
private CompletableFuture<Void> uploadAndSetJobFiles(final CompletableFuture<InetSocketAddress> blobServerAddressFuture, final JobGraph job) {
    return blobServerAddressFuture.thenAccept(blobServerAddress -> {
        try {
            ClientUtils.extractAndUploadJobGraphFiles(job, () -> new BlobClient(blobServerAddress, miniClusterConfiguration.getConfiguration()));
        } catch (FlinkException e) {
            throw new CompletionException(e);
        }
    });
}
```
### RestClusterClient
```java
HTTP REST请求通信

@Override
public CompletableFuture<JobID> submitJob(@Nonnull JobGraph jobGraph) {
    // JobGraph落地成JobGraphFile
    CompletableFuture<java.nio.file.Path> jobGraphFileFuture = CompletableFuture.supplyAsync(() -> {
        try {
            final java.nio.file.Path jobGraphFile = Files.createTempFile("flink-jobgraph", ".bin");
            try (ObjectOutputStream objectOut = new ObjectOutputStream(Files.newOutputStream(jobGraphFile))) {
                objectOut.writeObject(jobGraph);
            }
            return jobGraphFile;
        } catch (IOException e) {
            throw new CompletionException(new FlinkException("Failed to serialize JobGraph.", e));
        }
    }, executorService);

    CompletableFuture<Tuple2<JobSubmitRequestBody, Collection<FileUpload>>> requestFuture = jobGraphFileFuture.thenApply(jobGraphFile -> {
        // JarFile名称
        List<String> jarFileNames = new ArrayList<>(8);
        List<JobSubmitRequestBody.DistributedCacheFile> artifactFileNames = new ArrayList<>(8);
        // 需要上传的File集合
        Collection<FileUpload> filesToUpload = new ArrayList<>(8);

        filesToUpload.add(new FileUpload(jobGraphFile, RestConstants.CONTENT_TYPE_BINARY));

        // 添加Jar到FileUpload集合中
        for (Path jar : jobGraph.getUserJars()) {
            jarFileNames.add(jar.getName());
            filesToUpload.add(new FileUpload(Paths.get(jar.toUri()), RestConstants.CONTENT_TYPE_JAR));
        }

        // 添加artifacts到FileUpload集合
        for (Map.Entry<String, DistributedCache.DistributedCacheEntry> artifacts : jobGraph.getUserArtifacts().entrySet()) {
            final Path artifactFilePath = new Path(artifacts.getValue().filePath);
            try {
                // Only local artifacts need to be uploaded.
                // 只添加本地的artifacts
                if (!artifactFilePath.getFileSystem().isDistributedFS()) {
                    artifactFileNames.add(new JobSubmitRequestBody.DistributedCacheFile(artifacts.getKey(), artifactFilePath.getName()));
                    filesToUpload.add(new FileUpload(Paths.get(artifacts.getValue().filePath), RestConstants.CONTENT_TYPE_BINARY));
                }
            } catch (IOException e) {
                throw new CompletionException(
                    new FlinkException("Failed to get the FileSystem of artifact " + artifactFilePath + ".", e));
            }
        }

        // 封装成requestBody
        final JobSubmitRequestBody requestBody = new JobSubmitRequestBody(
            jobGraphFile.getFileName().toString(),
            jarFileNames,
            artifactFileNames);
        
        // 返回(请求主题,FileUpload集合)
        return Tuple2.of(requestBody, Collections.unmodifiableCollection(filesToUpload));
    });

    final CompletableFuture<JobSubmitResponseBody> submissionFuture = requestFuture.thenCompose(
        // 发送请求
        requestAndFileUploads -> sendRetriableRequest(
            JobSubmitHeaders.getInstance(),
            EmptyMessageParameters.getInstance(),
            requestAndFileUploads.f0,
            requestAndFileUploads.f1,
            isConnectionProblemOrServiceUnavailable())
    );

    // 删除临时文件
    submissionFuture
        .thenCombine(jobGraphFileFuture, (ignored, jobGraphFile) -> jobGraphFile)
        .thenAccept(jobGraphFile -> {
        try {
            Files.delete(jobGraphFile);
        } catch (IOException e) {
            LOG.warn("Could not delete temporary file {}.", jobGraphFile, e);
        }
    });

    // 返回提交结果
    return submissionFuture
        .thenApply(ignore -> jobGraph.getJobID())
        .exceptionally(
            (Throwable throwable) -> {
                throw new CompletionException(new JobSubmissionException(jobGraph.getJobID(), "Failed to submit JobGraph.", ExceptionUtils.stripCompletionException(throwable)));
            });
}

// 发送请求
private <M extends MessageHeaders<R, P, U>, U extends MessageParameters, R extends RequestBody, P extends ResponseBody> CompletableFuture<P>
	sendRetriableRequest(M messageHeaders, U messageParameters, R request, Collection<FileUpload> filesToUpload, Predicate<Throwable> retryPredicate) {
    return retry(() -> getWebMonitorBaseUrl().thenCompose(webMonitorBaseUrl -> {
        try {
            // 通过RestClient发送请求
            return restClient.sendRequest(webMonitorBaseUrl.getHost(), webMonitorBaseUrl.getPort(), messageHeaders, messageParameters, request, filesToUpload);
        } catch (IOException e) {
            throw new CompletionException(e);
        }
    }), retryPredicate);
}
```

---

## 结论
```
可以看到,Flink实际提交JobGraph有两种模式
    在本地测试运行时是开启了一个BLOB服务端进行对JobGraph信息的接收,使用BLOBClient进行提交
    而实际部署环境则是通过Rest请求进行提交

实际提交的信息则是从JobGraph提取出来的Jars和GraphFiles

至此Client方面的点已经梳理一遍了,关于对Job的取消,Job状态的获取
可以详细阅读RestClusterClient,同样是发送Rest请求
```