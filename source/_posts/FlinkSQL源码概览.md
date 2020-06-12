---
title: FlinkSQL源码概览
date: 2020-05-05 17:47:47
categories: 大数据
tags: flink
---

> 基于Flink的Demo,从代码层深入源码,逐层逐层剖析

<!-- more -->

## FlinkSQL引擎: Calcite
```
解析SQL
SqlNode(SQL语句转换而来的语法树)
    SqlToOperationConverter(SqlNode转换为Operation)

准备执行SQL
RelNode(可以看做对整体数据处理的一个语法树)
    Converter(RelNode之间转换)
    FlinkRelNode(Flink的运算树)
        DataSetRel
        DataStreamRel

RexNode(行表达式,对一行数据处理的语法树)

RelOptCluster(查询优化过程中相关关系表达式的环境)
    FlinkRelOptCluster
    
RelOptPlanner(查询优化器,根据给定的规则集和成本模型,将关系表达式转换为语义等价的关系表达式)
    AbstractRelOptPlanner
        HepPlanner
        VolcanoPlanner
            HiveVolcanoPlanner

RelOptCost(优化器成本模型会依赖)

RelOptRule(规则匹配使用)
    ConverterRule(规则之间的转换)

RelTrait(表示特性定义中关系表达式特性的表现形式)
    Convention(代表一个单一的数据源)
    RelMultipleTrait
        RelCollation
        RelDistribution

RelTraitDef
    ConventionTraitDef(代表数据源)
    RelCollationTraitDef(定义参与排序的字段)
    RelDistributionTraitDef(定义数据在物理存储上的分布方式)
```

---

## FlinkSQL解析阶段
```
Calcite使用JavaCC做SQL,JavaCC根据Parser.jj/Parser.tdd文件生成一系列java代码
生成的代码会将SQL转换为AST的数据结构(SqlNode,未经过验证)

调用SqlToOperationConverter的convert函数将SqlNode转换为Operator

    这期间SqlNode经过语法检查validate函数,生成经过验证的SqlNode
    调用SqlToOperationConverter的convertSqlQuery函数,将SqlNode转换为RelRoot
    RelRoot里面包含RelNode信息,RelNode可以看做是初始逻辑计划

进行Optimizer优化,查看源码可以知道,在执行writeToAppendSink时才进行优化操作
生成OptimizerPlan
    这个过程中包含规则的匹配:(从逻辑计划转换为物理计划)
        先基于Calcite Rules去优化
        后基于Flink定制Rules去优化
        optimizeConvertSubQueries
        optimizeExpandPlan
        decorrelateQuery
        optimizeNormalizeLogicalPlan
        optimizeLogicalPlan
        optimizeLogicalRewritePlan
        optimizePhysicalPlan
        
最后将OptimizerPlan转换为DataStream进行输出
RelNode->DataStreamNode->translateToPlan->DataStream

生成DataStream时会使用到CodeGen
e.g:
    node.translateToPlan之后调用DataStreamScan的translateToPlan函数
    DataStreamScan调用接口StreamScan的convertToInternalRow函数
    generateConversionProcessFunction
        generateFunction(生成Function)
    GeneratedFunction
```

---

