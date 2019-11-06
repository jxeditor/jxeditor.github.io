---
title: ES教程干货整理
date: 2018-07-05 14:27:14
categories: 大数据
tags: elk
---

> 没有什么比官网更加详细了,[传送门](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)

<!-- more -->

## 核心概念
### Near Realtime (NRT)
在ES中进行搜索是近实时的,意思是数据从写入ES到可以被searchable仅仅需要1秒钟,因此说基于ES执行的搜索和分析可以达到秒级

### Cluster
集群 , 集群是一个或多个node的集合,他们一起保存你存放进去的数据,用户可以在所有的node之间进行检索,一般的每个集群都会有一个唯一的名称标识,默认的名称标识为elasticsearch, 这个名字很重要,因为node想加入cluster时,需要这个名称信息

确保别在不同的环境中使用相同的集群名称,进而避免node加错集群的情况,一颗考虑下面的集群命名风格logging-stage和logging-dev和logging-pro

### Node
单台server就是一个node,他和cluster一样,也存在一个默认的名称,但是它的名称是通过UUID生成的随机串,当然用户也可以定制不同的名称,但是这个名字最好别重复,这个名称对于管理来说很在乎要,因为需要确定,当前网络中的哪台服务器,对应这个集群中的哪个节点

node存在一个默认的设置,默认的,当每一个node在启动时都会自动的去加入一个叫elasticsearch的节点,这就意味着,如果用户在网络中启动了多个node,他们会彼此发现,然后组成集群

在单个的cluster中,你可以拥有任意多的node,假如说你的网络上没有有其他正在运行的节点,然后你启动一个新的节点,这个新的节点自己会组件一个集群

### Index
Index是一类拥有相似属性的document的集合,比如你可以为消费者的数据创建一个index,为产品创建一个index,为订单创建一个index

index名称(必须是小写的字符), 当需要对index中的文档执行索引,搜索,更新,删除,等操作时,都需要用到这个index

一个集群中理论上你可以创建任意数量的index

### Type
Type可以作为index中的逻辑类别,为了更细的划分,比如用户数据type,评论数据type,博客数据type

在设计时,尽最大努力让拥有更多相同field的document会分为同一个type下

### Document
document就是ES中存储的一条数据,就像mysql中的一行记录一样,可以是一条用户的记录,一个商品的记录等等

### Shards & Replicas
elasticsearch6设置索引的默认分片数和副本数已经不是在elasticsearch.yml文件中了，而是使用了一个索引模板的东西。
```
# 创建索引的时候设置
PUT demo
{
    "settings" : {
        "index" : {
            "number_of_shards" : 3, 
            "number_of_replicas" : 2 
        }
    }
}

GET demo
 
# 在创建Maping的时候设置
PUT demo
{
    "settings" : {
        "number_of_shards" : 1
    },
    "mappings" : {
        "type1" : {
            "properties" : {
                "field1" : { "type" : "text" }
            }
        }
    }
}
```

---

## 入门探索
### 集群的健康状况
```
GET /_cat/health?v

epoch      timestamp cluster       status node.total node.data shards pri relo init unassign pending_tasks max_task_wait_time active_shards_percent
1572595632 16:07:12  elasticsearch yellow          1         1      5   5    0    0        5             0                  -                 50.0%
```
解读上面的信息,默认的集群名是elasticsearch,当前集群的status是yellow,后续列出来的是集群的分片信息,最后一个active_shards_percent表示当前集群中仅有一半shard是可用的

### 状态
存在三种状态分别是red green yellow
- green : 表示当前集群所有的节点全部可用
- yellow: 表示所有的数据是可以访问的,但是并不是所有的replica shard都是可以使用的(我现在是默认启动一个node,而ES又不允许同一个node的primary shard和replica shard共存,因此我当前的node中仅仅存在5个primary shard,为status为黄色)
- red: 集群宕机,数据不可访问

### 集群的索引信息
```
GET /_cat/indices?v

health status index              uuid                   pri rep docs.count docs.deleted store.size pri.store.size
yellow open   ai_answer_question cl_oJNRPRV-bdBBBLLL05g   5   1     203459            0    172.3mb        172.3mb
```
显示,状态yellow表示存在replica shard不可用, 存在5个primary shard,并且每一个primary shard都有一个replica shard , 一共20多万条文档,未删除过文档,文档占用的空间情况为172.3M

### 创建index
```
PUT /customer?pretty
```
ES 使用的RestfulAPI,新增使用put,这是个很亲民的举动

### 添加 or 修改
**如果是ES中没有过下面的数据则添加进去,如果存在了id=1的元素就修改(全量替换)**
- 格式:`PUT /index/type/id`

> **全量替换时,原来的document是没有被删除的,而是被标记为deleted,被标记成的deleted是不会被检索出来的,当ES中数据越来越多时,才会删除它**

