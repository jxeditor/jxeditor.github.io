---
title: FlinkTableAPI&SQL用户自定义函数新使用
date: 2020-10-16 13:42:00
categories: 大数据
tags: flink
---

> 在之前的blog里面有对自定义函数做过简单的介绍，这里主要讲下新的功能

<!-- more -->

## 函数有哪些
```
ScalarFunction(UDF)
TableFunction(UDTF)
AggregateFunction(UDAGG)
TableAggregateFunction(UDTAGG)
```

---

## 新功能
### 类型推断
```sh
@DataTypeHint
声明输入输出类型
// function with overloaded evaluation methods
class OverloadedFunction extends ScalarFunction {

  // no hint required
  def eval(a: Long, b: Long): Long = {
    a + b
  }

  // define the precision and scale of a decimal
  @DataTypeHint("DECIMAL(12, 3)")
  def eval(double a, double b): BigDecimal = {
    java.lang.BigDecimal.valueOf(a + b)
  }

  // define a nested data type
  @DataTypeHint("ROW<s STRING, t TIMESTAMP(3) WITH LOCAL TIME ZONE>")
  def eval(Int i): Row = {
    Row.of(java.lang.String.valueOf(i), java.time.Instant.ofEpochSecond(i))
  }

  // allow wildcard input and customly serialized output
  @DataTypeHint(value = "RAW", bridgedTo = classOf[java.nio.ByteBuffer])
  // 此处表示输入可以是任何类型
  def eval(@DataTypeHint(inputGroup = InputGroup.ANY) Object o): java.nio.ByteBuffer = {
    MyUtils.serializeToByteBuffer(o)
  }
}

@FunctionHint
声明整个函数的数据类型，如果有多种，代表每种重载函数分别对应一种推断，所有参数都是可选的
@FunctionHint(output = new DataTypeHint("ROW<s STRING, i INT>"))
class OverloadedFunction extends TableFunction[Row] {

  def eval(a: Int, b: Int): Unit = {
    collect(Row.of("Sum", Int.box(a + b)))
  }

  // overloading of arguments is still possible
  def eval(): Unit = {
    collect(Row.of("Empty args", Int.box(-1)))
  }
}

// decouples the type inference from evaluation methods,
// the type inference is entirely determined by the function hints
@FunctionHint(
  input = Array(new DataTypeHint("INT"), new DataTypeHint("INT")),
  output = new DataTypeHint("INT")
)
@FunctionHint(
  input = Array(new DataTypeHint("BIGINT"), new DataTypeHint("BIGINT")),
  output = new DataTypeHint("BIGINT")
)
@FunctionHint(
  input = Array(),
  output = new DataTypeHint("BOOLEAN")
)
class OverloadedFunction extends TableFunction[AnyRef] {

  // an implementer just needs to make sure that a method exists
  // that can be called by the JVM
  @varargs
  def eval(o: AnyRef*) = {
    if (o.length == 0) {
      collect(Boolean.box(false))
    }
    collect(o(0))
  }
}

自定义类型推断
public static class LiteralFunction extends ScalarFunction {
  public Object eval(String s, String type) {
    switch (type) {
      case "INT":
        return Integer.valueOf(s);
      case "DOUBLE":
        return Double.valueOf(s);
      case "STRING":
      default:
        return s;
    }
  }

  // the automatic, reflection-based type inference is disabled and
  // replaced by the following logic
  @Override
  public TypeInference getTypeInference(DataTypeFactory typeFactory) {
    return TypeInference.newBuilder()
      // specify typed arguments
      // parameters will be casted implicitly to those types if necessary
      .typedArguments(DataTypes.STRING(), DataTypes.STRING())
      // specify a strategy for the result data type of the function
      .outputTypeStrategy(callContext -> {
        if (!callContext.isArgumentLiteral(1) || callContext.isArgumentNull(1)) {
          throw callContext.newValidationError("Literal expected for second argument.");
        }
        // return a data type based on a literal
        final String literal = callContext.getArgumentValue(1, String.class).orElse("STRING");
        switch (literal) {
          case "INT":
            return Optional.of(DataTypes.INT().notNull());
          case "DOUBLE":
            return Optional.of(DataTypes.DOUBLE().notNull());
          case "STRING":
          default:
            return Optional.of(DataTypes.STRING());
        }
      })
      .build();
  }
}
```

