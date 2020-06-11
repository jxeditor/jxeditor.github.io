---
title: FlinkSQL在使用创建表语句时的源码解析
date: 2020-06-11 11:56:23
categories: 大数据
tags: flink
---

> 这一篇只是对于FlinkSQL创建表语句的解析，有涉及FlinkSQL源码部分可参考前面文章-[FlinkSQL源码概览](https://jxeditor.github.io/2020/05/05/FlinkSQL%E6%BA%90%E7%A0%81%E6%A6%82%E8%A7%88/)

<!-- more -->

## 流程
### 使用SQL
```scala
tEnv.sqlUpdate(
"""
  |CREATE TABLE demo1 (
  |    uid VARCHAR COMMENT 'uid',
  |    rid VARCHAR COMMENT 'rid'
  |)
  |WITH (
  |    'connector.type' = 'kafka', -- 使用 kafka connector
  |    'connector.version' = 'universal',  -- kafka 版本
  |    'connector.topic' = 'test',  -- kafka topic
  |    'connector.properties.0.key' = 'zookeeper.connect',  -- zk连接信息
  |    'connector.properties.0.value' = 'hosts:2181',  -- zk连接信息
  |    'connector.properties.1.key' = 'bootstrap.servers',  -- broker连接信息
  |    'connector.properties.1.value' = 'hosts:9092',  -- broker连接信息
  |    'connector.sink-partitioner' = 'fixed',
  |    'update-mode' = 'append',
  |    'format.type' = 'json',  -- 数据源格式为 json
  |    'format.derive-schema' = 'true' -- 从 DDL schema 确定 json 解析规则
  |)
""".stripMargin)
```
### 如何解析配置
```
这一部分得深入了解之前文章,有一部分其实已经在前面说过
SqlNode其实就包括了表的配置信息
然后会在转换为Operatoin时获取这些配置信息
// SqlToOperationConverter.convertCreateTable()->转换
private Operation convertCreateTable(SqlCreateTable sqlCreateTable) {
    // primary key and unique keys are not supported
    if ((sqlCreateTable.getPrimaryKeyList().size() > 0)
        || (sqlCreateTable.getUniqueKeysList().size() > 0)) {
        throw new SqlConversionException("Primary key and unique key are not supported yet.");
    }

    if (sqlCreateTable.getWatermark().isPresent()) {
        throw new SqlConversionException(
            "Watermark statement is not supported in Old Planner, please use Blink Planner instead.");
    }

    // set with properties
    Map<String, String> properties = new HashMap<>();
    // 设置配置
    sqlCreateTable.getPropertyList().getList().forEach(p ->
        properties.put(((SqlTableOption) p).getKeyString(), ((SqlTableOption) p).getValueString()));

    TableSchema tableSchema = createTableSchema(sqlCreateTable);
    String tableComment = sqlCreateTable.getComment().map(comment ->
        comment.getNlsString().getValue()).orElse(null);
    // set partition key
    List<String> partitionKeys = sqlCreateTable.getPartitionKeyList()
        .getList()
        .stream()
        .map(p -> ((SqlIdentifier) p).getSimple())
        .collect(Collectors.toList());

    CatalogTable catalogTable = new CatalogTableImpl(tableSchema,
        partitionKeys,
        properties,
        tableComment);

    UnresolvedIdentifier unresolvedIdentifier = UnresolvedIdentifier.of(sqlCreateTable.fullTableName());
    ObjectIdentifier identifier = catalogManager.qualifyIdentifier(unresolvedIdentifier);

    return new CreateTableOperation(
        identifier,
        catalogTable,
        sqlCreateTable.isIfNotExists());
}
```
### 加载进入Catalog
```java
sqlUpdate
    ->parser.parse()->operations
        ->CreateTableOperation
            ->createTable()

@Override
public void sqlUpdate(String stmt) {
    // 解析SQL语句为Operation
    List<Operation> operations = parser.parse(stmt);

    if (operations.size() != 1) {
        throw new TableException(UNSUPPORTED_QUERY_IN_SQL_UPDATE_MSG);
    }

    Operation operation = operations.get(0);

    if (operation instanceof ModifyOperation) {
        List<ModifyOperation> modifyOperations = Collections.singletonList((ModifyOperation) operation);
        if (isEagerOperationTranslation()) {
            translate(modifyOperations);
        } else {
            buffer(modifyOperations);
        }
    } else if (operation instanceof CreateTableOperation) {
        CreateTableOperation createTableOperation = (CreateTableOperation) operation;
        // 加载进Catalog
        catalogManager.createTable(
            createTableOperation.getCatalogTable(),
            createTableOperation.getTableIdentifier(),
            createTableOperation.isIgnoreIfExists());
    } else if (operation instanceof CreateDatabaseOperation) {
        CreateDatabaseOperation createDatabaseOperation = (CreateDatabaseOperation) operation;
        Catalog catalog = getCatalogOrThrowException(createDatabaseOperation.getCatalogName());
        String exMsg = getDDLOpExecuteErrorMsg(createDatabaseOperation.asSummaryString());
        try {
            catalog.createDatabase(
                    createDatabaseOperation.getDatabaseName(),
                    createDatabaseOperation.getCatalogDatabase(),
                    createDatabaseOperation.isIgnoreIfExists());
        } catch (DatabaseAlreadyExistException e) {
            throw new ValidationException(exMsg, e);
        } catch (Exception e) {
            throw new TableException(exMsg, e);
        }
    } else if (operation instanceof DropTableOperation) {
        DropTableOperation dropTableOperation = (DropTableOperation) operation;
        catalogManager.dropTable(
            dropTableOperation.getTableIdentifier(),
            dropTableOperation.isIfExists());
    } else if (operation instanceof AlterTableOperation) {
        AlterTableOperation alterTableOperation = (AlterTableOperation) operation;
        Catalog catalog = getCatalogOrThrowException(alterTableOperation.getTableIdentifier().getCatalogName());
        String exMsg = getDDLOpExecuteErrorMsg(alterTableOperation.asSummaryString());
        try {
            if (alterTableOperation instanceof AlterTableRenameOperation) {
                AlterTableRenameOperation alterTableRenameOp = (AlterTableRenameOperation) operation;
                catalog.renameTable(
                        alterTableRenameOp.getTableIdentifier().toObjectPath(),
                        alterTableRenameOp.getNewTableIdentifier().getObjectName(),
                        false);
            } else if (alterTableOperation instanceof AlterTablePropertiesOperation){
                AlterTablePropertiesOperation alterTablePropertiesOp = (AlterTablePropertiesOperation) operation;
                catalog.alterTable(
                        alterTablePropertiesOp.getTableIdentifier().toObjectPath(),
                        alterTablePropertiesOp.getCatalogTable(),
                        false);
            }
        } catch (TableAlreadyExistException | TableNotExistException e) {
            throw new ValidationException(exMsg, e);
        } catch (Exception e) {
            throw new TableException(exMsg, e);
        }
    } else if (operation instanceof DropDatabaseOperation) {
        DropDatabaseOperation dropDatabaseOperation = (DropDatabaseOperation) operation;
        Catalog catalog = getCatalogOrThrowException(dropDatabaseOperation.getCatalogName());
        String exMsg = getDDLOpExecuteErrorMsg(dropDatabaseOperation.asSummaryString());
        try {
            catalog.dropDatabase(
                    dropDatabaseOperation.getDatabaseName(),
                    dropDatabaseOperation.isIfExists(),
                    dropDatabaseOperation.isCascade());
        } catch (DatabaseNotExistException | DatabaseNotEmptyException e) {
            throw new ValidationException(exMsg, e);
        } catch (Exception e) {
            throw new TableException(exMsg, e);
        }
    } else if (operation instanceof AlterDatabaseOperation) {
        AlterDatabaseOperation alterDatabaseOperation = (AlterDatabaseOperation) operation;
        Catalog catalog = getCatalogOrThrowException(alterDatabaseOperation.getCatalogName());
        String exMsg = getDDLOpExecuteErrorMsg(alterDatabaseOperation.asSummaryString());
        try {
            catalog.alterDatabase(
                    alterDatabaseOperation.getDatabaseName(),
                    alterDatabaseOperation.getCatalogDatabase(),
                    false);
        } catch (DatabaseNotExistException e) {
            throw new ValidationException(exMsg, e);
        } catch (Exception e) {
            throw new TableException(exMsg, e);
        }
    } else if (operation instanceof CreateFunctionOperation) {
        CreateFunctionOperation createFunctionOperation = (CreateFunctionOperation) operation;
        createCatalogFunction(createFunctionOperation);
    } else if (operation instanceof CreateTempSystemFunctionOperation) {
        CreateTempSystemFunctionOperation createtempSystemFunctionOperation =
            (CreateTempSystemFunctionOperation) operation;
        createSystemFunction(createtempSystemFunctionOperation);
    } else if (operation instanceof AlterFunctionOperation) {
        AlterFunctionOperation alterFunctionOperation = (AlterFunctionOperation) operation;
        alterCatalogFunction(alterFunctionOperation);
    } else if (operation instanceof DropFunctionOperation) {
        DropFunctionOperation dropFunctionOperation = (DropFunctionOperation) operation;
        dropCatalogFunction(dropFunctionOperation);
    } else if (operation instanceof DropTempSystemFunctionOperation) {
        DropTempSystemFunctionOperation dropTempSystemFunctionOperation =
            (DropTempSystemFunctionOperation) operation;
        dropSystemFunction(dropTempSystemFunctionOperation);
    } else if (operation instanceof UseCatalogOperation) {
        UseCatalogOperation useCatalogOperation = (UseCatalogOperation) operation;
        catalogManager.setCurrentCatalog(useCatalogOperation.getCatalogName());
    } else if (operation instanceof UseDatabaseOperation) {
        UseDatabaseOperation useDatabaseOperation = (UseDatabaseOperation) operation;
        catalogManager.setCurrentCatalog(useDatabaseOperation.getCatalogName());
        catalogManager.setCurrentDatabase(useDatabaseOperation.getDatabaseName());
    } else {
        throw new TableException(UNSUPPORTED_QUERY_IN_SQL_UPDATE_MSG);
    }
}

// CatalogManager
public void createTable(CatalogBaseTable table, ObjectIdentifier objectIdentifier, boolean ignoreIfExists) {
	execute(
        // 交由具体的Catalog去创建
        // GenericInMemoryCatalog(默认)以及HiveCatalog
		(catalog, path) -> catalog.createTable(path, table, ignoreIfExists),
		objectIdentifier,
		false,
		"CreateTable");
}
```
### 实际查询使用
```java
// 其实就是QueryOperation的逻辑了,流程一致
ParserImpl.parse()->解析SQL为SqlNode
SqlToOperationConverter.convert()->转换为Operation
SqlToOperationConverter.convertSqlQuery()->匹配为QueryOperation
SqlToOperationConverter.toQueryOperation()->转换为QueryOperation
FlinkPlannerImpl.rel()->开始转换为RelNode
SqlToRelConverter.convertQuery()->转换
SqlToRelConverter.convertQueryRecursive()->转换查询
SqlToRelConverter.convertSelect()
SqlToRelConverter.convertSelectImpl()
SqlToRelConverter.convertFrom()
SqlToRelConverter.convertIdentifier()
SqlToRelConverter.toRel()->开始初始化源表
CatalogSourceTable.toRel()
CatalogSourceTable.tableSource()
CatalogSourceTable.findAndCreateTableSource()->寻找并创建数据源表
TableFactoryUtil.findAndCreateTableSource()
TableFactoryUtil.findAndCreateTableSource()

// TableFactoryUtil,此处去加载TableSourceFactory
private static <T> TableSource<T> findAndCreateTableSource(Map<String, String> properties) {
    try {
        return TableFactoryService
            // 根据配置去遍历寻找TableSourceFactory
            .find(TableSourceFactory.class, properties)
            // 使用配置参数创建TableSource
            .createTableSource(properties);
    } catch (Throwable t) {
        throw new TableException("findAndCreateTableSource failed.", t);
    }
}
```