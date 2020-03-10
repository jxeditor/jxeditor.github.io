---
title: Ververica&Flink进阶之十四PyFlink
date: 2019-08-09 14:15:36
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Python Table API架构
```
Python VM
    Python Table API
    Python Gateway
        Table TableEnv
Py4J
Socket
JVM
    CliFrontend
    Java GatewayServer
        Table TableEnv
Flink Cluster
```

---

# Job开发
```python
#创建执行环境
exec_env = ExecutionEnvironment.get_execution_environment()
#创建配置对象(IdleState TTL,NULL check,timezone等)
t_config = TableConfig()
#创建一个TableEnv
t_env = BatchTableEnvironment.create(exec_env,t_config)

#创建数据源
t_env.connect(FileSystem().path(source_file)) \
    #Csv/Json/Avro
    .with_format(OldCsv()
        .line_delimiter(',')
        .field('word',DataTypes.STRING())) \
    #定义字段名和类型
    .with_schema(Schema()
        .field('word',DataTypes.STRING())) \
    #注册Source
    .register_table_source('mySource')
    
#创建结果表
t_env.connect(FileSystem().path(sink_file)) \
    #Csv/Json/Avro
    .with_format(OldCsv()
        .line_delimiter(',')
        .field('word',DataTypes.STRING())
        .field('count',DataTypes.BIGINT())) \
    #定义字段名和类型
    .with_schema(Schema()
        .field('word',DataTypes.STRING())
        .field('count',DataTypes.BIGINT())) \
    #注册Sink
    .register_table_sink('mySink')
    
#编辑业务逻辑和执行
#word_count计算逻辑
#读取数据源
t_env.scan('mySource') \
    #按word进行分组
    .group_by('word') \
    #进行count计数统计
    .select('word,count(1)') \
    #将计算结果插入到结果表
    .insert_into('mySink')
#执行Job
t_env.execute("wc")
```

---

# 环境搭建
```
依赖
    JDK1.8+
    Maven3.x+
    Scala2.11+
    Python2.7+
    Git2.20+
    Pip19.1+
构建Java二进制发布包
    下载源代码
    git clone https://github.com/apache/flink.git
    拉取1.9分支
    cd flink
    git fetch origin release-1.9
    git checkout -b release-1.9 origin/release-1.9
    构建二进制发布包
    mvn clean install -DskipTests -Dfast
构建Python发布包
    cd flink-python
    python setup.py sdist
    在dist目录的apache-flink-1.9.dev0.tar.gz就是可以用于pip install的pyFlink包
安装PyFlink
    pip install dist/*.tar.gz
    pip list
```

---

# 作业提交
```
CLI方式
    ./bin/flink run -py wc.py
    -py指定python文件
    -pym指定python的module
    -pyfs指定python依赖的资源文件
    -j指定依赖的jar包
    
Python-Shell
    Local
        bin/pyflink-shell.sh local(会启动一个mini Cluster)
    Remote
        bin/pyflink-shell.sh remote 127.0.0.1 4000(需要一个已经存在的Cluster)
```

---

# PythonTableAPI算子
```
PythonAPI(1.9) == JavaTableAPI
select
alias
filter
where
group_by -> GroupedTable -> select -> Table
distinct
join(inner,left,right,full)
minus
minus_all
union
union_all
over_window -> OverWindowedTable -> select -> Table
window -> GroupWindowedTable -> groupBy -> WindowGroupedTable -> select -> Table
add_columns
drop_columns
```