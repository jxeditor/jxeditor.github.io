---
title: Hive基础语法整理
date: 2017-08-30 09:25:54
categories: 大数据
tags: hive
---

> 对于hive的一些常见使用

<!-- more -->

## 进入hive
```
hive
# 或者
beeline
!connect jdbc:hive2://localhost:10000
```

---

## 增删改查
```
# 查看表信息
desc formatted u1;
desc extended u1;
show create table u1;

# 创建内部表
create table data(id int,name string)
row format delimited fields terminated by ',';
create table data(id int,name string)
row format delimited fields terminated by ',';

# 创建外部表
create table data(id int,name string)
row format delimited fields terminated by '\t'
stored as textfile
location '/root/class.txt';

# 修改表名
alter table data rename to data1;

# 删除表
# 删除外部表,会删除元数据,数据内容还存在
# 删除内部表,会删除元数据,数据内容也被删除
drop table data;

# 清空表数据
# truncate不能删除外部表
truncate table data;

# 添加字段
alter table data add columns(age int,add String);
 
# 删除字段---只留下age,add字段
alter table data replace columns(age int,add String);

# 导入数据
insert into 导入到多张表 from aa7 insert into aa10 select id where id>1 insert into aa11 select name;

# 导出数据
# 从hive表导出到本地目录
insert overwrite local directory '/root/hivedata/exp1' row format delimited fields terminated by '\t' select * from aa7;
# 从hive表导出到hdfs目录
insert overwrite directory '/exp1' row format delimited fields terminated by '\t' select * from aa7;
# >重定向到文件中
hive -e "use uu;select * from aa7" > /root/exp1;

# 分区表
create table data(id int,name string)
partitioned by (country string)
row format delimited fields terminated by ',';

# 加载文件到分区表
load data local inpath '/root/class.txt' into table data partition(country='china');

# 添加分区
alter table data add partition(country='america');

# 添加分区时指定数据
alter table data add partition (year='2018') location '/数据';

#指定分区对应到已有的数据
alter table test partition (year='2020') set location 'hdfs://hadoop01:9000/user/hive/warehouse/qf.db/comm/year=2021'

# 显示分区
show partitions test;

# 删除分区
alter table data drop partition(country='america');

# 重命名分区
alter table data partition(year='2017') rename to partition(year='2021');

# 修改字段(字段名,类型,位置,注释)--必须指定列的类型
alter table data change column id myid int comment '注释'; 
alter table data change column id myid int after name; 
alter table data change column id myid int frist;

# 将内部表改成外部表--true必须大写
alter table test set tblproperties('EXTERNAL'='TRUE');

# 将外部表改成内部表--false小写大写都可以
alter table test set tblproperties('EXTERNAL'='false');

# 创建分桶表
# 分桶字段对其Hash值,然后mod总的桶数,得到的余数就是一个桶
create table if not exists data(
    id int,
    comment string
)
clustered by(id) into 4 buckets
row format delimited fields terminated by '\t'
;

# (load方式加载分桶数据,并没有真正的划分数据)
load data local inpath '/root/class.txt' into table data;

# 在使用insert into 加载数据时,要开启自动分桶
set hive.enforce.bucketing=true;
insert into data select id,comment from tmp3;

# 查询分桶数据
select * from data;

# 查询第一桶tablesample(bucket x out of y on id);
# x:从第几桶开始
# y:总的桶数
# x不能大于y
# y总的桶数尽量是源总桶数的倍数
# x x+分桶数/(分桶数/y)=下一桶
select * from data tablesample(bucket 1 out of 4 on id);
select * from tmp4 order by rand() limit 3; 
select * from tmp4 tablesample(1 rows);
select * from tmp4 tablesample(2G);
select * from tmp4 tablesample(2M);
select * from tmp4 tablesample(2K);
select * from tmp4 tablesample(2B);
select * from tmp4 tablesample(20 percent);

# 大表标识
select /*+STREAMTABLE(d)*/ d.deptno from data d left join emp e on d.deptno = e.deptno where e.deptno is null;

# sort by
# 局部排序,指单个reducer结果集排序,整个job是不是有序,他不管
# order by
# 全局排序,整个job的所有reducer中的数据都会排序
# 当reducer数量为1时,两者都一样.
# distribute by
# 对distribute by后的字段进行分发,相同的分发到同一个reduce,当distribute by 和 sort by同时存在时,distribute by在sort by之前
# cluster by
# 兼有distribute by 和 sort by 的功能,但是sort by需要是升序
```

---

## 复杂的数据类型
- array:数组
- map:集合
- struct:结构体

```
lucey 90,80,99
biman 10,100,99
create table if not exists data(
    name string,
    score Array<double>
)
row format delimited fields terminated by '\t'
collection items terminated by ','

select a.name,a.score[1],a.score[2] from data a where a.score[1] > 60;

lucey Chinese:90,Math:80,English:99
biman Chinese:10,Math:100,English:99
create table if not exists data(
    name string,
    score map<string,double>
)
row format delimited fields terminated by '\t'
collection items terminated by ','
map keys terminated by ':';
 
select m.name,m.score['Chinese'],m.score['Math'] from data m where m.score['Math'] > 60;
 
lucey 90,80,99
biman 10,100,99
create table if not exists data(
    name string,
    score struct<chinese:double,math:double,englist:double>
)
row format delimited fields terminated by '\t'
collection items terminated by ',';

select str.name,str.score.chinese,str.score.math from data str where str.score.math > 60;
```

---

## 内部函数
```
select rand();
select split(rand()*100,"\\.")[0];
select substring(rand()*100,2,2);
select regexp_replace("a.jsp","jsp","html");
select cast(1 as double);
select case when 1=1 then "man" when 1=2 then "woman" else "yao" end;
select concat("1","2");
select concat_ws("|","1","2"); # 连接符
select length("asb");

# 时间戳转字符串
from_unixtime(cast(f.finish_time as int),'yyyy-MM-dd HH:mm:ss')
# 字符串转时间戳
unix_timestamp('2018-02-06 00:00:00','yyyy-MM-dd HH:mm:ss')

row_number():没有相同名次,名次不空位
rank():有并列名次,并列名次后将空位
dense_rank():有并列名次,无空位

# 查询每个班级的前三
select tmp.c,tmp.s 
from (
select r.class c,r.score s,row_number() over (distribute by r.class sort by r.score desc) rr from classinfo r
) tmp 
where rr<4;

select class,score,
rank() over(distribute by class sort by score desc) rank,
dense_rank() over(distribute by class sort by score desc) dense_rank,
row_number() over(distribute by class sort by score desc) row_number
from classinfo;
```

---

## 执行计划
```
# 通过EXPLAIN,EXPLAIN EXTENDED或explain DEPENDENCY来查看执行计划和依赖情况
explain select * from aa7;
explain extended select * from aa7;
```

---

## 命令行执行
```
hive -e "sql"
# 显示表名列名
set hive.cli.print.header=true;
# 不显示表名
set  hive.resultset.use.unique.column.names=false;
```