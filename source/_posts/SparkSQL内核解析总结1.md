---
title: SparkSQL内核解析总结1
date: 2020-07-23 17:06:26
categories: 大数据
tags: spark
---

> 主要来自spark SQL内核解析书本内容

<!-- more -->



#### 简单的案例分析
```
val spark = SparkSession.builder().appName("test").config("es.index.auto.create","true").config("hive.exec.dynamic.partition","true").config("hive.exec.dynamic.partition.mode":"nonstrict").enableHiveSupport().getOrCreate()

用户表：
val userInfo = spark.sql("select user_id,ref,ett_user_id,dc_shool_id from user_info_mysql")

val schoolName = spark.sql("select school_id,name,belong_name,province from school_info_mysql")

spark SQL可以使用dataFrame接口进行调用，但是sql到rdd的执行需要经过复杂的流程；一般分为逻辑计划和物理计划

1.逻辑计划会将用户所提交的SQL语句转换成树形数据结构，SQL语句中蕴含的逻辑映射到逻辑算子数的不同节点；
一般分为未解析的逻辑算子数，解析后的逻辑算子数和优化后的逻辑算子数三个子阶段
主要对sql中所包含的各种处理逻辑（过滤、裁剪等）和数据信息都被整合在逻辑算子的不同节点中
filter 减少全表扫描的可能
select 指定字段 减少全表字段的扫描

2.物理计划将上一步生产的逻辑算子数进一步转换，生产物理算子树。
物理算子树会直接生成RDD或对RDD进行transfromation转换操作：
物理算子数也分为三个阶段：
1.生成物理算子数列表（同样的逻辑算子数可能对应多个物理算子数）
2.从列表中按照策略选择最优的物理算子数
3.对选取的物理算子数进行提交前的准备工作
执行action操作
```

#### 物理计划执行策略(strategy体系)
```
所有的策略都继承自GenericStrategy类，其中定义了planLater和apply方法；sparkStrategy继承GenericStrategy，strategy是生成物理算子树的基础
SparkPlanner中默认添加了8中Strategy来生成物理计划
1.fileSourceStrategy与dataSourceStrategy主要针对数据源
2.Aggregation和JoinSelection分别针对聚合与关联操作；
3.BasicOperatiors涉及范围广，包含了过滤、投影等各种操作

1) fileSourceStategy: 数据文件扫描计划
2) DataSourceStategy: 各种数据源相关的计划
3) DDLStrategy： DDL操作执行计划
4) specialLimits：特殊limit操作的执行计划
5）Aggregation ： 集合算子相关的执行计划
6）JoinSelection： Join操作相关的执行计划
7）InMemoryScans： 内存数据表扫描计划
8）BasicOperators：对基本算子生成的执行计划

```


#### transformation算子
```
map ： 原来rdd的每个数据项通过map中的用户自定义函数映射转变成一个新的元素
flatMap： 原来rdd中的每个元素通过函数转换成新的元素，并将生成的rdd的每个集合中的元素合并为一个集合
mapPartition：获取到每个分区的迭代器，在函数中通过这个分区整体的迭代器对整个分区的元素进行操作（每个分区对filter后数据进行保留）
union ：保证两个rdd元素的数据类型相同，返回的rdd数据类型和被合并的rdd元素数据类型相同，并不进行去重操作
distinct ：返回一个包含源数据集中所有不重复元素
groupByKey：在一个kv对组成的数据集上调用，输出结果的并行度依赖于父RDD的分区数目
reduceByKey：在kv对的数据集上调用，相同key的，由reduce的task个数的方式进行聚合
join: 宽依赖，每个key中的所有元素都在一起的数据集
repartition或coalesce：减少分区数，coalesce还可以用于left join后获取非空字段的数据
```

#### action算子
```
reduce: 通过函数聚集数据集中的所有元素，确保可以被正确的并发执行
collect：以数组的形式，返回数据集的所有元素，通常会在使用filter或者其他操作后，返回一个足够小的数据子集使用
count：返回数据集的元素个数
first，take，limit：返回一个数组，由前面的n个元素组成
foreach：每个元素遍历执行一次函数
foreachPartition：每个分区执行一次函数
```

#### spark开发调优，对多次使用的rdd进行持久
```
一般使用cache和persist
1.cache：使用非序列化的方式将rdd的数据全部尝试持久化到内存中，cache只是一个transformation，是lazy，必须通过一个action触发，才能真正的将该rdd cache到内存中
2.persist：手动选择持久化级别，并使用指定的方式进行持久化

缓存类型：
内存，磁盘，内存+磁盘以及相对应的反序列化和序列化以及双副本
反序列化：把RDD作为反序列化的方式存储，假如RDD的内存存不下，剩余的分区在以后需要时会重新计算，不会刷到磁盘上
序列化：序列化方式，每个partition以字节数据存储，好处是能带来更好的空间存储，但CPU耗费高
双副本：RDD以反序列化的方式存内存，假如rdd的内容存储不下，会存储至磁盘

手动移除缓存数据：unpersist
```