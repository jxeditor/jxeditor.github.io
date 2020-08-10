---
title: shell脚本监控hive日志表每日数据
date: 2020-08-10 09:50:38
categories: 大数据
tags: shell
---

> 日志数据由研发存储至kafka,偶尔发现相关表数据量为0的情况

<!-- more -->

#### 监控hive日志表数据的需求
```
原因:研发将相关日志数据存储至kafka,通过flink存储至hbase,映射至hive表,进行清洗处理
发现研发有丢失的情况

解决方案: 每日查询13张日志表数据,通过html的方式发送至每人的邮箱
```

#### 脚本内容
```
#!/bin/sh

#获取需要监控的表名称
arr=(`cat ./name|sed -e 's/[[:space:]]//g'`)

dt=`date "+%Y-%m-%d %H:%M:%S"`
echo $dt
yesDate=`date +%Y-%m-%d -d '-1 day'`

base=`pwd`
echo $BASE

log="./"$yesDate".html"
#如果存储对应目录文件,进行删除
$(> $log)
jarName='send-mail.jar'

echo -n "<html>" >> $log
echo -n "<body><h2 lign=center>13张日志表数据每日统计</h2>" >> $log
echo -n "<table>" >>$log
echo -n "<tr><th>Table Name</th><th width=200px>Yes Count</th></tr>" >> $log

for i in ${arr[@]}
do
  count=`hive -e "select count(*) from $i where c_date ='$yesDate'"`
  #echo $i $count >> $log
  echo -n "<tr><td align=center>$i</td><td align=center>$count</td></tr>" >> $log
done

echo -n "</table></body>" >>$log
echo -n "</html>" >> $log

if [ -e $log ]
then
  z=`cat $log|xargs`
  java -jar $BASE/$jarName $BASE/$config "$z"
fi
```

