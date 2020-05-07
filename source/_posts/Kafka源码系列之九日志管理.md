---
title: Kafka源码系列之九日志管理
date: 2020-05-07 17:16:34
categories: 大数据
tags: kafka
---

> 此日志不是Kafka本身日志,介绍Kafka底层是如何存储日志数据的

<!-- more -->

## 日志的基本概念
[传送门](https://jxeditor.github.io/2018/01/25/Kafka%E7%9A%84%E6%A6%82%E5%BF%B5%E6%80%A7%E7%9F%A5%E8%AF%86%E6%95%B4%E5%90%88/)
```
在[Kafka的概念性知识整合]一文有细致的介绍,本文不再赘述

副本概念:(假设有3个副本)
    每个Partition都会有3个副本,三个副本在不同的Broker上
    三个副本中会选举出来一个Leader,另外俩个就是Follower
    Topic的读写都是在Leader上进行,Follower从Leader同步
Follower不支持读写,为了保证数据一致性
```

---

## 日志管理
```
LogManager主要负责日志创建,检索,清理
日志读写操作由日志实例对象Log来处理
```
### 初始化LogManager
```java
logManager = LogManager(config, initialOfflineDirs, zkClient, brokerState, kafkaScheduler, time, brokerTopicStats, logDirFailureChannel)

LogManager.apply()

class LogManager(logDirs: Seq[File],
     initialOfflineDirs: Seq[File],
     val topicConfigs: Map[String, LogConfig], 
     val initialDefaultConfig: LogConfig,
     val cleanerConfig: CleanerConfig,
     recoveryThreadsPerDataDir: Int,
     val flushCheckMs: Long,
     val flushRecoveryOffsetCheckpointMs: Long,
     val flushStartOffsetCheckpointMs: Long,
     val retentionCheckMs: Long,
     val maxPidExpirationMs: Int,
     scheduler: Scheduler,
     val brokerState: BrokerState,
     brokerTopicStats: BrokerTopicStats,
     logDirFailureChannel: LogDirFailureChannel,
     time: Time) extends Logging with KafkaMetricsGroup {
  
  // 检查点表示日志已经刷新到磁盘的位置,用于数据恢复
  val RecoveryPointCheckpointFile = "recovery-point-offset-checkpoint" // 检查点文件

  // 分区与日志实例的对应关系
  private val currentLogs = new Pool[TopicPartition, Log]()
  
  // 检查日志目录
  private val _liveLogDirs: ConcurrentLinkedQueue[File] = createAndValidateLogDirs(logDirs, initialOfflineDirs)
  
  // 每个数据目录都有一个检查点文件,存储这个数据目录下所有分区的检查点信息
  @volatile private var recoveryPointCheckpoints = liveLogDirs.map(dir =>
    (dir, new OffsetCheckpointFile(new File(dir, RecoveryPointCheckpointFile), logDirFailureChannel))).toMap
    
  // 创建指定的数据目录,并做相应的检查
  // 确保数据,目录中没有重复的数据目录
  // 数据不存在的话就创建相应的目录
  // 检查每个目录路径是否是可读的
  private def createAndValidateLogDirs(dirs: Seq[File], initialOfflineDirs: Seq[File]): ConcurrentLinkedQueue[File] = {
    val liveLogDirs = new ConcurrentLinkedQueue[File]()
    val canonicalPaths = mutable.HashSet.empty[String]

    for (dir <- dirs) {
      try {
        if (initialOfflineDirs.contains(dir))
          throw new IOException(s"Failed to load ${dir.getAbsolutePath} during broker startup")

        if (!dir.exists) {
          info(s"Log directory ${dir.getAbsolutePath} not found, creating it.")
          val created = dir.mkdirs()
          if (!created)
            throw new IOException(s"Failed to create data directory ${dir.getAbsolutePath}")
        }
        if (!dir.isDirectory || !dir.canRead)
          throw new IOException(s"${dir.getAbsolutePath} is not a readable log directory.")

        if (!canonicalPaths.add(dir.getCanonicalPath))
          throw new KafkaException(s"Duplicate log directory found: ${dirs.mkString(", ")}")


        liveLogDirs.add(dir)
      } catch {
        case e: IOException =>
          logDirFailureChannel.maybeAddOfflineLogDir(dir.getAbsolutePath, s"Failed to create or validate data directory ${dir.getAbsolutePath}", e)
      }
    }
    if (liveLogDirs.isEmpty) {
      fatal(s"Shutdown broker because none of the specified log dirs from ${dirs.mkString(", ")} can be created or validated")
      Exit.halt(1)
    }

    liveLogDirs
  }  
    
  // 加载所有的日志,而每个日志也会调用loadSegments()方法加载所有的分段,过程比较慢,所以每个日志都会创建一个单独的线程
  // 日志管理器采用线程池提交任务,表示不用的任务可以同时运行
  private def loadLogs(): Unit = {
    info("Loading logs.")
    val startMs = time.milliseconds
    val threadPools = ArrayBuffer.empty[ExecutorService]
    val offlineDirs = mutable.Set.empty[(String, IOException)]
    val jobs = mutable.Map.empty[File, Seq[Future[_]]]

    for (dir <- liveLogDirs) { // 处理每一个日志目录
      try {
        val pool = Executors.newFixedThreadPool(numRecoveryThreadsPerDataDir) // 默认为1
        threadPools.append(pool) // 每个对应的数据目录都有一个线程池

        val cleanShutdownFile = new File(dir, Log.CleanShutdownFile)

        if (cleanShutdownFile.exists) {
          debug(s"Found clean shutdown file. Skipping recovery for all logs in data directory: ${dir.getAbsolutePath}")
        } else {
          // log recovery itself is being performed by `Log` class during initialization
          brokerState.newState(RecoveringFromUncleanShutdown)
        }

        var recoveryPoints = Map[TopicPartition, Long]()
        try {
          recoveryPoints = this.recoveryPointCheckpoints(dir).read // 读取检查点文件
        } catch {
          case e: Exception =>
            warn("Error occurred while reading recovery-point-offset-checkpoint file of directory " + dir, e)
            warn("Resetting the recovery checkpoint to 0")
        }

        var logStartOffsets = Map[TopicPartition, Long]()
        try {
          logStartOffsets = this.logStartOffsetCheckpoints(dir).read
        } catch {
          case e: Exception =>
            warn("Error occurred while reading log-start-offset-checkpoint file of directory " + dir, e)
        }

        val jobsForDir = for {
          dirContent <- Option(dir.listFiles).toList // 数据目录下所有日志目录
          logDir <- dirContent if logDir.isDirectory // 日志目录下每个分区目录
        } yield {
          CoreUtils.runnable { // 每个分区的目录都对应了一个线程
            try {
              loadLog(logDir, recoveryPoints, logStartOffsets)
            } catch {
              case e: IOException =>
                offlineDirs.add((dir.getAbsolutePath, e)) // 失效目录
                error("Error while loading log dir " + dir.getAbsolutePath, e)
            }
          }
        }
        jobs(cleanShutdownFile) = jobsForDir.map(pool.submit) // 提交任务
      } catch {
        case e: IOException =>
          offlineDirs.add((dir.getAbsolutePath, e))
          error("Error while loading log dir " + dir.getAbsolutePath, e)
      }
    }
    try {
      for ((cleanShutdownFile, dirJobs) <- jobs) {
        dirJobs.foreach(_.get)
        try {
          cleanShutdownFile.delete()
        } catch {
          case e: IOException =>
            offlineDirs.add((cleanShutdownFile.getParent, e))
            error(s"Error while deleting the clean shutdown file $cleanShutdownFile", e)
        }
      }

      offlineDirs.foreach { case (dir, e) =>
        logDirFailureChannel.maybeAddOfflineLogDir(dir, s"Error while deleting the clean shutdown file in dir $dir", e)
      }
    } catch {
      case e: ExecutionException =>
        error("There was an error in one of the threads during logs loading: " + e.getCause)
        throw e.getCause
    } finally {
      threadPools.foreach(_.shutdown())
    }

    info(s"Logs loading complete in ${time.milliseconds - startMs} ms.")
  }
}
```
### 启动LogManager
```java
// KafkaServer
logManager.startup()

def startup() {
    /* 安排清理任务以删除旧日志 */
    if (scheduler != null) {
      // 定时清理过期的日志segment,并维护日志的大小
      info("Starting log cleanup with a period of %d ms.".format(retentionCheckMs))
      scheduler.schedule("kafka-log-retention",
                         cleanupLogs _,
                         delay = InitialTaskDelayMs,
                         period = retentionCheckMs,
                         TimeUnit.MILLISECONDS)
      // 定时刷新还没有写到磁盘上的日志
      info("Starting log flusher with a default period of %d ms.".format(flushCheckMs))
      scheduler.schedule("kafka-log-flusher",
                         flushDirtyLogs _,
                         delay = InitialTaskDelayMs,
                         period = flushCheckMs,
                         TimeUnit.MILLISECONDS)
      // 定时将所有数据目录所有日志的检查点写到检查点文件中
      scheduler.schedule("kafka-recovery-point-checkpoint",
                         checkpointLogRecoveryOffsets _,
                         delay = InitialTaskDelayMs,
                         period = flushRecoveryOffsetCheckpointMs,
                         TimeUnit.MILLISECONDS)
      scheduler.schedule("kafka-log-start-offset-checkpoint",
                         checkpointLogStartOffsets _,
                         delay = InitialTaskDelayMs,
                         period = flushStartOffsetCheckpointMs,
                         TimeUnit.MILLISECONDS)
      // 定时删除标记为delete的日志文件
      scheduler.schedule("kafka-delete-logs", // will be rescheduled after each delete logs with a dynamic period
                         deleteLogs _,
                         delay = InitialTaskDelayMs,
                         unit = TimeUnit.MILLISECONDS)
    }
    // 如果设置为true,自动清理compaction类型的topic
    if (cleanerConfig.enableCleaner)
      cleaner.startup()
}
```
### 检查点文件
```
Kafka启动时创建LogManager,读取检查点文件,并把每个分区对应的检查点作为日志的恢复点,最后创建分区对应的Log实例
消费追加到分区对应的日志,在刷新日志时,将最新的偏移量作为日志的检查点
    刷新日志时,更新检查点位置
LogManager会启动一个定时任务,读取所有日志的检查点,并写入全局的检查点文件
    定时将检查点的位置更新到检查点文件中
```

---

## 日志刷新
```
LogManager会定时调度flushDirtyLogs(),定期将缓存中的数据刷新到磁盘中
    如果缓存数据在flush到磁盘之前,Broker宕机,数据就会丢失
Kafka两种策略,将日志刷新到磁盘上
    时间策略(log.flush.interval.ms)默认无限大,即选择大小策略
    大小策略(log.flush.interval.messages)当未刷新的数据超过这个值后,进行刷新

// 周期调度
private def flushDirtyLogs(): Unit = {
  debug("Checking for dirty logs to flush...")
  for ((topicPartition, log) <- currentLogs.toList ++ futureLogs.toList) {
    try {
      // 每个日志的刷新时间不相同
      val timeSinceLastFlush = time.milliseconds - log.lastFlushTime
      debug("Checking if flush is needed on " + topicPartition.topic + " flush interval  " + log.config.flushMs +
            " last flushed " + log.lastFlushTime + " time since last flush: " + timeSinceLastFlush)
      if(timeSinceLastFlush >= log.config.flushMs)
        // 最终还是调用Log实例的flush进行刷新操作
        log.flush
    } catch {
      case e: Throwable =>
        error("Error flushing topic " + topicPartition.topic, e)
    }
  }
}

def flush(offset: Long) : Unit = {
  maybeHandleIOException(s"Error while flushing log for $topicPartition in dir ${dir.getParent} with offset $offset") {
    if (offset <= this.recoveryPoint)
      return
    debug(s"Flushing log up to offset $offset, last flushed: $lastFlushTime,  current time: ${time.milliseconds()}, " +
      s"unflushed: $unflushedMessages")
    // 刷新检查点到最新偏移量之间的所有日志分段
    for (segment <- logSegments(this.recoveryPoint, offset))
      segment.flush() // 刷新数据文件以及索引文件(调用操作系统的fsync)
    lock synchronized {
      checkIfMemoryMappedBufferClosed()
      if (offset > this.recoveryPoint) { // 如果检查点比最新偏移量小,直接赋值
        this.recoveryPoint = offset
        lastFlushedTime.set(time.milliseconds) // 更新刷新时间
      }
    }
  }
}
```

---

## 日志清理
```
删除: 超过时间或大小阈值的旧segment,直接进行删除
压缩: 不直接删除日志分段,而是采用合并压缩的方式进行

def cleanupLogs() {
    debug("Beginning log cleanup...")
    var total = 0
    val startMs = time.milliseconds

    // clean current logs.
    val deletableLogs = {
      if (cleaner != null) {
        cleaner.pauseCleaningForNonCompactedPartitions()
      } else {
        currentLogs.filter {
          case (_, log) => !log.config.compact
        }
      }
    }

    try {
      deletableLogs.foreach {
        case (topicPartition, log) =>
          debug("Garbage collecting '" + log.name + "'")
          // 清理过期的segment
          total += log.deleteOldSegments()

          val futureLog = futureLogs.get(topicPartition)
          if (futureLog != null) {
            // clean future logs
            debug("Garbage collecting future log '" + futureLog.name + "'")
            total += futureLog.deleteOldSegments()
          }
      }
    } finally {
      if (cleaner != null) {
        cleaner.resumeCleaning(deletableLogs.map(_._1))
      }
    }

    debug("Log cleanup completed. " + total + " files deleted in " +
                  (time.milliseconds - startMs) / 1000 + " seconds")
}

// segment保存时间超过设置的时间,进行删除
// 如果当前最新的日志大小加上下一个即将删除的segment分段的大小超过阈值,那么就允许删除该segment
def deleteOldSegments(): Int = {
  if (config.delete) {
    deleteRetentionMsBreachedSegments() + deleteRetentionSizeBreachedSegments() + deleteLogStartOffsetBreachedSegments()
  } else {
    deleteLogStartOffsetBreachedSegments()
  }
}
```