---
title: Python搜索工程的输入输出表
date: 2020-07-31 09:53:20
categories: 大数据
tags: python
---

> 编写python相关脚本全自动搜索的方式来取代人工查找每个作业的输入输出表
> 主要用于作业汇总,作业流查询等用处
> 对错误数据以及可忽略的部分进行过滤处理
<!-- more -->

#### 指定具体某个作业(半自动)
```
# -*- coding: utf-8 -*-

# 解析程序的输出输出表关系
import re

with open('E:/relationship-analysis/file/DoQuesAndTeachingStat.scala',encoding='UTF-8')as file:
    encoding = 'UTF-8'
    line = file.read()

    appName = re.findall(r"appName\(\"(.+)\"", line)[0]
    # 查找以from开头,以"结尾的内容
    inputTable = re.findall(r"[fF][rR][oO][mM]\s+(.+)", line)
    input = []
    inputTable = list(set(inputTable))
    for i in range(len(inputTable)):
        #rfind返回字符串最后一次出现的位置,如果没有匹配则返回-1
        inputTable[i] = inputTable[i][0:inputTable[i].find('"', 1)]
        # find_ = inputTable[i].find(' ') + 1
        find_ = inputTable[i].find(' ', 1) + 1
        if find_ == 0:
            if inputTable[i].find("$") == -1 and inputTable[i].find("tmp") == -1 and inputTable[i].find("temp") == -1 :
                input.append(inputTable[i] + ',' + appName + "," + "INPUT")
        else:
            input.append(inputTable[i][:inputTable[i].find(' ')] + ',' + appName + "," + "INPUT")
    print(set(input))

    #outputTable = re.findall(r"(saveToEs\s*\(\s*|valueOf\s*\(|OUTPUT_TABLE\s*,\s*|saveAsTable\s*\(\s*|insertInto\s*\(\s*)(.+)\)",line)
    outputTable = re.findall(
        r"(saveToEs\s*\(\s*|valueOf\s*\(|OUTPUT_TABLE\s*,\s*|saveAsTable\s*\(\s*|insertInto\s*\(\s*)(.+)\)", line)
    out = []
    if(line.__contains__("syncEs")):
        tmp = re.findall(r"syncEs\s*?[\s\S]*?\)", line)
        outTmp= list(set(tmp))
        for j in range(len(outTmp)):
            out_=outTmp[j].find('"')
            if out_ != -1:
                cin = outTmp[j].split('"')[1]
                outputTable.append(["syncEs", '"'+cin+'"'])
    for i in range(len(outputTable)):
        find_=outputTable[i][1].find('"')+1
        if find_ == 0:
            regex = outputTable[i][1] + r"\s*=\s*\"(.+)\""
            if len(re.findall(regex, line)) != 0:
                out.append(appName[0] + "," + re.findall(regex, line)[0] + ",OUTPUT")
        else:
            if (outputTable[i][1] != "snapTable") and (outputTable[i][1].find("index")==-1):
                out.append(appName + "," + outputTable[i][1][find_:outputTable[i][1].find('"', 2)] + ",OUTPUT")
    print(set(out))

    with open('E:/relationship-analysis/file/relation.csv',mode='w') as relation:
        inputter = list(set(input))
        output = list(set(out))
        for i in range(len(inputter)):
            relation.write(inputter[i])
            relation.write("\n")
        for i in range(len(output)):
            relation.write(output[i])
            relation.write("\n")
```


#### 全自动,只要指定工程的目录,就能搜索相关作业的所有输入输出内容
```
import re
import os
import uuid
import time


def writeTable(path, fileName):
    arr = []
    f1 = open(path, encoding='utf-8')
    f2 = open(path, encoding='utf-8')
    line = f1.read()
    for l in f2:
        arr.append(l)

    # appName
    appName = re.findall(r"\.appName\(\"(.+)\"\)", line)
    if(len(appName) == 0):
        return

    # 输入表
    inputTable = re.findall(r"[fF][rR][oO][mM]\s+(.+)", line)
    input = []
    for i in range(len(inputTable)):
        # print(inputTable[i])
        inputTable[i] = inputTable[i][0:inputTable[i].find('"', 1)]
        find_ = inputTable[i].find(' ', 1) + 1
        if find_ == 0:
            if inputTable[i].find("$") == -1 and inputTable[i].find("tmp") == -1 and inputTable[i].find(
                    "temp") == -1:
                input.append(inputTable[i] + "," + appName[0] + ",INPUT")
        else:
            if not str(inputTable[i][0:inputTable[i].find(' ', 1)]).__eq__('"'):
                if inputTable[i].find("$") == -1 and inputTable[i].find("tmp") == -1 and inputTable[i].find(
                        "temp") == -1:
                    input.append(inputTable[i][0:inputTable[i].find(' ', 1)] + "," + appName[0] + ",INPUT")
    input = list(set(input))

    # 输出表
    out = []
    outputTable = re.findall(
        r"(saveToEs\s*\(\s*|valueOf\s*\(|OUTPUT_TABLE\s*,\s*|saveAsTable\s*\(\s*|insertInto\s*\(\s*)(.+)\)",
        line)
    if (line.__contains__("syncEs")):
        tmp = re.findall(r"syncEs\s*?[\s\S]*?\)", line)
        outTmp = list(set(tmp))
        for j in range(len(outTmp)):
            out_ = outTmp[j].find('"')
            if out_ != -1:
                cin = outTmp[j].split('"')[1]
                outputTable.append(["syncEs", '"' + cin + '"'])
    for i in range(len(outputTable)):
        find_ = outputTable[i][1].find('"') + 1
        if find_ == 0:
            regex = outputTable[i][1] + r"\s*=\s*\"(.+)\""
            if len(re.findall(regex, line)) != 0:
                out.append(appName[0] + "," + re.findall(regex, line)[0] + ",OUTPUT")
        else:
            if (outputTable[i][1] != "snapTable") and (outputTable[i][1].find("index") == -1):
                out.append(appName[0] + "," + outputTable[i][1][find_:outputTable[i][1].find('"', 2)] + ",OUTPUT")
    out = list(set(out))

    with open('E:\\relationship-analysis\\file\\' + fileName + '.csv', mode='a') as relation:
        for i in range(len(input)):
            relation.write(input[i])
            relation.write("\n")
        for i in range(len(out)):
            relation.write(out[i])
            relation.write("\n")


if __name__ == '__main__':
    target_dir = "E:\\spark2\\"
    fileName = str("relation-" + time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime()))
    for root, dirs, files in os.walk(target_dir):
        for name in files:
            if name.endswith(".scala"):
                print(os.path.join(root, name))
                writeTable(os.path.join(root, name), fileName)

```