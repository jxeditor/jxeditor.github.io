---
title: FlinkMeetup会议观后整理之OPPO
date: 2019-06-04 08:59:01
categories: 大数据
tags: 
    - Flink
---
> 对于4月份在深圳举行的FlinkMeetup峰会,做一些知识性总结,提升一下自己,OPPO篇其实张俊张老师已经在过往记忆上做过总结整理了-[传送门](https://mp.weixin.qq.com/s/ZZaaN0ubQgLqFwTiySi8UQ),本文更多的是了解自己的不足

---

## 主要内容
- OPPO实时数仓的演进思路
- 基于Flink SQL的扩展条件
- 构建实时数仓的应用案例
- 未来的思考和展望

---
<!-- more -->
## 一、OPPO实时数仓的演进思路
### 1.OPPO业务与数据规模
OPPO基于Android定制了自己的ColorOS系统,日活跃用户超过2亿.围绕着ColorOS,OPPO构建了很多互联网应用,比如应用商店,浏览器,信息流等.用户在使用这些互联网应用的同时,也给OPPO积累了大量的数据.目前OPPO的总数据量超过100PB,日增数据量超过200TB---**数据**.

要支撑这么大的一个数据量,OPPO研发出一整套的数据系统与服务,并逐渐形成了自己的数据中台体系---**数据中台**.

### 2.OPPO数据中台
数据中台是什么?数据中台是指通过数据技术,对海量数据进行采集,计算,存储,加工,同时统一标准和口径.如果将数据看做原材料,那么数据中台就是加工坊.把它分成4个层次:
> **业务支撑**: 应用商店,浏览器,广告等;生产,品质,销售等;手软,ColorOs,影像等;IOT厂商
> 
> **数据产品与服务**: BI报表,用户洞察,内容标签,精准营销,舆情监测
> 
> **全域数据体系**: ID-Mapping,用户标签,内容标签
> 
> **数据仓库**: 原始层,明细层,汇总层,应用层
> 
> **统一工具体系**: 数据接入,数据治理,数据开发,数据消费
>
> **基础设施**: 存储,计算

- 最下层是统一工具体系,涵盖了"接入-治理-开发-消费"全数据链路;
- 基于工具体系之上构建了数据仓库,划分成"原始层-明细层-汇总层-应用层",这也是经典的数仓架构;
- 再往上就是全域的数据体系,什么是全域呢?就是把公司所有的业务数据全部打通,形成统一的数据资产,比如ID-Mapping,用户标签等;
- 最终,数据要能被业务用起来,需要场景驱动的数据产品与服务.

以上就是OPPO数据中台的整个体系,而数据仓库在其中处于非常基础与核心的位置.

### 3.构建OPPO离线数仓
构建过程: 首先,数据来源基本是手机,日志文件以及DB数据库,基于Apache NiFI打造高可用,高吞吐的接入系统,将数据统一落入HDFS,形成原始层;紧接着,基于Hive的小时级ETL与天级汇总Hive任务,分别负责计算生成明细层与汇总层;最后,应用层是基于OPPO内部研发的数据产品,主要是报表分析,用户画像以及接口服务.此外,中间的明细层还支持Presto的**即席查询**与**自助取数**.

### 4.数仓实时化的诉求
> **业务侧**

- 实时报表: 人群投放的到达率/曝光率/点击率
- 实时标签: 用户当前所在的商圈
- 实时接口: 用户最近下载某APP的时间
 
> **平台侧**

- 调度任务: 凌晨0点大批量启动
- 标签导入: 全量导入耗费数小时
- 质量监控: 及时发现数据问题

对于数仓实时化的诉求,大家通常都是从业务视角来看,但其实站在平台的角度,实时化也能带来切实的好处.首先,从业务侧来看,报表,标签,接口等都会有实时的应用场景;其次,对平台侧来说:第一,大量的批量任务都是从0点开始启动,都是通过T+1的方式去做数据处理,这会导致计算负载集中爆发,对集群的压力很大;第二,标签导入也属于一种T+1批量任务,每次全量导入都会耗费很长的时间;第三,数据质量的监控也必须是T+1的,导致没办法及时发现数据的一些问题.

### 5.离线到实现的平滑迁移
<table>
    <tr>
        <th rowspan="4">小时/天级</th>
        <th rowspan="2">API</th>
        <th>编程接口</th>
        <th>SQL+UDF</th>
    </tr>
    <tr>
        <th>数仓抽象</th>
        <th>Table</th>
    </tr>
    <tr>
        <th rowspan="2">RunTime</th>
        <th>批量计算</th>
        <th>Hive</th>
    </tr>
    <tr>
        <th>离线数据</th>
        <th>HDFS</th>
    </tr>
</table>
<table>
    <tr>
        <th rowspan="4">秒级/分级</th>
        <th rowspan="2">API</th>
        <th>编程接口</th>
        <th>SQL+UDF</th>
    </tr>
    <tr>
        <th>数仓抽象</th>
        <th>Table</th>
    </tr>
    <tr>
        <th rowspan="2">RunTime</th>
        <th>流式计算</th>
        <th>Flink</th>
    </tr>
    <tr>
        <th>实时数据</th>
        <th>Kafka</th>
    </tr>
</table>
无论是一个平台还是一个系统,都离不开上下两个层次的构成: 上层是API,是面向用户的编程抽象与接口;下层是RunTime,是面向内核的执行引擎.从离线到实时的迁移是平滑的,是什么意思?从API这层来看,数仓的抽象是Table,编程接口是SQL+UDF,离线数仓时代用户已经习惯了这样的API,迁移到实时数仓最好也能保持一致.而从RunTime层来看,计算引擎从Hive演进到了Flink,存储引擎从HDFS演进到了Kakfa.

### 6.构建OPPO实时数仓
构建过程: 与离线数仓基本相似,只是把Hive替换成Flink,把HDFS替换为Kafka.总体流程来看,基本模型是不变的,还是由原始层,明细层,汇总层,应用层的级联计算来构成.

核心问题: 如何基于Flink构建实时数仓.

---
## 二、基于Flink SQL的扩展工作
### 1.Why Flink SQL
> **SQL**: High-level Language
>
- ANSI SQL + UDF
- 数据类型 + 内置函数
- 自定义Source/Sink
- 批流统一

> **Table API**: Declarative DSL

> **DataStream/DataSet API**: Core APIs

> **Stateful Stream Processing**: Low-level building block(streams,state,[event] time)
>
- 低延迟,高吞吐
- 高容错的状态管理
- 端到端exactly-once
- Windows & Event Time

首先,为什么要用Flink SQL?上面展示了Flink框架的基本结构,最下面是Runtime,这个执行引擎我们认为最核心的优势是四个: 第一,低延迟,高吞吐;第二,端到端的Exactly-once;第三,可容错的状态管理;第四,Window & Event time的支持.基于Runtime抽象出3个层次的API,SQL处于最上层.

Flink SQL API有哪些优势?也可以从四个方面去看: 第一,支持ANSI SQL的标准;第二, 支持丰富的数据类型与内置函数,包括常见的算术运算与统计聚合;第三,可自定义Source/Sink,基于此可以灵活地扩展上下游;第四,批流统一,同样的SQL,既可以跑离线也可以跑实时.

**ps:想了解下scala怎么实现获取Kafka消息,FlinkKafkaConsumer010?**

Flink SQL编程示例
```java
final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
final StreamTableEnvironment tblEnv = TableEnvironment.getTableEnvronment(env);

// 定义与注册输入表
tblEnv.connect(new Kafka().version("0.10")
    .topic("input").properties(kafkaParops).startFromGroupOffsets())
    .withFormat(new Avro().recordClass(SdkLog.class))
    .withSchema(new Schema().schema(TableSchema.fromTypeInfo(
        AvroSchemaConverter.convertToTypeInfo(SdkLog.class))))
    .inAppenddMode()
    .registerTableSource("srcTable");

// 定义与注册输出表
tblEnv.connect(new Kafka().version("0.10")
    .topic("output").properties(kafkaParops).startFromGroupOffsets())
    .withFormat(new Avro().recordClass(SdkLog.class))
    .withSchema(new Schema().schema(TableSchema.fromTypeInfo(
        AvroSchemaConverter.convertToTypeInfo(SdkLog.class))))
    .inAppenddMode()
    .registerTableSource("dstTable");

// 注册UDF
tblEnv.registerFunction("doubleFunc", new DoubleInt());
// 执行SQL
tblEnv.sqlUpdate("INSERT INTO dstTable SELECT id,name,doubleFunc(age) FROM srcTable WHERE event['eventTag'] = '10004'");

env.execute("Flink meetup demo");
```
首先定义与注册输入/输出表,创建了2张Kafka的表,指定了Kafka版本,对应哪个topic;接下来注册UDF;最后才是执行真正的SQL.可以看到,为了执行SQL,需要做这么多编码工作,这不是我们希望暴露给用户的接口.

### 2.基于WEB的开发IDE
前面提到过,数仓的抽象是Table,编程接口是SQL+UDF.对于用户来说,平台提供的编程界面应该是类似HUE的那种,有用过HUE做交互查询的应该很熟悉.左边是Table列表,右边是SQL编辑器,可以在上面直接写SQL,然后提交执行.要实现这样一种交互方式,Flink SQL默认是无法实现的,中间存在缺口,总结下来就两点:第一,元数据的管理,怎么去创建库表,怎么去上传UDF,使得之后在SQL中可直接引用;第二,SQL作业的管理,怎么去编译SQL,怎么去提交作业.

### 3.AthenaX: 基于REST的SQL管理器
AthenaX可以看作一个基于REST的SQL管理器,它是怎么实现SQL作业与元数据管理的呢?
- 对于SQL作业提交,AthenaX中有一个Job的抽象,封装了要执行的SQL以及作业资源等信息.所有的Job由一个JobStore来托管,它定期跟YARN当中处于Running的App做一个匹配.如果不一致,就会向YARN提交对应的Job.
- 对于元数据管理,核心的问题是如何将外部创建的库表注入Flink,使得SQL中可以识别到.实际上,Flink本身就预留了与外部元数据对接的能力,分别提供了ExternalCatalog和ExternalCatalogTable这两个抽象.AthenaX在此基础上再封装出一个TableCatalog,在接口层面做了一定的扩展.在提交SQL作业的阶段,AthenaX会自动将TableCatalog注册到Flink,再调用Flink SQL的接口将SQL编译为Flink的可执行单元JobGraph,并最终提交到YARN生成新的App.

AthenaX虽然定义好了TableCatalog接口,但并没有提供可直接使用的实现.那么,我们怎么来实现,以便对接到我们已有的元数据系统呢?

### 4.Flink SQL注册库表的过程
首先,我们的搞清楚Flink SQL内部是如何注册库表的.整个过程涉及到三个基本的抽象:TableDescriptor,TableFactory以及TableEnvironment.

TableDescriptor顾名思义,是对表的描述,它由三个子描述符构成:第一是Connector,描述数据的来源,比如Kafka,ES等;第二是Format,描述数据的格式,比如csv,json,avro等;第三是Schema,描述每个字段的名称与类型.

TableDescriptor有两个基本的实现
- ConnectTableDescriptor用于描述内部表,也就是编程方式创建的表.
- ExternalCatalogTable用于描述外部表.

有了TableDescriptor,接下来需要TableFactory根据描述信息来实例化Table.不同的描述信息需要不同的TableFactory来处理,Flink如何找到匹配的TableFactory实现呢?实际上,为了保证框架的可扩展性,Flink采用了JavaSPI机制来加载所有声明过的TableFactory,通过遍历的方式去寻找哪个TableFactory是匹配该TableDescriptor的.TableDescriptor在传递给TableFactory前,被转换成一个map,所有的描述信息都用key-value的形式来表达.TableFactory定义了两个用于过滤匹配的方法,一个是requiredContext(),用于检测某些特定的key的value是否匹配,比如connector.type是否为kafka;另一个是supportedProperties(),用于检测key是否能识别,如果出现不识别的key,说明无法匹配.

匹配到了正确的TableFactory,接下来就是创建真正的Table,然后将其通过TableEnvironment注册.最终注册成功的Table,才能在SQL中引用.

### 5.Flink SQL对接外部数据源
搞清楚了Flink SQL注册库表的过程,给我们带来这样一个思路:如果外部元数据创建的表也能被转换成TableFactory可识别的map,那么就能被无缝地注册到TableEnvironment.基于这个思路,我们实现了Flink SQL与已有元数据中心的对接.

通过元数据中心创建的表,都会将元数据信息存储到MySQL,我们用一张表来记录Table的基本信息,然后另外三张表分别记录Connector,Format,Schema转换成key-value后的描述信息.之所以拆开成三张表,是为了能够能独立的更新这三种描述信息.接下来是定制实现的ExternalCatalog,能够读取MySQL这四张表,并转换成map结构.

### 6.实时表-维表关联
到目前为止,我们的平台已经具备了元数据管理与SQL作业管理的能力,但是要真正开放给用户使用,还有一点基本特性存在缺失.通过我们去构建数仓,星型模型是无法避免的.这里有一个比较简单的案例:中间的事实表记录了广告点击流,周边是关于用户,广告,产品,渠道的维度表.

假定我们有一个SQL分析,需要将点击流表与用户维表进行关联,这个目前在Flink SQL中应该怎么实现?我们有两种实现方式,一个基于UDF,一个基于SQL转换.

### 7.基于UDF的维表关联
首先是基于UDF的实现,需要用户将原始SQL改写成带UDF调用的SQL,这里是userDimFunc,UserDimFunc继承了Flink SQL抽象的TableFunction,它是其中一种UDF类型,可以将任意一行数据转换成一行或多行数据.为了实现维表关联,在UDF初始化时需要从MySQL全量加载维表的数据,缓存在内存cache中.后续对每行数据的处理,TableFunction会调用eval()方法,在eval()中根据user_id去查找cache,从而实现关联.当然,这里是假定维表数据比较小,如果数据量很大,不适合全量的加载与缓存,这里不做展开了.

基于UDF的实现,对用户与平台来说都不太友好:用户需要写奇怪的SQL语句;平台需要为每个关联场景定制特定的UDF,维护成本太高.

### 8.基于SQL转换的维表关联
我们希望解决基于UDF实现所带来的问题,用户不需要改写原始SQL,平台不需要开发很多UDF.有一种思路是,是否可以在SQL交给Flink编译之前,加一层SQL的解析与改写,自动实现维表的关联?经过一定的技术调研与POC,我们发现是行得通的,所以称之为基于SQL转换的实现.

首先,增加的SQL解析是为了识别SQL中是否存在预先定义的维度表.一旦识别到维表,将触发SQL改写的流程,将红框标注的join语句改写成新的Table,这个Table怎么得到?我们知道,流计算领域近年来发展出"流表二象性"的理念,Flink也是该理念的践行者.这意味着,在Flink中Stream与Table之间是可以相互转换的.flatmap怎么实现维表关联?

Flink中对于Stream的flatmap操作,实际上是执行一个RichFlatmapFunction,每来一行数据就调用其flatmap()方法做转换.那么,我们可以定制一个RichFlatmapFunction,来实现维表数据的加载,缓存,查找以及关联,功能与基于UDF的TableFunction实现类似.

既然RichFlatmapFunction的实现逻辑与TableFunction相似,那为什么相比基于UDF的方式,这种实现能更加通用呢?核心的点在于多了一层SQL解析,可以将维表的信息获取出来(比如维表名,关联字段,select字段等),再封装成JoinContext传递给RichFlatmapFunction,使得它的表达能力就具备通用性了.

---
## 三、构建实时数仓的应用案例
### 1.实时ETL拆分
这里是一个典型的实时ETL链路,从大表中拆分各业务对应的小表: 手机->NIFI->Kafka->ETL->Kafka/HDFS

OPPO的最大数据来源是手机端埋点,从手机APP过来的数据有一个特点,所有的数据是通过统一的几个通道上报过来.因为不可能每一次业务有新的埋点,都要去升级客户端,去增加新的通道.比如我们有个sdk_log通道,所有APP应用的埋点都往这个通道上报数据,导致这个通道对应的原始层表巨大,一天几十个TB.但实际上,每个业务只关心它自身的那部分数据,这就要求我们在原始层进行ETL拆分.

这个SQL逻辑比较简单,无非是根据某些业务字段做筛选,插入到不同的业务表中去.它的特点是,多行SQL最终合并成一个SQL提交给Flink执行.大家担心的是,包含了4个SQL,会不会对同一份数据重复读取4次?其实,在Flink编译SQL的阶段是会做一些优化的,因为最终指向的是同一个Kakfa topic,所以只会读取1次数据.

另外,同样的Flink SQL,我们同时用于离线与实时数仓的ETL拆分,分别落入HDFS与Kafka.Flink中本身支持写入HDFS的Sink,比如RollingFileSink.

### 2.实时指标统计
这里是一个典型的计算信息流CTR的这个案例,分别计算一定时间段内的曝光与点击次数,相除得到点击率导入MySQL,然后通过我们内部的报表系统来可视化.这个SQL的特点是它用到了窗口(Tumbling Window)以及子查询.

**窗口函数:** TUMBLE函数

### 3.实时标签导入
这个SQL的特点是用了AggregateFunction,在5分钟的窗口内,我们只关心用户最新一次上报的经纬度.AggregateFunction是一种UDF类型,通常是用于聚合指标的统计,比如计算sum或者average.在这个示例中,由于我们只关心最新的经纬度,所以每次都替换老的数据即可.
