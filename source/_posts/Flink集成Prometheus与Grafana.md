---
title: Flink集成Prometheus与Grafana
date: 2020-01-07 11:03:13
categories: 大数据
tags: 
    - flink
    - prometheus
    - grafana
---

> 监控Flink任务情况

<!-- more -->

## 下载软件
```
grafana
node_exporter
prometheus
pushgateway
```

---

## Flink方面修改
```
# 复制opt/flink-metrics-prometheus到lib目录
# 修改conf/flink-conf.yaml
metrics.reporter.promgateway.class: org.apache.flink.metrics.prometheus.PrometheusPushGatewayReporter
metrics.reporter.promgateway.host: hadoop01
metrics.reporter.promgateway.port: 9091
metrics.reporter.promgateway.jobName: myJob
metrics.reporter.promgateway.randomJobNameSuffix: true
metrics.reporter.promgateway.deleteOnShutdown: false
```

---

## prometheus.yml
```
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['hadoop01:9090']
        labels:
          instance: 'prometheus'
  - job_name: 'linux'
    static_configs:
      - targets: ['hadoop01:9100']
        labels:
          instance: 'hadoop01'
  - job_name: 'pushgateway'
    static_configs:
      - targets: ['hadoop01:9091']
        labels:
          instance: 'pushgateway'
```

---

## 启动
```
# pushgateway
./pushgateway &
./pushgateway --web.enable-lifecycle --web.enable-admin-api &

# node_exporter
./node_exporter &

# prometheus
./prometheus --config.file=./conf/prometheus.yml &

# grafana
./bin/grafana-server web &
username/password: admin/admin

# 注意版本问题
```

---

## 针对pushgateway的优化
```
# 版本为1.0.1,低版本并不会主动去清除group信息
# 哪怕是很久没有进行push数据了,也不会清除
# 需要自己写脚本定时去清除所有的group信息
curl -X PUT http://hadoop01:9091/api/v1/admin/wipe
```

---

## 图表的设置
```
可以直接去Grafana官网导入,也可以自己写
```

