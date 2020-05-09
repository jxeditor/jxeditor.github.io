---
title: Kafka源码系列之十七Server网络处理
date: 2020-05-09 12:27:34
categories: 大数据
tags: kafka
---

> Server端对于不同类型的请求处理实现

<!-- more -->

## Server网络模型整体流程
```
KafkaServer在启动时会初始化SocketServer,KafkaApis,KafkaRequestHandlerPool对象
这些是Server网络处理模型的主要组成部分

KafkaServer的网络处理模型也是基于JavaNIO机制实现
```
### 初始化以及启动
```scala
// 初始化SocketServer
socketServer = new SocketServer(config, metrics, time, credentialProvider)
// 延时启动处理器,直到初始化序列结束
socketServer.startup(startupProcessors = false)

// KafkaApis
apis = new KafkaApis(socketServer.requestChannel, replicaManager, adminManager, groupCoordinator, transactionCoordinator,
          kafkaController, zkClient, config.brokerId, config, metadataCache, metrics, authorizer, quotaManagers,
          fetchManager, brokerTopicStats, clusterId, time, tokenManager)

// 请求处理响应池
requestHandlerPool = new KafkaRequestHandlerPool(config.brokerId, socketServer.requestChannel, apis, time,
          config.numIoThreads)

// 启动处理器
socketServer.startProcessors()
```
### 流程
```
组成部分:
    1个Acceptor线程,负责监听Socket新的连接请求,注册了OP_ACCEPT事件
        将新的连接按照RoundRobin方式交给对应的Processor线程处理
    N个Processor线程,其中每个Processor都有自己的Selector
        它会向Acceptor分配的SocketChannel注册相应的OP_READ事件
        N的大小由num.networker.threads决定
    M个KafkaRequestHandler线程处理请求,并将处理的结果返回给Processor线程对应的ResponseQueue中
        由Processor将处理的结果返回给相应的请求发送者
        M的大小由num.io.threads决定

处理流程:
    1.Acceptor监听到来自请求者(client或者server)的新连接,Acceptor将这个请求者按照RoundRobin的方式交给对应的Processor进行处理
    2.Processor注册这个SocketChannel的OP_READ事件,如果有请求发送过来就可以被Processor的Selector选中
    3.Processor将请求者发送的请求放入一个RequestQueue中,这是所有Processor共有的一个队列
    4.KafkaResultHandler从RequestQueue中取出请求
    5.调用KafkaApis进行相应的处理
    6.处理的结果放入到该Processor对应的ResponseQueue中(每个request都标识它们来自哪个Processor),ResponseQueue与Processor数量保持一致
    7.Processor从对应的ResponseQueue中取出response
    8.Processor将处理的结果返回给相应的请求者
```

---

