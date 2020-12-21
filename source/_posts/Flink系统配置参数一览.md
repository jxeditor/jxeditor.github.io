---
title: Flink系统配置参数一览
date: 2020-12-14 17:48:10
categories: 大数据
tags: Flink
---

> 慢慢肝,整理下Flink的系统配置信息,不同于环境配置[Flink代码编写中的环境配置](https://jxeditor.github.io/2020/04/21/Flink%E4%BB%A3%E7%A0%81%E7%BC%96%E5%86%99%E4%B8%AD%E7%9A%84%E7%8E%AF%E5%A2%83%E9%85%8D%E7%BD%AE/)

<!-- more -->

## AkkaOptions
```
akka.ask.callstack
默认值:true
捕获异步请求的调用堆栈,当ASK失败时,得到一个适当的异常,描述原始方法调度

akka.ask.timeout
默认值:10 s
Akka超时时间,Flink出现超时失败,可以增加该值

akka.tcp.timeout
默认值:20 s
TCP超时时间,由于网络问题导致Flink失败,可以增加该值


akka.startup-timeout

akka.transport.heartbeat.interval

akka.transport.heartbeat.pause

akka.transport.threshold

akka.ssl.enabled

akka.framesize

akka.throughput

akka.log.lifecycle.events

akka.lookup.timeout

akka.client.timeout

akka.jvm-exit-on-fatal-error

akka.retry-gate-closed-for

akka.fork-join-executor.parallelism-factor

akka.fork-join-executor.parallelism-min

akka.fork-join-executor.parallelism-max

akka.client-socket-worker-pool.pool-size-min

akka.client-socket-worker-pool.pool-size-max

akka.client-socket-worker-pool.pool-size-factor

akka.server-socket-worker-pool.pool-size-min

akka.server-socket-worker-pool.pool-size-max

akka.server-socket-worker-pool.pool-size-factor

--- 过时的配置

akka.watch.heartbeat.interval

akka.watch.heartbeat.pause

akka.watch.threshold
```