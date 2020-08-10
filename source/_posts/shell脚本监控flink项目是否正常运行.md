---
title: shell脚本监控flink项目是否正常运行
date: 2020-08-10 09:58:06
categories: 大数据
tags: shell
---

> flink基于yarn,其中一种较为简单的判断flink作业是否正常执行的方式

<!-- more -->
#### 监控flink作业的需求
```
原因: flink作业运行至yarn上,可以直接在yarn的Resource Manager上进行查看该作业是否因为某些原因强制退出以及containers是否大于等于2
(发现只有一个container的作业都有问题,需要报警进行查看原因)

解决方案:使用shell监控yarn上的flink相关脚本
```

#### shell脚本相关内容
```
#!/bin/sh
#获取flink作业在yarn上的名称
nameIds=(`yarn application -list -appStates RUNNING|sed -n "3~1p" |awk -F "\t" '{print $1"|" $2}'|sed -e 's/[[:space:]]//g'`)

#获取需要监控的flink名称
arr=(`cat ./name|sed -e 's/[[:space:]]//g'`)
#cd /home/etiantian/common-jars
jarName='send-mail.jar'

base=`pwd`
dt=`date "+%Y-%m-%d_%H:%M:%S"`
echo $dt
echo $base
log="./"$dt".stop"
for i in ${arr[@]}
do
        isExist="false"
        flag="true"
        for j in ${nameIds[@]}
        do
                nameId=(${j//\|/ })
                if [ "$i" = "${nameId[1]}" ]
                then
                        isExist="true"
                        attempt=(`yarn applicationattempt -list ${nameId[0]}|sed -n "3~1p" |awk -F "\t" '{print $1}'`)
                        #判断该作业对应containers是否大于2处于正常状态
                        container=`yarn container -list ${attempt[0]}|grep "Total number of containers"|awk -F ":" '{print $2}'`
                        if [ $container -lt 2  ]
                        then
                                flag="false"
                        fi
                fi
        done
        if [ "$flag" != "true" ] || [ "$isExist" != "true" ]
        #if [ "$flag" == "true" ] && [ "$isExist" == "true" ]
        then
                echo $i >> $log
        fi
done
#对有问题的flink作业报警告处理
if [ -e $log ]
then
   z=`cat $log|xargs echo|sed -e 's/ /,/g'`
   #z=`cat $log`
   echo $z
   java -jar $BASE/$jarName $BASE/$config $z
   #cd $base && java -jar $BASE/$jarName $BASE/$config $z
   rm -rf $log
fi
```