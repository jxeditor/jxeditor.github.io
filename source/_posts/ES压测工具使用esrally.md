---
title: ES压测工具使用esrally
date: 2020-06-22 18:45:09
categories: 大数据
tags: elk
---

> 对ES集群的性能进行测试,判断程序是否有优化的空间

<!-- more -->

## 环境
- Git-1.8以后
- Python3

---

## 安装
```
pip3 install esrally
```

---

## 开始压测
```sh
# 离线环境对目标ES集群进行压力测试
esrally --offline --distribution-version=7.2.0 --pipeline=benchmark-only --target-hosts=hosts:9200,hosts:9200,hosts:9200

# 注意
压测数据过大,下载速度慢可以在网上找对应下载好的数据包
对于本地数据,需要修改/root/.rally/benchmarks/tracks/default/geonames/track.json文件
离线数据包在/root/.rally/benchmarks/data/geonames/documents-2.json
{% import "rally.helpers" as rally with context %}
{
  "version": 2,
  "description": "POIs from Geonames",
  "indices": [
    {
      "name": "geonames",
      "body": "index.json"
    }
  ],
  "corpora": [
    {
      "name": "geonames",
      "documents": [
        {
          "source-file": "documents-2.json",
          "document-count": 11396505,
          "uncompressed-bytes": 3547614383
        }
      ]
    }
  ],
  "operations": [
    {{ rally.collect(parts="operations/*.json") }}
  ],
  "challenges": [
    {{ rally.collect(parts="challenges/*.json") }}
  ]
}
压测操作过多,可以修改/root/.rally/benchmarks/tracks/default/geonames/
下challenges和operations文件夹下json文件
```

---

## 压测结果
```
# 主要关注Throughput
# 有时会没有该指标,怀疑是写入超过10wdoc/s
[WARNING] No throughput metrics available for [index-append]. Likely cause: The benchmark ended already during warmup.
------------------------------------------------------
    _______             __   _____
   / ____(_)___  ____ _/ /  / ___/_________  ________
  / /_  / / __ \/ __ `/ /   \__ \/ ___/ __ \/ ___/ _ \
 / __/ / / / / / /_/ / /   ___/ / /__/ /_/ / /  /  __/
/_/   /_/_/ /_/\__,_/_/   /____/\___/\____/_/   \___/
------------------------------------------------------
            
|                                                         Metric |         Task |       Value |   Unit |
|---------------------------------------------------------------:|-------------:|------------:|-------:|
|                     Cumulative indexing time of primary shards |              |     185.051 |    min |
|             Min cumulative indexing time across primary shards |              |           0 |    min |
|          Median cumulative indexing time across primary shards |              |           0 |    min |
|             Max cumulative indexing time across primary shards |              |     8.03388 |    min |
|            Cumulative indexing throttle time of primary shards |              |           0 |    min |
|    Min cumulative indexing throttle time across primary shards |              |           0 |    min |
| Median cumulative indexing throttle time across primary shards |              |           0 |    min |
|    Max cumulative indexing throttle time across primary shards |              |           0 |    min |
|                        Cumulative merge time of primary shards |              |     176.086 |    min |
|                       Cumulative merge count of primary shards |              |       77193 |        |
|                Min cumulative merge time across primary shards |              |           0 |    min |
|             Median cumulative merge time across primary shards |              |           0 |    min |
|                Max cumulative merge time across primary shards |              |       7.611 |    min |
|               Cumulative merge throttle time of primary shards |              |     4.00247 |    min |
|       Min cumulative merge throttle time across primary shards |              |           0 |    min |
|    Median cumulative merge throttle time across primary shards |              |           0 |    min |
|       Max cumulative merge throttle time across primary shards |              |    0.718383 |    min |
|                      Cumulative refresh time of primary shards |              |     162.916 |    min |
|                     Cumulative refresh count of primary shards |              |      790587 |        |
|              Min cumulative refresh time across primary shards |              |           0 |    min |
|           Median cumulative refresh time across primary shards |              |           0 |    min |
|              Max cumulative refresh time across primary shards |              |     5.61482 |    min |
|                        Cumulative flush time of primary shards |              |     94.4581 |    min |
|                       Cumulative flush count of primary shards |              | 3.46617e+06 |        |
|                Min cumulative flush time across primary shards |              |           0 |    min |
|             Median cumulative flush time across primary shards |              |     0.00045 |    min |
|                Max cumulative flush time across primary shards |              |      1.5087 |    min |
|                                             Total Young Gen GC |              |      22.105 |      s |
|                                               Total Old Gen GC |              |       0.341 |      s |
|                                                     Store size |              |     82.7575 |     GB |
|                                                  Translog size |              |     6.60301 |     GB |
|                                         Heap used for segments |              |     394.897 |     MB |
|                                       Heap used for doc values |              |      60.712 |     MB |
|                                            Heap used for terms |              |     302.566 |     MB |
|                                            Heap used for norms |              |    0.105835 |     MB |
|                                           Heap used for points |              |     8.01107 |     MB |
|                                    Heap used for stored fields |              |     23.5017 |     MB |
|                                                  Segment count |              |       23151 |        |
|                                                 Min Throughput | index-append |     89289.5 | docs/s |
|                                              Median Throughput | index-append |     89984.6 | docs/s |
|                                                 Max Throughput | index-append |       90241 | docs/s |
|                                        50th percentile latency | index-append |     305.877 |     ms |
|                                        90th percentile latency | index-append |     363.315 |     ms |
|                                        99th percentile latency | index-append |     396.602 |     ms |
|                                       100th percentile latency | index-append |     419.911 |     ms |
|                                   50th percentile service time | index-append |     305.877 |     ms |
|                                   90th percentile service time | index-append |     363.315 |     ms |
|                                   99th percentile service time | index-append |     396.602 |     ms |
|                                  100th percentile service time | index-append |     419.911 |     ms |
|                                                     error rate | index-append |           0 |      % |


---------------------------------
[INFO] SUCCESS (took 178 seconds)
---------------------------------
```