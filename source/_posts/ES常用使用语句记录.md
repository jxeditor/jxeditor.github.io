---
title: ES常用使用语句记录
date: 2019-03-03 21:19:43
categories: 大数据
tags: elk
---

> 记录常用的语句,省得到处找

<!-- more -->

# 查询数据并写入新Index
```
POST _reindex
{
  "source": {
    "index": "myindex",
    "query": {
      "bool": {
        "must_not": [
          {"term": {
            "country": {
              "value": "中国"
            }
          }}
        ]
      }
    }
  },
  "dest": {
    "index": "myindexnew"
  }
}
```