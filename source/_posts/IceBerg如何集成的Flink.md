---
title: IceBerg如何集成的Flink
date: 2021-04-28 11:34:01
categories: 大数据
tags:
    - iceberg
    - flink
---

> 再次膜拜SPI机制

<!-- more -->

## 直入主题
```
# Iceberg主要是在Flink中嵌入了一个新的Catalog
# 怎么嵌入?(和嵌入自定义表连接器一样)
Iceberg的iceberg-flink模块中定义了FlinkCatalogFactory
在使用CREATE CATALOG语法时,FLINK会根据WITH子句的参数去discover对应的工厂类进行操作
针对传递的参数将Catalog建立起来
```

---

## 怎么读取/写入数据呢?
### 入口
```
# 各种Catalog/Database/Table操作对应FlinkCatalog中的各种方法
# 那么表如何被获取到,并进行实例化呢?
FlinkCatalog.getFactory()创建了FlinkDynamicTableFactory

# 根据表的种类分为Source与Sink(熟悉的Flink自定义表)
@Override
public DynamicTableSource createDynamicTableSource(Context context) {
    # 表路径database.table
    ObjectPath objectPath = context.getObjectIdentifier().toObjectPath();
    # 加载器,根据config文件进行构造
    TableLoader tableLoader = createTableLoader(objectPath);
    # 获取表结构
    TableSchema tableSchema = TableSchemaUtils.getPhysicalSchema(context.getCatalogTable().getSchema());
    # 重头戏
    return new IcebergTableSource(tableLoader, tableSchema, context.getCatalogTable().getOptions(), context.getConfiguration());
}

@Override
public DynamicTableSink createDynamicTableSink(Context context) {
    ObjectPath objectPath = context.getObjectIdentifier().toObjectPath();
    TableLoader tableLoader = createTableLoader(objectPath);
    TableSchema tableSchema = TableSchemaUtils.getPhysicalSchema(context.getCatalogTable().getSchema());
    return new IcebergTableSink(tableLoader, tableSchema);
}
```
### 读取-转化为DataStream
```
# 创建DataStream(怎么创建?)
IcebergTableSource.createDataStream()

# 获取配置信息构造DataStream
FlinkSource.forRowData().*.build()

public DataStream<RowData> build() {
  Preconditions.checkNotNull(env, "StreamExecutionEnvironment should not be null");
  // 构造FlinkInputFormat获取输入ScanPlan
  FlinkInputFormat format = buildFormat();
  
  ScanContext context = contextBuilder.build();
  // 获取上下文
  TypeInformation<RowData> typeInfo = FlinkCompatibilityUtil.toTypeInfo(FlinkSchemaUtil.convert(context.project()));

  if (!context.isStreaming()) {
    // 批
    int parallelism = inferParallelism(format, context);
    return env.createInput(format, typeInfo).setParallelism(parallelism);
  } else {
    // 流
    // 如果是Restore状态会获取之前的SnapshotId
    // 如果不是则获取开始的SnapshotId
    StreamingMonitorFunction function = new StreamingMonitorFunction(tableLoader, context);

    String monitorFunctionName = String.format("Iceberg table (%s) monitor", table);
    String readerOperatorName = String.format("Iceberg table (%s) reader", table);
    // 返回DataStream
    return env.addSource(function, monitorFunctionName)
        .transform(readerOperatorName, typeInfo, StreamingReaderOperator.factory(format));
  }
}
```
### 写入-addSink
```
# 并行度是个迷,设置了也没有啥用,写死的1
FlinkSink.forRowData().*.build()
public DataStreamSink<RowData> build() {
  Preconditions.checkArgument(rowDataInput != null,
      "Please use forRowData() to initialize the input DataStream.");
  Preconditions.checkNotNull(tableLoader, "Table loader shouldn't be null");

  if (table == null) {
    tableLoader.open();
    try (TableLoader loader = tableLoader) {
      this.table = loader.loadTable();
    } catch (IOException e) {
      throw new UncheckedIOException("Failed to load iceberg table from table loader: " + tableLoader, e);
    }
  }

  // Find out the equality field id list based on the user-provided equality field column names.
  List<Integer> equalityFieldIds = Lists.newArrayList();
  if (equalityFieldColumns != null && equalityFieldColumns.size() > 0) {
    for (String column : equalityFieldColumns) {
      org.apache.iceberg.types.Types.NestedField field = table.schema().findField(column);
      Preconditions.checkNotNull(field, "Missing required equality field column '%s' in table schema %s",
          column, table.schema());
      equalityFieldIds.add(field.fieldId());
    }
  }

  // Convert the requested flink table schema to flink row type.
  RowType flinkRowType = toFlinkRowType(table.schema(), tableSchema);

  // Distribute the records from input data stream based on the write.distribution-mode.
  rowDataInput = distributeDataStream(rowDataInput, table.properties(), table.spec(), table.schema(), flinkRowType);

  // Chain the iceberg stream writer and committer operator.
  IcebergStreamWriter<RowData> streamWriter = createStreamWriter(table, flinkRowType, equalityFieldIds);
  IcebergFilesCommitter filesCommitter = new IcebergFilesCommitter(tableLoader, overwrite);

  this.writeParallelism = writeParallelism == null ? rowDataInput.getParallelism() : writeParallelism;

  DataStream<Void> returnStream = rowDataInput
      .transform(ICEBERG_STREAM_WRITER_NAME, TypeInformation.of(WriteResult.class), streamWriter)
      .setParallelism(writeParallelism)
      .transform(ICEBERG_FILES_COMMITTER_NAME, Types.VOID, filesCommitter)
      .setParallelism(1)
      .setMaxParallelism(1);

  return returnStream.addSink(new DiscardingSink())
      .name(String.format("IcebergSink %s", table.name()))
      .setParallelism(1);
}
```