## 源码解析
### SocketServer
```scala
class SocketServer(val config: KafkaConfig, val metrics: Metrics, val time: Time, val credentialProvider: CredentialProvider) extends Logging with KafkaMetricsGroup {

  // broker开放的端口
  private def endpoints = config.listeners.map(l => l.listenerName -> l).toMap
  // 队列中允许的最多请求数,默认是500
  private val maxQueuedRequests = config.queuedMaxRequests

  // 请求队列
  val requestChannel = new RequestChannel(maxQueuedRequests)
  private val processors = new ConcurrentHashMap[Int, Processor]()
  private var nextProcessorId = 0

  private[network] val acceptors = new ConcurrentHashMap[EndPoint, Acceptor]()
}

class RequestChannel(val queueSize: Int) extends KafkaMetricsGroup {
  import RequestChannel._
  // 1个requestQueue,N个response队列(有N个processor就有N个responseQueue)
  private val requestQueue = new ArrayBlockingQueue[BaseRequest](queueSize)
  private val processors = new ConcurrentHashMap[Int, Processor]()
}
```
#### 初始化
```scala
startup()方法中,初始一个Acceptor和N个Processor线程(每个EndPoint都会初始化这么多)
connectionQuotas = new ConnectionQuotas(config.maxConnectionsPerIp, config.maxConnectionsPerIpOverrides)
// numNetworkThreads决定有多少个Processor
createAcceptorAndProcessors(config.numNetworkThreads, config.listeners)

private def createAcceptorAndProcessors(processorsPerListener: Int,
                                        endpoints: Seq[EndPoint]): Unit = synchronized {
  val sendBufferSize = config.socketSendBufferBytes
  val recvBufferSize = config.socketReceiveBufferBytes
  val brokerId = config.brokerId
  endpoints.foreach { endpoint =>
    val listenerName = endpoint.listenerName
    val securityProtocol = endpoint.securityProtocol
    val acceptor = new Acceptor(endpoint, sendBufferSize, recvBufferSize, brokerId, connectionQuotas)
    addProcessors(acceptor, endpoint, processorsPerListener)
    // 守护线程启动Acceptor
    KafkaThread.nonDaemon(s"kafka-socket-acceptor-$listenerName-$securityProtocol-${endpoint.port}", acceptor).start()
    // Acceptor等待启动完成
    acceptor.awaitStartup()
    acceptors.put(endpoint, acceptor)
  }
}

// N个Processor
private def addProcessors(acceptor: Acceptor, endpoint: EndPoint, newProcessorsPerListener: Int): Unit = synchronized {
  val listenerName = endpoint.listenerName
  val securityProtocol = endpoint.securityProtocol
  val listenerProcessors = new ArrayBuffer[Processor]()
  for (_ <- 0 until newProcessorsPerListener) {
    val processor = newProcessor(nextProcessorId, connectionQuotas, listenerName, securityProtocol, memoryPool)
    listenerProcessors += processor
    requestChannel.addProcessor(processor)
    nextProcessorId += 1
  }
  listenerProcessors.foreach(p => processors.put(p.id, p))
  acceptor.addProcessors(listenerProcessors)
}
```
#### Acceptor处理
```scala
def run() {
    // 注册accept事件
    serverChannel.register(nioSelector, SelectionKey.OP_ACCEPT)
    startupComplete()
    try {
      var currentProcessor = 0
      while (isRunning) {
        try {
          val ready = nioSelector.select(500)
          if (ready > 0) {
            val keys = nioSelector.selectedKeys()
            val iter = keys.iterator()
            while (iter.hasNext && isRunning) {
              try {
                val key = iter.next
                iter.remove()
                if (key.isAcceptable) {
                  val processor = synchronized {
                    currentProcessor = currentProcessor % processors.size
                    processors(currentProcessor)
                  }
                  // 拿到一个socket连接,轮询选一个processor进行处理
                  accept(key, processor)
                } else
                  throw new IllegalStateException("Unrecognized key state for acceptor thread.")

                // round robin to the next processor thread, mod(numProcessors) will be done later
                // 轮询算法
                currentProcessor = currentProcessor + 1
              } catch {
                case e: Throwable => error("Error while accepting connection", e)
              }
            }
          }
        }
        catch {
          // We catch all the throwables to prevent the acceptor thread from exiting on exceptions due
          // to a select operation on a specific channel or a bad request. We don't want
          // the broker to stop responding to requests from other clients in these scenarios.
          case e: ControlThrowable => throw e
          case e: Throwable => error("Error occurred", e)
        }
      }
    } finally {
      debug("Closing server socket and selector.")
      CoreUtils.swallow(serverChannel.close(), this, Level.ERROR)
      CoreUtils.swallow(nioSelector.close(), this, Level.ERROR)
      shutdownComplete()
    }
}

// 将新连接交给对应的Processor
def accept(key: SelectionKey, processor: Processor) {
    // accept事件发生时,获取注册到Selector上的ServerSocketChannel
    val serverSocketChannel = key.channel().asInstanceOf[ServerSocketChannel]
    val socketChannel = serverSocketChannel.accept()
    try {
      connectionQuotas.inc(socketChannel.socket().getInetAddress)
      socketChannel.configureBlocking(false)
      socketChannel.socket().setTcpNoDelay(true)
      socketChannel.socket().setKeepAlive(true)
      if (sendBufferSize != Selectable.USE_DEFAULT_BUFFER_SIZE)
        socketChannel.socket().setSendBufferSize(sendBufferSize)

      debug("Accepted connection from %s on %s and assigned it to processor %d, sendBufferSize [actual|requested]: [%d|%d] recvBufferSize [actual|requested]: [%d|%d]"
            .format(socketChannel.socket.getRemoteSocketAddress, socketChannel.socket.getLocalSocketAddress, processor.id,
                  socketChannel.socket.getSendBufferSize, sendBufferSize,
                  socketChannel.socket.getReceiveBufferSize, recvBufferSize))
      
      // 轮询选择不同的Processor进行处理
      processor.accept(socketChannel)
    } catch {
      case e: TooManyConnectionsException =>
        info("Rejected connection from %s, address already has the configured maximum of %d connections.".format(e.ip, e.count))
        close(socketChannel)
    }
}
```
#### Processor处理
```scala
实际是将该SocketChannel添加到该Processor的newConnections队列中
def accept(socketChannel: SocketChannel) {
  newConnections.add(socketChannel)
  wakeup()
}

// Processo线程做了什么
override def run() {
    startupComplete()
    try {
      while (isRunning) {
        try {
          // setup any new connections that have been queued up
          // 对新的socket连接进行配置,并注册READ事件
          configureNewConnections()
          // register any new responses for writing
          // 处理response队列中response
          processNewResponses()
          poll() // 监听所有的socketchannel,是否有新的请求发送过来
          processCompletedReceives() // 处理接收到的请求,将其加入到requestqueue中
          processCompletedSends() // 处理已经完成的发送
          processDisconnected() // 处理断开的连接
        } catch {
          case e: Throwable => processException("Processor got uncaught exception.", e)
        }
      }
    } finally {
      debug("Closing selector - processor " + id)
      CoreUtils.swallow(closeAll(), this, Level.ERROR)
      shutdownComplete()
    }
}
```
### KafkaRequestHandlerPool
#### 初始化
```scala
class KafkaRequestHandlerPool(val brokerId: Int,
                              val requestChannel: RequestChannel,
                              val apis: KafkaApis,
                              time: Time,
                              numThreads: Int) extends Logging with KafkaMetricsGroup {

  // 建立M个KafkaRequestHandler
  private val threadPoolSize: AtomicInteger = new AtomicInteger(numThreads)
  /* a meter to track the average free capacity of the request handlers */
  private val aggregateIdleMeter = newMeter("RequestHandlerAvgIdlePercent", "percent", TimeUnit.NANOSECONDS)

  this.logIdent = "[Kafka Request Handler on Broker " + brokerId + "], "
  val runnables = new mutable.ArrayBuffer[KafkaRequestHandler](numThreads)
  for (i <- 0 until numThreads) {
    // requestChannel是Processor存放request请求的地方
    // 也是Handler处理完请求存放response的地方
    createHandler(i)
  }
  
  def shutdown(): Unit = synchronized {
    info("shutting down")
    for (handler <- runnables)
      handler.initiateShutdown()
    for (handler <- runnables)
      handler.awaitShutdown()
    info("shut down completely")
  }
}
```
#### 处理
```scala
def run() {
    while (!stopped) {
      // We use a single meter for aggregate idle percentage for the thread pool.
      // Since meter is calculated as total_recorded_value / time_window and
      // time_window is independent of the number of threads, each recorded idle
      // time should be discounted by # threads.
      val startSelectTime = time.nanoseconds

      // 从requestQueue中拿取request
      val req = requestChannel.receiveRequest(300)
      val endTime = time.nanoseconds
      val idleTime = endTime - startSelectTime
      aggregateIdleMeter.mark(idleTime / totalHandlerThreads.get)

      req match {
        case RequestChannel.ShutdownRequest =>
          debug(s"Kafka request handler $id on broker $brokerId received shut down command")
          shutdownComplete.countDown()
          return

        case request: RequestChannel.Request =>
          try {
            request.requestDequeueTimeNanos = endTime
            trace(s"Kafka request handler $id on broker $brokerId handling request $request")
            // 处理请求,并将处理的结果通过sendResponse放入responseQueue中
            apis.handle(request)
          } catch {
            case e: FatalExitError =>
              shutdownComplete.countDown()
              Exit.exit(e.statusCode)
            case e: Throwable => error("Exception when handling request", e)
          } finally {
            request.releaseBuffer()
          }

        case null => // continue
      }
    }
    shutdownComplete.countDown()
}

// KafkaApis
private def sendResponse(request: RequestChannel.Request,
                         responseOpt: Option[AbstractResponse],
                         onComplete: Option[Send => Unit]): Unit = {
  // Update error metrics for each error code in the response including Errors.NONE
  responseOpt.foreach(response => requestChannel.updateErrorMetrics(request.header.apiKey, response.errorCounts.asScala))
  val response = responseOpt match {
    case Some(response) =>
      val responseSend = request.context.buildResponse(response)
      val responseString =
        if (RequestChannel.isRequestLoggingEnabled) Some(response.toString(request.context.apiVersion))
        else None
      new RequestChannel.SendResponse(request, responseSend, responseString, onComplete)
    case None =>
      new RequestChannel.NoOpResponse(request)
  }
  // 调用对应的Processor的enqueueResponse方法添加response到responseQueue,wakeup唤醒
  sendResponse(response)
}

// KafkaApis.handle***Request()
// KafkaApis.sendResponse()->sendResponse()
// ResultChannel.sendResponse()->获取对应的Processor
// Processor.enqueueResponse()->添加Response到队列
// wakeup()唤醒Processor线程
```
