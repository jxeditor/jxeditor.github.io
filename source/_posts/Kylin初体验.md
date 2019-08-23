---
title: Kylin初体验
date: 2019-06-12 14:53:01
categories: 大数据
tags: 
    - kylin
---

> Kylin初入门

<!-- more -->

## 一、部署

---

## 二、Restful API
### 查询
> **Authentication**
> ```bash
> # POST /kylin/api/user/authentication
> curl -c ./cookiefile.txt -X POST -H "Authorization:Basic QURNSU46S1lMSU4=" -H "Content-Type:application/json" "http://192.168.142.128:7070/kylin/api/user/authentication"
> 
> # 使用上面的cookiefile来build cube
> curl -b ./cookiefile.txt -X PUT -H "Authorization:Basic QURNSU46S1lMSU4=" -H "Content-Type:application/json" -d '{"startTime":1423526400000,"endTime":1423612800000,"buildType":"BUILD"}' "http://192.168.142.128:7070/kylin/api/cubes/your_cube/build"
> 
> # 使用user/password来build cube 
> curl -X PUT --user ADMIN:KYLIN -H "Content-Type:application/json;charset=utf-8" -d '{"startTime":820454400000,"endTime":821318400000,"buildType":"BUILD"}' "http://192.168.142.128:7070/kylin/api/cubes/your_cube/build" 
> ```
> **Query**
> ```bash
> # POST /kylin/api/query
> curl -X POST -H "Authorization:Basic QURNSU46S1lMSU4=" -H "Content-Type:application/json" -d '{"sql":"select part_dt,sum(price) as total_sold,count(distinct seller_id) as sellers from kylin_sales group by part_dt order by part_dt","project":"learn_kylin"}'  "http://192.168.142.128:7070/kylin/api/query"
> curl -X POST --user ADMIN:KYLIN -H "Content-Type:application/json" -d '{"sql":"select part_dt,sum(price) as total_sold,count(distinct seller_id) as sellers from kylin_sales group by part_dt order by part_dt","project":"learn_kylin"}'  "http://192.168.142.128:7070/kylin/api/query"
> ```
> **List queryable tables**
> ```bash
> # GET /kylin/api/tables_and_columns
> # 必要的参数project
> curl -X GET --user ADMIN:KYLIN -H "Content-Type:application/json" "http://192.168.142.128:7070/kylin/api/tables_and_columns?project=learn_kylin"
> ```
> **List cubes**
> ```bash
> # GET /kylin/api/cubes
> # 必要的参数offset,limit
> curl -X GET --user ADMIN:KYLIN -H "Content-Type:application/json" "http://192.168.142.128:7070/kylin/api/cubes"
> ```