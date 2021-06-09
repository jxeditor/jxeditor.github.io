---
title: ClickHouse笔录
date: 2021-06-09 14:01:23
categories: 大数据
tags: clickhouse
---

> Everything is table(万物皆为表)

<!-- more -->

## 基础类型
```
int8 -> tinyint
int16 -> smallint
int32 -> int
int64 -> bigint
uint8 -> tinyint unsigned
float32 -> float
float64 -> double
decimal(16,4) -> decimal(16,4)
string -> string
fixedstring -> string指定位数
UUID -> 32 位8-4-4-4-12
datetime-> 包含时分秒信息,精准到秒
datetime64 -> 可以记录亚秒,增加了精度的设置
date ->  不包含具体的时间信息,只精准到天
array(T) -> 类型需要指定
array(nullable(uint8)) 
tuple -> 由1~n个元素组成,每个元素之间允许设置不同的数据类型,不要求兼容
enum -> 枚举类型
nested -> 定义任意多个嵌套类型字段;嵌套类型本质是一种多维数组的结构
nullable -> 只能和基础类型搭配使用,不能用于数组和元组这些复合类型,不能作为索引字段,少用,不然会使查询和写入性能变慢
原因:(正常情况下,每个列字段的数据会被存储在对应的[column].bin)文件中;如果一个列字段被nullable类型修饰后,会额外生成一个[column].null.bin文件专门保存它的null值;这意味着在读取和写入数据时,需要一倍的额外文件操作
domain -> 域名类型分为ipv4(UInt32)和IPv6(fixedstring),本质上是对整型和字符串的进一步封装
与字符串区别:
1.出于便捷,格式错误的ip数据是无法被写入的
2.出于性能,相比string,ipv4使用的uint32存储,更加紧凑,占用的空间更快
注意:domain类型不是字符串,不支持隐私的自动类型转换,需要返回ip的字符串形式,则需要显式调用ipv4NumToString或IPv6NumToString
```

---

## 数据库
```
起到命名空间的作用,可以有效规避命名冲突的问题,也为后续的数据隔离提供了支撑
目前支持5种引擎:
1.Ordinary:默认引擎,在此数据库下可以使用任意类型的表引擎
2.Dictionary:字典引擎,会自动为所有数据字典创建它们的数据表
3.memory:内存引擎,用于存放临时数据,此类数据库下的数据表只会停留在内存中,不会涉及任何磁盘操作,当服务重启后数据会被清除
4.Lazy:日志引擎,只能使用Log系列的表引擎
5.mysql:mysql引擎,会自动拉取远端mysql中的数据,并为它们创建mysql表引擎的数据表

eg:
create table user_info(
id int32,
age int8,
name string
) engine=memory;
在默认的数据库下创建一张内存表,末尾engine参数,被用于指定数据表的引擎;表引擎决定了数据表的特性,也决定了数据将会被如何存储及加载
```

### 创建表
```
复制其他表的结构(default.table复制到db1.table1):
eg:create table if not exists db1.table1 as default.table [engine=memory] 

engine也可以与原表不一样
eg:create table if not exists db1.table1 engine=mysql as select * from default.table

临时表:
create temporary table if not exists table1

相对普通表,优势:
1.它的生命周期时会话绑定的,只支持memory表引擎,如果会话结束,数据表就会销毁
2.临时表不属于任何数据库,所以在它的建表语句中,既没有数据库参数也没有表引擎参数
临时表的优先级时大于普通表[验证创建同一表名,不同的内容]
```

### 分区表
```
数据分区对于一款OLAP数据库而言意义非凡,借助数据分区,在后续的查询过程中能够跳过不必要的数据目录,从而提升查询的性能;合理的利用分区特性,还可以变相数据的更新操作,因为数据分区支持删除、替换和重置操作;
目前只有合并树(mergeTree)家族系列的表引擎才支持数据分区

eg:
create table user_info(
id int32,
age int8,
name string,
create_time Date
) engine=MergeTree()
partition by toYYYYMM(create_time)
order by id;

注意:分区数量增长会导致性能下降
```

### 视图
```
分为普通和物化两种试图
1.物化视图拥有独立的存储,支持表引擎,数据保存形式由它的表引擎决定
eg: create metarialized view if not exists db2.table1 engine=mysql [populate] as select ....

物化视图创建好之后,如果源表被写入新数据,那么物化视图也会同步更新;populate修饰符决定了物化视图的初始化策略,会连带将源表中已存在的数据一并导入

2.普通视图只是一层简单的查询代理,不会存储任何数据,只是单纯的select查询映射
```