## SqlNode的产生
```java
// Parser.parser()->解析sql的接口类
List<Operation> parse(String statement);

// ParserImpl.parser()->实现类
@Override
public List<Operation> parse(String statement) {
    // 获取CalciteParser解析器
    CalciteParser parser = calciteParserSupplier.get();
    FlinkPlannerImpl planner = validatorSupplier.get();
    // parse the sql query
    SqlNode parsed = parser.parse(statement);
    
    // SqlNode转换为Operation
    Operation operation = SqlToOperationConverter.convert(planner, catalogManager, parsed)
        .orElseThrow(() -> new TableException(
            "Unsupported SQL query! parse() only accepts SQL queries of type " +
                "SELECT, UNION, INTERSECT, EXCEPT, VALUES, ORDER_BY or INSERT;" +
                "and SQL DDLs of type " +
                "CREATE TABLE"));
    // 返回
    return Collections.singletonList(operation);
}

// CalciteParser.parser()->Calcite引擎解析器
public SqlNode parse(String sql) {
	try {
        // 根据config创建SqlParser
		SqlParser parser = SqlParser.create(sql, config);
        
        // 获取SqlNode
		return parser.parseStmt();
	} catch (SqlParseException e) {
		throw new SqlParserException("SQL parse failed. " + e.getMessage());
	}
}

// SqlParser.create()->根据config去创建SqlParser
public static SqlParser create(String sql, SqlParser.Config config) {
    return create((Reader)(new SourceStringReader(sql)), config);
}
public static SqlParser create(Reader reader, SqlParser.Config config) {
    SqlAbstractParserImpl parser = config.parserFactory().getParser(reader);
    return new SqlParser(parser, config);
}

// SqlParser.parseStmt()->获取SqlNode
public SqlNode parseStmt() throws SqlParseException {
    return this.parseQuery();
}
public SqlNode parseQuery() throws SqlParseException {
    try {
        // 切换到SQLAbstractParserImpl的实现类FlinkSqlParserImpl
        return this.parser.parseSqlStmtEof();
    } catch (Throwable var2) {
        throw this.handleException(var2);
    }
}

// FlinkSqlParserImpl.parseSqlStmtEof()->获取SqlNode
public SqlNode parseSqlStmtEof() throws Exception {
    return this.SqlStmtEof();
}
public final SqlNode SqlStmtEof() throws ParseException {
    // 在SqlStmt方法中有着各种可能性
    SqlNode stmt = this.SqlStmt();
    this.jj_consume_token(0);
    return stmt;
}

// FlinkSqlParserImpl.SqlStmt(),有几百行,这里挑一部分
public final SqlNode SqlStmt() throws ParseException {
    Object stmt;
    ...
    case 109:
        stmt = this.SqlCreate();
        break;
    ...
    return (SqlNode)stmt;
}
public final SqlCreate SqlCreate() throws ParseException {
    boolean replace = false;
    this.jj_consume_token(109);
    Span s = this.span();
    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 366:
        this.jj_consume_token(366);
        this.jj_consume_token(441);
        replace = true;
        break;
    default:
        this.jj_la1[224] = this.jj_gen;
    }

    SqlCreate create;
    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 129:
        create = this.SqlCreateDatabase(s, replace);
        break;
    case 215:
    case 585:
        create = this.SqlCreateFunction(s, replace);
        break;
    case 582:
        create = this.SqlCreateTable(s, replace);
        break;
    case 650:
        create = this.SqlCreateView(s, replace);
        break;
    default:
        this.jj_la1[225] = this.jj_gen;
        this.jj_consume_token(-1);
        throw new ParseException();
    }

    return create;
}
public final SqlCreate SqlCreateTable(Span s, boolean replace) throws ParseException {
    SqlParserPos startPos;
    SqlIdentifier tableName;
    SqlNodeList primaryKeyList;
    Object uniqueKeysList;
    SqlWatermark watermark;
    SqlNodeList columnList;
    SqlCharStringLiteral comment;
    SqlNodeList propertyList;
    SqlNodeList partitionColumns;
    startPos = s.pos();
    primaryKeyList = SqlNodeList.EMPTY;
    uniqueKeysList = new ArrayList();
    watermark = null;
    columnList = SqlNodeList.EMPTY;
    comment = null;
    propertyList = SqlNodeList.EMPTY;
    partitionColumns = SqlNodeList.EMPTY;
    this.jj_consume_token(582);
    tableName = this.CompoundIdentifier();
    label61:
    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 694:
        this.jj_consume_token(694);
        SqlParserPos pos = this.getPos();
        TableCreationContext ctx = new TableCreationContext();
        this.TableColumn(ctx);

        while(true) {
            switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
            case 706:
                this.jj_consume_token(706);
                this.TableColumn(ctx);
                break;
            default:
                this.jj_la1[51] = this.jj_gen;
                pos = pos.plus(this.getPos());
                columnList = new SqlNodeList(ctx.columnList, pos);
                primaryKeyList = ctx.primaryKeyList;
                uniqueKeysList = ctx.uniqueKeysList;
                watermark = ctx.watermark;
                this.jj_consume_token(695);
                break label61;
            }
        }
    default:
        this.jj_la1[52] = this.jj_gen;
    }

    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 666:
        this.jj_consume_token(666);
        this.jj_consume_token(689);
        String p = SqlParserUtil.parseString(this.token.image);
        comment = SqlLiteral.createCharString(p, this.getPos());
        break;
    default:
        this.jj_la1[53] = this.jj_gen;
    }

    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 667:
        this.jj_consume_token(667);
        this.jj_consume_token(46);
        partitionColumns = this.ParenthesizedSimpleIdentifierList();
        if (!((FlinkSqlConformance)this.conformance).allowCreatePartitionedTable()) {
            throw SqlUtil.newContextException(this.getPos(), ParserResource.RESOURCE.createPartitionedTableIsOnlyAllowedForHive());
        }
        break;
    default:
        this.jj_la1[54] = this.jj_gen;
    }

    switch(this.jj_ntk == -1 ? this.jj_ntk() : this.jj_ntk) {
    case 657:
        this.jj_consume_token(657);
        // 获取表属性
        propertyList = this.TableProperties();
        break;
    default:
        this.jj_la1[55] = this.jj_gen;
    }

    return new SqlCreateTable(startPos.plus(this.getPos()), tableName, columnList, primaryKeyList, (List)uniqueKeysList, propertyList, partitionColumns, watermark, comment);
}
```
**注意** FlinkParserImpl是由代码生成的类,并不是一个文件
*flink-table/flink-sql-parser/src/main/codegen/data/Parser.tdd*