### 是否产生确定性结果
```
isDeterministic()
如果产生的结果并不是一个确定值(random,date,now),必须返回false
默认情况下,返回true
```

### 获取全局信息
```
提供open以及close方法获取FunctionContext信息
getMetricGroup()---->此并行子任务的度量标准组
getCachedFile(name)---->分布式缓存文件的本地临时文件副本
getJobParameter(name, defaultValue)---->与给定键关联的全局作业参数值
getExternalResourceInfos(resourceName)---->返回与给定键关联的一组外部资源信息
```

---

## ScalarFunction
```scala
import org.apache.flink.table.annotation.InputGroup
import org.apache.flink.table.api._
import org.apache.flink.table.functions.ScalarFunction

class HashFunction extends ScalarFunction {

  // take any data type and return INT
  def eval(@DataTypeHint(inputGroup = InputGroup.ANY) o: AnyRef): Int = {
    o.hashCode()
  }
}

val env = TableEnvironment.create(...)

// call function "inline" without registration in Table API
env.from("MyTable").select(call(classOf[HashFunction], $"myField"))

// register function
env.createTemporarySystemFunction("HashFunction", classOf[HashFunction])

// call registered function in Table API
env.from("MyTable").select(call("HashFunction", $"myField"))

// call registered function in SQL
env.sqlQuery("SELECT HashFunction(myField) FROM MyTable")
```

---

## TableFunction
```scala
import org.apache.flink.table.annotation.DataTypeHint
import org.apache.flink.table.annotation.FunctionHint
import org.apache.flink.table.api._
import org.apache.flink.table.functions.TableFunction
import org.apache.flink.types.Row

@FunctionHint(output = new DataTypeHint("ROW<word STRING, length INT>"))
class SplitFunction extends TableFunction[Row] {

  def eval(str: String): Unit = {
    // use collect(...) to emit a row
    str.split(" ").foreach(s => collect(Row.of(s, Int.box(s.length))))
  }
}

val env = TableEnvironment.create(...)

// call function "inline" without registration in Table API
env
  .from("MyTable")
  .joinLateral(call(classOf[SplitFunction], $"myField")
  .select($"myField", $"word", $"length")
env
  .from("MyTable")
  .leftOuterJoinLateral(call(classOf[SplitFunction], $"myField"))
  .select($"myField", $"word", $"length")

// rename fields of the function in Table API
env
  .from("MyTable")
  .leftOuterJoinLateral(call(classOf[SplitFunction], $"myField").as("newWord", "newLength"))
  .select($"myField", $"newWord", $"newLength")

// register function
env.createTemporarySystemFunction("SplitFunction", classOf[SplitFunction])

// call registered function in Table API
env
  .from("MyTable")
  .joinLateral(call("SplitFunction", $"myField"))
  .select($"myField", $"word", $"length")
env
  .from("MyTable")
  .leftOuterJoinLateral(call("SplitFunction", $"myField"))
  .select($"myField", $"word", $"length")

// call registered function in SQL
env.sqlQuery(
  "SELECT myField, word, length " +
  "FROM MyTable, LATERAL TABLE(SplitFunction(myField))")
env.sqlQuery(
  "SELECT myField, word, length " +
  "FROM MyTable " +
  "LEFT JOIN LATERAL TABLE(SplitFunction(myField)) ON TRUE")

// rename fields of the function in SQL
env.sqlQuery(
  "SELECT myField, newWord, newLength " +
  "FROM MyTable " +
  "LEFT JOIN LATERAL TABLE(SplitFunction(myField)) AS T(newWord, newLength) ON TRUE")
```

---