### 数据表的基本操作
```
支持alter查询的表引擎:
MergeTree:
Merge:
Distributed:

追加新字段:
1.在数据表的末尾增加新字段
alter table user_info add column address string default '杭州'

2.通过after修饰符,在指定字段的后面增加新字段
alter table user_info add column ip string after id

修改数据类型:
修改某个字段的数据类型,实质上会调用相应的toType转型方法;如果当前的类型与期望的类型不能兼容,则修改失败
eg: alter table user_info modify column address uint32

修改备注:
alter table user_info comment column id '主键id'

删除已有字段:
alter table user_info drop column ip

移动数据表:
rename table a.a_v1 to b.a_v1
数据表的移动只能在单个节点的范围内;换言之,数据表移动的目标数据库和原始数据库必须同一个服务节点内,而不能是集群中的远程节点

清除数据表:
truncate table a.a_v1

复制分区数据: 不懂可看p59页
alter table user_info replace partition 202106 from a
需要满足两个条件:
1.两张表需要拥有相同的分区键
2.他们的表结构完全相同

重置分区数据:
数据表某一列的数据有误,需要将其重置为初始化
alter table user_info clear column ip in partition 202106

卸载和装载分区:
常用于分区数据的迁移和备份
卸载:(移动到detached目录)
alter table user_info detach partition 202106
一旦分区被移动到detached子目录,就代表它已经脱离了clickhouse的管理,clickhouse并不会主动清理这些文件,除非主动删除
装载:
alter table user_info attach partition 202106
```

### 分布式DDL执行
```
eg:
create table c_v1 on cluster 集群名 (
 id string,
 url string,
 eventtime date
) engine=mergetree()
partition by toYYYYMM(eventtime)
order by id

数据删除与修改:
delete和update的能力,被称为Mutation查询,看作alter的变种;
与常用的OLTP操作不同:
1.更适用于批量数据的修改和删除
2.不支持事务,一旦语句被提交执行,就会立刻对现有数据产生影响,无法回滚
3.Mutation语句的执行是一个异步的后台过程,语句被提交之后就会立即返回;所以这并不代表具体逻辑已经执行完毕,具体执行进度需要通过system.mutations系统表查询

删除:
alter table c_v1 delete where id='a33'

查询执行进度:
select database,table,mutation_id,block_numbers.number as num ,is_done from system.mutations
```

### 数据字典
```
数据字典,以键值和属性映射的形式定义数据;字典中的数据会主动或被动加载(启动时主动加载,首次查询时惰性加载由参数设置决定)到内存,并支持动态更新;适用于保存常量或经常使用的维表数据,以避免不必要的join查询
分为内置字典和外部扩展字典
外部扩展字典:由用户自定义数据模式记数据来源,支撑7种类型和4种数据来源(参数配置)  具体内容可参考p69
```

---

## 执行过程
### MergeTree表引擎
```
只有合并树系列的表引擎才支持主键索引、数据分区、数据副本和数据采样这些特征,同时也只有此系列的表引擎支持alter相关操作
replacingMergeTree表引擎:具有删除重复数据的特征
SummingMergeTree:按照排序键自动聚合数据
给合并树系列的表引擎加上replicated前缀,又会得到一组支持数据副本的引擎

MergeTree在写入一批数据时,数据总会以数据片段的形式写入磁盘,且数据片段不可修改,clickhouse会通过后台线程,定期合并这些数据片段,属于相同分区的数据片段会被合成一个新的片段

一级索引
1.稠密索引:每一行索引标记都会对应到一行具体的数据记录
2.稀疏索引:每一行索引标记对应的是一段数据,而不是一行

索引粒度:如同标尺一般,会丈量整个数据的长度,并依照刻度对数据进行标注,最终将数据标记成多个间隔的小段

索引查询过程:
MergeTree通过递归的形式持续向下拆分区间,最终将MarkRange定位到最细的粒度,以帮助在后续读取数据的时候,能够最小化扫描数据的范围;如果取的内容是范围边的,因为MarkRange转换的树枝区间是闭区间,所以会额外匹配到临近的一个区间

二级索引:
又称跳级索引,由数据的聚合信息构建而成;granularity参数设置
MergeTree支持4种跳数索引:
1.minmax:索引记录了一段数据内的最大和最小极值,能够快速跳过无用的数据区间
2.set:直接记录了声明字段或表达式的取值(唯一值、无重复),其完整形式为set(max_rows),其中max_rows是一个阈值,表示在一个index_granularity内,索引最多记录的数据行数
3.ngrambf_v1:数据短语的布隆表过滤器,只支持string和fixedString数据类型
4.tokenbf_v1:也是一种布隆过滤器索引,会自动按照非字符的、数字的字符串分割token
一张数据表支持同时声明多个跳数索引

eg:
create table skip_test(
id string,
url string,
code string,
eventtime date,
index a id type minmax GRANULARITY 5,
index b (length(id) * 8) type set(2) GRANULARITY 5,
index c (id,code) type ngrambf_v1(3,256,2,0) GRANULARITY 5,
index d id type tokenbf_v1(256,2,0) GRANULARITY 5
) engine=MergeTree()


MergeTree在读取数据时,必须通过标记数据的位置信息才能够找到所需要的数据,整个查找过程大致可以氛围读取压缩数据块和读取数据两个步骤
```