```
PUT /customer/_doc/1?pretty
{
  "name": "John Doe"
}

{
  "_index": "customer",
  "_type": "_doc",
  "_id": "1",
  "_version": 1,
  "result": "created",
  "_shards": {
    "total": 2,
    "successful": 1,
    "failed": 0
  },
  "_seq_no": 0,
  "_primary_term": 1
}
```
**强制创建**,加添_create或者?op_type=create
```
PUT /customer/_doc/1?op_type=create
PUT /customer/_doc/1/_create
```
- 局部更新(Partial Update)

> **不指定id则新增document**

```
POST /customer/_doc?pretty
{
  "name": "Jane Doe"
}
```

> **指定id则进行doc的局部更新操作**

```
POST /customer/_doc/1?pretty
{
  "name": "Jane Doe"
}
```

> **并且POST相对于上面的PUT而言,不论是否存在相同内容的doc,只要不指定id,都会使用一个随机的串当成id,完成doc的插入**

> **Partial Update先获取document,再将传递过来的field更新进document的json中,将老的doc标记为deleted,再将创建document,相对于全量替换中间会省去两次网络请求**

### 检索
格式: `GET /index/type/`

```
GET /customer/_doc/1?pretty

{
  "_index": "customer",
  "_type": "_doc",
  "_id": "1",
  "_version": 1,
  "found": true,
  "_source": {
    "name": "John Doe"
  }
}
```

### 删除
删除一条document

> **大部分情况下,原来的document不会被立即删除,而是被标记为deleted,被标记成的deleted是不会被检索出来的,当ES中数据越来越多时,才会删除它**

```
DELETE /customer/_doc/1

{
  "_index": "customer",
  "_type": "_doc",
  "_id": "1",
  "_version": 2,
  "result": "deleted",
  "_shards": {
    "total": 2,
    "successful": 1,
    "failed": 0
  },
  "_seq_no": 1,
  "_primary_term": 1
}
```
删除index
```
DELETE /index1
DELETE /index1,index2
DELETE /index*
DELETE /_all

# 可以在elasticsearch.yml中将下面这个设置置为ture,表示禁止使用 DELETE /_all
action.destructive_required_name:true

{
  "acknowledged": true
}
```

### 更新文档
上面说了POST关键字,可以实现不指定id就完成document的插入, `POST` + `_update`关键字可以实现更新的操作

```
POST /customer/_doc/1/_update?pretty
{
  "doc": { "name": "changwu" }
}
```
> **POST+_update进行更新的动作依然需要执行id, 但是它相对于PUT来说,当使用POST进行更新时,id不存在的话会报错,而PUT则会认为这是在新增**

此外: 针对这种更新操作,ES会先删除原来的doc,然后插入这个新的doc

---

## document api
### multi-index & multi-type
- 检索所有索引下面的所有数据

```
/_search
```

- 搜索指定索引下的所有数据

```
/index/_search
```

- 更多模式

```
/index1/index2/_search
/*1/*2/_search
/index1/index2/type1/type2/_search
/_all/type1/type2/_search
```

### _mget api 批量查询

- 在docs中指定_index,_type,_id

```
GET /_mget
{
    "docs" : [
        {
            "_index" : "test",
            "_type" : "_doc",
            "_id" : "1"
        },
        {
            "_index" : "test",
            "_type" : "_doc",
            "_id" : "2"
        }
    ]
}
```

- 在URL中指定index

```
GET /test/_mget
{
    "docs" : [
        {
            "_type" : "_doc",
            "_id" : "1"
        },
        {
            "_type" : "_doc",
            "_id" : "2"
        }
    ]
}
```

- 在URL中指定 index和type

```
GET /test/type/_mget
{
    "docs" : [
        {
            "_id" : "1"
        },
        {
            "_id" : "2"
        }
    ]
}
```

- 在URL中指定index和type,并使用ids指定id范围

```
GET /test/type/_mget
{
    "ids" : ["1", "2"]
}
```

- 为不同的doc指定不同的过滤规则

```
GET /_mget
{
    "docs" : [
        {
            "_index" : "test",
            "_type" : "_doc",
            "_id" : "1",
            "_source" : false
        },
        {
            "_index" : "test",
            "_type" : "_doc",
            "_id" : "2",
            "_source" : ["field3", "field4"]
        },
        {
            "_index" : "test",
            "_type" : "_doc",
            "_id" : "3",
            "_source" : {
                "include": ["user"],
                "exclude": ["user.location"]
            }
        }
    ]
}
```

### _bulk api 批量增删改
#### 基本语法
```
{"action":{"metadata"}}\n
{"data"}\n
```
存在哪些类型的操作可以执行呢?
- delete: 删除文档
- create: _create 强制创建
- index: 表示普通的put操作,可以是创建文档也可以是全量替换文档
- update: 局部替换

**上面的语法中并不是人们习惯阅读的json格式,但是这种单行形式的json更具备高效的优势**

ES如何处理普通的json如下:
- 将json数组转换为JSONArray对象,这就意味着内存中会出现一份一模一样的拷贝,一份是json文本,一份是JSONArray对象

