---
title: 优雅停止SparkStreaming
date: 2018-07-03 09:38:32
categories: 大数据
tags: spark
---
> SparkStreaming从Kafka中读取数据，并使用Redis进行Offset保存，同时监听Redis中的Key来确定是否停止程序。

<!-- more -->

## 监听Redis中的Key
```scala
/**
  * 优雅的停止Streaming程序
  *
  * @param ssc
  */
def stopByMarkKey(ssc: StreamingContext): Unit = {
  val intervalMills = 10 * 1000 // 每隔10秒扫描一次消息是否存在
    var isStop = false
    while (!isStop) {
      isStop = ssc.awaitTerminationOrTimeout(intervalMills)
        if (!isStop && isExists(STOP_FLAG)) {
          LOG.warn("2秒后开始关闭sparstreaming程序.....")
            Thread.sleep(2000)
            ssc.stop(true, true)
        }
    }
}
 
/**
  * 判断Key是否存在
  *
  * @param key
  * @return
  */
def isExists(key: String): Boolean = {
  val jedis = InternalRedisClient.getPool.getResource
    val flag = jedis.exists(key)
    jedis.close()
    flag
}
```

## 主程序
```scala
package com.dev.stream
 
import com.dev.scala.ETLStreaming.LOG
import com.dev.scala.util.InternalRedisClient
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.spark.streaming.kafka010.{ConsumerStrategies, HasOffsetRanges, KafkaUtils, LocationStrategies}
import org.apache.spark.streaming.{Seconds, StreamingContext}
import org.apache.spark.{SparkConf, SparkContext, TaskContext}
import org.slf4j.LoggerFactory
 
/**
  *
  */
object KafkaRedisStreaming {
  private val LOG = LoggerFactory.getLogger("KafkaRedisStreaming")
 
  private val STOP_FLAG = "TEST_STOP_FLAG"
 
  def initRedisPool() = {
    // Redis configurations
    val maxTotal = 20
    val maxIdle = 10
    val minIdle = 1
    val redisHost = "47.98.119.122"
    val redisPort = 6379
    val redisTimeout = 30000
    InternalRedisClient.makePool(redisHost, redisPort, redisTimeout, maxTotal, maxIdle, minIdle)
  }
 
  /**
    * 从redis里获取Topic的offset值
    *
    * @param topicName
    * @param partitions
    * @return
    */
  def getLastCommittedOffsets(topicName: String, partitions: Int): Map[TopicPartition, Long] = {
    if (LOG.isInfoEnabled())
      LOG.info("||--Topic:{},getLastCommittedOffsets from Redis--||", topicName)
 
    //从Redis获取上一次存的Offset
    val jedis = InternalRedisClient.getPool.getResource
    val fromOffsets = collection.mutable.HashMap.empty[TopicPartition, Long]
    for (partition <- 0 to partitions - 1) {
      val topic_partition_key = topicName + "_" + partition
      val lastSavedOffset = jedis.get(topic_partition_key)
      val lastOffset = if (lastSavedOffset == null) 0L else lastSavedOffset.toLong
      fromOffsets += (new TopicPartition(topicName, partition) -> lastOffset)
    }
    jedis.close()
 
    fromOffsets.toMap
  }
 
  def main(args: Array[String]): Unit = {
    //初始化Redis Pool
    initRedisPool()
 
    val conf = new SparkConf()
      .setAppName("ScalaKafkaStream")
      .setMaster("local[2]")
 
    val sc = new SparkContext(conf)
    sc.setLogLevel("WARN")
 
    val ssc = new StreamingContext(sc, Seconds(3))
 
    val bootstrapServers = "hadoop1:9092,hadoop2:9092,hadoop3:9092"
    val groupId = "kafka-test-group"
    val topicName = "Test"
    val maxPoll = 20000
 
    val kafkaParams = Map(
      ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG -> bootstrapServers,
      ConsumerConfig.GROUP_ID_CONFIG -> groupId,
      ConsumerConfig.MAX_POLL_RECORDS_CONFIG -> maxPoll.toString,
      ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG -> classOf[StringDeserializer],
      ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG -> classOf[StringDeserializer]
    )
 
    // 这里指定Topic的Partition的总数
    val fromOffsets = getLastCommittedOffsets(topicName, 3)
 
    // 初始化KafkaDS
    val kafkaTopicDS =
      KafkaUtils.createDirectStream(ssc, LocationStrategies.PreferConsistent, ConsumerStrategies.Assign[String, String](fromOffsets.keys.toList, kafkaParams, fromOffsets))
 
    kafkaTopicDS.foreachRDD(rdd => {
      val offsetRanges = rdd.asInstanceOf[HasOffsetRanges].offsetRanges
 
      // 如果rdd有数据
      if (!rdd.isEmpty()) {
        val jedis = InternalRedisClient.getPool.getResource
        val p = jedis.pipelined()
        p.multi() //开启事务
 
        // 处理数据
        rdd
          .map(_.value)
          .flatMap(_.split(" "))
          .map(x => (x, 1L))
          .reduceByKey(_ + _)
          .sortBy(_._2, false)
          .foreach(println)
 
        //更新Offset
        offsetRanges.foreach { offsetRange =>
          println("partition : " + offsetRange.partition + " fromOffset:  " + offsetRange.fromOffset + " untilOffset: " + offsetRange.untilOffset)
          val topic_partition_key = offsetRange.topic + "_" + offsetRange.partition
          p.set(topic_partition_key, offsetRange.untilOffset + "")
        }
 
        p.exec() //提交事务
        p.sync //关闭pipeline
        jedis.close()
      }
    })
 
    ssc.start()
 
    // 优雅停止
    stopByMarkKey(ssc)
 
    ssc.awaitTermination()
  }
}
```