### 写入过程
```
数据写入的第一步是生成分区目录,伴随着每一批数据的写入,都会生成一个新的分区目录;
在后续的操作里,属于相同分区的目录会依照规则合并在一起;
接着按照index_granularity索引粒度,会分别生成primary.idx一级索引(如果声明了二级索引,还会创建二级索引文件)、每一列字段的.mrk数据标记和.bin压缩数据文件
```

### 查询过程
```
数据查询的本质,可以看作一个不断减小数据范围的过程;
在最理想的情况下,MergeTree首先可以依次借助分区索引、一级索引和二级索引,将数据扫描范围缩至最小;
然后再借助数据标记,将需要解压与计算的数据范围缩至最小
```

### 数据标记与压缩数据块的对应关系
```
1.多个数据标记对应一个压缩数据块,当一个间隔(index_granularity)内的数据未压缩大小size小于64kb
2.一个数据标记对应一个压缩数据块,当一个间隔内的数据未压缩大小size大于等于64kb且小于等于1MB
3.一对多,当一个间隔内的数据未压缩大小size直接大于1MB
```

### 数据TTL
```
表示数据的存活时间;如果是列字段级别的TTL,则会删除这一列的数据;如果是表级别的TTL,则会删除整张表的数据;如果同时设置了列级别和表级别的TTL,则会以先到期的哪个为主

列级别:
create table ttl_a1 (
id string,
create_time DateTime,
code string TTL create_time + INTERVAL 10 SECOND,
type UInt8 TTL create_time + INTERVAL 10 SECOND
)
ENGINE=MergeTree()
PARTITION BY toYYYYMM(create_time)
order by id;

执行optimize命令强制触发TTL清理
optimize table ttl_a1 final

修改列字段TTL,或是为已有字段添加TTL
alter table ttl_a1 modify column code string TTL create_time + INVERVAL 1 DAY

注意: clickhouse没有提供取消列级别TTL的方法

表级别:
如果想要为整张数据表设置TTL,需要再MergeTree的表
eg:
create table ttl_a1 (
id string,
create_time DateTime,
code string TTL create_time + INTERVAL 10 SECOND,
type UInt8 TTL create_time + INTERVAL 10 SECOND
)
ENGINE=MergeTree()
PARTITION BY toYYYYMM(create_time)
order by create_time
TTL create_time + INVTERVAL 1 DAY;
```

### ReplacingMergeTree
```
eg:
create table replace_table(
id string,
code string,
create_time datetime
) engine=ReplacingMergeTree()
partition by toYYYYMM(create_time)
order by (id,code)
primary key id

order by 是去重复数据的关键,排序键order by 所声明的表达式是后续作为判断数据是否重复的依据;数据会基于id和code两个字段去重复

在执行optimize强制触发合并后,会按照id和code分组,保留分组内的最后一条
optimize table replace_table final

注意:replacingMergeTree是以分区为单位删除重复数据的,而不同数据分区之间的重复数据依然不能被剔除

处理逻辑:
1.使用order by排序键作为判断重复数据的唯一键
2.只有再合并分区的时候才会触发删除重复数据的逻辑
3.以数据分区为单位删除重复数据;当分区合并时,同一个分区的重复数据会被删除,不同分区之间的重复数据不会删除
4.在进行数据去重时,因为分区内的数据已经基于order by 进行了排序,所以能够找到那些相邻的重复数据
5.数据去重策略有两种:
1) 如果没有设置ver版本号,则保留同一组重复数据中的最后一行
2) 如果设置了ver版本号,则保留同一组重复数据中ver字段取值最大的那一行
```

