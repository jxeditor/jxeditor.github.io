---
title: 压力测试工具
date: 2018-10-16 08:43:06
categories: 工具
tags: tools
---

> 通过一些简单的命令进行压力测试

<!-- more -->

## MySQL自带的压测工具MySQLSlap
```sh
# 示例
mysqlslap –user=root –password=123456 –auto-generate-sql

-auto-generate-sql: 自动生成测试SQL
结果:运行所有语句的平均秒数,运行所有语句的最小秒数,运行所有语句的最大秒数,客户端数量,每个客户端运行查询的平均数

# 添加并发
mysqlslap –user=root –password=123456 –concurrency=100 –number-of-queries=1000 –auto-generate-sql

–concurrency=100 指定同时有100个客户端连接
–number-of-queries=1000 指定总的测试查询次数(并发客户端数 * 每个客户端的查询次数)

# 自动生成复杂表
mysqlslap –user=root –password=123456 –concurrency=50 –number-int-cols=5 –number-char-cols=20 –auto-generate-sql

–number-int-cols=5 指定生成5个int类型的列
–number-char-cols=20 指定生成20个char类型的列

# 使用自定义测试库与测试语句
mysqlslap –user=root –password=123456 –concurrency=50 –create-schema=employees –query="SELECT * FROM dept_emp;"

–create-schema 用来指定测试库名称
–query 是自定义的测试语句

mysqlslap –user=root –password=123456 –concurrency=20 –number-of-queries=1000 –create-schema=employees –query="select_query.sql" –delimiter=";"

–query 中指定了sql文件
–delimiter 说明sql文件中语句间的分隔符是什么

# 常用参数
--auto-generate-sql, -a 自动生成测试表和数据，表示用mysqlslap工具自己生成的SQL脚本来测试并发压力。
--auto-generate-sql-load-type=type 测试语句的类型。代表要测试的环境是读操作还是写操作还是两者混合的。取值包括：read，key，write，update和mixed(默认)。
--auto-generate-sql-add-auto-increment 代表对生成的表自动添加auto_increment列，从5.1.18版本开始支持。
--number-char-cols=N, -x N 自动生成的测试表中包含多少个字符类型的列，默认1
--number-int-cols=N, -y N 自动生成的测试表中包含多少个数字类型的列，默认1
--number-of-queries=N 总的测试查询次数(并发客户数×每客户查询次数)
--query=name,-q 使用自定义脚本执行测试，例如可以调用自定义的一个存储过程或者sql语句来执行测试。
--create-schema 代表自定义的测试库名称，测试的schema，MySQL中schema也就是database。
--commint=N 多少条DML后提交一次。
--compress, -C 如果服务器和客户端支持都压缩，则压缩信息传递。
--concurrency=N, -c N 表示并发量，也就是模拟多少个客户端同时执行select。可指定多个值，以逗号或者--delimiter参数指定的值做为分隔符。例如：--concurrency=100,200,500。
--engine=engine_name, -e engine_name 代表要测试的引擎，可以有多个，用分隔符隔开。例如：--engines=myisam,innodb。
--iterations=N, -i N 测试执行的迭代次数，代表要在不同并发环境下，各自运行测试多少次。
--only-print 只打印测试语句而不实际执行。
--detach=N 执行N条语句后断开重连。
--debug-info, -T 打印内存和CPU的相关信息。
```

---

## AB接口压力测试
```sh
# ab的使用
Usage: ab [options] [http[s]://]hostname[:port]/path
Options are:
    -n requests     请求的次数
    -c concurrency  并发数
    -t timelimit    持续时间
                    This implies -n 50000

# 模拟500个客户端进行20000次请求
ab -c 500 -c 20000 'http://127.0.0.1'

# 模拟POST请求
args.txt内容id=1&name=zs
ab -n 500 -c 500 -p args.txt -T application/x-www-form-urlencoded 'http://IP:PORT/api/demo'

# 测试结果
Requests per second: 吞吐率
Time per request: 上面的是用户平均请求等待时间
Time per request: 下面的是服务器平均请求处理时间
```