但是如果上面的单行JSON,ES直接进行切割使用,不会在内存中整一个数据拷贝出来

#### delete
delete比较好看仅仅需要一行json就ok
```
{ "delete" : { "_index" : "test", "_type" : "_doc", "_id" : "2" } }
```

#### create
两行json,第一行指明我们要创建的json的index,type以及id
第二行指明我们要创建的doc的数据
```
{ "create" : { "_index" : "test", "_type" : "_doc", "_id" : "3" } }
{ "field1" : "value3" }
```

#### index
相当于是PUT,可以实现新建或者是全量替换,同样是两行json
第一行表示将要新建或者是全量替换的json的index type 以及 id
第二行是具体的数据
```
{ "index" : { "_index" : "test", "_type" : "_doc", "_id" : "1" } }
{ "field1" : "value1" }
```

#### update
表示 parcial update,局部替换
他可以指定一个`retry_on_conflict`的特性,表示可以重试3次
```
POST _bulk
{ "update" : {"_id" : "1", "_type" : "_doc", "_index" : "index1", "retry_on_conflict" : 3} }
{ "doc" : {"field" : "value"} }
{ "update" : { "_id" : "0", "_type" : "_doc", "_index" : "index1", "retry_on_conflict" : 3} }
{ "script" : { "source": "ctx._source.counter += params.param1", "lang" : "painless", "params" : {"param1" : 1}}, "upsert" : {"counter" : 1}}
{ "update" : {"_id" : "2", "_type" : "_doc", "_index" : "index1", "retry_on_conflict" : 3} }
{ "doc" : {"field" : "value"}, "doc_as_upsert" : true }
{ "update" : {"_id" : "3", "_type" : "_doc", "_index" : "index1", "_source" : true} }
{ "doc" : {"field" : "value"} }
{ "update" : {"_id" : "4", "_type" : "_doc", "_index" : "index1"} }
{ "doc" : {"field" : "value"}, "_source": true}
```

### 滚动查询技术
滚动查询技术和分页技术在使用场景方面还是存在出入的,这里的滚动查询技术同样适用于系统在海量数据中进行检索,比如过一次性存在10条数据被命中可以被检索出来,那么性能一定会很差,这时可以选择使用滚动查询技术,一批一批的查询,直到所有的数据被查询完成他可以先搜索一批数据再搜索一批数据

采用基于_doc的排序方式会获得较高的性能

每次发送scroll请求,我们还需要指定一个scroll参数,指定一个时间窗口,每次搜索只要在这个时间窗口内完成就ok

示例
```
GET /index/type/_search?scroll=1m
{
    "query":{
        "match_all":{}
    },
    "sort":["_doc"],
    "size":3
}

{
  "_scroll_id": "DnF1ZXJ5VGhlbkZldGNoBQAAAAAAAACNFlJmWHZLTkFhU0plbzlHX01LU2VzUXcAAAAAAAAAkRZSZlh2S05BYVNKZW85R19NS1Nlc1F3AAAAAAAAAI8WUmZYdktOQWFTSmVvOUdfTUtTZXNRdwAAAAAAAACQFlJmWHZLTkFhU0plbzlHX01LU2VzUXcAAAAAAAAAjhZSZlh2S05BYVNKZW85R19NS1Nlc1F3",
  "took": 9,
  "timed_out": false,
  "_shards": {
    "total": 5,
    "successful": 5,
    "skipped": 0,
    "failed": 0
  },
  "hits": {
    "total": 2,
    "max_score": null,
    "hits": [
      {
        "_index": "my_index",
        "_type": "_doc",
        "_id": "2",
        "_score": null,
        "_source": {
          "title": "This is another document",
          "body": "This document has a body"
        },
        "sort": [
          0
        ]
      },
      {
        "_index": "my_index",
        "_type": "_doc",
        "_id": "1",
        "_score": null,
        "_source": {
          "title": "This is a document"
        },
        "sort": [
          0
        ]
      }
    ]
  }
}
```
再次滚动查询
```
GET /_search/scroll
{
    "scroll":"1m",
    "_scroll_id": "DnF1ZXJ5VGhlbkZldGNoBQAAAAAAAACNFlJmWHZLTkFhU0plbzlHX01LU2VzUXcAAAAAAAAAkRZSZlh2S05BYVNKZW85R19NS1Nlc1F3AAAAAAAAAI8WUmZYdktOQWFTSmVvOUdfTUtTZXNRdwAAAAAAAACQFlJmWHZLTkFhU0plbzlHX01LU2VzUXcAAAAAAAAAjhZSZlh2S05BYVNKZW85R19NS1Nlc1F3"
}
```

---

## _search api 搜索api
### query string search
`_search`API + 将请求写在URI中
```
GET /bank/_search?q=*&sort=account_number:asc&pretty
```
同样使用的是RestfulAPI, `q=*` ,表示匹配index=bank的下的所有doc,`sort=account_number:asc`表示告诉ES,结果按照account_number字段升序排序,`pretty`是告诉ES,返回一个漂亮的json格式的数据