---

## 如何匹配SQL是什么类型
```
在FlinkSqlParserImpl.SqlStmt()方法中,有着switch语句进行匹配
其实在第一个方法调用中就已经完成了匹配的必须信息的获取
简单的讲就是在创建SqlParser时,将SQL语句转换成流的形式
现在就是对流中的一个字符一个字符去获取解析,然后生成一个Token
这个Token就是匹配类型的关键

public final SqlNode SqlStmt() throws ParseException {
    Object stmt;
    // jj_2_4就是去调用jj_3_4方法然后最终调用jj_scan_token方法
    if (this.jj_2_4(2)) {
        stmt = this.RichSqlInsert();
    }
    ...
}
private final boolean jj_scan_token(int kind) {
    if (this.jj_scanpos == this.jj_lastpos) {
        --this.jj_la;
        if (this.jj_scanpos.next == null) {
            // 利用FlinkSqlParserImplTokenManager去获取Token
            // Manager在CalciteParser的parse方法中创建
            this.jj_lastpos = this.jj_scanpos = this.jj_scanpos.next = this.token_source.getNextToken();
        } else {
            this.jj_lastpos = this.jj_scanpos = this.jj_scanpos.next;
        }
    ...
}
// getNextToken去调用SimpleCharStream的BeginToken方法循环获取字符
```

---

