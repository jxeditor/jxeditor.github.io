---
title: Hudi如何集成Flink
date: 2021-05-11 10:33:17
categories: 大数据
tags: 
    - flink
    - hudi
---

> 直接看看hudi源码究竟做了些什么

<!-- more -->

## 配置参数的了解
```
org.apache.hudi.configuration.FlinkOptions
org.apache.hudi.streamer.FlinkStreamerConfig
主要是一些可以配置的参数,对使用的时候会有帮助
```

---

## 集成开始处
```java
和Iceberg一致
一般直接看resources/META-INF/services文件夹的org.apache.flink.table.factories.Factory,直接定位
org.apache.hudi.table.HoodieTableFactory

// 读取
@Override
public DynamicTableSource createDynamicTableSource(Context context) {
    FactoryUtil.TableFactoryHelper helper = FactoryUtil.createTableFactoryHelper(this, context);
    helper.validate();

    Configuration conf = (Configuration) helper.getOptions();
    TableSchema schema = TableSchemaUtils.getPhysicalSchema(context.getCatalogTable().getSchema());
    setupConfOptions(conf, context.getObjectIdentifier().getObjectName(), context.getCatalogTable(), schema);

    Path path = new Path(conf.getOptional(FlinkOptions.PATH).orElseThrow(() ->
        new ValidationException("Option [path] should not be empty.")));
    return new HoodieTableSource(
        schema,
        path,
        context.getCatalogTable().getPartitionKeys(),
        conf.getString(FlinkOptions.PARTITION_DEFAULT_NAME),
        conf);
}

// 写入
@Override
public DynamicTableSink createDynamicTableSink(Context context) {
    Configuration conf = FlinkOptions.fromMap(context.getCatalogTable().getOptions());
    TableSchema schema = TableSchemaUtils.getPhysicalSchema(context.getCatalogTable().getSchema());
    setupConfOptions(conf, context.getObjectIdentifier().getObjectName(), context.getCatalogTable(), schema);
    return new HoodieTableSink(conf, schema);
}
```