### SummingMergeTree
```
终端用户只需要查询数据的汇总结果,不关心明细数据,并且数据的汇总条件是预先明确的(group by 条件明确)

eg:
create table summing_table(
id string,
nestMap Nested(
    id Uint32,
    key Uint32,
    val UInt64
  ),
create_time DateTime
)engine = SummingMergeTree()
partition by toYYYYMM(create_time)
order by id 

处理逻辑:
1.用order by 排序键作为聚合数据的条件key
2.只有在合并分区的时候才会触发汇总的逻辑
3.以数据分区为单位来聚合数据;当分区合并时,同一数据分区内聚合key相同的数据会被合并汇总,而不同分区之间的数据则不会被汇总
4.如果在定义引擎时指定了columns汇总列(非主键的数值类型字段),则sum汇总这些列字;如果未指定,则聚合所有非主键的数值类型字段
5.在进行数据汇总时,因为分区内的数据已经基于order by 排序,所以能够找到相邻且拥有相同聚合key的数据
6.在汇总数据时,同一分区内,相同聚合key的多行数据会合并成一行;其中,汇总字段会进行sum计算;对于那些非汇总字段,则会使用第一行数据的取值
7.支持嵌套结构,但列字段名称必须以map后缀结尾;嵌套类型中,默认以第一个字段作为聚合key;除第一个字段外,任何名称以key、ID或type为后缀结尾的字段,都将和第一个字段一起组合成复合key
```

### AggregatingMergeTree
```
通过以空间换时间的方法提升查询性能,将需要聚合的数据预先计算出来,并将结果保存起来
eg:
create table agg_table(
id string,
city string,
code AggregateFunction(uniq,string),
value AggregateFunction(sum,UInt32),
create_time DateTime
) engine=AggregatingMergeTree()
order by (id,city)
primary key id

AggregateFunction 是clickhouse提供的一种特殊的数据类型,它能够以二进制的形式存储中间状态结果;在写入数据时,需要调用*State函数;而在查询数据时,则需要调用相应的*Merge函数;
*表示定义时使用的聚合函数 比如uniq和sum

写入数据
eg:
insert into table agg_table
select 'a000','dan',uniqState('code1'),sumState(toUInt32(100)),'2021-06-05 10:00:00'

查询数据
eg:
select id,city,uniqMerge(code),summerge(value) from agg_table group by id,city


更为常见的应用方式是结合物化视图使用,将它作为物化视图的表引擎

首先建立明细数据表,俗称的底表
eg:
create table agg_table_basic(
id string,
city string,
code string,
value UInt32
)engine=MergeTree()
partition by city
order by (id,city)

通常会使用MergeTree作为底表,用于存储全量的明细数据,并以此对外提供实时查询
eg:
create metarialized view agg_view
engine = AggregatingMergeTree()
partition by city
order by (id,city)
as select
id,city,uniqState(code) as code,
sumState(value) as value
from agg_table_basic
group by id,city

处理逻辑:
1.用order by排序键作为聚合数据的条件key
2.使用AggregateFunction字段类型定义聚合函数的类型以及聚合字段
3.只有在合并分区的时候才会触发聚合计算的逻辑
4.以数据分区为单位来聚合数据,当分区合并时,同一数据分区内聚合key相同的数据会被合并计算,而不同分区之间的数据则不会被计算
5.在进行数据计算时,因为分区内的数据已经基于order by排序,所以能够找到那些相邻且拥有相同聚合key的数据
6.在聚合数据时,同一分区内,相同聚合key的多行数据会合并成一行;对于那些非主键、非AggregateFunction类型字段,则会使用第一行数据的取值
7.AggregateFunction类型的字段使用二进制存储,在写入数据时,需要调用*State函数;而在查询数据时,则需要调用相应的*Merge函数;其中*表示定义时使用的聚合函数
8.AggregatingMergeTree通常作为物化视图的表引擎,与普通MergeTree搭配使用
```

