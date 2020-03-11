---
title: Ververica&Flink运维之六StateProcessorAPI
date: 2019-09-17 15:05:41
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# StateProcessorAPI
```
Apache Flink 1.9.0推出的新功能之一
用于读取/分析/生成Flink的SavePoint与CheckPoint

状态的运算与分析
    读取保存点中的状态数据并且加以分析
StateBootstraping
    用历史数据生成新流式应用的起始状态保存点
状态修正
    仅修正错误的状态值,其余算子的状态保留并且生成一个新的Flink保存点
```

---

# 范例
```java
UserPurchase{
    String userId;
    long timestamp;
    Item item;
}
UserItems KeyedProcessFunction(uid="user_items")
ValueState<String> userId;
ValueState<Long> lastSeenTimestamp;
ListState<Item> purchasedItems;

// SP&CK读取
ExecutionEnvironment env = ExecutionEnvironment.getExecutionEnvironment();
ExistingSavepoint existingSavepoint = Savepoint.load(env,"hdfs://path/",new RocksDBStateBackend());
// read keyed state in operator "user_items"
DataSet<UserState> userStates = existingSavepoint.readKeyedState("user_items",new UserKeyedStateReaderFunction());
public class UserKeyedStateReaderFunction extends KeyedStateReaderFunction<String,UserState> {
    private ValueState<String> userId;
    private ValueState<Long> lastSeenTimestamp;
    private ListState<Item> purchasedItems;
    
    @Override
    public void open(Configuration configuration) throws Exception {
        this.userId = getRuntimeContext.getState(...);
        this.lastSeenTimestamp = getRuntimeContext.getState(...);
        this.purchasedItems = getRuntimeContext.getListState(...);
    }
    
    @Override
    public void readKey(String key,Context cxt,Collector<OUT> out) throws Exception {
        out.collect(new UserState(userId.get(),lastSeenTimestamp.get(),purchasedItems.get()));
    }
}

// SP&CK运算
ExecutionEnvironment env = ExecutionEnvironment.getExecutionEnvironment();
ExistingSavepoint existingSavepoint = Savepoint.load(env,"hdfs://path/",new RocksDBStateBackend());
// read keyed state in operator "user_items"
DataSet<UserState> userStates = existingSavepoint.readKeyedState("user_items",new UserKeyedStateReaderFunction());
// process userStates as you normally would with the DataSetAPI ...
// e.g. count total number of items purchased for each category,计算所有被购买过的商品中,各商品种类的购买次数
userStates.flatMap(/* split purchased items list into individual items */)
    .groupBy("itemCategory")
    .reduce(new ItemCounter());
env.execute();

// SP&CK状态修正
// 某商品的隶属分类被改动
// UserItems算子中状态内的ListState<Item>所有的状态值则需要被过滤且修正分类类别
ExistingSavepoint existingSavepoint = Savepoint.load(env,"hdfs://path/",new RocksDBStateBackend());
// read keyed state in operator "user_items"
DataSet<UserState> userStates = existingSavepoint.readKeyedState("user_items",new UserKeyedStateReaderFunction());
// perpare a DataSet with the correct state values
DataSet<UserState> correctedUserStates = userStates.map(new PurchasedItemCategoryPatcher());
// bootstrap a new operator with the correctedUserStates
BootstrapTransformation bootstrapTransformation = OperatorTransformation.bootstrapWith(correctedUserStates)
    .keyBy("userId")
    .transform(new UserKeyedStateBootstrapFunction());
// replace the old operator with the new one
existingSavepoint.withOperator("user_items",bootstrapTransformation)
    .write("hdfs://path/for/corrected/savepoint");
env.execute();
public class UserKeyedStateBootstrapFunction extends KeyedStateBootstrapFunction<String,UserState> {
    private ValueState<String> userId;
    private ValueState<Long> lastSeenTimestamp;
    private ListState<Item> purchasedItems;
    
    @Override
    public void open(Configuration parameters) throws Exception {
        this.userId = getRuntimeContext.getState(...);
        this.lastSeenTimestamp = getRuntimeContext.getState(...);
        this.purchasedItems = getRuntimeContext.getListState(...);
    }
    
    @Override
    public void processElement(UserState userStates,Context cxt) throws Exception {
        this.userId.update(userStates.userId);
        this.lastSeenTimestamp(userStates.lastSeenTimestamp);
        for(Item purchasedItem : userStates.purchasedItems) {
            this.purchasedItems.add(purchasedItem);
        }
    }
}
```

---

# State Bootstrapping
```
// 新部署的流式运算应用的初始状态往往存在于其他现有数据库/档案存储系统
// 先以DataSet读取历史资料,处理完毕后生成新的Flink SavePoint
ExecutionEnvironment env = ExecutionEnvironment.getExecutionEnvironment();
// read a DataSet from any existing data source
DataSet<UserState> historicUserStates = env.readFile(new MyFileInputFormat<>(...), "hdfs://history/user/files");
// bootstarp a new operator with the historicUserStates
BootstrapTransformation bootstrapTransformation = OperatorTransformation.bootstrapWith(correctedUserStates)
    .keyBy("userId")
    .transform(new UserKeyedStateBootstrapFunction());
// create a new savepoint, and register the bootstrapped operator
NewSavepoint newSavepoint = Savepoint.create(new RocksDBStateBackend(), 128);
newSavepoint.withOperator("user_items",bootstrapTransformation)
    .write("hdfs://new/flink/savepoint");
env.execute();
```

---

# 未来计划
```
DataSet API即将被移除,未来State Processor API会直接使用DataStream API
更便利的直接更改MaxParallelism
更便利的去生成WindowState
增加查询应用保存点中有的Operator与所有注册过的状态MetaInfomation
```