### 写入做了些什么
```java
# 先看下整体流程
@Override
public SinkRuntimeProvider getSinkRuntimeProvider(Context context) {
    return (DataStreamSinkProvider) dataStream -> {
      // 获取RowType
      RowType rowType = (RowType) schema.toRowDataType().notNull().getLogicalType();
      // 获取WITH配置,决定着Sink的并行度
      int numWriteTasks = conf.getInteger(FlinkOptions.WRITE_TASKS);
      StreamWriteOperatorFactory<HoodieRecord> operatorFactory = new StreamWriteOperatorFactory<>(conf);
      
      // DataStream中的RowData转换HoodieRecord
      DataStream<Object> pipeline = dataStream
          // 转化函数
          .map(new RowDataToHoodieFunction<>(rowType, conf), TypeInformation.of(HoodieRecord.class))
          // 避免多个子任务写入一个bucket
          .keyBy(HoodieRecord::getRecordKey)
          // 分配给不同的fileId
          .transform(
              "bucket_assigner",
              TypeInformation.of(HoodieRecord.class),
              new KeyedProcessOperator<>(new BucketAssignFunction<>(conf)))
          .uid("uid_bucket_assigner")
          // shuffle by fileId(bucket id)
          .keyBy(record -> record.getCurrentLocation().getFileId())
          // 写入hoodie
          .transform("hoodie_stream_write", TypeInformation.of(Object.class), operatorFactory)
          .uid("uid_hoodie_stream_write")
          .setParallelism(numWriteTasks);
      // 看是否需要开启压缩合并,压缩合并自带清除操作
      if (StreamerUtil.needsScheduleCompaction(conf)) {
        return pipeline.transform("compact_plan_generate",
            TypeInformation.of(CompactionPlanEvent.class),
            new CompactionPlanOperator(conf))
            .uid("uid_compact_plan_generate")
            .setParallelism(1) // plan generate must be singleton
            .keyBy(event -> event.getOperation().hashCode())
            .transform("compact_task",
                TypeInformation.of(CompactionCommitEvent.class),
                new KeyedProcessOperator<>(new CompactFunction(conf)))
            .setParallelism(conf.getInteger(FlinkOptions.COMPACTION_TASKS))
            .addSink(new CompactionCommitSink(conf))
            .name("compact_commit")
            .setParallelism(1); // compaction commit should be singleton
      } else {
        // 不开启则使用clean
        return pipeline.addSink(new CleanFunction<>(conf))
            .setParallelism(1)
            .name("clean_commits").uid("uid_clean_commits");
      }
    };
}

# RowDataToHoodieFunction
@Override
public void open(Configuration parameters) throws Exception {
    super.open(parameters);
    // Avro Schema
    this.avroSchema = StreamerUtil.getSourceSchema(this.config);
    // 创建RowData转换Hudi的GenericRecord的converter
    this.converter = RowDataToAvroConverters.createConverter(this.rowType);
    // 主键生成器
    this.keyGenerator = StreamerUtil.createKeyGenerator(FlinkOptions.flatOptions(this.config));
    // 数据加载
    this.payloadCreation = PayloadCreation.instance(config);
}

// 每来一条数据都会执行map方法,进行转换成HoodieRecord
@SuppressWarnings("unchecked")
@Override
public O map(I i) throws Exception {
    return (O) toHoodieRecord(i);
}

@SuppressWarnings("rawtypes")
private HoodieRecord toHoodieRecord(I record) throws Exception {
    
    GenericRecord gr = (GenericRecord) this.converter.convert(this.avroSchema, record);
    final HoodieKey hoodieKey = keyGenerator.getKey(gr);
    // 是否删除数据
    final boolean isDelete = record.getRowKind() == RowKind.DELETE;
    // 创建Payload
    HoodieRecordPayload payload = payloadCreation.createPayload(gr, isDelete);
    // Key+Payload组装成HoodieRecord
    return new HoodieRecord<>(hoodieKey, payload);
}

public HoodieRecordPayload<?> createPayload(GenericRecord record, boolean isDelete) throws Exception {
    // 是否合并,由write.insert.drop.duplicates,write.operation决定
    if (shouldCombine) {
        ValidationUtils.checkState(preCombineField != null);
        // 将重复数据进行合并,根据时间字段进行合并
        Comparable<?> orderingVal = (Comparable<?>) HoodieAvroUtils.getNestedFieldVal(record,
            preCombineField, false);
        return (HoodieRecordPayload<?>) constructor.newInstance(
            isDelete ? null : record, orderingVal);
    } else {
        return (HoodieRecordPayload<?>) this.constructor.newInstance(Option.of(record));
    }
}

# BucketAssignFunction
@Override
public void open(Configuration parameters) throws Exception {
    super.open(parameters);
    HoodieWriteConfig writeConfig = StreamerUtil.getHoodieClientConfig(this.conf);
    this.hadoopConf = StreamerUtil.getHadoopConf();
    // Hadoop+FlinkRuntimeContext
    this.context = new HoodieFlinkEngineContext(
        new SerializableConfiguration(this.hadoopConf),
        new FlinkTaskContextSupplier(getRuntimeContext()));
    // Bucket分配器
    this.bucketAssigner = BucketAssigners.create(
        getRuntimeContext().getIndexOfThisSubtask(), // 当前子任务
        getRuntimeContext().getNumberOfParallelSubtasks(), // 子任务并行度
        WriteOperationType.isOverwrite(WriteOperationType.fromValue(conf.getString(FlinkOptions.OPERATION))),
        HoodieTableType.valueOf(conf.getString(FlinkOptions.TABLE_TYPE)),
        context,
        writeConfig);
}

public static BucketAssigner create(
  int taskID,
  int numTasks,
  boolean isOverwrite,
  HoodieTableType tableType,
  HoodieFlinkEngineContext context,
  HoodieWriteConfig config) {
    if (isOverwrite) {
      return new OverwriteBucketAssigner(taskID, numTasks, context, config);
    }
    switch (tableType) {
      // 不同表类型
      case COPY_ON_WRITE:
        return new BucketAssigner(taskID, numTasks, context, config);
      case MERGE_ON_READ:
        return new DeltaBucketAssigner(taskID, numTasks, context, config);
      default:
        throw new AssertionError();
    }
}

@Override
public void processElement(I value, Context ctx, Collector<O> out) throws Exception {
    // 1. 将Record给BucketAssigner
    // 2. 查看Location的状态,有Location,发送
    // 3. 如果是INSERT,则BuckerAssigner确定位置,然后发送
    HoodieRecord<?> record = (HoodieRecord<?>) value;
    final HoodieKey hoodieKey = record.getKey();
    final BucketInfo bucketInfo;
    final HoodieRecordLocation location;

    // 数据集可能很大,处理会阻塞,默认情况下禁用
    if (bootstrapIndex && !partitionLoadState.contains(hoodieKey.getPartitionPath())) {
      // 如果从未加载分区记录,先加载记录
      loadRecords(hoodieKey.getPartitionPath());
    }
    // 只有更改的记录才需要查找位置的索引,仅追加的记录始终被识别为插入
    if (isChangingRecords && this.indexState.contains(hoodieKey)) {
      // 设置Instant为U,bucket标记为更新
      location = new HoodieRecordLocation("U", this.indexState.get(hoodieKey).getFileId());
      this.bucketAssigner.addUpdate(record.getPartitionPath(), location.getFileId());
    } else {
      bucketInfo = this.bucketAssigner.addInsert(hoodieKey.getPartitionPath());
      switch (bucketInfo.getBucketType()) {
        case INSERT:
          // INSERT bucket,Instant为I,下游操作可以检查Instant,知道是否是INSERT bucket.
          location = new HoodieRecordLocation("I", bucketInfo.getFileIdPrefix());
          break;
        case UPDATE:
          location = new HoodieRecordLocation("U", bucketInfo.getFileIdPrefix());
          break;
        default:
          throw new AssertionError();
      }
      if (isChangingRecords) {
        this.indexState.put(hoodieKey, location);
      }
    }
    record.unseal();
    record.setCurrentLocation(location);
    record.seal();
    out.collect((O) record);
}

# DeltaBucketAssigner--->BucketAssigner
主要还是看父类操作,子类只是获取小文件列表
public BucketInfo addUpdate(String partitionPath, String fileIdHint) {
    final String key = StreamerUtil.generateBucketKey(partitionPath, fileIdHint);
    if (!bucketInfoMap.containsKey(key)) {
      BucketInfo bucketInfo = new BucketInfo(BucketType.UPDATE, fileIdHint, partitionPath);
      bucketInfoMap.put(key, bucketInfo);
    }
    return bucketInfoMap.get(key);
}

public BucketInfo addInsert(String partitionPath) {
    // 对于新的插入,根据每个分区有多少条记录来计算Bucket
    List<SmallFile> smallFiles = getSmallFilesForPartition(partitionPath);

    // 先插入到小文件中
    for (SmallFile smallFile : smallFiles) {
      final String key = StreamerUtil.generateBucketKey(partitionPath, smallFile.location.getFileId());
      SmallFileAssignState assignState = smallFileAssignStates.get(key);
      assert assignState != null;
      if (assignState.canAssign()) {
        assignState.assign();
        // 创建新的Bucket,或者重用现有Bucket
        BucketInfo bucketInfo;
        if (bucketInfoMap.containsKey(key)) {
          // 向现有UpdateBucket分配插入
          bucketInfo = bucketInfoMap.get(key);
        } else {
          bucketInfo = addUpdate(partitionPath, smallFile.location.getFileId());
        }
        return bucketInfo;
      }
    }

    // 创建新的InsertBucket
    if (newFileAssignStates.containsKey(partitionPath)) {
      NewFileAssignState newFileAssignState = newFileAssignStates.get(partitionPath);
      if (newFileAssignState.canAssign()) {
        newFileAssignState.assign();
      }
      final String key = StreamerUtil.generateBucketKey(partitionPath, newFileAssignState.fileId);
      return bucketInfoMap.get(key);
    }
    BucketInfo bucketInfo = new BucketInfo(BucketType.INSERT, FSUtils.createNewFileIdPfx(), partitionPath);
    final String key = StreamerUtil.generateBucketKey(partitionPath, bucketInfo.getFileIdPrefix());
    bucketInfoMap.put(key, bucketInfo);
    newFileAssignStates.put(partitionPath, new NewFileAssignState(bucketInfo.getFileIdPrefix(), insertRecordsPerBucket));
    return bucketInfo;
}

# StreamWriteOperatorFactory
// 创建StreamWriteOperator
// 提供StreamWriteOperatorCoordinator
@Override
@SuppressWarnings("unchecked")
public <T extends StreamOperator<Object>> T createStreamOperator(StreamOperatorParameters<Object> parameters) {
    final OperatorID operatorID = parameters.getStreamConfig().getOperatorID();
    final OperatorEventDispatcher eventDispatcher = parameters.getOperatorEventDispatcher();

    this.operator.setOperatorEventGateway(eventDispatcher.getOperatorEventGateway(operatorID));
    this.operator.setup(parameters.getContainingTask(), parameters.getStreamConfig(), parameters.getOutput());
    this.operator.setProcessingTimeService(this.processingTimeService);
    eventDispatcher.registerEventHandler(operatorID, operator);
    return (T) operator;
}

@Override
public OperatorCoordinator.Provider getCoordinatorProvider(String s, OperatorID operatorID) {
    return new StreamWriteOperatorCoordinator.Provider(operatorID, this.conf);
}

# StreamWriteOperator
// 指定StreamWriteFunction
// 设置OperatorEventGateway

# StreamWriteFunction
// 处理数据,缓存数据,写出数据,完成后发送事件给OperatorCoordinator
private void bufferRecord(I value) {
    // 计算BucketID
    final String bucketID = getBucketID(value);

    // 获取Bucket
    DataBucket bucket = this.buckets.computeIfAbsent(bucketID,
        k -> new DataBucket(this.config.getDouble(FlinkOptions.WRITE_BATCH_SIZE)));
    boolean flushBucket = bucket.detector.detect(value);
    boolean flushBuffer = this.tracer.trace(bucket.detector.lastRecordSize);
    // 判断是否需要Flush数据
    if (flushBucket) {
      flushBucket(bucket);
      this.tracer.countDown(bucket.detector.totalSize);
      bucket.reset();
    } else if (flushBuffer) {
      // 找到缓存数据最多的Bucket
      List<DataBucket> sortedBuckets = this.buckets.values().stream()
          .sorted((b1, b2) -> Long.compare(b2.detector.totalSize, b1.detector.totalSize))
          .collect(Collectors.toList());
      final DataBucket bucketToFlush = sortedBuckets.get(0);
      // 写入文件
      flushBucket(bucketToFlush);
      this.tracer.countDown(bucketToFlush.detector.totalSize);
      bucketToFlush.reset();
    }
    // 都不满足则缓存起来
    bucket.records.add((HoodieRecord<?>) value);
}

@SuppressWarnings("unchecked, rawtypes")
private void flushBucket(DataBucket bucket) {
    // 获取PendingInstant
    final String instant = this.writeClient.getLastPendingInstant(this.actionType);

    if (instant == null) {
      // in case there are empty checkpoints that has no input data
      LOG.info("No inflight instant when flushing data, cancel.");
      return;
    }

    // if we are waiting for the checkpoint notification, shift the write instant time.
    boolean shift = confirming && StreamerUtil.equal(instant, this.currentInstant);
    final String flushInstant = shift ? StreamerUtil.instantTimePlus(instant, 1) : instant;

    List<HoodieRecord> records = bucket.records;
    ValidationUtils.checkState(records.size() > 0, "Data bucket to flush has no buffering records");
    if (config.getBoolean(FlinkOptions.INSERT_DROP_DUPS)) {
      records = FlinkWriteHelper.newInstance().deduplicateRecords(records, (HoodieIndex) null, -1);
    }
    // 写入文件
    final List<WriteStatus> writeStatus = new ArrayList<>(writeFunction.apply(records, flushInstant));
    final BatchWriteSuccessEvent event = BatchWriteSuccessEvent.builder()
        .taskID(taskID)
        .instantTime(instant) // the write instant may shift but the event still use the currentInstant.
        .writeStatus(writeStatus)
        .isLastBatch(false)
        .isEndInput(false)
        .build();
    // 发送成功事件给StreamWriteOperatorCoordinator
    this.eventGateway.sendEventToCoordinator(event);
}

# StreamWriteOperatorCoordinator
@Override
public void handleEventFromOperator(int i, OperatorEvent operatorEvent) {
    executor.execute(
        () -> {
          // no event to handle
          ValidationUtils.checkState(operatorEvent instanceof BatchWriteSuccessEvent,
              "The coordinator can only handle BatchWriteSuccessEvent");
          BatchWriteSuccessEvent event = (BatchWriteSuccessEvent) operatorEvent;
          // the write task does not block after checkpointing(and before it receives a checkpoint success event),
          // if it it checkpoints succeed then flushes the data buffer again before this coordinator receives a checkpoint
          // success event, the data buffer would flush with an older instant time.
          ValidationUtils.checkState(
              HoodieTimeline.compareTimestamps(instant, HoodieTimeline.GREATER_THAN_OR_EQUALS, event.getInstantTime()),
              String.format("Receive an unexpected event for instant %s from task %d",
                  event.getInstantTime(), event.getTaskID()));
          if (this.eventBuffer[event.getTaskID()] != null) {
            this.eventBuffer[event.getTaskID()].mergeWith(event);
          } else {
            this.eventBuffer[event.getTaskID()] = event;
          }
          // 是EndInput且所有事件都被接受
          if (event.isEndInput() && allEventsReceived()) {
            // 提交当前Instant
            commitInstant();
            // no compaction scheduling for batch mode
          }
        }, "handle write success event for instant %s", this.instant
    );
}
```
### 读取做了些什么
```java
@Override
public ScanRuntimeProvider getScanRuntimeProvider(ScanContext scanContext) {
    return new DataStreamScanProvider() {

      @Override
      public boolean isBounded() {
        // 是否有界
        return !conf.getBoolean(FlinkOptions.READ_AS_STREAMING);
      }

      @Override
      public DataStream<RowData> produceDataStream(StreamExecutionEnvironment execEnv) {
        @SuppressWarnings("unchecked")
        // 数据类型
        TypeInformation<RowData> typeInfo =
            (TypeInformation<RowData>) TypeInfoDataTypeConverter.fromDataTypeToTypeInfo(getProducedDataType());
        if (conf.getBoolean(FlinkOptions.READ_AS_STREAMING)) {
          // 流读,很眼熟哟,IceBerg也见过
          StreamReadMonitoringFunction monitoringFunction = new StreamReadMonitoringFunction(
              conf, FilePathUtils.toFlinkPath(path), metaClient, maxCompactionMemoryInBytes);
          InputFormat<RowData, ?> inputFormat = getInputFormat(true);
          if (!(inputFormat instanceof MergeOnReadInputFormat)) {
            throw new HoodieException("No successful commits under path " + path);
          }
          // InputFormat转换DataStream
          OneInputStreamOperatorFactory<MergeOnReadInputSplit, RowData> factory = StreamReadOperator.factory((MergeOnReadInputFormat) inputFormat);
          SingleOutputStreamOperator<RowData> source = execEnv.addSource(monitoringFunction, "streaming_source")
              .setParallelism(1)
              .uid("uid_streaming_source")
              .transform("split_reader", typeInfo, factory)
              .setParallelism(conf.getInteger(FlinkOptions.READ_TASKS))
              .uid("uid_split_reader");
          return new DataStreamSource<>(source);
        } else {
          // 有界
          InputFormatSourceFunction<RowData> func = new InputFormatSourceFunction<>(getInputFormat(), typeInfo);
          DataStreamSource<RowData> source = execEnv.addSource(func, asSummaryString(), typeInfo);
          return source.name("bounded_source")
              .setParallelism(conf.getInteger(FlinkOptions.READ_TASKS))
              .uid("uid_bounded_source");
        }
      }
    };
}

# StreamReadMonitoringFunction
// 监听用户提供的Hoodie表路径
// 决定读取和处理哪些文件
// 创建与这些文件对应的MergeOnReadInputSplit
// 将他们分配给下游任务进行处理
@VisibleForTesting
public void monitorDirAndForwardSplits(SourceContext<MergeOnReadInputSplit> context) {
    // 已完成的Instant
    metaClient.reloadActiveTimeline();
    HoodieTimeline commitTimeline = metaClient.getCommitsAndCompactionTimeline().filterCompletedInstants();
    if (commitTimeline.empty()) {
      LOG.warn("No splits found for the table under path " + path);
      return;
    }
    List<HoodieInstant> instants = filterInstantsWithStart(commitTimeline, this.issuedInstant);
    // 获取满足条件的最新Instant
    final HoodieInstant instantToIssue = instants.size() == 0 ? null : instants.get(instants.size() - 1);
    final InstantRange instantRange;
    if (instantToIssue != null) {
      if (this.issuedInstant != null) {
        // had already consumed an instant
        instantRange = InstantRange.getInstance(this.issuedInstant, instantToIssue.getTimestamp(),
            InstantRange.RangeType.OPEN_CLOSE);
      } else if (this.conf.getOptional(FlinkOptions.READ_STREAMING_START_COMMIT).isPresent()) {
        // first time consume and has a start commit
        final String specifiedStart = this.conf.getString(FlinkOptions.READ_STREAMING_START_COMMIT);
        instantRange = InstantRange.getInstance(specifiedStart, instantToIssue.getTimestamp(),
            InstantRange.RangeType.CLOSE_CLOSE);
      } else {
        // first time consume and no start commit,
        // would consume all the snapshot data PLUS incremental data set
        instantRange = null;
      }
    } else {
      LOG.info("No new instant found for the table under path " + path + ", skip reading");
      return;
    }
    // 生成InputSplit:
    // 1. 获取元数据;
    // 2. 过滤相对分区路径
    // 3. 筛选完整文件路径
    // 4. 使用步骤3文件路径作为文件系统视图的备份
    List<HoodieCommitMetadata> metadataList = instants.stream()
        .map(instant -> getCommitMetadata(instant, commitTimeline)).collect(Collectors.toList());
    Set<String> writePartitions = getWritePartitionPaths(metadataList);
    FileStatus[] fileStatuses = getWritePathsOfInstants(metadataList);
    if (fileStatuses.length == 0) {
      throw new HoodieException("No files found for reading in user provided path.");
    }

    HoodieTableFileSystemView fsView = new HoodieTableFileSystemView(metaClient, commitTimeline, fileStatuses);
    final String commitToIssue = instantToIssue.getTimestamp();
    final AtomicInteger cnt = new AtomicInteger(0);
    final String mergeType = this.conf.getString(FlinkOptions.MERGE_TYPE);
    List<MergeOnReadInputSplit> inputSplits = writePartitions.stream()
        .map(relPartitionPath -> fsView.getLatestMergedFileSlicesBeforeOrOn(relPartitionPath, commitToIssue)
        .map(fileSlice -> {
          Option<List<String>> logPaths = Option.ofNullable(fileSlice.getLogFiles()
              .sorted(HoodieLogFile.getLogFileComparator())
              .map(logFile -> logFile.getPath().toString())
              .collect(Collectors.toList()));
          String basePath = fileSlice.getBaseFile().map(BaseFile::getPath).orElse(null);
          return new MergeOnReadInputSplit(cnt.getAndAdd(1),
              basePath, logPaths, commitToIssue,
              metaClient.getBasePath(), maxCompactionMemoryInBytes, mergeType, instantRange);
        }).collect(Collectors.toList()))
        .flatMap(Collection::stream)
        .collect(Collectors.toList());

    for (MergeOnReadInputSplit split : inputSplits) {
      context.collect(split);
    }
    // update the issues instant time
    this.issuedInstant = commitToIssue;
}

# StreamReadOperator
@Override
public void processElement(StreamRecord<MergeOnReadInputSplit> element) {
    // 接受到InputSplit就放入队列
    splits.add(element.getValue());
    enqueueProcessSplits();
}

private void enqueueProcessSplits() {
    if (currentSplitState == SplitState.IDLE && !splits.isEmpty()) {
      currentSplitState = SplitState.RUNNING;
      // MailboxExecutor读取InputSplit的实际数据
      executor.execute(this::processSplits, "process input split");
    }
}
```