上面的q还可以写成下面这样
```
GET /bank/_search?q=自定义field:期望的值
GET /bank/_search?q=+自定义field:期望的值
GET /bank/_search?q=-自定义field:期望的值

{
  "took" : 63,    // 耗费的时间
  "timed_out" : false,  // 是否超时了
  "_shards" : {   // 分片信息
    "total" : 5, // 总共5个分片,它的搜索请求会被打到5个分片上去,并且都成功了
    "successful" : 5,  // 
    "skipped" : 0, // 跳过了0个
    "failed" : 0 // 失败了0个
  },
  "hits" : {  //命中的情况
    "total" : 1000,  // 命中率 1000个
    "max_score" : null,  // 相关性得分,越相关就越匹配
    "hits" : [ {   
      "_index" : "bank",  // 索引
      "_type" : "_doc",   // type
      "_id" : "0",  // id 
      "sort": [0], 
      "_score" : null, // 相关性得分
                    // _source里面存放的是数据
      "_source" : {"account_number":0,"balance":16623,"firstname":"Bradshaw","lastname":"Mckenzie","age":29,"gender":"F","address":"244 Columbus Place","employer":"Euron","email":"bradshawmckenzie@euron.com","city":"Hobucken","state":"CO"}
    }, {
      "_index" : "bank",
      "_type" : "_doc",
      "_id" : "1",
      "sort": [1],
      "_score" : null,
      "_source" : {"account_number":1,"balance":39225,"firstname":"Amber","lastname":"Duke","age":32,"gender":"M","address":"880 Holmes Lane","employer":"Pyrami","email":"amberduke@pyrami.com","city":"Brogan","state":"IL"}
    }, ...
    ]
  }
}
```
指定超时时间: `GET /_search?timeout=10ms` 在进行优化时,可以考虑使用timeout, 比如: 正常来说我们可以在10s内获取2000条数据,但是指定了timeout,发生超时后我们可以获取10ms中获取到的 100条数据
### query dsl (domain specified language)
参见官网 [点击进入官网](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html)
`_search`API +将请求写在请求体中
```
GET /bank/_search
{
  "query": { "match_all": {} }, # 查询全部
  "query": { "match": {"name":"changwu zhu"} }, # 全文检索,户将输入的字符串拆解开,去倒排索引中一一匹配, 哪怕匹配上了一个也会将结果返回
  # 实际上,上面的操作会被ES转换成下面的格式
  #
  # {
  #    "bool":{
  #        "should":[
  #         {"term":{"title":"changwu"}},
  #         {"term":{"title":"zhu"}}
  #     ]
  #  }
  # }
  #
   "query": { 
     "match": { # 手动控制全文检索的精度,
        "name":{
            "query":"changwu zhu",
            "operator":"and",  # and表示,只有同时出现changwu zhu 两个词的doc才会被命中
            "minimum_should_match":"75%" # 去长尾,控制至少命中3/4才算是真正命中
        }
     }
    }, # 全文检索,operator 表示
  # 添加上operator 操作会被ES转换成下面的格式,将上面的should转换成must
  #
  # {
  #    "bool":{
  #        "must":[
  #         {"term":{"title":"changwu"}},
  #         {"term":{"title":"zhu"}}
  #     ]
  #  }
  # }
  #
  # 添加上 minimum_should_match 操作会被ES转换成下面的格式 
  #
  # {
  #    "bool":{
  #        "should":[
  #         {"term":{"title":"changwu"}},
  #         {"term":{"title":"zhu"}}
  #     ],
  #       "minimum_should_match":3
  #  }
  # }
  #  
   "query": { 
     "match": { #控制权重, 
        "name":{
            "query":"changwu zhu",
            "boost":3  # 将name字段的权重提升成3,默认情况下,所有字段的权重都是样的,都是1
        }
     }
    },
   "query": { 
   # 这种用法不容忽略
     "dis_max": { # 直接取下面多个query中得分最高的query当成最终得分
        "queries":[
           {"match":{"name":"changwu zhu"}},
           {"match":{"content":"changwu"}}
        ]
     }
    },
    
    # best field策略
    "query": { # 基于 tie_breaker 优化dis_max
    # tie_breaker可以使dis_max考虑其他field的得分影响
       "multi_match":{
           "query":"用于去匹配的字段",
           "type":"most_fields",# 指定检索的策略most_fields
           "fields":["field1","field2","field3"]
       }
    },
    
    # most field 策略, 优先返回命中更多关键词的doc, (忽略从哪个,从多少个field中命中的,只要命中就行)
    "query": { # 基于 tie_breaker 优化dis_max
    # tie_breaker可以使dis_max考虑其他field的得分影响
     "dis_max": { # 直接取下面多个query中得分最高的query当成最终得分, 这也是best field策略
        "queries":[
           {"match":{"name":"changwu zhu"}},
           {"match":{"content":"changwu"}}
        ],
        "tie_breaker":0.4
     }
    },
    
    
  "query": { "match_none": {} }
  "query": { "term": {"test_field":"指定值"} } # 精确匹配
  "query": { "exits": {"field":"title"} } # title不为空(但是这时ES2.0中的用法,现在不再提供了)
  "query": {  # 短语检索 
              # 顺序的保证是通过 term position来保证的
              # 精准度很高,但是召回率低
         "match_phrase": { # 只有address字段中包含了完整的 mill lane (相连,顺序也不能变) 时,这个doc才算命中
             "address": "mill lane"
             } 
  },
   "query": {  # 短语检索 
         "match_phrase": { 
             "address": "mill lane",
             # 指定了slop就不再要求搜索term之间必须相邻,而是可以最多间隔slop距离
             # 在指定了slop参数的情况下,离关键词越近,移动的次数越少, relevance score 越高
             # match_phrase +  slop 和 proximity match 近似匹配作用类似
             # 平衡精准度和召回率
             "slop":1 # 指定搜索文本中的几个term经过几次移动后可以匹配到一个doc
             } 
  },
  
  # 混合使用match和match_phrase 平衡精准度和召回率
   "query": { 
      "bool": {  
      "must":  {
          # 全文检索虽然可以匹配到大量的文档,但是它不能控制词条之间的距离
          # 可能java elasticsearch在Adoc中距离很近,但是它却被ES排在结果集的后面
          # 它的性能比match_phrase高10倍,比proximity高20倍
         "match": {
            "address": "java elasticsearch" 
            } 
      },
      "should": {
         # 借助match_phrase+slop可以感知term position的功能,为距离相近的doc贡献分数,让它们靠前排列
          "match_phrase":{
              "title":{
                  "query":"java elasticsearch",
                  "slop":50
              }
          }
      }
  },
  
  # 重打分机制
   "query": { 
       "match":{
           "title":{
               "query":"java elasticsearch",
               "minimum_should_match":"50%"
           }
       },
       "rescore":{ # 对全文检索的结果进行重新打分
           "window_size":50,  # 对全文检索的前50条进行重新打分
           "query": { 
               "rescore_query":{ # 关键字
                    "match_phrase":{ # match_phrase + slop 感知 term persition,贡献分数
                       "title":{
                           "query":"java elasticsearch",
                           "slop":50
                  }
              }
          }
       }
   }
  
  # 前缀匹配, 相对于全文检索,前缀匹配是不会进行分词的,而且每次匹配都会扫描整个倒排索引,直到扫描完一遍才会停下来
  # 不会计算相关性得分,前缀越短拼配到的越多,性能越不好
  "query": { # 查询多个, 在下面指定的两个字段中检索含有 `this is a test`的doc
    "multi_match" : {
      "query":    "this is a test", 
      "fields": [ "subject", "message" ] 
    }
  },
  "query": { # 前缀搜索,搜索 user字段以ki开头的 doc
    "prefix" : { "user" : "ki" }
  },
  "query": { # 前缀搜索 + 添加权重
    "prefix" : { "user" :  { "value" : "ki", "boost" : 2.0 } }
  },
  
  # 通配符搜索
   "query": {
        "wildcard" : { "user" : "ki*y" }
    },
   "query": {
        "wildcard" : { "user" : { "value" : "ki*y", "boost" : 2.0 } }
    }
  # 正则搜索
   "query": {
        "regexp":{
            "name.first": "s.*y"
        }
    },
   "query": {# 正则搜索
        "regexp":{
            "name.first":{
                "value":"s.*y",
                "boost":1.2
            }
        }
    },
  # 搜索推荐, 类似于百度,当用户输入一个词条后,将其他符合条件的词条的选项推送出来
  # 原理和match_pharse相似,但是唯一的区别就是会将最后一个term当作前缀去搜索
  # 下例中: 使用quick brown进行match 使用f进行前缀搜索,使用slop调整term persition,贡献得分
   "query": {
      "match_phrase_prefix" : {# 前缀匹配
        "message" : {
                "query" : "quick brown f",
                "max_expansions" : 10, # 指定前缀最多匹配多少个term,超过这个数量就不在倒排索引中检索了,提升性能
                "slop":10
            }
       } 
  },
  # Function Score Query
  # 用户可以自定义一个function_secore 函数,然后将某个field的值和ES计算出来的分数进行运算
  # 最终实现对自己指定的field进行分数的增强功能
  "query": {
        "function_score": {
            "query": { "match_all": {} },
            "boost": "5",
            "random_score": {}, 
            "boost_mode":"multiply"
        }
    }, 
  
  # Fuzzy Query 模糊查询会提供容错的处理
   "query": {
        "fuzzy" : {
            "user" : {
                "value": "ki",
                "boost": 1.0,
                "fuzziness": 2, # 做大的纠错数量
                "prefix_length": 0,# 不会被“模糊化”的初始字符数。这有助于减少必须检查的术语的数量。默认值为0。
                "max_expansions": 100 # 模糊查询将扩展到的最大项数。默认值为50
                transpositions:true # 是否支持模糊变换(ab→ba)。默认的是假的
            }
        }
    }
  
  "query": {
    "bool": {  # 布尔查询, 最终通过将它内置must,should等查询的得分加起来/should,must的总数, 得到最终的得分
      "must": [ # 必须匹配到XXX, 并且会得出相关性得分
        { "match": { "address": "mill" } }, # address中必须包含mill
      ],
      # 在满足must的基础上,should条件不满足也可以,但是如果也匹配上了,相关性得分会增加
      # 如果没有must的话,should中的条件必须满足一个
      "should": [ # 指定可以包含的值, should是可以影响相关性得分的
        { "match": { "address": "lane" } }
      ],
      "must_not": [ # 一定不包含谁
        { "match": { "address": "mill" } },
      ],
      "filter": { # 对数据进行过滤
        "range": { # 按照范围过滤
          "balance": { # 指定过滤的字段
            "gte": 20000, # 高于20000
            "lte": 30000  # 低于30000
          }
        }
      }
    }
  }
```
> **在上面的组合查询中,每一个子查询都会计算一下他的相关性分数,然后由最外层的bool综合合并一个得分,但是 filter是不会计算分数的**

