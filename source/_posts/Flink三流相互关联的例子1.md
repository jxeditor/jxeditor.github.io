---
title: Flink三流相互关联的例子
date: 2020-07-27 15:25:12
categories: 大数据
tags: flink
---

> 经典案例:三流影响hbase共享课列表(教材id+schoolId为rowkey)

<!-- more -->
#### debezium结果kafka connect实时捕获mysql变更事件(binlog)
```
主要介绍kafka的数据特点:
只有after是插入操作
只有before是删除操作
有before又有after是更改操作,before是修改前的数据after是修改后的数据
为null是debezium捕获mysql的binlog中产生的垃圾数据
```

#### 流一: tp_j_course_question_info 课与试题的关联表

```
字段选取:course_id,question_id,is_quote,local_status
过滤条件: course_id <0 and is_quote=0 为非引用课列表内容(一课包含多个试题,一个试题在多个课下)
注意逻辑字段:
更新操作中local_status为2是删除操作
后续操作:
1.如果是有效的且是共享课,是删除操作,非引用试题列表长度为0,从共享课列表中删除
2.如果是有效且共享课,是添加操作,非引用试题列表长度为1,在共享课列表中添加数据
```

#### 流二: tp_course_info 课信息表
```
字段选取:share_type,local_status,dc_school_id
过滤条件:course_id <0
后续操作:
1.如果为更新操作:
 1).如果share_type从其他值变为1并且非引用试题列表不为0;则在共享课列表添加课
 2).如果local_status从1变成2并且非引用试题列表长度不为0,则从共享课列表移除课
2.如果是插入操作:如share_type=1,如非引用试题列表长度不为0,在共享课列表添加课
```

#### 流三: tp_j_course_teaching_material 课与教材的关联表
```
如果为插入操作,如非引用试题列表长度不为0,如share_type=1,local_status=1,则在共享课列表添加课
```

#### 总结
```
三个流相互依赖,但是顺序为无序,每个流过来都需要判断其他两个流的相关字段在hbase中是否有值,如果没有值就只存储自己的数据;如果都有值就进行判断对目标hbase表数据是添加课列表还是删除相关课列表
历史数据:使用hive+spark+hbase架构,离线程序进行生成数据
```