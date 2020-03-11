---
title: Flink1.3版本到flink1.9不同版本特性
date: 2020-01-13 15:36:25
categories: 大数据
tags: flink
---

> 一年内,公司从flink1.3-> flink1.8 -> flink1.9 不断的迎接不同版本对flink相关业务需求进行满足,代码方面也慢慢的简单化

<!-- more -->

### [Flink的1.0到1.9特性理论内容](https://www.cnblogs.com/zclaude/p/12048429.html)
```
主要详细讲解
Flink API历史变迁;
Flink High-Level API历史变迁;
Flink Checkpoint & Recovery历史变迁
Flink Runtime历史变迁
```

### flink 历史变迁结合实际业务
#### flink1.3版本
```
# flink1.3版本:基本支持简单的业务的开发
当时对用户做题的行为轨迹进行记录: 
Debezium结合Kafka Connect实时捕获Mysql变更事件写入kafka,flink监控kafka,hbase作为中间表进行数据处理,结果存储es
mysql -> kafka -> flink -> hbase -> es

主要根据flink API结合scala的相关算子, 对es进行增删操作
难点:根据kafka收集到的数据分为增删改以及空数据四块内容,需要分别对这四种数据进行按条件处理,程序大量引用了filter.map操作,代码的可读性比较差

具体代码实现:
https://github.com/hostility-sadan/flink-bahavior-trace.git

```

#### flink1.8版本
```
flink1.8版本:对之前业务逻辑使用新的框架进行优化
主要特征项目:试题画像
需求表述:
1、
维护目标：自建试题->若干属性（包括status属性，正文+选项+解析 即content+option+analysis 只放ES)
监控：question_info
过滤条件：question_id<0
后续操作：各种属性从after拿出放入ES
2、
维护目标：非引用试题->自建课列表; 自建课-> 非引用试题列表
监控：tp_j_course_question_info
过滤条件：course_id<0,is_quote=0
特殊处理：更新操作里，如果after:local_status=2 表示删除，不是更新
后续操作：查询自建课列表更新ES
          如果是有效的且共享课，如果是删除操作，如果非引用试题列表长度为0，从 教材id+schoolid->共享课列表 移除课
  如果是有效的且共享课，如果是添加操作，如果非引用试题列表长度为1，从 教材id+schoolid->共享课列表 添加课
3、
维护目标：自建课->SHARE_TYPE,LOCAL_STATUS,dc_school_id
监控：tp_course_info
过滤条件：course_id<0
后续操作：如果为更新操作，如果SHARE_TYPE从其它值变为1并且非引用试题列表长度不为0，则从 教材id+schoolid->共享课列表 添加课
                          如果SHARE_TYPE从1变为其它值并且非引用试题列表长度不为0，则从 教材id+schoolid->共享课列表 移除课
  如果LOCAL_STATUS从1变为2并且非引用试题列表长度不为0，则从 教材id+schoolid->共享课列表 移除课
                          如果SHARE_TYPE从其它值变为1,用当前时间更新 自建课->share_time
          如果为插入操作，如SHARE_TYPE=1，如非引用试题列表长度不为0，如有教材ID，则从 教材id+schoolid->共享课列表 添加课
4、
维护目标：自建课->教材ID
监控:tp_j_course_teaching_material
过滤条件：course_id<0
后续操作：如果为插入操作，如非引用试题列表长度不为0，如SHARE_TYPE=1，如LOCAL_STATUS=1，则从 教材id+schoolid->共享课列表 添加课

难点:多流交互,需要做到流与流处理的无序性
优化内容:构建了图的架构,提高了代码的可读性,以及使用checkpoint进行自动恢复机制

具体代码实现:
https://github.com/hostility-sadan/flink-new-ques-all-profile.git
```