> **默认的排序规则是按照score降序排序,但像上面说的那样,如果全部都是filter的话他就不会计算得分,也就是说所有的得分全是1,这时候就需要定制排序规则,定义的语法我在上面写了**

### 其他辅助API
比如下面的高亮,排序,分页,以及`_source`指定需要的字段都可以进一步作用在`query`的结果上
```
  "highlight":{ # 高亮显示
    "fields":{  # 指定高亮的字段
      "balance":{}
  },
  "sort": [  # 指定排序条件
    { "account_number": "asc" } # 按照账户余额降序
  ],
  "from": 0, # 分页
  "size": 10, # 每页的大小4,通过执行size=0,可以实现仅显示聚合结果而不显示命中的信息详情
  "_source": ["account_number", "balance"], # 默认情况下,ES会返回全文JSON,通过_source可以指定返回的字段
```
### 聚合分析
**聚合分析是基于doc value这样一个数据结果进行的,前面有说过,这个doc value 其实就是正排索引, 聚合分析就是根据某一个字段进行分组,要求这个字段是不能被分词的,如果被聚合的字段被分词,按照倒排索引的方式去索引的话,就不得不去扫描整个倒排索引(才可能将被聚合的字段找全,效率很低)**
三个概念:
- 什么是bucket?
bucket就是聚合得到的结果
- 什么是metric?
metric就是对bucket进行分析,如最最大值,最小值,平均值
- 什么是下钻?
下钻就是在现有的分好组的bucket继续分组,比如一个先按性别分组,再按年龄分组