## AggregateFunction
```scala
import org.apache.flink.table.api._
import org.apache.flink.table.functions.AggregateFunction

// mutable accumulator of structured type for the aggregate function
case class WeightedAvgAccumulator(
  var sum: Long = 0,
  var count: Int = 0
)

// function that takes (value BIGINT, weight INT), stores intermediate results in a structured
// type of WeightedAvgAccumulator, and returns the weighted average as BIGINT
class WeightedAvg extends AggregateFunction[java.lang.Long, WeightedAvgAccumulator] {

  override def createAccumulator(): WeightedAvgAccumulator = {
    WeightedAvgAccumulator()
  }

  override def getValue(acc: WeightedAvgAccumulator): java.lang.Long = {
    if (acc.count == 0) {
      null
    } else {
      acc.sum / acc.count
    }
  }

  def accumulate(acc: WeightedAvgAccumulator, iValue: java.lang.Long, iWeight: java.lang.Integer): Unit = {
    acc.sum += iValue * iWeight
    acc.count += iWeight
  }

  def retract(acc: WeightedAvgAccumulator, iValue: java.lang.Long, iWeight: java.lang.Integer): Unit = {
    acc.sum -= iValue * iWeight
    acc.count -= iWeight
  }

  def merge(acc: WeightedAvgAccumulator, it: java.lang.Iterable[WeightedAvgAccumulator]): Unit = {
    val iter = it.iterator()
    while (iter.hasNext) {
      val a = iter.next()
      acc.count += a.count
      acc.sum += a.sum
    }
  }

  def resetAccumulator(acc: WeightedAvgAccumulator): Unit = {
    acc.count = 0
    acc.sum = 0L
  }
}

val env = TableEnvironment.create(...)

// call function "inline" without registration in Table API
env
  .from("MyTable")
  .groupBy($"myField")
  .select($"myField", call(classOf[WeightedAvg], $"value", $"weight"))

// register function
env.createTemporarySystemFunction("WeightedAvg", classOf[WeightedAvg])

// call registered function in Table API
env
  .from("MyTable")
  .groupBy($"myField")
  .select($"myField", call("WeightedAvg", $"value", $"weight"))

// call registered function in SQL
env.sqlQuery(
  "SELECT myField, WeightedAvg(value, weight) FROM MyTable GROUP BY myField"
)
```

### 方法说明
```
必要
    createAccumulator()
    accumulate()
    getValue()
可选
    retract() 开窗聚合必须实现
    merge() 有界聚合会话聚合必须实现
```

---

## TableAggregateFunction
```scala
import java.lang.Integer
import org.apache.flink.api.java.tuple.Tuple2
import org.apache.flink.table.api._
import org.apache.flink.table.functions.TableAggregateFunction
import org.apache.flink.util.Collector

// mutable accumulator of structured type for the aggregate function
case class Top2Accumulator(
  var first: Integer,
  var second: Integer
)

// function that takes (value INT), stores intermediate results in a structured
// type of Top2Accumulator, and returns the result as a structured type of Tuple2[Integer, Integer]
// for value and rank
class Top2 extends TableAggregateFunction[Tuple2[Integer, Integer], Top2Accumulator] {

  override def createAccumulator(): Top2Accumulator = {
    Top2Accumulator(
      Integer.MIN_VALUE,
      Integer.MIN_VALUE
    )
  }

  def accumulate(acc: Top2Accumulator, value: Integer): Unit = {
    if (value > acc.first) {
      acc.second = acc.first
      acc.first = value
    } else if (value > acc.second) {
      acc.second = value
    }
  }

  def merge(acc: Top2Accumulator, it: java.lang.Iterable[Top2Accumulator]) {
    val iter = it.iterator()
    while (iter.hasNext) {
      val otherAcc = iter.next()
      accumulate(acc, otherAcc.first)
      accumulate(acc, otherAcc.second)
    }
  }

  def emitValue(acc: Top2Accumulator, out: Collector[Tuple2[Integer, Integer]]): Unit = {
    // emit the value and rank
    if (acc.first != Integer.MIN_VALUE) {
      out.collect(Tuple2.of(acc.first, 1))
    }
    if (acc.second != Integer.MIN_VALUE) {
      out.collect(Tuple2.of(acc.second, 2))
    }
  }
}

val env = TableEnvironment.create(...)

// call function "inline" without registration in Table API
env
  .from("MyTable")
  .groupBy($"myField")
  .flatAggregate(call(classOf[Top2], $"value"))
  .select($"myField", $"f0", $"f1")

// call function "inline" without registration in Table API
// but use an alias for a better naming of Tuple2's fields
env
  .from("MyTable")
  .groupBy($"myField")
  .flatAggregate(call(classOf[Top2], $"value").as("value", "rank"))
  .select($"myField", $"value", $"rank")

// register function
env.createTemporarySystemFunction("Top2", classOf[Top2])

// call registered function in Table API
env
  .from("MyTable")
  .groupBy($"myField")
  .flatAggregate(call("Top2", $"value").as("value", "rank"))
  .select($"myField", $"value", $"rank")
```