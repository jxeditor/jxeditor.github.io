---
title: GP查询计划怎么阅读
date: 2021-04-16 10:47:07
categories: 大数据
tags: greenplum
---

> 对EXPLAIN执行计划的阅读解释

<!-- more -->

## 查询计划
```
描述了GP数据库优化器执行查询时遵循的执行步骤
整体是一个树,阅读时从底向上阅读,每一个节点都会将其结果传递给其直接上层节点
每个节点表示计划的一个步骤,每个节点对应那一行标识了该步骤的执行操作
并且标识了用于执行该操作的方法

例子:
gpdb=# explain select id,count(1) from demo_load group by id;
 Gather Motion 1:1  (slice1; segments: 1)  (cost=0.00..431.00 rows=1 width=12)
   ->  GroupAggregate  (cost=0.00..431.00 rows=1 width=12)
         Group Key: id
         ->  Sort  (cost=0.00..431.00 rows=1 width=4)
               Sort Key: id
               ->  Seq Scan on demo_load  (cost=0.00..431.00 rows=1 width=4)
 Optimizer: Pivotal Optimizer (GPORCA)
```

---

## 代价估计
```
cost - 读取的顺序页面
    一次顺序磁盘页面读取,前面为读取第一行的代价,后面为得到所有行的代价
    
rows - 行数
    计划节点输出的行数,该值可能会小于计划节点实际处理或扫描的行数
    
width - 行宽度
    计划节点输出所有列以字节表示的总宽度
```

---

## 操作解释
### 扫描操作
```
对表上的Seq Scan — 扫描表中的所有行
Append-only Scan — 扫描行存追加优化表
Append-only Columnar Scan — 扫描列存追加优化表中的行
Index Scan — 遍历一个B-树索引以从表中取得行
Bitmap Append-only Row-oriented Scan — 从索引中收集仅追加表中行的指针并且按照磁盘上的位置进行排序
Dynamic Table Scan — 使用一个分区选择函数来选择分区
    Function Scan节点包含分区选择函数的名称,可以是下列之一:
        gp_partition_expansion — 选择表中的所有分区.不会有分区被消除
        gp_partition_selection — 基于一个等值表达式选择一个分区
        gp_partition_inversion — 基于一个范围表达式选择分区
    Function Scan节点将动态选择的分区列表传递给Result节点,该节点又会被传递给Sequence节点
```

### Join操作
```
Hash Join – 从较小的表构建一个哈希表,用连接列作为哈希键
    然后扫描较大的表,为连接列计算哈希键并且探索哈希表寻找具有相同哈希键的行
    哈希连接通常是Greenplum数据库中最快的连接
    解释计划中的Hash Cond标识要被连接的列
Nested Loop – 在较大数据集的行上迭代,在每次迭代时于较小的数据集中扫描行
    嵌套循环连接要求广播其中的一个表,这样一个表中的所有行才能与其他表中的所有行进行比较
    它在较小的表或者通过使用索引约束的表上执行得不错
    它还被用于笛卡尔积和范围连接
    在使用Nested Loop连接大型表时会有性能影响
    对于包含Nested Loop连接操作符的计划节点,应该验证SQL并且确保结果是想要的结果
    设置服务器配置参数enable_nestloop为OFF(默认)能够让优化器更偏爱Hash Join
Merge Join – 排序两个数据集并且将它们合并起来
    归并连接对预排序好的数据很快,但是在现实世界中很少见
    为了更偏爱Merge Join,可把系统配置参数enable_mergejoin设置为ON
```

### Motion操作
```
Broadcast motion – 每一个Segment将自己的行发送给所有其他Segment,这样每一个Segment实例都有表的一份完整的本地拷贝
    Broadcast motion可能不如Redistribute motion那么好,因此优化器通常只为小型表选择Broadcast motion
    对大型表来说,Broadcast motion是不可接受的
    在数据没有按照连接键分布的情况下,将把一个表中所需的行动态重分布到另一个Segment
Redistribute motion – 每一个Segment重新哈希数据并且把行发送到对应于哈希键的合适Segment上
Gather motion – 来自所有Segment的结果数据被组装成一个单一的流
```

### 其他操作
```
Materialize – 规划器将一个子查询物化一次,这样就不用为顶层行重复该工作
InitPlan – 一个预查询,被用在动态分区消除中,当执行时还不知道规划器需要用来标识要扫描分区的值时,会执行这个预查询
Sort – 为另一个要求排序数据的操作(例如Aggregation或者Merge Join)准备排序数据
Group By – 通过一个或者更多列分组行
Group/Hash Aggregate – 使用哈希聚集行
Append – 串接数据集,例如在整合从分区表中各分区扫描的行时会用到
Filter – 使用来自于一个WHERE子句的条件选择行
Limit – 限制返回的行数
```