聚合的关键字: `aggs` 和 `query`地位并列
```
  
  # 使用聚合时,天然存在一个metric,就是当前bucket的count
  "aggs": { # 聚合
    "group_by_state": { # 自定义的名字
      "term": {
        "field": "balance" # 指定聚合的字段, 意思是 group by balance
      },
       "terms": { # terms
        "field": {"value1","value2","value3"} # 指定聚合的字段, 意思是 group by balance
      }
    }
  },    
  "aggs": { # 聚合中嵌套聚合
    "group_by_state": {
      "terms": {
        "field": "field1"
      },
      "aggs": { # 聚合中嵌套聚合
        "average_balance": {
          "avg": {
            "field": "field2"
          }
        }
      }
    }
  },
   "aggs": { #嵌套聚合,并且使用内部聚合的结果集
    "group_by_state": {
      "terms": {
        "field": "state.keyword",
        "order": {
          "average_balance": "desc" # 使用的下面聚合的结果集
        }
      },
      "aggs": {
        "average_balance": {
          "avg": {  # avg 求平均值  metric
            "field": "balance"
          }
        },
         "min_price": {
          "min": {  # metric 求最小值
            "field": "price"
          }
        },
         "max_price": {
          "max": {  # metric 求最大值
            "field": "price"
          }
        },
         "sum_price": {
          "sum": {  #  metric 计算总和
            "field": "price"
          }
        },
      }
    }
  },
   "aggs": { # 先按照年龄分组,在按照性别分组,再按照平均工资聚合
             # 最终的结果就得到了每个年龄段,每个性别的平均账户余额
    "group_by_age": {
      "range": {
        "field": "age",
        "ranges": [
          {
            "from": 20,
            "to": 30
          }
        ]
      },
      "aggs": {
        "group_by_gender": {
          "terms": {
            "field": "gender.keyword"
          },
          "aggs": {
            "average_balance": {
              "avg": {
                "field": "balance"
              }
            }
          }
        }
      },
      # histogram,类似于terms, 同样会进行bucket分组操作,接受一个field,按照这个field的值的各个范围区间进行分组操作
      # 比如我们指定为2000, 它会划分成这样 0-2000  2000-4000  4000-6000 ...
      "aggs": { # 聚合中嵌套聚合  
         "group_by_price": {
              "histogram": {
                 "field": "price",
                 "interval":2000
             },
         "aggs": { # 聚合中嵌套聚合
             "average_price": {
               "avg": {
                  "field": "price"
               }
           }
        }
    }
  },
  "aggs" : {
        "sales_over_time" : { # 根据日期进行聚合
            "date_histogram" : {
                "field" : "date",
                "interval" : "1M",# 一个月为一个跨度
                "format" : "yyyy-MM-dd",
                "min_doc_count":0 #即使这个区间中一条数据都没有,这个区间也要返回
            } 
        }
    }
    }
  }
}
```
#### filter aggregate
过滤加聚合,统计type=t-shirt的平均价格
```
POST /sales/_search?size=0
{
    "aggs" : {
        "t_shirts" : {
            "filter" : { "term": { "type": "t-shirt" } },
            "aggs" : {
                "avg_price" : { "avg" : { "field" : "price" } }
            }
        }
    }
}
```
#### 嵌套聚合-广度优先
说一个应用于场景: 我们检索电影的评论, 但是我们先按照演员分组聚合,在按照评论的数量进行聚合

