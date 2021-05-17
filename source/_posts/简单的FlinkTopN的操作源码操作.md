---
title: 简单的FlinkTopN的操作源码操作
date: 2021-05-17 14:24:37
categories: 大数据
tags: flink
---

> 和女票争论了一下,一开始我认为使用ROW_NUMBER计算出TOPN写入MySQL中只会进行更新操作,结果还进行了删除操作,最终结果表中只保留RK条记录

<!-- more -->

## 前置Demo
### 准备工作
```sql
-- mysql上建立结果表
CREATE TABLE `users` (
  `user_id` bigint NOT NULL,
  `page_id` bigint NOT NULL,
  `num` bigint DEFAULT NULL,
  `update_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`page_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- flinksql
CREATE TABLE pageviews (
   user_id BIGINT,
   page_id BIGINT,
   view_time TIMESTAMP(3),
   proctime AS PROCTIME()
 ) WITH (
   'connector' = 'kafka',
   'topic' = 'pageviews',
   'properties.bootstrap.servers' = 'localhost:9092',
   'scan.startup.mode' = 'earliest-offset',
   'format' = 'json'
);

CREATE TABLE users (
  user_id BIGINT,
  page_id BIGINT,
  num BIGINT,
  PRIMARY KEY (user_id,page_id) NOT ENFORCED
) WITH (
   'connector' = 'jdbc',
   'url' = 'jdbc:mysql://localhost:3306/flink',
   'table-name' = 'users',
   'username' = 'root',
   'password' = '123456'
);

insert into users
select user_id,page_id,num
from (
    select user_id,page_id,num,row_number() over(partition by user_id order by num desc) rk
    from (
        select user_id,page_id,count(1) num
        from pageviews
        group by user_id,page_id
    ) tmp
) a
where rk <= 3;

INSERT INTO pageviews VALUES
  (1, 101, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 102, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 103, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 103, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 104, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 104, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 104, TO_TIMESTAMP('2020-11-23 15:00:01.00')),
  (2, 104, TO_TIMESTAMP('2020-11-23 15:00:00'))
;
```
## 结果
```
mysql> select user_id,page_id,num from users;
+---------+---------+------+
| user_id | page_id | num  |
+---------+---------+------+
|       1 |     101 |    1 |
|       1 |     103 |    2 |
|       1 |     104 |    3 |
|       2 |     104 |    1 |
+---------+---------+------+
4 rows in set (0.00 sec)

# 再次插入两条数据后
INSERT INTO pageviews VALUES
  (1, 102, TO_TIMESTAMP('2020-11-23 15:00:00')),
  (1, 102, TO_TIMESTAMP('2020-11-23 15:00:00'));

mysql> select user_id,page_id,num from users;
+---------+---------+------+
| user_id | page_id | num  |
+---------+---------+------+
|       1 |     102 |    3 |
|       1 |     103 |    2 |
|       1 |     104 |    3 |
|       2 |     104 |    1 |
+---------+---------+------+
4 rows in set (0.00 sec)

# user_id=1,page_id=101的数据被删除了
源码层次做了什么操作呢?(发送UPDATE/DELETE)
```

---


