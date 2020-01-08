---
title: Kafka集成Prometheus与Grafana
date: 2020-01-08 09:20:17
categories: 大数据
tags:
    - kafka
    - prometheus
    - grafana
---

> 监控Kafka

<!-- more -->

## 依赖情况
```
grafana
prometheus
kafka_exporter
```

---

## prometheus.yml
```
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['hadoop01:9308','hadoop02:9308','hadoop03:9308']
        labels:
          instance: 'kafka'
```

---

## 启动
```
# kafka_exporter
./kafka_exporter --kafka.server=hadoop03:9092 &
# prometheus
./prometheus --config.file=./conf/prometheus.yml &
# grafana
./bin/grafana-server web &
username/password: admin/admin
```