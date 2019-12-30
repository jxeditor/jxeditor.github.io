---
title: Flink官网解读
date: 2019-12-25 10:42:44
categories: 大数据
tags: flink
---

> 上次实时维表join的事,觉得自己对于Flink官网并没有去细致了解,单开一篇,记录对Flink官网的解读,局限于scala开发

<!-- more -->

# 基本API
## 数据集与数据流
```
Flink使用DataSet和DataStream表示程序中的数据
```
## Flink程序剖析
```scala
// a.获得execution environment
// org.apache.flink.api.scala
// ExecutionEnvironment
val env = ExecutionEnvironment.getExecutionEnvironment
// org.apache.flink.streaming.api.scala
// StreamExecutionEnvironment
val env = StreamExecutionEnvironment.getExecutionEnvironment()

// b.加载/创建初始数据
val text = env.readTextFile("test.log")

// c.指定对此数据的转换
val counts = text.flatMap(w => {w.split(" ")}).map((_, 1))

// d.指定将计算结果放在何处
counts.writeAsCsv("output", "\n", " ")
counts.print()

// e.触发程序执行
env.execute("Scala WordCount Example")
```
## Lazy Evaluation
```
所有Flink程序都是延迟执行的,执行程序的main方法时,不会进行数据加载和转换,而是先生成执行计划.
当通过execute显示触发时,才会真正执行.
```
## 指定键
```scala
// join,coGroup,keyBy,groupBy要求定义Key
// reduce,groupReduce,aggregate,windows计算分组数据
val counts = text
  .flatMap(_.split(" "))
  .map((_, 1))
  .groupBy(0)
  .reduceGroup(new GroupReduceFunction[(String, Int), (String, Int)] {
    override def reduce(iterable: lang.Iterable[(String, Int)], collector: Collector[(String, Int)]): Unit = {
      val value = iterable.iterator()
      var map = Map[String, Int]()
      while (value.hasNext) {
        val tuple = value.next()
        map += (tuple._1 -> (tuple._2 + map.getOrElse(tuple._1, 0)))
      }
      map.foreach(x => {
        collector.collect((x._1, x._2))
      })
    }
  })

val counts = text
  .flatMap(_.split(" "))
  .map((_, 1))
  .groupBy(0)
  .reduce((x, y) => (x._1, x._2 + y._2))

// 也可以使用POJO
case class WordCount(word: String, count: Int)
val input = env.fromElements(
    WordCount("hello", 1),
    WordCount("world", 2))
input.keyBy("word")
```
## 指定转换函数
```scala
data.map { x => x.toInt }
class MyMapFunction extends RichMapFunction[String, Int] {
  def map(in: String):Int = { in.toInt }
};
data.map(new MyMapFunction())
```

---

# Streaming(DataStream API)
## 范例
```scala
// 5秒一个窗口输出计数
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.api.windowing.time.Time

object WindowWordCount {
  def main(args: Array[String]) {

    val env = StreamExecutionEnvironment.getExecutionEnvironment
    val text = env.socketTextStream("localhost", 9999)

    val counts = text.flatMap { _.toLowerCase.split("\\W+") filter { _.nonEmpty } }
      .map { (_, 1) }
      .keyBy(0)
      .timeWindow(Time.seconds(5))
      .sum(1)

    counts.print()

    env.execute("Window Stream WordCount")
  }
}
```
## 数据源
```
// 文件
readTextFile(path) // 逐行读取文件
readFile(fileInputFormat, path) // 根据指定的文件输入格式读取一次文件
readFile(fileInputFormat, path, watchType, interval, pathFilter) // watchType可以定期监视路径中的新数据(FileProcessingMode.PROCESS_CONTINUOUSLY),或者处理一次路径中当前数据并退出(FileProcessingMode.PROCESS_ONCE),使用pathFilter,进一步排除文件

// socket
socketTextStream

// 集合
fromCollection(Seq)
fromCollection(Iterator)
fromElements(elements: _*)
fromParallelCollection(SplittableIterator)
generateSequence(from, to)

// 自定义
addSource // 比如FlinkKafkaConsumer10
```