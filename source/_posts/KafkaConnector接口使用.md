---
title: KafkaConnector接口使用
date: 2021-04-23 16:46:17
categories: 大数据
tags: kafka
---

> 整理之前遗留的使用方式

<!-- more -->


## connector接口
```
# 列出所有connector
curl -i -X GET http://192.168.6.128:8083/connectors

# 新建一个connector,请求体是包含name和config的json
curl -i -X POST -H 'Content-type':'application/json' -d 'config_json' http://192.168.6.128:8083/connectors

# 获取指定connector的信息
curl -i -X GET http://192.168.6.128:8083/connectors/{name}

# 获取指定connector的配置信息
curl -i -X GET http://192.168.6.128:8083/connectors/{name}/config

# 更新指定connector的配置信息
curl -i -X PUT -H 'Content-type':'application/json' -d 'config_json' http://192.168.6.128:8083/connectors/{name}/config

# 获取指定connector的状态信息
curl -i -X GET http://192.168.6.128:8083/connectors/{name}/status

# 列出指定connector的所有任务信息
curl -i -X GET http://192.168.6.128:8083/connectors/{name}/tasks

# 指定任务的状态信息
curl -i -X GET http://192.168.6.128:8083/connectors/{name}/tasks/{taskid}/status

# 暂停connector
curl -i -X PUT http://192.168.6.128:8083/connectors/{name}/pause

# 恢复connector
curl -i -X PUT http://192.168.6.128:8083/connectors/{name}/resume

# 重启connector
curl -i -X POST http://192.168.6.128:8083/connectors/{name}/restart

# 重启task
curl -i -X POST http://192.168.6.128:8083/connectors/{name}/tasks/{taskid}/restart

# 删除connector
curl -i -X DELETE http://192.168.6.128:8083/connectors/{name}
```