## Operation的产生
```
// SqlToOperationConverter.convert()->将SqlNode转换为Operation
public static Optional<Operation> convert(
			FlinkPlannerImpl flinkPlanner,
			CatalogManager catalogManager,
			SqlNode sqlNode) {
    // validate the query
    final SqlNode validated = flinkPlanner.validate(sqlNode);
    SqlToOperationConverter converter = new SqlToOperationConverter(flinkPlanner, catalogManager);
    if (validated instanceof SqlCreateTable) {
        return Optional.of(converter.convertCreateTable((SqlCreateTable) validated));
    } else if (validated instanceof SqlDropTable) {
        return Optional.of(converter.convertDropTable((SqlDropTable) validated));
    } else if (validated instanceof SqlAlterTable) {
        return Optional.of(converter.convertAlterTable((SqlAlterTable) validated));
    } else if (validated instanceof SqlCreateFunction) {
        return Optional.of(converter.convertCreateFunction((SqlCreateFunction) validated));
    } else if (validated instanceof SqlAlterFunction) {
        return Optional.of(converter.convertAlterFunction((SqlAlterFunction) validated));
    } else if (validated instanceof SqlDropFunction) {
        return Optional.of(converter.convertDropFunction((SqlDropFunction) validated));
    } else if (validated instanceof RichSqlInsert) {
        SqlNodeList targetColumnList = ((RichSqlInsert) validated).getTargetColumnList();
        if (targetColumnList != null && targetColumnList.size() != 0) {
            throw new ValidationException("Partial inserts are not supported");
        }
        return Optional.of(converter.convertSqlInsert((RichSqlInsert) validated));
    } else if (validated instanceof SqlUseCatalog) {
        return Optional.of(converter.convertUseCatalog((SqlUseCatalog) validated));
    } else if (validated instanceof SqlUseDatabase) {
        return Optional.of(converter.convertUseDatabase((SqlUseDatabase) validated));
    } else if (validated instanceof SqlCreateDatabase) {
        return Optional.of(converter.convertCreateDatabase((SqlCreateDatabase) validated));
    } else if (validated instanceof SqlDropDatabase) {
        return Optional.of(converter.convertDropDatabase((SqlDropDatabase) validated));
    } else if (validated instanceof SqlAlterDatabase) {
        return Optional.of(converter.convertAlterDatabase((SqlAlterDatabase) validated));
    } else if (validated.getKind().belongsTo(SqlKind.QUERY)) {
        return Optional.of(converter.convertSqlQuery(validated));
    } else {
        return Optional.empty();
    }
}
```

---

## 结合Demo测试
```
# 打印出SQL的AST语法树,优化好的逻辑计划以及物理计划
tEnv.explain(result)
```

---