## 源码浏览
### 流程
```java
# SQL的转换就不再赘述了,之前有做过分析
1.StreamPhysicalRankRule,Rule规则转换RelNode
override def convert(rel: RelNode): RelNode = {
    val rank = rel.asInstanceOf[FlinkLogicalRank]
    val input = rank.getInput
    val requiredDistribution = if (!rank.partitionKey.isEmpty) {
      FlinkRelDistribution.hash(rank.partitionKey.toList)
    } else {
      FlinkRelDistribution.SINGLETON
    }
    val requiredTraitSet = input.getTraitSet
      .replace(FlinkConventions.STREAM_PHYSICAL)
      .replace(requiredDistribution)
    val providedTraitSet = rank.getTraitSet.replace(FlinkConventions.STREAM_PHYSICAL)
    val newInput: RelNode = RelOptRule.convert(input, requiredTraitSet)

    new StreamPhysicalRank(
      rank.getCluster,
      providedTraitSet,
      newInput,
      rank.partitionKey,
      rank.orderKey,
      rank.rankType,
      rank.rankRange,
      rank.rankNumberType,
      rank.outputRankNumber,
      // TopN更新策略
      // 1.UndefinedStrategy
      // 2.AppendFastStrategy
      // 3.RetractStrategy
      // 4.UpdateFastStrategy
      RankProcessStrategy.UNDEFINED_STRATEGY)
}
2.StreamPhysicalRank,转换为ExecNode
override def translateToExecNode(): ExecNode[_] = {
    val generateUpdateBefore = ChangelogPlanUtils.generateUpdateBefore(this)
    val fieldCollations = orderKey.getFieldCollations
    new StreamExecRank(
      rankType,
      new PartitionSpec(partitionKey.toArray),
      SortUtil.getSortSpec(fieldCollations),
      rankRange,
      rankStrategy,
      outputRankNumber,
      generateUpdateBefore,
      InputProperty.DEFAULT,
      FlinkTypeFactory.toLogicalRowType(getRowType),
      getRelDetailedDescription
    )
}
# 这里注意copy方法,涉及到策略的选型
3.StreamExecRank,转换为Operator
@Override
protected Transformation<RowData> translateToPlanInternal(PlannerBase planner) {
    switch (rankType) {
        case ROW_NUMBER:
            break;
        case RANK:
            throw new TableException("RANK() on streaming table is not supported currently");
        case DENSE_RANK:
            throw new TableException(
                    "DENSE_RANK() on streaming table is not supported currently");
        default:
            throw new TableException(
                    String.format(
                            "Streaming tables do not support %s rank function.", rankType));
    }

    ExecEdge inputEdge = getInputEdges().get(0);
    Transformation<RowData> inputTransform =
            (Transformation<RowData>) inputEdge.translateToPlan(planner);

    RowType inputType = (RowType) inputEdge.getOutputType();
    InternalTypeInfo<RowData> inputRowTypeInfo = InternalTypeInfo.of(inputType);
    int[] sortFields = sortSpec.getFieldIndices();
    RowDataKeySelector sortKeySelector =
            KeySelectorUtil.getRowDataSelector(sortFields, inputRowTypeInfo);
    // create a sort spec on sort keys.
    int[] sortKeyPositions = IntStream.range(0, sortFields.length).toArray();
    SortSpec.SortSpecBuilder builder = SortSpec.builder();
    IntStream.range(0, sortFields.length)
            .forEach(
                    idx ->
                            builder.addField(
                                    idx,
                                    sortSpec.getFieldSpec(idx).getIsAscendingOrder(),
                                    sortSpec.getFieldSpec(idx).getNullIsLast()));
    SortSpec sortSpecInSortKey = builder.build();
    TableConfig tableConfig = planner.getTableConfig();
    GeneratedRecordComparator sortKeyComparator =
            ComparatorCodeGenerator.gen(
                    tableConfig,
                    "StreamExecSortComparator",
                    RowType.of(sortSpec.getFieldTypes(inputType)),
                    sortSpecInSortKey);
    long cacheSize = tableConfig.getConfiguration().getLong(TABLE_EXEC_TOPN_CACHE_SIZE);
    long minIdleStateRetentionTime = tableConfig.getMinIdleStateRetentionTime();
    long maxIdleStateRetentionTime = tableConfig.getMaxIdleStateRetentionTime();

    AbstractTopNFunction processFunction;
    if (rankStrategy instanceof RankProcessStrategy.AppendFastStrategy) {
        processFunction =
                new AppendOnlyTopNFunction(
                        minIdleStateRetentionTime,
                        maxIdleStateRetentionTime,
                        inputRowTypeInfo,
                        sortKeyComparator,
                        sortKeySelector,
                        rankType,
                        rankRange,
                        generateUpdateBefore,
                        outputRankNumber,
                        cacheSize);
    } else if (rankStrategy instanceof RankProcessStrategy.UpdateFastStrategy) {
        RankProcessStrategy.UpdateFastStrategy updateFastStrategy =
                (RankProcessStrategy.UpdateFastStrategy) rankStrategy;
        int[] primaryKeys = updateFastStrategy.getPrimaryKeys();
        RowDataKeySelector rowKeySelector =
                KeySelectorUtil.getRowDataSelector(primaryKeys, inputRowTypeInfo);
        processFunction =
                new UpdatableTopNFunction(
                        minIdleStateRetentionTime,
                        maxIdleStateRetentionTime,
                        inputRowTypeInfo,
                        rowKeySelector,
                        sortKeyComparator,
                        sortKeySelector,
                        rankType,
                        rankRange,
                        generateUpdateBefore,
                        outputRankNumber,
                        cacheSize);
        // TODO Use UnaryUpdateTopNFunction after SortedMapState is merged
    } else if (rankStrategy instanceof RankProcessStrategy.RetractStrategy) {
        EqualiserCodeGenerator equaliserCodeGen =
                new EqualiserCodeGenerator(
                        inputType.getFields().stream()
                                .map(RowType.RowField::getType)
                                .toArray(LogicalType[]::new));
        GeneratedRecordEqualiser generatedEqualiser =
                equaliserCodeGen.generateRecordEqualiser("RankValueEqualiser");
        ComparableRecordComparator comparator =
                new ComparableRecordComparator(
                        sortKeyComparator,
                        sortKeyPositions,
                        sortSpec.getFieldTypes(inputType),
                        sortSpec.getAscendingOrders(),
                        sortSpec.getNullsIsLast());
        processFunction =
                new RetractableTopNFunction(
                        minIdleStateRetentionTime,
                        maxIdleStateRetentionTime,
                        inputRowTypeInfo,
                        comparator,
                        sortKeySelector,
                        rankType,
                        rankRange,
                        generatedEqualiser,
                        generateUpdateBefore,
                        outputRankNumber);
    } else {
        throw new TableException(
                String.format("rank strategy:%s is not supported.", rankStrategy));
    }

    KeyedProcessOperator<RowData, RowData, RowData> operator =
            new KeyedProcessOperator<>(processFunction);
    processFunction.setKeyContext(operator);

    OneInputTransformation<RowData, RowData> transform =
            new OneInputTransformation<>(
                    inputTransform,
                    getDescription(),
                    operator,
                    InternalTypeInfo.of((RowType) getOutputType()),
                    inputTransform.getParallelism());

    // set KeyType and Selector for state
    RowDataKeySelector selector =
            KeySelectorUtil.getRowDataSelector(
                    partitionSpec.getFieldIndices(), inputRowTypeInfo);
    transform.setStateKeySelector(selector);
    transform.setStateKeyType(selector.getProducedType());
    return transform;
}
4.使用的是RetractStrategy,主要看RetractableTopNFunction的emitRecordsWithRowNumber和retractRecordWithRowNumber
一者进行只进行插入更新操作,一者进行插入更新删除操作
private boolean retractRecordWithRowNumber(
        SortedMap<RowData, Long> sortedMap,
        RowData sortKey,
        RowData inputRow,
        Collector<RowData> out)
        throws Exception {
    Iterator<Map.Entry<RowData, Long>> iterator = sortedMap.entrySet().iterator();
    long currentRank = 0L;
    RowData prevRow = null;
    boolean findsSortKey = false;
    while (iterator.hasNext() && isInRankEnd(currentRank)) {
        Map.Entry<RowData, Long> entry = iterator.next();
        RowData key = entry.getKey();
        if (!findsSortKey && key.equals(sortKey)) {
            List<RowData> inputs = dataState.get(key);
            if (inputs == null) {
                // Skip the data if it's state is cleared because of state ttl.
                if (lenient) {
                    LOG.warn(STATE_CLEARED_WARN_MSG);
                } else {
                    throw new RuntimeException(STATE_CLEARED_WARN_MSG);
                }
            } else {
                Iterator<RowData> inputIter = inputs.iterator();
                while (inputIter.hasNext() && isInRankEnd(currentRank)) {
                    RowData currentRow = inputIter.next();
                    if (!findsSortKey && equaliser.equals(currentRow, inputRow)) {
                        prevRow = currentRow;
                        findsSortKey = true;
                        inputIter.remove();
                    } else if (findsSortKey) {
                        collectUpdateBefore(out, prevRow, currentRank);
                        collectUpdateAfter(out, currentRow, currentRank);
                        prevRow = currentRow;
                    }
                    currentRank += 1;
                }
                if (inputs.isEmpty()) {
                    dataState.remove(key);
                } else {
                    dataState.put(key, inputs);
                }
            }
        } else if (findsSortKey) {
            List<RowData> inputs = dataState.get(key);
            int i = 0;
            while (i < inputs.size() && isInRankEnd(currentRank)) {
                RowData currentRow = inputs.get(i);
                collectUpdateBefore(out, prevRow, currentRank);
                collectUpdateAfter(out, currentRow, currentRank);
                prevRow = currentRow;
                currentRank += 1;
                i++;
            }
        } else {
            currentRank += entry.getValue();
        }
    }
    if (isInRankEnd(currentRank)) {
        // there is no enough elements in Top-N, emit DELETE message for the retract record.
        collectDelete(out, prevRow, currentRank);
    }

    return findsSortKey;
}
```
### 在何处进行策略的更新?
```java
上面有提到,需要注意StreamPhysicalRank的copy方法
在FlinkChangelogModeInferenceProgram中被调用
推断ChangelogMode优化
case rank: StreamPhysicalRank =>
    val rankStrategies = RankProcessStrategy.analyzeRankProcessStrategies(
      rank, rank.partitionKey, rank.orderKey)
    visitRankStrategies(rankStrategies, requiredTrait, rankStrategy => rank.copy(rankStrategy))

基于FlinkPhysicalRel,分区Key,排序Key获取更新策略RankProcessStrategy.analyzeRankProcessStrategies()
static List<RankProcessStrategy> analyzeRankProcessStrategies(
        StreamPhysicalRel rank, ImmutableBitSet partitionKey, RelCollation orderKey) {

    RelMetadataQuery mq = rank.getCluster().getMetadataQuery();
    List<RelFieldCollation> fieldCollations = orderKey.getFieldCollations();
    // 分析是不是Update流
    boolean isUpdateStream = !ChangelogPlanUtils.inputInsertOnly(rank);
    RelNode input = rank.getInput(0);

    if (isUpdateStream) {
        Set<ImmutableBitSet> uniqueKeys = mq.getUniqueKeys(input);
        if (uniqueKeys == null
                || uniqueKeys.isEmpty()
                // unique key should contains partition key
                || uniqueKeys.stream().noneMatch(k -> k.contains(partitionKey))) {
            // and we fall back to using retract rank
            // 返回的是RETRACT_STRATEGY
            return Collections.singletonList(RETRACT_STRATEGY);
        } else {
            FlinkRelMetadataQuery fmq = FlinkRelMetadataQuery.reuseOrCreate(mq);
            RelModifiedMonotonicity monotonicity = fmq.getRelModifiedMonotonicity(input);
            boolean isMonotonic = false;
            if (monotonicity != null && !fieldCollations.isEmpty()) {
                isMonotonic =
                        fieldCollations.stream()
                                .allMatch(
                                        collation -> {
                                            SqlMonotonicity fieldMonotonicity =
                                                    monotonicity
                                                            .fieldMonotonicities()[
                                                            collation.getFieldIndex()];
                                            RelFieldCollation.Direction direction =
                                                    collation.direction;
                                            if ((fieldMonotonicity == SqlMonotonicity.DECREASING
                                                            || fieldMonotonicity
                                                                    == SqlMonotonicity
                                                                            .STRICTLY_DECREASING)
                                                    && direction
                                                            == RelFieldCollation.Direction
                                                                    .ASCENDING) {
                                                // sort field is ascending and its monotonicity
                                                // is decreasing
                                                return true;
                                            } else if ((fieldMonotonicity
                                                                    == SqlMonotonicity
                                                                            .INCREASING
                                                            || fieldMonotonicity
                                                                    == SqlMonotonicity
                                                                            .STRICTLY_INCREASING)
                                                    && direction
                                                            == RelFieldCollation.Direction
                                                                    .DESCENDING) {
                                                // sort field is descending and its monotonicity
                                                // is increasing
                                                return true;
                                            } else {
                                                // sort key is a grouping key of upstream agg,
                                                // it is monotonic
                                                return fieldMonotonicity
                                                        == SqlMonotonicity.CONSTANT;
                                            }
                                        });
            }

            if (isMonotonic) {
                // TODO: choose a set of primary key
                return Arrays.asList(
                        new UpdateFastStrategy(uniqueKeys.iterator().next().toArray()),
                        RETRACT_STRATEGY);
            } else {
                // 返回RETRACT_STRATEGY
                return Collections.singletonList(RETRACT_STRATEGY);
            }
        }
    } else {
        // 返回APPEND_FAST_STRATEGY
        return Collections.singletonList(APPEND_FAST_STRATEGY);
    }
}
```