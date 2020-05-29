---
title: Flink源码解析之五读取Hive流程
date: 2020-05-29 09:12:16
categories: 大数据
tags: flink
---

> 此流程是基于1.10.x版本的,对于1.11.x来说存在许多不足;所以根据问题去看源码

<!-- more -->

## 概览
```
// 将SqlNode去accept一个访问类
FlinkPlannerImpl
    validate()

// 获取Table信息
PreValidateReWriter
    visit()
        appendPartitionProjects()

// 将Table转换为CatalogTable
FlinkCalciteCatalogReader
    getTable()
        toPreparingTable()
            convertCatalogTable()

// 查找并创建TableSource
CatalogSourceTable
    findAndCreateTableSource()

// 创建TableSource
HiveTableFactory<-TableSourceFactory
    createTableSource()
        createHiveTableSource()

// 从StreamExecutionEnvironment获取DataStream并获取HiveTableInputFormat
HiveTableSource
    getDataStream()
        getInputFormat()

// 创建InputSplit并根据HiveTableInputSplit转换为对应的Reader
HiveTableInputFormat
    createInputSplits()
        open()
            nextRecord()

// 根据BaseRow添加字段信息转换为GenericRow
HiveMapredSplitReader/HiveVectorizedOrcSplitReader
    nextRecord()

// 实际运行,通过获取InputSplit循环调用Format执行nextRecord
DataSourceTask
    invoke()
```

---

## 问题
### 为什么Source并行度会很高,并且程序内无法控制?
```java
// HiveOptions
TABLE_EXEC_HIVE_FALLBACK_MAPRED_READER 默认值false
    false,使用FlinkNativeVectorizedReader去读取ORC文件
    true,使用HadooMapredRecordReader去读取ORC文件
TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM 默认值true
    false,Source的并行度在Config中设置
    true,并行度使用split数量
TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM_MAX 默认1000
    Source的最大并行度

// HiveTableSource.getDataStream
@Override
public DataStream<BaseRow> getDataStream(StreamExecutionEnvironment execEnv) {
    // 初始化分区,去查询元数据
    List<HiveTablePartition> allHivePartitions = initAllPartitions();

    @SuppressWarnings("unchecked")
    // 将字段进行转换
    TypeInformation<BaseRow> typeInfo =
            (TypeInformation<BaseRow>) TypeInfoDataTypeConverter.fromDataTypeToTypeInfo(getProducedDataType());
    // 去获取flink-conf.yaml文件中的配置
    Configuration conf = GlobalConfiguration.loadConfiguration();
    // 获取Reader
    HiveTableInputFormat inputFormat = getInputFormat(allHivePartitions, conf.getBoolean(HiveOptions.TABLE_EXEC_HIVE_FALLBACK_MAPRED_READER));
    DataStreamSource<BaseRow> source = execEnv.createInput(inputFormat, typeInfo);

    // 并行度获取,从Env中得到Source的默认并行度
    int parallelism = conf.get(ExecutionConfigOptions.TABLE_EXEC_RESOURCE_DEFAULT_PARALLELISM);
    // 默认为true,使用split数量
    if (conf.getBoolean(HiveOptions.TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM)) {
        int max = conf.getInteger(HiveOptions.TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM_MAX);
        if (max < 1) {
            throw new IllegalConfigurationException(
                    HiveOptions.TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM_MAX.key() +
                            " cannot be less than 1");
        }

        int splitNum;
        try {
            long nano1 = System.nanoTime();
            // 获取split数量
            splitNum = inputFormat.createInputSplits(0).length;
            long nano2 = System.nanoTime();
            LOG.info(
                    "Hive source({}}) createInputSplits use time: {} ms",
                    tablePath,
                    (nano2 - nano1) / 1_000_000);
        } catch (IOException e) {
            throw new FlinkHiveException(e);
        }
        // 并行度取两者最小值
        parallelism = Math.min(splitNum, max);
    }
    parallelism = limit > 0 ? Math.min(parallelism, (int) limit / 1000) : parallelism;
    parallelism = Math.max(1, parallelism);
    source.setParallelism(parallelism);
    return source.name(explainSource());
}

由于HiveOptions中TABLE_EXEC_HIVE_INFER_SOURCE_PARALLELISM为true
并且conf的获取为去配置文件中加载
所以在程序内设置并行度并不会生效
```
### 为什么写入的Parquet文件无法读取,字段会乱?
```java
/**
其实Flink去读取Hive,本质是获取分区数据路径
然后取读取HDFS文件,每一个文件就是一个Split,也对应一个并行度
读取完HDFS文件后,会根据其Parquet文件中的定义,生成一个字段数组
同时,SQL的SELECT操作,也会生成一个字段数组
由于代码的限制性,所以如果顺序错乱就会导致类型不匹配,或者数据错乱的问题
*/

// HiveMapredSplitReader
@Override
@SuppressWarnings("unchecked")
public BaseRow nextRecord(BaseRow reuse) throws IOException {
    if (reachedEnd()) {
        return null;
    }
    // 将BaseRow转换为GenericRow
    final GenericRow row = reuse instanceof GenericRow ?
            (GenericRow) reuse : new GenericRow(selectedFields.length);
    try {
        //Use HiveDeserializer to deserialize an object out of a Writable blob
        Object hiveRowStruct = deserializer.deserialize(value);
        // 循环遍历查找字段,注意查找字段是Int数组,代表字段在表中的位置,就是这里不合理
        for (int i = 0; i < selectedFields.length; i++) {
            // set non-partition columns
            if (selectedFields[i] < structFields.size()) {
                // stuctFields是读取split文件解析出来的字段列表,所以可能存在字段顺序不匹配
                StructField structField = structFields.get(selectedFields[i]);
                // 转换字段
                Object object = HiveInspectors.toFlinkObject(structField.getFieldObjectInspector(),
                        structObjectInspector.getStructFieldData(hiveRowStruct, structField), hiveShim);
                // 设置行,字段类型不一致就会报错
                row.setField(i, converters[i].toInternal(object));
            }
        }
    } catch (Exception e) {
        LOG.error("Error happens when converting hive data type to flink data type.");
        throw new FlinkHiveException(e);
    }
    if (!rowReused) {
        // set partition columns
        if (!partitionKeys.isEmpty()) {
            for (int i = 0; i < selectedFields.length; i++) {
                if (selectedFields[i] >= structFields.size()) {
                    String partition = partitionKeys.get(selectedFields[i] - structFields.size());
                    row.setField(i, converters[i].toInternal(hiveTablePartition.getPartitionSpec().get(partition)));
                }
            }
        }
        rowReused = true;
    }
    this.fetched = false;
    return row;
}

// ArrayWritableObjectInspector.getStructFieldData
public Object getStructFieldData(Object data, StructField fieldRef) {
    if (data == null) {
        return null;
    } else if (data instanceof ArrayWritable) {
        // 整条数据,对应着数据类型的
        ArrayWritable arr = (ArrayWritable)data;
        // SELECT的字段
        ArrayWritableObjectInspector.StructFieldImpl structField = (ArrayWritableObjectInspector.StructFieldImpl)fieldRef;
        // 获取字段在表中的下标,去arr对应下标获取数据
        // 位置不对,获取到的数据就是错乱的
        return structField.getIndex() < arr.get().length ? arr.get()[structField.getIndex()] : null;
    } else if (data instanceof List) {
        return ((List)data).get(((ArrayWritableObjectInspector.StructFieldImpl)fieldRef).getIndex());
    } else {
        throw new UnsupportedOperationException("Cannot inspect " + data.getClass().getCanonicalName());
    }
}
```

