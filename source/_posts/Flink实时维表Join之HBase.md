---
title: Flink实时维表Join之HBase
date: 2020-01-06 15:56:34
categories: 大数据
tags: 
    - flink
    - hbase
---

> 支持HBase注册成表,并异步加载,需要自己实现

<!-- more -->

实现的支持用的还是Java,使用是Scala,等有空的时候实现下scala支持

## Java类支持
**HBaseAsyncLookupFunction**
```java
package com.test.flink.hbase;

import com.stumbleupon.async.Callback;
import com.stumbleupon.async.Deferred;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.async.RedisAsyncCommands;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.typeutils.RowTypeInfo;
import org.apache.flink.table.functions.AsyncTableFunction;
import org.apache.flink.table.functions.FunctionContext;
import org.apache.flink.types.Row;
import org.hbase.async.GetRequest;
import org.hbase.async.HBaseClient;
import org.hbase.async.KeyValue;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.concurrent.CompletableFuture;

/**
 * @Author: xs
 * @Date: 2020-01-03 17:21
 * @Description:
 */
public class HBaseAsyncLookupFunction extends AsyncTableFunction<Row> {

    private final String tableName;
    private final String[] fieldNames;
    private final TypeInformation[] fieldTypes;

    private transient HBaseClient hBaseClient;

    public HBaseAsyncLookupFunction(String tableName, String[] fieldNames, TypeInformation[] fieldTypes) {
        this.tableName = tableName;
        this.fieldNames = fieldNames;
        this.fieldTypes = fieldTypes;
    }

    @Override
    public void open(FunctionContext context) {
        hBaseClient = new HBaseClient("hadoop01,hadoop02,hadoop03");
    }

    //每一条流数据都会调用此方法进行join
    public void eval(CompletableFuture<Collection<Row>> future, Object... paramas) {
        //表名、主键名、主键值、列名
        String[] info = {"userInfo", "userId", paramas[0].toString(), "userName"};
        String key = String.join(":", info);
        GetRequest get = new GetRequest(tableName, key);
        Deferred<ArrayList<KeyValue>> arrayListDeferred = hBaseClient.get(get);
        arrayListDeferred.addCallbacks(new Callback<String, ArrayList<KeyValue>>() {
            @Override
            public String call(ArrayList<KeyValue> keyValues) throws Exception {
                String value;
                if (keyValues.size() == 0) {
                    value = null;
                } else {
                    StringBuilder valueBuilder = new StringBuilder();
                    for (KeyValue keyValue : keyValues) {
                        valueBuilder.append(new String(keyValue.value()));
                    }
                    value = valueBuilder.toString();
                }
                future.complete(Collections.singletonList(Row.of(key, value, "aaa")));
                return "";
            }
        }, new Callback<String, Exception>() {
            @Override
            public String call(Exception e) throws Exception {
                return "";
            }
        });
    }

    @Override
    public TypeInformation<Row> getResultType() {
        return new RowTypeInfo(fieldTypes, fieldNames);
    }

    public static final class Builder {
        private String tableName;
        private String[] fieldNames;
        private TypeInformation[] fieldTypes;

        private Builder() {
        }

        public static Builder getBuilder() {
            return new Builder();
        }

        public Builder withFieldNames(String[] fieldNames) {
            this.fieldNames = fieldNames;
            return this;
        }

        public Builder withFieldTypes(TypeInformation[] fieldTypes) {
            this.fieldTypes = fieldTypes;
            return this;
        }

        public Builder withTableName(String tableName) {
            this.tableName = tableName;
            return this;
        }

        public HBaseAsyncLookupFunction build() {
            return new HBaseAsyncLookupFunction(tableName, fieldNames, fieldTypes);
        }
    }
}
```