### CollapsingMergeTree
```
一种通过以增代删的思路,支持行级数据修改和删除的表引擎;
通过定义一个sign标记位字段,记录数据行的状态;如果sign标记1,则表示这是一行有效的数据;标记为-1,则表示这行数据需要被删除
eg:
create table collpase_table(
id string,
code Int32,
create_time DateTime,
sign Int8
)engine=CollapsingMergeTree(sign)
partition by toYYYYMM(create_time)
order by id

1.折叠数据并不是实时触发的,在查询数据之前,使用optimize table tab2 final 命令强制分区合并,但是这种方法效率极低,在实际生产环境中慎用
2.需要改变我们的查询方式
原始sql:
select id,sum(code),count(code),avg(code),uniq(code) from collpase_table group by id
修改后sql:
select id,sum(code*sign),count(code*sign),avg(code*sign),uniq(code* sign) from collpase_table group by id having sum(sign) >0

2.只有相同分区的数据才有可能被折叠;这项限制对于折叠合并树不是问题,因为修改或者删除数据的时候,这些数据的分区规则通常都是一致的,并不会改变

3.命门所在:对于写入的数据顺序有着严格要求;先写入sign=-1,再写入sign=1.则不能够折叠;
数据的写入程序通常时多线程执行的,那么不能完全保障数据的写入顺序
```

### VersionedCollapsingMergeTree
```
表引擎于CollapsingMergeTree完全相同,只是它对数据的写入顺序没有要求,在同一个分区内,任意顺序的数据都能够完全折叠操作
eg:
create table ver_collapse_table(
id string,
code Int32,
create_time DateTime,
sign Int8,
ver Int8
)engine=VersionedCollapsingMerge(sign,ver)
partition by toYYYYMM(create_time)
order by id

会自动将ver作为排序条件并增加到order by的末端;在每个分区内,数据会按照order by id ver desc排序;所以无论写入时数据的顺序如何,在折叠处理时,都能回到正确的顺序
```

### ReplicatedMergeTree
```
在MergeTree能力的基础之上增加了分布式协同的能力,其借助zookeeper的消息日志广播功能,实现了副本实例之间的数据同步功能
```

---

## 数据操作
### Join
```
join表引擎为join查询而生,等同于将join查询进行了一层简单封装;
engine=Join(join_stricyness,join_type,key1...)

1.join_stricyness:连接精度,决定了join查询在连接数据时所使用的策略,支持ALL、ANY和ASOF三种类型
ALL:如果左表内的一行数据,在右表中有多行数据与之连接匹配,则返回右表中全部连接的数据
eg:
select a.id,a.name,b.rate from join_tb1 as a all inner join join_tb2 on a.id=b.id
ANY:如果左表内的一行数据,在右表中有多行数据与之连接匹配,则仅返回右表中第一行连接的数据
eg:
select a.id,a.name,b.rate from join_tb1 as a any inner join join_tb2 on a.id=b.id
ASOF:是一种模糊连接,允许在连接键之后追加定义一个模糊连接的匹配条件asof_column
eg:
select a.id,a.name,b.rate,a.time,b.time from join_tb1 as a asfo inner join join_tb2 as b on a.id=b.id and a.time=b.time
这条语句的语义等同于:
a.id=b.id and a.time>=b.time

支持使用using的简写形式,using后声明的最后一个字段会被自动转换成asof_column模糊连接条件
eg:
select a.id,a.name.b.rate,a.time,b.time from join_tb1 as a asof inner join join_tb2 as b using (id,time)

注意:asof_column必须是整数、浮点数和日期型这类有序序列的数据类型;asof_column不能是数据表内的唯一字段,连接键join_key和asof_column不能是同一个字段

2.join_type:连接类型,决定了join查询组合左右两个数据集合的策略,形成的结果是交集、并集、笛卡尔积或其他形式,支持INNER(只会返回左表与右表两个数据集合中交集的部分,其余部分都会被排除)、OUTER(left、right、full)和CROSS(会返回左表与右表两个数据集合的笛卡尔积)三种类型;被设置为ANY,在数据写入时,join_key重复数据会被自动忽略
3.join_key:连接键,决定了使用哪个列字段进行关联
eg:
create table join_tb1(
id UInt8,
name string,
time DateTime
)engine=log

create table id_join_tab1(
id UInt8,
price UInt32,
time DateTime
)ENGINE=Join(ANY,LEFT,id)

select id,name,price from join_tb1 LEFT JOIN id_join_tb1 USING (id)

注意事项:
1.遵循左大右小的原则,即将数据量小的表放在右侧;因为无论使用的是哪种连接方式,右表都会被全部加载到内存中与左表进行比较
2.join查询目前没有缓存的支撑,这意味着每一次join查询,即便是连续执行的相同的sql,也都会生成一次全新的执行计划
3.如果是在大量维表属性补全的查询场景中,则建议使用字典代替join查询
```
### Array Join
```
array join 在默认情况下,使用的时inner join策略
eg:
create table query_v1(
title string,
value Array(UInt8)
)ENGINE=Log

select title,value from query_v1 array join value

最终的数据基于value数组被展开成了多行,并且排除掉了空数组;在使用array join时,如果为原有的数组字段添加一个别名,则能够访问展开前的数组字段
select title,value,v from query_v1 array join value as v

left array join:
在改为left连接查询后,在inner join中被排除掉的空数组出现在了返回的结果集中
```

