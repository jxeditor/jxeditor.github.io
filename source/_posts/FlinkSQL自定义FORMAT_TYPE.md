---
title: FlinkSQL自定义FORMAT_TYPE
date: 2020-06-11 11:18:43
categories: 大数据
tags: flink
---

> Flink本身的`format.type`目前支持`json`，`avro`，`csv`三种格式
> 对于涉及的源码会另开一章进行介绍

<!-- more -->

## 需求
```scala
FlinkSQL创建Kafka源表,数据格式为JSON,但是数据中有一些脏数据
这时候程序会直接报错停掉
Caused by: java.io.IOException: Failed to deserialize JSON object.

def createKafkaTable(): String = {
    """
      |CREATE TABLE demo1 (
      |    uid VARCHAR COMMENT 'uid',
      |    rid VARCHAR COMMENT 'rid'
      |)
      |WITH (
      |    'connector.type' = 'kafka', -- 使用 kafka connector
      |    'connector.version' = 'universal',  -- kafka 版本
      |    'connector.topic' = 'test',  -- kafka topic
      |    'connector.properties.0.key' = 'zookeeper.connect',  -- zk连接信息
      |    'connector.properties.0.value' = 'hosts:2181',  -- zk连接信息
      |    'connector.properties.1.key' = 'bootstrap.servers',  -- broker连接信息
      |    'connector.properties.1.value' = 'hosts:9092',  -- broker连接信息
      |    'connector.sink-partitioner' = 'fixed',
      |    'update-mode' = 'append',
      |    'format.type' = 'json',  -- 数据源格式为 json
      |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
      |)
    """.stripMargin
}
```

---

## 解决
### 自定义Factory
```java
package org.apache.flink.formats.custom;

import com.test.flink.CustomJsonRowDeserializationSchema;
import org.apache.flink.api.common.serialization.DeserializationSchema;
import org.apache.flink.api.common.serialization.SerializationSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.java.typeutils.RowTypeInfo;
import org.apache.flink.formats.json.JsonRowDeserializationSchema;
import org.apache.flink.formats.json.JsonRowSchemaConverter;
import org.apache.flink.formats.json.JsonRowSerializationSchema;
import org.apache.flink.table.descriptors.DescriptorProperties;
import org.apache.flink.table.descriptors.JsonValidator;
import org.apache.flink.table.factories.DeserializationSchemaFactory;
import org.apache.flink.table.factories.SerializationSchemaFactory;
import org.apache.flink.table.factories.TableFormatFactoryBase;
import org.apache.flink.types.Row;

import java.util.Map;

/**
 * @author XiaShuai on 2020/6/11.
 */
public class CustomJsonRowFormatFactory extends TableFormatFactoryBase<Row>
        implements SerializationSchemaFactory<Row>, DeserializationSchemaFactory<Row> {

    // 必须实现一个无参构造器
    public CustomJsonRowFormatFactory() {
        // custom就是你自定义的format.type
        super("custom", 1, true);
    }

    // 将参数转换为DescriptorProperties
    private static DescriptorProperties getValidatedProperties(Map<String, String> propertiesMap) {
        final DescriptorProperties descriptorProperties = new DescriptorProperties();
        descriptorProperties.putProperties(propertiesMap);

        // validate
        new JsonValidator().validate(descriptorProperties);

        return descriptorProperties;
    }

    // 重点: 创建DeserializationSchema,进行反序列化
    @Override
    public DeserializationSchema<Row> createDeserializationSchema(Map<String, String> properties) {
        final DescriptorProperties descriptorProperties = getValidatedProperties(properties);

        // create and configure
        final CustomJsonRowDeserializationSchema.Builder schema =
                new CustomJsonRowDeserializationSchema.Builder(createTypeInformation(descriptorProperties));

        return schema.build();
    }

    // 重点: 创建SerializationSchema,进行序列化
    @Override
    public SerializationSchema<Row> createSerializationSchema(Map<String, String> properties) {
        final DescriptorProperties descriptorProperties = getValidatedProperties(properties);
        return new JsonRowSerializationSchema.Builder(createTypeInformation(descriptorProperties)).build();
    }

    // 创建TypeInformation
    private TypeInformation<Row> createTypeInformation(DescriptorProperties descriptorProperties) {
        if (descriptorProperties.containsKey(JsonValidator.FORMAT_SCHEMA)) {
            return (RowTypeInfo) descriptorProperties.getType(JsonValidator.FORMAT_SCHEMA);
        } else if (descriptorProperties.containsKey(JsonValidator.FORMAT_JSON_SCHEMA)) {
            return JsonRowSchemaConverter.convert(descriptorProperties.getString(JsonValidator.FORMAT_JSON_SCHEMA));
        } else {
            return deriveSchema(descriptorProperties.asMap()).toRowType();
        }
    }
}
```
**注意** 由于是自定义Factory类,所以需要在resources文件夹下进行以下操作
```
创建文件夹
    META-INF/services
创建文件(注意文件名就是下面的字符串)
    org.apache.flink.table.factories.TableFactory
文件内容(自定义Factory类路径)
org.apache.flink.formats.custom.CustomJsonRowFormatFactory
```
### 创建自定义的DeSerializationSchema/SerializationSchema
```
此处可以参考以下实现
    org.apache.flink.formats.json.JsonRowSerializationSchema
    org.apache.flink.formats.json.JsonRowDeserializationSchema
不再赘述
```

---

## 使用
```scala
def createKafkaTable(): String = {
    """
      |CREATE TABLE demo1 (
      |    uid VARCHAR COMMENT 'uid',
      |    rid VARCHAR COMMENT 'rid'
      |)
      |WITH (
      |    'connector.type' = 'kafka', -- 使用 kafka connector
      |    'connector.version' = 'universal',  -- kafka 版本
      |    'connector.topic' = 'test',  -- kafka topic
      |    'connector.properties.0.key' = 'zookeeper.connect',  -- zk连接信息
      |    'connector.properties.0.value' = 'hosts:2181',  -- zk连接信息
      |    'connector.properties.1.key' = 'bootstrap.servers',  -- broker连接信息
      |    'connector.properties.1.value' = 'hosts:9092',  -- broker连接信息
      |    'connector.sink-partitioner' = 'fixed',
      |    'update-mode' = 'append',
      |    'format.type' = 'custom',  -- 数据源格式为解析换为自定义
      |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
      |)
    """.stripMargin
}
```