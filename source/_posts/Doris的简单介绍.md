---
title: Doris的简单介绍
date: 2020-11-30 14:11:01
categories: 大数据
tags: doris
---

> 初步了解Doris的原理,与Kylin满足离线多维分析需求相对,Doris满足实时多维分析需求[传送门](https://blog.bcmeng.com/post/apache-doris-query.html).

<!-- more -->

## 整体架构
```sh
FE(Frontend)
    功能:
        存储,维护集群元数据
        接收,解析查询请求,规划查询计划,调度查询执行,生成物理计划,返回查询结果
    角色:
        Leader,Follower(高可用)
        Observer(扩展查询节点,只参与读取)
    元数据:
        Paxos协议以及Memory+CheckPoint+Journal机制保证元数据高性能高可靠
        元数据更新(写入磁盘日志文件,写入内存,定期CheckPoint到本地磁盘)
        
BE(Backend)
    功能:
        存储物理数据
        分布式执行查询
```

---

## 执行
```sh
步骤:
    1.用户通过MySQL(MySQL协议)客户端向Doris发送查询
    2.Doris接收到请求,每个请求封装成一个ConnectContext
    3.ConnectScheduler维护一个线程池,每个ConnectContext在一个线程中由ConnectProcessor(负责查询的处理,审计,返回查询结果给客户端)进程处理
    4.ConnectProcessor进行SQL的Parse(Java CUP Parser: sql_parser.cup),输入是SQL字符串,输出为AST(StatementBase)
        ps:一个SelectStmt由SelectList,FromClause,WherePredicate,GroupByClause,HavingPredicate,OrderByElement,LimitElement组成
    5.StmtExecutor具体负责查询的执行,对AST进行语法和语义分析
        a.检查并绑定Cluster,DataBase,Table,Column等元信息
        b.SQL合法性检查:窗口函数不能distinct,HLL和Bitmap列不能sum/count,where中不能有grouping操作
        c.SQL重写
        d.Table和Column的别名处理
        e.Tuple,Slot,表达式分配唯一的ID
        f.函数参数的合法性检测
        g.表达式替换
        h.类型检查,类型替换
    6.ExprRewriter根据ExprRewriteRule进行重写(重写成功会再次触发语法语义分析)
    7.生成单机执行Plan(单机Plan由SingleNodePlanner执行,输入是AST,输出是物理执行Plan)
        a.Slot物化
        b.投影下推: 只会读取必须读取的列
        c.谓词下推: 满足语义的前提下过滤条件尽可能下推到Scan节点
        d.分区,分桶裁剪
        e.Join Reorder: 对于InnerJoin,根据行数调整表的顺序,大表在前
        f.Sort+Limit优化成TopN
        g.MaterializedView选择
    8.DistributedPlanner生成PlanFragment树(1个PlanFragment封装了在一台机器上对同一数据集的操作逻辑)
    9.Coordinator会负责PlanFragment的执行实例生成
```