分析: 如果我们选择深度优先的话, ES在构建演员电影相关信息时,会顺道计算出电影下面评论数的信息,假如说有10万个演员的话, 10万*10=100万个电影 每个电影下又有很多影评,接着处理影评, 就这样内存中可能会存在几百万条数据,但是我们最终就需要50条,这种开销是很大的

广度优先的话,是我们先处理电影数,而不管电影的评论数的聚合情况,先从10万演员中干掉99990条数据,剩下10个演员再聚合
```
"aggs":{
    "target_actors":{
        "terms":{
            "field":"actors",
            "size":10,
            "collect_mode":"breadth_first" # 广度优先
        }
    }
}
```
#### global aggregation
全局聚合,下面先使用query进行全文检索,然后进行聚合, 下面的聚合实际上是针对两个不同的结果进行聚合,第一个聚合添加了global关键字,意思是ES中存在的所有doc进行聚合计算得出t-shirt的平均价格

第二个聚合针对全文检索的结果进行聚合
```
POST /sales/_search?size=0
{
    "query" : {
        "match" : { "type" : "t-shirt" }
    },
    "aggs" : {
        "all_products" : {
            "global" : {}, 
            "aggs" : { 
                "avg_price" : { "avg" : { "field" : "price" } }
            }
        },
        "t_shirts": { "avg" : { "field" : "price" } }
    }
}
```
#### Cardinality Aggregate 基数聚合
作用类似于`count(distcint)`,会对每一个bucket中指定的field进行去重,然后取去重后的count

虽然她会存在5%左右的错误率,但是性能特别好
```
POST /sales/_search?size=0
{
    "aggs" : {
        "type_count" : {
            "cardinality" : { # 关键字
                "field" : "type"
            }
        }
    }
}
```
对Cardinality Aggregate的性能优化, 添加 `precision_threshold` 优化准确率和内存的开销

下面的示例中将`precision_threshold`的值调整到100意思是当 type的类型小于100时,去重的精准度为100%, 此时内存的占用情况为 100*8=800字节

加入我们将这个值调整为1000,意思是当type的种类在1000个以内时,去重的精准度100%,内存的占用率为1000*8=80KB

官方给出的指标是, 当将`precision_threshold`设置为5时,错误率会被控制在5%以内
```
POST /sales/_search?size=0
{
    "aggs" : {
        "type_count" : {
            "cardinality" : { # 关键字
                "field" : "type",
                "precision_threshold":100
            }
        }
    }
}
```
进一步优化,Cardinality底层使用的算法是 HyperLogLog++, 可以针对这个算法的特性进行进一步的优化,因为这个算法的底层会对所有的 unique value取hash值,利用这个hash值去近似的求distcint count, 因此我们可以在创建mapping时,将这个hash的求法设置好,添加doc时,一并计算出这个hash值,这样 HyperLogLog++ 就无需再计算hash值,而是直接使用
```
PUT /index/
{
    "mappings":{
        "my_type":{
            "properties":{
                "my_field":{
                    "type":"text",
                    "fields":{
                        "hash":{
                            "type":"murmu3"
                        }
                    }
                }
            }
        }
    }
}
```
#### 控制聚合的升降序
先按照颜色聚合,在聚合的结果上,再根据价格进行聚合, 最终的结果中,按照价格聚合的分组中升序排序, 这算是个在下转分析时的排序技巧
```
GET /index/type/_search
{
    "size":0,
     "aggs":{
         "group_by_color":{
             "term":{
                 "field":"color",
                 "order":{ # 
                     "avg_price":"asc"
                 }
             }
         },
         "aggs":{
             "avg_price":{
                 "avg":{
                     "field":"price"
                 }
             }
         }
     }
}
```
#### Percentiles Aggregation
计算百分比, **常用它计算如,在200ms内成功访问网站的比率,在500ms内成功访问网站的比例,在1000ms内成功访问网站的比例, 或者是销售价为1000元的商品,占总销售量的比例, 销售价为2000元的商品占总销售量的比例等等**

