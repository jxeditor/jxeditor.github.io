---
title: Hudi初探
date: 2021-05-07 14:58:12
categories: 大数据
tags: hudi
---

> 从Hudi的使用到Hudi文件层次的记录,参考[狄杰blog](https://blog.csdn.net/weixin_47482194/article/details/116357831)

<!-- more -->

## 编译
```
git clone https://github.com/apache/hudi.git
mvn clean package -DskipTests
# 详细内容可参考https://github.com/apache/hudi/README.md

# 最终获得Hudi捆绑包
hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar

# 在Zeppelin配置Hudi捆绑包(这种方式会报错,放入$FLINK_HOME/lib下)
%flink.conf
flink.execution.jars /Users/xz/Local/Temps/hudi/packaging/hudi-flink-bundle/target/hudi-flink-bundle_2.11-0.9.0-SNAPSHOT.jar
# 错误信息
Caused by: java.lang.ClassNotFoundException: org.apache.hudi.common.metrics.LocalRegistry
```

---

## 使用
```sql
# Hudi使用的是Flink-1.12.*,注意版本问题

# 需要开启CK
%flink.conf
pipeline.time-characteristic EventTime
execution.checkpointing.interval 60000
execution.checkpointing.externalized-checkpoint-retention RETAIN_ON_CANCELLATION
state.backend filesystem
state.checkpoints.dir hdfs://mac:9000/flink/checkpoints

-- 模拟数据
CREATE TABLE gen_data (
    uuid STRING,
    name STRING,
    age  INT,
    order_time   TIMESTAMP(3)
) WITH (
  'connector' = 'datagen'
)

-- CLI将结果显示模式设置为tableau,这里用zeppelin,可以注释
-- set execution.result-mode=tableau;

CREATE TABLE t1(
  uuid VARCHAR(20), -- 要么给定uuid,要么PRIMARY KEY(field) NOT ENFORCED指定主键,否则会报错
  name VARCHAR(10),
  age INT,
  ts TIMESTAMP(3), -- ts是必须字段,在前面有介绍过,用来决定数据的新旧的
  `partition` VARCHAR(20)
)
PARTITIONED BY (`partition`)
WITH (
  'connector' = 'hudi',
  'path' = 'hdfs://mac:9000/t1',
  'write.tasks' = '1', -- default is 4 ,required more resource
  'compaction.tasks' = '1', -- default is 10 ,required more resource
  'table.type' = 'MERGE_ON_READ' -- this creates a MERGE_ON_READ table, by default is COPY_ON_WRITE
);

-- 插入初始数据
INSERT INTO t1 VALUES
  ('id1','Danny',23,TIMESTAMP '1970-01-01 00:00:01','par1'),
  ('id2','Stephen',33,TIMESTAMP '1970-01-01 00:00:02','par1'),
  ('id3','Julian',53,TIMESTAMP '1970-01-01 00:00:03','par2'),
  ('id4','Fabian',31,TIMESTAMP '1970-01-01 00:00:04','par2'),
  ('id5','Sophia',18,TIMESTAMP '1970-01-01 00:00:05','par3'),
  ('id6','Emma',20,TIMESTAMP '1970-01-01 00:00:06','par3'),
  ('id7','Bob',44,TIMESTAMP '1970-01-01 00:00:07','par4'),
  ('id8','Han',56,TIMESTAMP '1970-01-01 00:00:08','par4');
  
-- 进行查询
select * from t1;

-- 更新数据
insert into t1 values
  ('id1','Danny',27,TIMESTAMP '1970-01-01 00:00:01','par1');

-- 流查询
CREATE TABLE t2(
  uuid VARCHAR(20), -- you can use 'PRIMARY KEY NOT ENFORCED' syntax to mark the field as record key
  name VARCHAR(10),
  age INT,
  ts TIMESTAMP(3),
  `partition` VARCHAR(20)
)
PARTITIONED BY (`partition`)
WITH (
  'connector' = 'hudi',
  'path' = 'hdfs://mac:9000/t2',
  'table.type' = 'MERGE_ON_READ',
  'read.tasks' = '1', -- default is 4 ,required more resource
  'read.streaming.enabled' = 'true',  -- this option enable the streaming read
  'read.streaming.start-commit' = '20210316134557', -- specifies the start commit instant time
  'read.streaming.check-interval' = '4' -- specifies the check interval for finding new source commits, default 60s.
);
```

---

## 开始文件分析MOR
### 文件一览
```
.
├── .hoodie
│   ├── .aux
│   │   ├── .bootstrap
│   │   │   ├── .fileids
│   │   │   └── .partitions
│   │   ├── 20210510175131.compaction.requested
│   │   ├── 20210510181521.compaction.requested
│   │   ├── 20210510190422.compaction.requested
│   │   └── 20210511091552.compaction.requested
│   ├── .temp
│   │   ├── 20210510175131
│   │   │   └── par1
│   │   │       ├── 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet.marker.CREATE
│   │   │       ├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet.marker.CREATE
│   │   │       └── 75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet.marker.CREATE
│   │   ├── 20210510181521
│   │   │   └── par1
│   │   │       └── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510181521.parquet.marker.MERGE
│   │   └── 20210510190422
│   │       └── par1
│   │           └── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510190422.parquet.marker.MERGE
│   ├── 20210510174713.deltacommit
│   ├── 20210510174713.deltacommit.inflight
│   ├── 20210510174713.deltacommit.requested
......
│   ├── 20210510181212.rollback
│   ├── 20210510181212.rollback.inflight
......
│   ├── 20210510181521.commit
│   ├── 20210510181521.compaction.inflight
│   ├── 20210510181521.compaction.requested
......
│   ├── 20210511090334.clean
│   ├── 20210511090334.clean.inflight
│   ├── 20210511090334.clean.requested
......
│   ├── archived -- 归档目录,操作未达到默认值时,没有产生对应文件
│   └── hoodie.properties
└── par1
    ├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510181521.log.1_0-1-0
    ├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510190422.log.1_0-1-0
    ├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210511091552.log.1_0-1-2
    ├── .hoodie_partition_metadata
    ├── 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet
    ├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510181521.parquet
    ├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510190422.parquet
    └── 75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet
```

### .hoodie文件
```
# 逐层介绍文件中都由什么构成
# deltacommit
cat .hoodie/20210507163615.deltacommit
{
  "partitionToWriteStats" : { -- 分区明细
    "par1" : [ { -- 注意,这里是Json数组,我这一个分区只有一个文件所以只有一个对象
      "fileId" : "de05d871-e8b5-4049-beb5-bed87e50586a", -- 每一个分区中文件分片的唯一标识
      "path" : "par1/.de05d871-e8b5-4049-beb5-bed87e50586a_20210507163615.log.1_0-1-0", -- 写入的日志文件路径
      "prevCommit" : "20210507163615", -- 上一次提交成功的标识,首次,所以指定自己
      "numWrites" : 2, -- 写入记录数
      "numDeletes" : 0, -- 删除记录数
      "numUpdateWrites" : 0, -- 更新记录数
      "numInserts" : 2, -- 插入记录数
      "totalWriteBytes" : 1074, -- 总写入大小
      "totalWriteErrors" : 0, --  总写入错误数
      "tempPath" : null, -- 临时路径
      "partitionPath" : "par1", -- 分区路径
      "totalLogRecords" : 0, -- 总日志记录数
      "totalLogFilesCompacted" : 0, -- 总压缩日志文件数
      "totalLogSizeCompacted" : 0, -- 总压缩日志大小
      "totalUpdatedRecordsCompacted" : 0, -- 总压缩更新记录数
      "totalLogBlocks" : 0, -- 总日志块数量
      "totalCorruptLogBlock" : 0, -- 总损坏日志块数量
      "totalRollbackBlocks" : 0, -- 总回滚块数量
      "fileSizeInBytes" : 1074, -- 文件大小
      "minEventTime" : null, -- 最小事件时间
      "maxEventTime" : null, -- 最大事件时间
      "logVersion" : 1, -- 日志版本
      "logOffset" : 0, -- 日志偏移量
      "baseFile" : "", -- 基本文件,每次读取baseFile和logFiles合并,就是实时数据
      "logFiles" : [ ".de05d871-e8b5-4049-beb5-bed87e50586a_20210507163615.log.1_0-1-0" ]
    } ],
    "par2" : ...,
    "par3" : ...,
    "par4" : ...
  },
  "compacted" : false, -- 是否压缩合并
  "extraMetadata" : { -- 元数据信息
    "schema" : "{\"type\":\"record\",\"name\":\"record\",\"fields\":[{\"name\":\"uuid\",\"type\":[\"null\",\"string\"],\"default\":null},{\"name\":\"name\",\"type\":[\"null\",\"string\"],\"default\":null},{\"name\":\"age\",\"type\":[\"null\",\"int\"],\"default\":null},{\"name\":\"ts\",\"type\":[\"null\",{\"type\":\"long\",\"logicalType\":\"timestamp-millis\"}],\"default\":null},{\"name\":\"partition\",\"type\":[\"null\",\"string\"],\"default\":null}]}"
  },
  "operationType" : null, -- 操作类型
  "totalCreateTime" : 0,
  "totalScanTime" : 0,
  "totalCompactedRecordsUpdated" : 0,
  "totalLogFilesCompacted" : 0,
  "totalLogFilesSize" : 0,
  "minAndMaxEventTime" : {
    "Optional.empty" : {
      "val" : null,
      "present" : false
    }
  },
  "fileIdAndRelativePaths" : { -- fileId和对应的相对路径
    "1208697c-3b27-4a48-9389-f345c137c763" : "par4/.1208697c-3b27-4a48-9389-f345c137c763_20210507163615.log.1_0-1-0",
    "de05d871-e8b5-4049-beb5-bed87e50586a" : "par1/.de05d871-e8b5-4049-beb5-bed87e50586a_20210507163615.log.1_0-1-0",
    "918a682e-caff-462a-93c0-8b18a178e809" : "par2/.918a682e-caff-462a-93c0-8b18a178e809_20210507163615.log.1_0-1-0",
    "cfd22631-84c7-4a79-8f90-6fc13a0bbb6d" : "par3/.cfd22631-84c7-4a79-8f90-6fc13a0bbb6d_20210507163615.log.1_0-1-0"
  },
  "totalRecordsDeleted" : 0,
  "totalLogRecordsCompacted" : 0,
  "writePartitionPaths" : [ "par1", "par2", "par3", "par4" ], -- 写入的分区路径
  "totalUpsertTime" : 3331
}

# compaction
avro-tools tojson .hoodie/20210510175131.compaction.requested
{
    "operations":{
        "array":[
            {
                "baseInstantTime":{
                    "string":"20210510174713" -- 基于什么操作
                },
                "deltaFilePaths":{
                    "array":[
                        ".39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510174713.log.1_0-1-0" -- log_file路径
                    ]
                },
                "dataFilePath":null, base_file路径,第一次所以没有
                "fileId":{
                    "string":"39798d42-eb9f-46c7-aece-bdbe9fed3c45" -- 文件id
                },
                "partitionPath":{
                    "string":"par1" -- 分区
                },
                "metrics":{ -- 指标
                    "map":{
                        "TOTAL_LOG_FILES":"1.0",
                        "TOTAL_IO_READ_MB":"0.0",
                        "TOTAL_LOG_FILES_SIZE":"392692.0",
                        "TOTAL_IO_WRITE_MB":"120.0",
                        "TOTAL_IO_MB":"120.0"
                    }
                },
                "bootstrapFilePath":null -- 引导文件
            },
            ...,
            ...
        ]
    },
    "extraMetadata":null, -- 元数据
    "version":{
        "int":2 -- 版本
    }
}

# commit
cat .hoodie/20210510175131.commit
{
  "partitionToWriteStats" : {
    "par1" : [ {
      "fileId" : "39798d42-eb9f-46c7-aece-bdbe9fed3c45",
      "path" : "par1/39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet", -- 合并压缩后的路径
      "prevCommit" : "null", -- 之前的commit
      "numWrites" : 940,
      "numDeletes" : 0,
      "numUpdateWrites" : 0,
      "numInserts" : 940,
      "totalWriteBytes" : 612245,
      "totalWriteErrors" : 0,
      "tempPath" : null,
      "partitionPath" : "par1",
      "totalLogRecords" : 940,
      "totalLogFilesCompacted" : 1,
      "totalLogSizeCompacted" : 392692,
      "totalUpdatedRecordsCompacted" : 940,
      "totalLogBlocks" : 4,
      "totalCorruptLogBlock" : 0,
      "totalRollbackBlocks" : 0,
      "fileSizeInBytes" : 612245,
      "minEventTime" : null,
      "maxEventTime" : null
    }, {
      "fileId" : "75dff8c0-614a-43e9-83c7-452dfa1dc797",
      "path" : "par1/75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet",
      "prevCommit" : "null",
      "numWrites" : 300,
      "numDeletes" : 0,
      "numUpdateWrites" : 0,
      "numInserts" : 300,
      "totalWriteBytes" : 493134,
      "totalWriteErrors" : 0,
      "tempPath" : null,
      "partitionPath" : "par1",
      "totalLogRecords" : 300,
      "totalLogFilesCompacted" : 1,
      "totalLogSizeCompacted" : 124976,
      "totalUpdatedRecordsCompacted" : 300,
      "totalLogBlocks" : 1,
      "totalCorruptLogBlock" : 0,
      "totalRollbackBlocks" : 0,
      "fileSizeInBytes" : 493134,
      "minEventTime" : null,
      "maxEventTime" : null
    }, {
      "fileId" : "0a0110a8-b26b-4595-b5fb-b2388263ac54",
      "path" : "par1/0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet",
      "prevCommit" : "null",
      "numWrites" : 5,
      "numDeletes" : 0,
      "numUpdateWrites" : 0,
      "numInserts" : 5,
      "totalWriteBytes" : 437253,
      "totalWriteErrors" : 0,
      "tempPath" : null,
      "partitionPath" : "par1",
      "totalLogRecords" : 5,
      "totalLogFilesCompacted" : 1,
      "totalLogSizeCompacted" : 2918,
      "totalUpdatedRecordsCompacted" : 5,
      "totalLogBlocks" : 1,
      "totalCorruptLogBlock" : 0,
      "totalRollbackBlocks" : 0,
      "fileSizeInBytes" : 437253,
      "minEventTime" : null,
      "maxEventTime" : null
    } ]
  },
  "compacted" : true, -- 是否合并压缩
  "extraMetadata" : {
    "schema" : "{\"type\":\"record\",\"name\":\"record\",\"fields\":[{\"name\":\"uuid\",\"type\":[\"null\",\"string\"],\"default\":null},{\"name\":\"name\",\"type\":[\"null\",\"string\"],\"default\":null},{\"name\":\"age\",\"type\":[\"null\",\"int\"],\"default\":null},{\"name\":\"ts\",\"type\":[\"null\",{\"type\":\"long\",\"logicalType\":\"timestamp-millis\"}],\"default\":null},{\"name\":\"partition\",\"type\":[\"null\",\"string\"],\"default\":null}]}"
  },
  "operationType" : "UNKNOWN",
  "totalUpsertTime" : 0,
  "totalCreateTime" : 0,
  "totalScanTime" : 225,
  "totalCompactedRecordsUpdated" : 1245,
  "totalLogFilesCompacted" : 3,
  "totalLogFilesSize" : 520586,
  "minAndMaxEventTime" : {
    "Optional.empty" : {
      "val" : null,
      "present" : false
    }
  },
  "fileIdAndRelativePaths" : { -- 压缩后的文件路径
    "39798d42-eb9f-46c7-aece-bdbe9fed3c45" : "par1/39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet",
    "75dff8c0-614a-43e9-83c7-452dfa1dc797" : "par1/75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet",
    "0a0110a8-b26b-4595-b5fb-b2388263ac54" : "par1/0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet"
  },
  "totalRecordsDeleted" : 0,
  "totalLogRecordsCompacted" : 1245,
  "writePartitionPaths" : [ "par1" ]
}


# rollback(取消任务再重新执行任务)
avro-tools tojson t1/.hoodie/20210510181212.rollback
{
    "startRollbackTime":"20210510181212", -- 开始rollback的时间
    "timeTakenInMillis":33, -- rollback耗时
    "totalFilesDeleted":0, -- 共删除文件
    "commitsRollback":[
        "20210510175331" -- 回滚操作
    ],
    "partitionMetadata":{ -- 元数据
        "par1":{
            "partitionPath":"par1",
            "successDeleteFiles":[

            ],
            "failedDeleteFiles":[

            ],
            "rollbackLogFiles":{
                "map":{

                }
            },
            "writtenLogFiles":{
                "map":{

                }
            }
        }
    },
    "version":{ -- 版本
        "int":1
    },
    "instantsRollback":[ -- 回滚操作
        {
            "commitTime":"20210510175331", -- commit时间
            "action":"deltacommit" -- commit类型
        }
    ]
}

# clean(清理)
# clean.requested
{
    "earliestInstantToRetain":{ -- 需要保留的操作,之前的操作将被清除掉
        "org.apache.hudi.avro.model.HoodieActionInstant":{
            "timestamp":"20210510181523",
            "action":"deltacommit",
            "state":"COMPLETED"
        }
    },
    "policy":"KEEP_LATEST_COMMITS", -- 清理策略,保留最新的commit
    "filesToBeDeletedPerPartition":{ -- 每个分区被删除的文件
        "map":{

        }
    },
    "version":{
        "int":2
    },
    "filePathsToBeDeletedPerPartition":{ -- 每个分区被删除的文件
        "map":{
            "par1":[
                {
                    "filePath":{
                        "string":"hdfs://mac:9000/t1/par1/39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet"
                    },
                    "isBootstrapBaseFile":{
                        "boolean":false
                    }
                },
                {
                    "filePath":{
                        "string":"hdfs://mac:9000/t1/par1/.39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510175131.log.1_0-1-0"
                    },
                    "isBootstrapBaseFile":{
                        "boolean":false
                    }
                }
            ]
        }
    }
}

# clean
{
    "startCleanTime":"20210511090334", -- 开始清除时间
    "timeTakenInMillis":618, -- 耗时
    "totalFilesDeleted":2, -- 删除文件数
    "earliestCommitToRetain":"20210510181523", -- 最早提交操作
    "partitionMetadata":{ -- 分区元数据
        "par1":{
            "partitionPath":"par1",
            "policy":"KEEP_LATEST_COMMITS",
            "deletePathPatterns":[ -- 删除文件正则
                "39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet",
                ".39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510175131.log.1_0-1-0"
            ],
            "successDeleteFiles":[ -- 成功删除文件
                "39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet",
                ".39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510175131.log.1_0-1-0"
            ],
            "failedDeleteFiles":[

            ]
        }
    },
    "version":{
        "int":2
    },
    "bootstrapPartitionMetadata":{
        "map":{

        }
    }
}
```
### .aux
```
.
├── .bootstrap -- 引导文件,将已有的表转化为Hudi表的操作
│   ├── .fileids
│   └── .partitions
├── 20210510175131.compaction.requested -- 和上一级目录下的压缩文件内容一致
├── 20210510181521.compaction.requested
├── 20210510190422.compaction.requested
└── 20210511091552.compaction.requested
```
### .temp
```
.
├── 20210510175131 -- 首次创建
│   └── par1
│       ├── 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet.marker.CREATE
│       ├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510175131.parquet.marker.CREATE
│       └── 75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet.marker.CREATE
├── 20210510181521 -- 第一次合并
│   └── par1
│       └── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510181521.parquet.marker.MERGE
└── 20210510190422 -- 第二次合并
    └── par1
        └── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510190422.parquet.marker.MERGE
```
### hoodie.properties
```
#Properties saved on Mon May 10 17:47:12 CST 2021
#Mon May 10 17:47:12 CST 2021
hoodie.compaction.payload.class=org.apache.hudi.common.model.OverwriteWithLatestAvroPayload -- 压缩类
hoodie.table.name=t1 -- 表名
hoodie.archivelog.folder=archived -- 归档文件
hoodie.table.type=MERGE_ON_READ -- 表类型
hoodie.table.version=1 -- 版本
hoodie.timeline.layout.version=1
```
### 数据文件
```
# 分为元数据,log_file和数据文件
.
├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510181521.log.1_0-1-0 -- log_file
├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210510190422.log.1_0-1-0
├── .39798d42-eb9f-46c7-aece-bdbe9fed3c45_20210511091552.log.1_0-1-2
├── .hoodie_partition_metadata -- 元数据
├── 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet -- 数据文件
├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510181521.parquet
├── 39798d42-eb9f-46c7-aece-bdbe9fed3c45_0-1-0_20210510190422.parquet
└── 75dff8c0-614a-43e9-83c7-452dfa1dc797_0-1-0_20210510175131.parquet

# .hoodie_partition_metadata
#partition metadata
#Mon May 10 17:47:30 CST 2021
commitTime=20210510174713
partitionDepth=1

# 数据文件
parquet-tools meta 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet >> meta.txt
extra:                  org.apache.hudi.bloomfilter = /////wAAAB4BACd9Pg.... -- 构建BloomFilter,将key值记录起来
extra:                  hoodie_min_record_key = 0233cab512845df34fec93538e60860bdb6dbb770731806a75eb194ca4e7dc1a13ceda88250e9f70d747697a392eb40c4cc3 -- 最小Key
extra:                  parquet.avro.schema = {"type":"record","name":"record","fields":[{"name":"_hoodie_commit_time","type":["null","string"],"doc":"","default":null},{"name":"_hoodie_commit_seqno","type":["null","string"],"doc":"","default":null},{"name":"_hoodie_record_key","type":["null","string"],"doc":"","default":null},{"name":"_hoodie_partition_path","type":["null","string"],"doc":"","default":null},{"name":"_hoodie_file_name","type":["null","string"],"doc":"","default":null},{"name":"uuid","type":["null","string"],"default":null},{"name":"name","type":["null","string"],"default":null},{"name":"age","type":["null","int"],"default":null},{"name":"ts","type":["null",{"type":"long","logicalType":"timestamp-millis"}],"default":null},{"name":"partition","type":["null","string"],"default":null}]}
extra:                  writer.model.name = avro
extra:                  hoodie_max_record_key = b9ae5bdd9eca29847501c5862d330a5055ef78574260b12a19dd9a3a910f45478b46489f0ad5274c90e057ded524b1d932f6 -- 最大Key

file schema:            record
--------------------------------------------------------------------------------
_hoodie_commit_time:    OPTIONAL BINARY L:STRING R:0 D:1
_hoodie_commit_seqno:   OPTIONAL BINARY L:STRING R:0 D:1
_hoodie_record_key:     OPTIONAL BINARY L:STRING R:0 D:1
_hoodie_partition_path: OPTIONAL BINARY L:STRING R:0 D:1
_hoodie_file_name:      OPTIONAL BINARY L:STRING R:0 D:1
uuid:                   OPTIONAL BINARY L:STRING R:0 D:1
name:                   OPTIONAL BINARY L:STRING R:0 D:1
age:                    OPTIONAL INT32 R:0 D:1
ts:                     OPTIONAL INT64 L:TIMESTAMP(MILLIS,true) R:0 D:1
partition:              OPTIONAL BINARY L:STRING R:0 D:1
extra:                  org.apache.hudi.bloomfilter = /////wAAAB4BACd9PgAA......, num_nulls: 0]
_hoodie_commit_seqno:    BINARY GZIP DO:0 FPO:112 SZ:86/155/1.80 VC:5 ENC:BIT_PACKED,RLE,PLAIN ST:[min: 20210510175131_0_1241, max: 20210510175131_0_1245, num_nulls: 0]
_hoodie_record_key:      BINARY GZIP DO:0 FPO:198 SZ:344/551/1.60 VC:5 ENC:BIT_PACKED,RLE,PLAIN ST:[min: 0233cab512845df34fec93538e60860bdb6dbb770731806a75eb194ca4e7dc1a13ceda88250e9f70d747697a392eb40c4cc3, max: b9ae5bdd9eca29847501c5862d330a5055ef78574260b12a19dd9a3a910f45478b46489f0ad5274c90e057ded524b1d932f6, num_nulls: 0]
_hoodie_partition_path:  BINARY GZIP DO:0 FPO:542 SZ:98/58/0.59 VC:5 ENC:BIT_PACKED,RLE,PLAIN_DICTIONARY ST:[min: par1, max: par1, num_nulls: 0]
_hoodie_file_name:       BINARY GZIP DO:0 FPO:640 SZ:154/121/0.79 VC:5 ENC:BIT_PACKED,RLE,PLAIN_DICTIONARY ST:[min: 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet, max: 0a0110a8-b26b-4595-b5fb-b2388263ac54_0-1-0_20210510175131.parquet, num_nulls: 0]
uuid:                    BINARY GZIP DO:0 FPO:794 SZ:344/551/1.60 VC:5 ENC:BIT_PACKED,RLE,PLAIN ST:[min: 0233cab512845df34fec93538e60860bdb6dbb770731806a75eb194ca4e7dc1a13ceda88250e9f70d747697a392eb40c4cc3, max: b9ae5bdd9eca29847501c5862d330a5055ef78574260b12a19dd9a3a910f45478b46489f0ad5274c90e057ded524b1d932f6, num_nulls: 0]
name:                    BINARY GZIP DO:0 FPO:1138 SZ:343/551/1.61 VC:5 ENC:BIT_PACKED,RLE,PLAIN ST:[min: 24f402db3830a56c82a39e83b2e6278d1e629c4447cbe7ddd3edaa2eda2bfef3d2f7a241ccb61d135565c4aef105793204ff, max: e415f52b9a6bc9b9f8e71bbd493aea76c9f272f5a63ffdcd3c0cd4f5ad4911acd9bdf002226c63363b44a764c5087ff59298, num_nulls: 0]
age:                     INT32 GZIP DO:0 FPO:1481 SZ:70/49/0.70 VC:5 ENC:BIT_PACKED,RLE,PLAIN ST:[min: 470087658, max: 1934377936, num_nulls: 0]
ts:                      INT64 GZIP DO:0 FPO:1551 SZ:102/67/0.66 VC:5 ENC:BIT_PACKED,RLE,PLAIN_DICTIONARY ST:[min: 2021-05-10T09:48:30.721+0000, max: 2021-05-10T09:48:30.728+0000, num_nulls: 0]
partition:               BINARY GZIP DO:0 FPO:1653 SZ:98/58/0.59 VC:5 ENC:BIT_PACKED,RLE,PLAIN_DICTIONARY ST:[min: par1, max: par1, num_nulls: 0]
```

---

## 开始文件分析COW
### 文件一览
```
.
├── .hoodie
│   ├── .aux
│   │   └── .bootstrap
│   │       ├── .fileids
│   │       └── .partitions
│   ├── .temp
│   ├── 20210511100234.commit
│   ├── 20210511100234.commit.requested
│   ├── 20210511100234.inflight
│   ├── 20210511100304.commit
│   ├── 20210511100304.commit.requested
│   ├── 20210511100304.inflight
│   ├── 20210511100402.commit
│   ├── 20210511100402.commit.requested
│   ├── 20210511100402.inflight
│   ├── 20210511100503.commit.requested
│   ├── 20210511100503.inflight
│   ├── archived
│   └── hoodie.properties
└── par1
    ├── .hoodie_partition_metadata
    ├── 48ca22d7-d503-4073-93ec-be7a33e6e8f4_0-1-0_20210511100234.parquet
    ├── 99aaf2d1-8e82-42d9-a982-65ed8d258f28_0-1-0_20210511100304.parquet
    └── 99aaf2d1-8e82-42d9-a982-65ed8d258f28_0-1-0_20210511100402.parquet
```
### .hoodie文件
```
# 记录的都是commit记录
.
├── .aux
│   └── .bootstrap
│       ├── .fileids
│       └── .partitions
├── .temp
├── 20210511100234.commit
├── 20210511100234.commit.requested
├── 20210511100234.inflight
├── 20210511100304.commit
├── 20210511100304.commit.requested
├── 20210511100304.inflight
├── 20210511100402.commit
├── 20210511100402.commit.requested
├── 20210511100402.inflight
├── 20210511100503.commit.requested
├── 20210511100503.inflight
├── archived
└── hoodie.properties
```
### 数据文件
```
# 未见log_file文件
.
├── .hoodie_partition_metadata
├── 48ca22d7-d503-4073-93ec-be7a33e6e8f4_0-1-0_20210511100234.parquet
├── 99aaf2d1-8e82-42d9-a982-65ed8d258f28_0-1-0_20210511100304.parquet
└── 99aaf2d1-8e82-42d9-a982-65ed8d258f28_0-1-0_20210511100402.parquet
```