### With RollUP与With Totals
```
rollup 能够按照聚合键从右向左上卷数据,基于聚合函数依次生成分组小计和总计
eg:
select table,name,sum(bytes_on_disk) from system.parts
group by table,name
with rollup
order by table
结果中会附加返回显示名称为空的小计汇总行,包括所有表分区磁盘大小的汇总合计以及每张table内所有分区大小的合计信息

totals会基于聚合函数对所有数据进行总计
eg:select database, sum(bytes_on_disk),count(table) from system.parts group by database with totals
```

### 副本与分片
```
区别:
1.从数据层面区分,假设clickhouse的N个节点组成了一个集群,在集群的各个节点上,都有一张结构相同的数据表Y;
如果N1的Y和N2的Y中的数据完全不同,则N1和N2互为分片;
如果它们的数据完全相同,则互为副本
2.从功能作用层面区分,使用副本的主要目的时防止数据丢失,增加数据存储的冗余;
而使用分片的主要目的时实现数据的水平切分
```

---

## 原理
### ReplicatedMergeTree原理解析
```
在核心逻辑中,大量运用了zookeeper的能力,以实现多个replicatedMergeTree副本实例之间的协同,包括主副本选举、副本状态感知、操作日志分布、任务队列和blockID去重判断等;
在执行insert数据写入、merge分区和mutation操作的时候,都会涉及与zk的通信,但是不涉及任何表数据的传输,不必担心zk的承载压力

初始化操作:
1.根据zk_path初始化所有的zk节点
2.在/replicas/节点下注册自己的副本实例ch5.nauu.com
3.启动监听任务,监听/log日志节点
4.参与副本选举,选举出主副本,选举的方式是向/leader_election插入子节点,第一个插入成功的副本就是主副本


创建第二个ReplicatedMergeTree初始化操作:
1.在/replicas/节点下注册自己的副本实例ch6.nauu.com
2.启动监听任务,监听/log日志节点
3.参与副本选举,选举出主副本
```

### Distributed原理解析
```
Distributed表引擎是分布式表的代名词,它自身不存储任何数据,而是作为数据分片的透明代理,能够自动路由数据至集群中的各个节点,所以Distributed表引擎需要和其他数据表引擎一起协同工作

一张分片表由两部分组成:
1.本地表:通常以_local为后缀进行命名;本地表是承接数据的载体,可以使用非distributed的任意表引擎,一张本地表对应了一个数据分片
2.分布式表:通常以_all为后缀进行命名;分布式表只能使用distributed表引擎,它与本地表形成一对多的映射关系,日后将通过分布式表代理操作多张本地表

定义形式:
engine = distributed(cluster,database,table[,sharding_key])

cluster:集群名称,与集群配置中的自定义名称相对应;在对分布式表执行写入和查询的过程中,会使用集群的配置信息来找到对应的host节点
database和table:分别对应数据库和表的名称,分布式使用这组配置映射到本地表
sharding_key:分片键,选填参数;在数据写入的过程中,分布式表会依据分片键的规则,将数据分布到各个host节点的本地表
eg:
create table test_shard2_all on cluster sharding_simple(
id UInt64
)engine=Distriuted(default_cluster,default,test_shard_local,rand())
```