## 补充SQL转换到DataStream操作
```scala
SQL是如何转换为DataStream操作的
当直接使用Table时,会发现Table的API并没有类似打印,输出数据的功能
只能使用toAppendStream/toRetractStream将Table转换为DataStream进行输出

这里我使用的剖析入口是insertInto
// TableImpl(实体类,也就是Table)
public void insertInto(String tablePath) {
	tableEnvironment.insertInto(tablePath, this);
}

// TableEnvironment接口
void insertInto(String targetPath, Table table);
// TableEnvironmentImpl实现类
public void insertInto(String targetPath, Table table) {
    // 获取要插入的表信息,这里不进行分析
	UnresolvedIdentifier unresolvedIdentifier = parser.parseIdentifier(targetPath);
    // 插入,看看做了什么
	insertIntoInternal(unresolvedIdentifier, table);
}
private void insertIntoInternal(UnresolvedIdentifier unresolvedIdentifier, Table table) {
	ObjectIdentifier objectIdentifier = catalogManager.qualifyIdentifier(unresolvedIdentifier);
    // 获取了table的QueryOperation,转换成ModifyOperation列表
	List<ModifyOperation列表> modifyOperations = Collections.singletonList(
		new CatalogSinkModifyOperation(
			objectIdentifier,
			table.getQueryOperation()));
    // 重点:将Operation转换为Translation
	if (isEagerOperationTranslation()) {
        // 如果是立即执行的,后面我们就直接剖析的是立即执行
		translate(modifyOperations);
	} else {
        // 否则将会把这写Operation放入bufferedModifyOperations中,等待tEnv.execute的操作
		buffer(modifyOperations);
	}
}
private void translate(List<ModifyOperation> modifyOperations) {
    // 调用Planner.translate进行转换,这里我们使用StreamPlanner
	List<Transformation<?>> transformations = planner.translate(modifyOperations);
	execEnv.apply(transformations);
}

// StreamPlanner
override def translate(tableOperations: util.List[ModifyOperation])
  : util.List[Transformation[_]] = {
  // 转换
  tableOperations.asScala.map(translate).filter(Objects.nonNull).asJava
}
// 将ModifyOperation转换成对应的Transformation
private def translate(tableOperation: ModifyOperation)
  : Transformation[_] = {
  tableOperation match {
    case s : UnregisteredSinkModifyOperation[_] =>
      // Sink
      writeToSink(s.getChild, s.getSink, unwrapQueryConfig)
    case catalogSink: CatalogSinkModifyOperation =>
      getTableSink(catalogSink.getTableIdentifier)
        .map(sink => {
          TableSinkUtils.validateSink(
            catalogSink.getStaticPartitions,
            catalogSink.getChild,
            catalogSink.getTableIdentifier,
            sink)
          // set static partitions if it is a partitioned sink
          sink match {
            case partitionableSink: PartitionableTableSink =>
              partitionableSink.setStaticPartition(catalogSink.getStaticPartitions)
            case _ =>
          }
          // set whether to overwrite if it's an OverwritableTableSink
          sink match {
            case overwritableTableSink: OverwritableTableSink =>
              overwritableTableSink.setOverwrite(catalogSink.isOverwrite)
            case _ =>
              assert(!catalogSink.isOverwrite, "INSERT OVERWRITE requires " +
                s"${classOf[OverwritableTableSink].getSimpleName} but actually got " +
                sink.getClass.getName)
          }
          writeToSink(catalogSink.getChild, sink, unwrapQueryConfig)
        }) match {
        case Some(t) => t
        case None =>
          throw new TableException(s"Sink ${catalogSink.getTableIdentifier} does not exists")
      }
    case outputConversion: OutputConversionModifyOperation =>
      val (isRetract, withChangeFlag) = outputConversion.getUpdateMode match {
        case UpdateMode.RETRACT => (true, true)
        case UpdateMode.APPEND => (false, false)
        case UpdateMode.UPSERT => (false, true)
      }
      translateToType(
        tableOperation.getChild,
        unwrapQueryConfig,
        isRetract,
        withChangeFlag,
        TypeConversions.fromDataTypeToLegacyInfo(outputConversion.getType)).getTransformation
    case _ =>
      throw new TableException(s"Unsupported ModifyOperation: $tableOperation")
  }
}

// 可以看出上面的只是进行一个匹配操作,真正的转换在translateToType中,writeToSink同样是一个匹配操作
// 其中writeToSink中会根据sink的不同类型,转换成不同的Sink
// AppendSink,UpsertSink,RetractSink
private def writeToSink[T](
    tableOperation: QueryOperation,
    sink: TableSink[T],
    queryConfig: StreamQueryConfig)
  : Transformation[_] = {
  val resultSink = sink match {
    case retractSink: RetractStreamTableSink[T] =>
      retractSink match {
        case _: PartitionableTableSink =>
          throw new TableException("Partitionable sink in retract stream mode " +
            "is not supported yet!")
        case _ =>
      }
      writeToRetractSink(retractSink, tableOperation, queryConfig)
    case upsertSink: UpsertStreamTableSink[T] =>
      upsertSink match {
        case _: PartitionableTableSink =>
          throw new TableException("Partitionable sink in upsert stream mode " +
            "is not supported yet!")
        case _ =>
      }
      writeToUpsertSink(upsertSink, tableOperation, queryConfig)
    case appendSink: AppendStreamTableSink[T] =>
      writeToAppendSink(appendSink, tableOperation, queryConfig)
    case _ =>
      throw new ValidationException("Stream Tables can only be emitted by AppendStreamTableSink, "
        + "RetractStreamTableSink, or UpsertStreamTableSink.")
  }
  if (resultSink != null) {
    resultSink.getTransformation
  } else {
    null
  }
}

// translateToType,将类型Schema获取出来
private def translateToType[A](
    table: QueryOperation,
    queryConfig: StreamQueryConfig,
    updatesAsRetraction: Boolean,
    withChangeFlag: Boolean,
    tpe: TypeInformation[A])
  : DataStream[A] = {
  val relNode = getRelBuilder.tableOperation(table).build()
  // 重点,对relNode进行优化
  val dataStreamPlan = optimizer.optimize(relNode, updatesAsRetraction, getRelBuilder)
  // 数据类型
  val rowType = getTableSchema(table.getTableSchema.getFieldNames, dataStreamPlan)
  // if no change flags are requested, verify table is an insert-only (append-only) table.
  if (!withChangeFlag && !UpdatingPlanChecker.isAppendOnly(dataStreamPlan)) {
    throw new ValidationException(
      "Table is not an append-only table. " +
        "Use the toRetractStream() in order to handle add and retract messages.")
  }
  // get CRow plan
  // 将OptimizerPlan转化成CRow
  // 个人理解:就是将执行计划交由对应的DataStreamRel进行代码生成DataStream[CRow]
  translateOptimized(dataStreamPlan, rowType, tpe, queryConfig, withChangeFlag)
}

// 转换
private def translateOptimized[A](
    optimizedPlan: RelNode,
    logicalSchema: TableSchema,
    tpe: TypeInformation[A],
    queryConfig: StreamQueryConfig,
    withChangeFlag: Boolean)
  : DataStream[A] = {
  val dataStream = translateToCRow(optimizedPlan, queryConfig)
  // 将生成的DataStream[CRow]根据TypeInformation转换为对应的DataStream[A]
  DataStreamConversions.convert(dataStream, logicalSchema, withChangeFlag, tpe, config)
}

// 逻辑计划转换为实际的运算代码
private def translateToCRow(
  logicalPlan: RelNode,
  queryConfig: StreamQueryConfig): DataStream[CRow] = {
  logicalPlan match {
    case node: DataStreamRel =>
      getExecutionEnvironment.configure(
        config.getConfiguration,
        Thread.currentThread().getContextClassLoader)
      // 这里调用的是DataStreamRel接口方法
      node.translateToPlan(this, queryConfig)
    case _ =>
      throw new TableException("Cannot generate DataStream due to an invalid logical plan. " +
        "This is a bug and should not happen. Please file an issue.")
  }
}

// 这里DataStreamRel的实现类有很多,对应的是具体的操作
// 看下DataStreamCalc中的实现
override def translateToPlan(
    planner: StreamPlanner,
    queryConfig: StreamQueryConfig): DataStream[CRow] = {
  val config = planner.getConfig // 配置信息
  // 获取input输入数据,其实也是进行调用translateToPlan
  val inputDataStream =
    getInput.asInstanceOf[DataStreamRel].translateToPlan(planner, queryConfig)
  // materialize time attributes in condition
  val condition = if (calcProgram.getCondition != null) {
    val materializedCondition = RelTimeIndicatorConverter.convertExpression(
      calcProgram.expandLocalRef(calcProgram.getCondition),
      inputSchema.relDataType,
      cluster.getRexBuilder)
    Some(materializedCondition)
  } else {
    None
  }
  // filter out time attributes
  val projection = calcProgram.getProjectList.asScala
    .map(calcProgram.expandLocalRef)
  // 获取CodeGenerator代码生成器 
  val generator = new FunctionCodeGenerator(config, false, inputSchema.typeInfo)
  
  // 生成Function
  val genFunction = generateFunction(
    generator,
    ruleDescription,
    schema,
    projection,
    condition,
    config,
    classOf[ProcessFunction[CRow, CRow]])
  val inputParallelism = inputDataStream.getParallelism
  // 创建CRowProcessRunner
  val processFunc = new CRowProcessRunner(
    genFunction.name,
    genFunction.code,
    CRowTypeInfo(schema.typeInfo))
  // 对输入数据流进行计算
  inputDataStream
    .process(processFunc)
    .name(calcOpName(calcProgram, getExpressionString))
    // keep parallelism to ensure order of accumulate and retract messages
    .setParallelism(inputParallelism)
}
```

---

## 注意
```
同理,sqlUpdate中的转换也是一样的操作
都是通过translate进行转换为DataStream
其实这方面可以分为两部分进行剖析,sqlQuery和sqlUpdate
sqlQuery对应createTable创建source,对应TableImpl
sqlUpdate对应sink
```