---
title: Flink实时维表Join之Redis
date: 2020-01-06 15:00:02
categories: 大数据
tags: 
    - flink
    - redis
---

> 支持Redis注册成表,并异步加载,需要自己实现,现在只支持String的keyvalue形式

<!-- more -->

实现的支持用的还是Java,使用是Scala,等有空的时候实现下scala支持
## Java类支持
**RedisAsyncLookupFunction**
```java
package com.test.flink.redis;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.async.RedisAsyncCommands;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.typeutils.RowTypeInfo;
import org.apache.flink.table.functions.AsyncTableFunction;
import org.apache.flink.table.functions.FunctionContext;
import org.apache.flink.types.Row;

import java.util.Collection;
import java.util.Collections;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * @Author: xs
 * @Date: 2020-01-03 17:21
 * @Description:
 */
public class RedisAsyncLookupFunction extends AsyncTableFunction<Row> {

    private final String[] fieldNames;
    private final TypeInformation[] fieldTypes;

    private transient RedisAsyncCommands<String, String> async;

    public RedisAsyncLookupFunction(String[] fieldNames, TypeInformation[] fieldTypes) {
        this.fieldNames = fieldNames;
        this.fieldTypes = fieldTypes;
    }

    @Override
    public void open(FunctionContext context) {
        //配置redis异步连接
        RedisClient redisClient = RedisClient.create("redis://hadoop02:6379/0");
        StatefulRedisConnection<String, String> connection = redisClient.connect();
        async = connection.async();
    }

    //每一条流数据都会调用此方法进行join
    public void eval(CompletableFuture<Collection<Row>> future, Object... paramas) {
        //表名、主键名、主键值、列名
        String[] info = {"userInfo", "userId", paramas[0].toString(), "userName"};
        String key = String.join(":", info);
        RedisFuture<String> redisFuture = async.get(key);

        redisFuture.thenAccept(new Consumer<String>() {
            @Override
            public void accept(String value) {
                future.complete(Collections.singletonList(Row.of(key, value, "aaa")));
                //todo
                // BinaryRow row = new BinaryRow(2);
            }
        });
    }

    @Override
    public TypeInformation<Row> getResultType() {
        return new RowTypeInfo(fieldTypes, fieldNames);
    }

    public static final class Builder {
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

        public RedisAsyncLookupFunction build() {
            return new RedisAsyncLookupFunction(fieldNames, fieldTypes);
        }
    }
}
```

**RedisAsyncLookupTableSource**
```java
package com.test.flink.redis;

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
public class RedisAsyncLookupTableSource implements StreamTableSource<Row>, LookupableTableSource<Row> {
    private final String[] fieldNames;
    private final TypeInformation[] fieldTypes;

    public RedisAsyncLookupTableSource(String[] fieldNames, TypeInformation[] fieldTypes) {
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
        return RedisAsyncLookupFunction.Builder.getBuilder()
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

        public RedisAsyncLookupTableSource build() {
            return new RedisAsyncLookupTableSource(fieldNames, fieldTypes);
        }
    }
}
```

---

## 实现
```scala
package com.test.flink.stream.dim.redis

import com.test.flink.redis.RedisAsyncLookupTableSource
import org.apache.flink.api.common.typeinfo.{BasicTypeInfo, TypeInformation, Types}
import org.apache.flink.api.scala._
import org.apache.flink.streaming.api.scala.{DataStream, StreamExecutionEnvironment}
import org.apache.flink.table.api.{DataTypes, EnvironmentSettings, TableSchema}
import org.apache.flink.api.java.io.jdbc.{JDBCAppendTableSink, JDBCOptions, JDBCUpsertTableSink}
import org.apache.flink.table.api.scala.{StreamTableEnvironment, _}
import org.apache.flink.types.Row

/**
 * @Author: xs
 * @Date: 2020-01-03 17:15
 * @Description:
 */
object DoubleStreamRedisDemo {
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

    val redisSource = RedisAsyncLookupTableSource.Builder.newBuilder().withFieldNames(Array("id", "name", "age"))
      .withFieldTypes(Array(Types.STRING, Types.STRING, Types.STRING))
      .build()
    tEnv.registerTableSource("info", redisSource)

    val sql =
    //"select t1.id,t1.user_click,t2.name" +
      "select * " +
        " from user_click_name as t1" +
        " join info FOR SYSTEM_TIME AS OF t1.proctime as t2" +
        " on t1.id = t2.id"

    val table = tEnv.sqlQuery(sql)
    val tableName = table.toString
    tEnv.toAppendStream[Row](table).print()
    //    val value2 = tEnv.toRetractStream[Row](table).filter(_._1).map(_._2)

    // ----------------------------------------------------------------------------

    // AppendTableSink
    val sinkA = JDBCAppendTableSink.builder()
      .setDrivername("com.mysql.jdbc.Driver")
      .setDBUrl("jdbc:mysql://localhost:3306/world?autoReconnect=true&failOverReadOnly=false&useSSL=false")
      .setUsername("root")
      .setPassword("123456")
      .setQuery("insert into test (uid) values (?)")
      .setBatchSize(1)
      .setParameterTypes(Types.STRING)
      .build()
    //    tEnv.registerTableSink("jdbcOutputTable", Array[String]("uid"), Array[TypeInformation[_]](BasicTypeInfo.STRING_TYPE_INFO), sinkA)
    
    // UpsertTableSink
    val sinkB = JDBCUpsertTableSink.builder()
      .setOptions(JDBCOptions.builder()
        .setDriverName("com.mysql.jdbc.Driver")
        .setDBUrl("jdbc:mysql://localhost:3306/world?autoReconnect=true&failOverReadOnly=false&useSSL=false")
        .setUsername("root")
        .setPassword("123456")
        .setTableName("test")
        .build())
      .setTableSchema(TableSchema.builder()
        .field("uid", DataTypes.STRING())
        .build())
      .setFlushIntervalMills(1)
      .build()
    // tEnv.registerTableSink("jdbcOutputTable", sinkB)

    // table.insertInto("jdbcOutputTable")
    //    val insertSQL = "insert into jdbcOutputTable (uid) select id from " + tableName
    //    tEnv.sqlUpdate(insertSQL)
    tEnv.execute("")
  }

  case class Demo(id: String, user_click: String, time: String)

}
```