示例: 针对doc中的 load_time字段, 计算出在不同百分比下面的 load_time_outliner情况
```
GET latency/_search
{
    "size": 0,
    "aggs" : {
        "load_time_outlier" : {
            "percentiles" : {
                "field" : "load_time" 
            }
        }
    }
}

# 解读: 在百分之50的加载请求中,平均load_time的时间是在445.0, 在99%的请求中,平均加载时间980.1

{
    ...

   "aggregations": {
      "load_time_outlier": {
         "values" : {
            "1.0": 9.9,
            "5.0": 29.500000000000004,
            "25.0": 167.5,
            "50.0": 445.0,
            "75.0": 722.5,
            "95.0": 940.5,
            "99.0": 980.1000000000001
         }
      }
   }
}

# 还可以自己指定百分比跨度间隔

GET latency/_search
{
    "size": 0,
    "aggs" : {
        "load_time_outlier" : {
            "percentiles" : {
                "field" : "load_time",
                "percents" : [95, 99, 99.9] 
            }
        }
    }
}
```
优化: percentile底层使用的是 TDigest算法,用很多个节点执行百分比计算,近似估计,有误差,节点越多,越精准

可以设置`compression`的值, 默认是100 , ES限制节点的最多是 `compression`*20 =2000个node去计算 , 因为节点越多,性能就越差

一个节点占用 32字节, 1002032 = 64KB
```
GET latency/_search
{
    "size": 0,
    "aggs" : {
        "load_time_outlier" : {
            "percentiles" : {
                "field" : "load_time",
                "percents" : [95, 99, 99.9],
                "compression":100 # 默认值100
            }
        }
    }
}
```

---

## 优化相关性得分
- 第一种方式:

在content字段中全文检索 `java elasticsearch`时,给title中同时出现`java elasticsearch`的doc的权重加倍
```
"query": {
      "bool" : {# 前缀匹配
         "match":{
            "content":{
                 "query":"java elasticsearch"
            }
         },
         "should":[
             "match":{
                 "title":{
                     "query":"java elasticsearch",
                     "boost":2
                 }
             }
         ]
       } 
  }
```
- 第二种: 更换写法,改变占用的权重比例

```
GET my_index/_doc/_search
{
  "query":{
     "should":[
      { "match":{"title":"this is"}},  # 1/3
      { "match":{"title":"this is"}},  # 1/3
      {
        "bool":{
         "should":[
           {"match":{"title":"this is"}}, # 1/6
           {"match":{"title":"this is"}}  # 1/6
           ]
       }
     }
   ] 
 }
}
```
- 第三种: 如果不希望使用相关性得分,使用下面的语法

```
GET my_index/_doc/_search
{
    "query": {
        "constant_score" : {
            "filter" : {
              "term" : { "title" : "this"} #
            },
            "boost" : 1.2
        }
    }
}
```
- 第四种: 灵活的查询

查询必须包含XXX,必须不包含YYY的doc

```
GET my_index/_doc/_search
{
  "query":{
    "bool": {
      "must":{
        "match":{
          "title":"this is a "
        }
      },
      "must_not":{
        "match":{
           "title":"another"
         }
       }
    }
  }
}
```
- 第五种: 查询必须包含XXX,可以包含YYY,但是包含了YYY后它的权重就会减少指定的值

```
GET my_index/_doc/_search
{
  "query":{
    "boosting": {
      "positive":{
        "match":{
          "title":"this is a "
        }
      },
      "negative":{
        "match":{
           "title":"another"
         }
       },
       "negative_boost": 0.2
    }
  }
}
```
- 第六种: 重打分机制

```
"query": { 
   "match":{
       "title":{
           "query":"java elasticsearch",
           "minimum_should_match":"50%"
       }
   },
   "rescore":{ # 对全文检索的结果进行重新打分
       "window_size":50,  # 对全文检索的前50条进行重新打分
       "query": { 
           "rescore_query":{ # 关键字
                "match_phrase":{ # match_phrase + slop 感知 term persition,贡献分数
                   "title":{
                       "query":"java elasticsearch",
                       "slop":50
              }
          }
      }
   }
}
```
- 第七种: 混用match和match_phrase提高召回率

```
"query": { 
  "bool": {  
  "must":  {
      # 全文检索虽然可以匹配到大量的文档,但是它不能控制词条之间的距离
      # 可能java elasticsearch在Adoc中距离很近,但是它却被ES排在结果集的后面
      # 它的性能比match_phrase高10倍,比proximity高20倍
     "match": {
        "address": "java elasticsearch" 
        } 
  },
  "should": {
     # 借助match_phrase+slop可以感知term position的功能,为距离相近的doc贡献分数,让它们靠前排列
      "match_phrase":{
          "title":{
              "query":"java elasticsearch",
              "slop":50
          }
      }
  }
}
```