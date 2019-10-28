---
title: ELK安装搭建以及常见问题
date: 2019-02-21 08:32:49
categories: 
    - 搭建
    - 大数据
    - 运维
tags: elk
---

> 对于ELK一系列环境搭建

<!-- more -->

## 安装包准备
- elasticsearch-6.6.1.tar.gz
- kibana-6.6.1-linux-x86_64.tar.gz
- logstash-6.6.1.tar.gz

---

## 安装步骤
### ElasticSearch
```
# 创建用户
useradd elsearch
tar xf elasticsearch-6.6.1.tar.gz
vi elasticsearch-6.6.1/config/elasticsearch.yml
node.name: node-n # n变化,每台不一样
bootstrap.memory_lock: false # 不设置会报错
bootstrap.system_call_filter: false
network.host: 192.168.1.128
discovery.zen.ping.unicast.hosts: ["hadoop01", "hadoop02", "hadoop03"]

vi /etc/security/limits.conf
*       soft    nofile  65536
*       hard    nofile  131072
*       soft    nproc   2048
*       hard    nproc   4096
vi /etc/security/limits.d/90-nproc.conf
*          soft    nproc     4096
root       soft    nproc     unlimited
vi /etc/sysctl.conf 
vm.max_map_count = 655360
sysctl -p
# 后台启动
elasticsearch-6.6.1/bin/elasticsearch -d
http://hadoop01:9200
```
### Kibana
```
tar xf kibana-6.6.1-linux-x86_64.tar.gz
mv kibana-6.6.1-linux-x86_64 kibana-6.6.1
vi kibana-6.6.1/config/kibana.yml
server.host: "192.168.1.129"
elasticsearch.hosts: ["http://hadoop01:9200", "http://hadoop02:9200", "http://hadoop03:9200"]
kibana-6.6.1/bin/kibana
# 后台启动
nohup kibana-6.6.1/bin/kibana &
http://hadoop02:5601
```
### Logstash
```
tar -zxvf logstash-2.3.1.tar.gz
# 设置采集配置
# 命令行形式
bin/logstash -e 'input { stdin {} } output { stdout{} }'
bin/logstash -e 'input { stdin {} } output { stdout{codec => rubydebug} }'
bin/logstash -e 'input { stdin {} } output { elasticsearch {hosts => ["172.16.0.14:9200"]} stdout{} }'
bin/logstash -e 'input { stdin {} } output { elasticsearch {hosts => ["172.16.0.15:9200", "172.16.0.16:9200"]} stdout{} }'

bin/logstash -e 'input { stdin {} } output { kafka { topic_id => "test_topic" bootstrap_servers => "172.16.0.11:9092,172.16.0.12:9092,172.16.0.13:9092"} stdout{codec => rubydebug} }'

# 配置文件形式
vi logstash.conf
input {
	file {
		type => "gamelog"
		path => "/log/*/*.log"
		discover_interval => 10
		start_position => "beginning" 
	}
}
output {
    elasticsearch {
		index => "gamelog-%{+YYYY.MM.dd}"
        hosts => ["172.16.0.14:9200", "172.16.0.15:9200", "172.16.0.16:9200"]
    }
}
bin/logstash -f logstash.conf
```