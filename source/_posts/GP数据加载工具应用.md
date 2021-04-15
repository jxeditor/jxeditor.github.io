---
title: GP数据加载工具应用
date: 2021-04-14 18:51:12
categories: 大数据
tags: greenplum
---

> 主要介绍gpload进行数据导入操作流程

<!-- more -->

## 准备工作
```
gpload是对gpfdist的封装,使用前必须开启gpfdist服务

# 创建加载数据的表,用于将数据导入到该表
CREATE TABLE demo_load(
    id int,
    name text
);
```

---

## 使用gpload
### 执行命令
```
vi load.yml
VERSION: 1.0.0.1
DATABASE: gpdb
USER: gpadmin
HOST: 192.168.157.128
PORT: 5432
GPLOAD:
   INPUT:
    - SOURCE:
         LOCAL_HOSTNAME:
           - master
         PORT: 5432
         FILE:
           - /home/gpadmin/load_files/demo.txt
    - COLUMNS:
               - id: int
               - name: text
    - FORMAT: text
    - DELIMITER: '|'
    - QUOTE: '"'
    - HEADER: false
    - ERROR_LIMIT: 25
    - ERROR_TABLE: public.gpload_err
   OUTPUT:
    - TABLE: public.demo_load
    - MODE: INSERT

# 加载数据
gpload -f load.yml
```

### 参数含义
```
VERSION: 1.0.0.1            --指定控制文件schema的版本
DATABASE: db_name           --指定连接数据库的名字,如果没有指定,由环境变量$PGDATABASE,或者通过gpload参数-d指定
USER: db_username           --指定连接目标数据库的用户名,如果不使用超级管理员,服务参数gp_external_grant_privileges必须设置成on
HOST: master_hostname       --指定master主机名,也可以通过gpload的-h选项,或者环境变量$PGHOST指定
PORT: master_port           --指定master的连接端口号,默认是5432,或者通过gpload命令的-p选项或者环境变量$PGPORT指定
GPLOAD:                     --必须指定,表示装载设置部分在它下面必须定义INPUT:和OUTPUT:两个部分
INPUT:                      --必须指定,这部分指定装载数据的格式和位置
- SOURCE:                   --必须指定,定义source文件的位置,每个输入部分可以定义多个source部分, windows路径的指定比较特别,比如c:\要写成c:/
LOCAL_HOSTNAME:             --指定gpload运行的主机名称和ip地址,如果有多块网卡,可以同时使用它们,提高装载速度.默认只使用首选主机名和IP
- hostname_or_ip
PORT: http_port             --指定gpfdist使用的端口,也可以选择端口范围,由系统选择,如果同时指定,port设置优先级高
| PORT_RANGE: [start_port_range, end_port_range]
FILE:                       --指定装载数据文件的位置,目录或者命名管道.如果文件使用gpzip或者bzip2进行了压缩,它可以自动解压.可以使用通配符*和C语言风格的关系匹配模式指定多个文件
- /path/to/input_file
- COLUMNS:                    --指定数据源的数据格式,如果没有指定这部分,source表的列顺序,数量,以及数据类型必须与目标表一致
- field_name: data_type
- FORMAT: text | csv          --指定文件格式是text还是csv
- DELIMITER: 'delimiter_character'  --指定文本数据域(列)之间的分割符,默认是|
- ESCAPE: 'escape_character' | 'OFF'  --text定义转义字符,text格式默认是\,在text格式中可以选择off关掉转义字符(web log处理时比较有用)
- NULL_AS: 'null_string'       --指定描述空值的字符串,text格式默认是\N,csv格式不使用转义符号的空值
- FORCE_NOT_NULL: true | false --csv格式,强制所有字符默认都用""括起,因此不能有空值,如果两个分割符之间没有值,被当做0长度字符串,认为值已经丢失
- QUOTE: 'csv_quote_character'  --csv指定转义字符,默认是"
- HEADER: true | false          --是否跳过数据文件第一行,当做表头
- ENCODING: database_encoding   --指定数据源的字符集
- ERROR_LIMIT: integer          --指定由于不符合格式数据记录的上限,如果超过该上限,gpload停止装载,否则正确记录可以被装载,错误记录抛出写入错误表.但它仅支持数据格式错误,不支持违背约束的问题
- ERROR_TABLE: schema.table_name --指定不符合格式要求记录的错误表.如果指定的表不存在系统自动创建

OUTPUT:
- TABLE: schema.table_name       --指定装载的目标表
- MODE: insert | update | merge  --指定操作模式，默认是insert.merge操作不支持使用随机分布策略的表
- MATCH_COLUMNS:                 --为update操作和merge操作指定匹配条件
     - target_column_name            
- UPDATE_COLUMNS:                 --为update操作和merge操作指定更新的列
     - target_column_name
- UPDATE_CONDITION: 'boolean_condition'  --指定where条件,目标表中只有满足条件的记录才能更改,(merge情况下,只有满足条件的记录才能insert)
- MAPPING:                        --指定source列和目标列的映射关系
target_column_name: source_column_name | 'expression'
PRELOAD:                          --指定load之前的操作
- TRUNCATE: true | false          --如果设置成true,装载之前先删除目标表中所有记录,再装载
- REUSE_TABLES: true | false     --设置成true，不会删除外部表对象会这中间表对象。从而提升性能
SQL:
- BEFORE: "sql_command"         --装载操作开始前执行的SQL，比如写日志表
- AFTER: "sql_command"          --装载操作之后执行的SQL
```

---

## 问题
```
每次gpload之后都会产生一个外部表,查看表是又连接也会失效
did not find an external table to reuse.
需要手动指定新的gpfdist文件服务目录
```