**HBaseAsyncLookupTableSource**
```java
package com.test.flink.hbase;

import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.typeutils.RowTypeInfo;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.table.api.TableSchema;
import org.apache.flink.table.functions.AsyncTableFunction;
import org.apache.flink.table.functions.TableFunction;
import org.apache.flink.table.sources.LookupableTableSource;
import org.apache.flink.table.sources.StreamTableSource;
import org.apache.flink.table.types.DataType;
import org.apache.flink.table.types.utils.TypeConversions;
import org.apache.flink.types.Row;

/**
 * @Author: xs
 * @Date: 2020-01-03 17:23
 * @Description:
 */
public class HBaseAsyncLookupTableSource implements StreamTableSource<Row>, LookupableTableSource<Row> {
    private final String tableName;
    private final String[] fieldNames;
    private final TypeInformation[] fieldTypes;

    public HBaseAsyncLookupTableSource(String tableName, String[] fieldNames, TypeInformation[] fieldTypes) {
        this.tableName = tableName;
        this.fieldNames = fieldNames;
        this.fieldTypes = fieldTypes;
    }

    //同步方法
    @Override
    public TableFunction<Row> getLookupFunction(String[] strings) {
        return null;
    }

    //异步方法
    @Override
    public AsyncTableFunction<Row> getAsyncLookupFunction(String[] strings) {
        return HBaseAsyncLookupFunction.Builder.getBuilder()
                .withTableName(tableName)
                .withFieldNames(fieldNames)
                .withFieldTypes(fieldTypes)
                .build();
    }

    //开启异步
    @Override
    public boolean isAsyncEnabled() {
        return true;
    }

    @Override
    public DataType getProducedDataType() {
        return TypeConversions.fromLegacyInfoToDataType(new RowTypeInfo(fieldTypes, fieldNames));
    }

    @Override
    public TableSchema getTableSchema() {
        return TableSchema.builder()
                .fields(fieldNames, TypeConversions.fromLegacyInfoToDataType(fieldTypes))
                .build();
    }

    @Override
    public DataStream<Row> getDataStream(StreamExecutionEnvironment environment) {
        throw new UnsupportedOperationException("do not support getDataStream");
    }

    public static final class Builder {
        private String tableName;
        private String[] fieldNames;
        private TypeInformation[] fieldTypes;

        private Builder() {
        }

        public static Builder newBuilder() {
            return new Builder();
        }

        public Builder withFieldNames(String[] fieldNames) {
            this.fieldNames = fieldNames;
            return this;
        }

        public Builder withFieldTypes(TypeInformation[] fieldTypes) {
            this.fieldTypes = fieldTypes;
            return this;
        }

        public Builder withTableName(String tableName) {
            this.tableName = tableName;
            return this;
        }

        public HBaseAsyncLookupTableSource build() {
            return new HBaseAsyncLookupTableSource(tableName, fieldNames, fieldTypes);
        }
    }
}
```

---

## 实现
```scala
package com.test.flink.stream.dim.hbase

import com.test.flink.hbase.HBaseAsyncLookupTableSource
import com.test.flink.redis.RedisAsyncLookupTableSource
import org.apache.flink.api.common.typeinfo.Types
import org.apache.flink.api.java.io.jdbc.{JDBCAppendTableSink, JDBCOptions, JDBCUpsertTableSink}
import org.apache.flink.api.scala._
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.scala.{StreamTableEnvironment, _}
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2020-01-03 17:15
 * @Description:
 */
object DoubleStreamHBaseDemo {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    val settings = EnvironmentSettings.newInstance()
      .useBlinkPlanner()
      .inStreamingMode()
      .build()
    val tEnv = StreamTableEnvironment.create(env, settings)
    val ds = env.socketTextStream("hadoop01", 9999, '\n')
    // 1000,good0c,1566375779658
    val demo = ds.flatMap(_.split(" ")).map(x => {
      val arr = x.split(",")
      Demo(arr(0), arr(1), arr(2))
    })

    tEnv.registerDataStream("user_click_name", demo, 'id, 'user_click, 'time, 'proctime.proctime)

    val hbaseSource = HBaseAsyncLookupTableSource.Builder.newBuilder()
      .withFieldNames(Array("id", "name", "age"))
      .withFieldTypes(Array(Types.STRING, Types.STRING, Types.STRING))
      .withTableName("user")
      .build()
    tEnv.registerTableSource("info", hbaseSource)

    val sql =
    //"select t1.id,t1.user_click,t2.name" +
      "select * " +
        " from user_click_name as t1" +
        " join info FOR SYSTEM_TIME AS OF t1.proctime as t2" +
        " on t1.id = t2.id"

    val table = tEnv.sqlQuery(sql)
    val tableName = table.toString
    tEnv.toAppendStream[Row](table).print()
    tEnv.execute("")
  }

  case class Demo(id: String, user_click: String, time: String)

}
```

