---
title: Flink操作ES
date: 2019-07-02 14:53:01
categories: 大数据
tags: 
    - Flink
---

> 利用了Flink的Sink功能,将对ES的操作封装在自定义ElasticsearchSinkFunction类中.

<!-- more -->
## 代码
### 主实现
```scala
val addressList = new java.util.ArrayList[HttpHost]()
addressList.add(new HttpHost(ES_NAME, ES_PORT))
val hbaseDs = kafkaStream.map(x => {
  val result = new JSONObject(x)
  (result.getString("value"), 1)
})
hbaseDs.addSink(new ElasticsearchSink.Builder[(String, Int)](addressList, new TestElasticsearchSinkFunction).build())
```
### 自定义ElasticsearchSinkFunction类
```scala
package com.dev.flink.stream.es.entry

import com.dev.flink.stream.es.develop.{ES_INDEX, ES_TYPE}
import org.apache.flink.api.common.functions.RuntimeContext
import org.apache.flink.streaming.connectors.elasticsearch.{ElasticsearchSinkFunction, RequestIndexer}
import org.elasticsearch.action.update.UpdateRequest
import org.elasticsearch.common.xcontent.json.JsonXContent
import org.elasticsearch.script.Script

class TestElasticsearchSinkFunction extends ElasticsearchSinkFunction[(String, Int)] {
  override def process(data: (String, Int), runtimeContext: RuntimeContext, requestIndexer: RequestIndexer): Unit = {
    val id = data._1
    val content = JsonXContent.contentBuilder().startObject()
      .field("id", id)
      .field("word", data._1)
      .field("count", data._2)
      .endObject()
    //    val indexRequest = new IndexRequest().index(
    //      ES_INDEX
    //    ).`type`(
    //      ES_TYPE
    //    ).id(id).source(content)
    //    requestIndexer.add(indexRequest)
    //    val deleteRequest = new DeleteRequest().index(
    //      ES_INDEX
    //    ).`type`(
    //      ES_TYPE
    //    ).id(id)
    //
    //    requestIndexer.add(deleteRequest)

    val updateRequest1 = new UpdateRequest().index(
      ES_INDEX
    ).`type`(
      ES_TYPE
    ).id(id)
    .docAsUpsert(true).doc(content)

    val updateRequest = new UpdateRequest().index(
      ES_INDEX
    ).`type`(
      ES_TYPE
    ).id(id)
      .script(new Script("ctx._source.remove(\"word\")")).scriptedUpsert(true)
      //.docAsUpsert(true).doc(content)
    // doc对存在的数据进行修改,upsert对不存在的数据进行添加
    requestIndexer.add(updateRequest1)
    requestIndexer.add(updateRequest)
  }
}
```

---

## 总结
可以看到,对于ES的增删改查都在自定义ElasticsearchSinkFunction类中实现,支持IndexRequest,DeleteRequest,UpdateRequest,GetRequest