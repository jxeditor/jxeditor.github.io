---
title: Kafka源码系列之一Producer发送者
date: 2020-05-06 11:29:15
categories: 大数据
tags: kafka
---

> 关注了大佬的Blog,对于自己深受打击,kafka-clients-2.1.0-CDH-6.2.0版本

<!-- more -->

## Producer简单使用
```java
// 1.配置Producer需要配置
Properties props = new Properties();
props.put("bootstrap.servers", "127.0.0.1:9092,127.0.0.2:9092");
props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

topicName = "test";
msgNum = 10; // 发送的消息数

// 2.初始化Producer实例
Producer<String, String> producer = new KafkaProducer<>(props);
for (int i = 0; i < msgNum; i++) {
    String msg = i + " test";
    // 3.调用send接口进行数据发送
    producer.send(new ProducerRecord<String, String>(topicName, msg));
}
producer.close();
```

---

## Producer发送流程
### send实现
```java
@Override
public Future<RecordMetadata> send(ProducerRecord<K, V> record) {
    return send(record, null);
}

// 可以知道当发送确认后,可以调用回调函数
@Override
public Future<RecordMetadata> send(ProducerRecord<K, V> record, Callback callback) {
    // 拦截可能被修改的记录;此方法不引发异常
    ProducerRecord<K, V> interceptedRecord = this.interceptors.onSend(record);
    // 最终使用doSend方法
    return doSend(interceptedRecord, callback);
}
```
### doSend实现
```java
throwIfProducerClosed();// 如果Producer已经关闭跑出异常
// 1.首先确保topic的metadata可用
ClusterAndWaitTime clusterAndWaitTime;
try {
    clusterAndWaitTime = waitOnMetadata(record.topic(), record.partition(), maxBlockTimeMs);
} catch (KafkaException e) {
    // matadata关闭抛出异常
    if (metadata.isClosed())
        throw new KafkaException("Producer closed while send in progress", e);
    throw e;
}
long remainingWaitMs = Math.max(0, maxBlockTimeMs - clusterAndWaitTime.waitedOnMetadataMs);
Cluster cluster = clusterAndWaitTime.cluster;
// 2.序列化record的topic,header,Key,Value
byte[] serializedKey;
try {
    serializedKey = keySerializer.serialize(record.topic(), record.headers(), record.key());
} catch (ClassCastException cce) {
    throw new SerializationException("Can't convert key of class " + record.key().getClass().getName() +
            " to class " + producerConfig.getClass(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG).getName() +
            " specified in key.serializer", cce);
}
byte[] serializedValue;
try {
    serializedValue = valueSerializer.serialize(record.topic(), record.headers(), record.value());
} catch (ClassCastException cce) {
    throw new SerializationException("Can't convert value of class " + record.value().getClass().getName() +
            " to class " + producerConfig.getClass(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG).getName() +
            " specified in value.serializer", cce);
}
// 3.获取record的partition的值(可以在Record指定,也可以根据算法生成)
int partition = partition(record, serializedKey, serializedValue, cluster);
tp = new TopicPartition(record.topic(), partition);

setReadOnly(record.headers());
Header[] headers = record.headers().toArray();

int serializedSize = AbstractRecords.estimateSizeInBytesUpperBound(apiVersions.maxUsableProduceMagic(),
        compressionType, serializedKey, serializedValue, headers);
ensureValidRecordSize(serializedSize); // 如果record的字节超出限制或大于内存限制,会抛出异常
long timestamp = record.timestamp() == null ? time.milliseconds() : record.timestamp();
log.trace("Sending record {} with callback {} to topic {} partition {}", record, callback, record.topic(), partition);
// producer callback will make sure to call both 'callback' and interceptor callback
Callback interceptCallback = new InterceptorCallback<>(callback, this.interceptors, tp);

if (transactionManager != null && transactionManager.isTransactional())
    transactionManager.maybeAddPartitionToTransaction(tp);

// 4.向accumulator追加数据
RecordAccumulator.RecordAppendResult result = accumulator.append(tp, timestamp, serializedKey,
        serializedValue, headers, interceptCallback, remainingWaitMs);
// 5.如果batch满了,唤醒sender线程发送数据
if (result.batchIsFull || result.newBatchCreated) {
    log.trace("Waking up the sender since topic {} partition {} is either full or getting a new batch", record.topic(), partition);
    this.sender.wakeup();
}
return result.future;
```

---

## 发送过程详解
### 获取topic的metadata信息
```java
// 等待Metadata的更新
private ClusterAndWaitTime waitOnMetadata(String topic, Integer partition, long maxWaitMs) throws InterruptedException {
    // 将topic添加到元数据topic列表（如果尚未存在），并重置过期时间
    Cluster cluster = metadata.fetch();

    if (cluster.invalidTopics().contains(topic))
        throw new InvalidTopicException(topic);

    metadata.add(topic);

    Integer partitionsCount = cluster.partitionCountForTopic(topic); // 如果topic已经存在meta中,则返回该topic的partition数,否则返回null
    // 如果有缓存的元数据,并且记录的分区未定义或在已知分区范围内,则返回该元数据
    if (partitionsCount != null && (partition == null || partition < partitionsCount))
        return new ClusterAndWaitTime(cluster, 0);

    long begin = time.milliseconds();
    long remainingWaitMs = maxWaitMs;
    long elapsed;
    // 发送metadata请求,直到获取这个topic的metadata或者请求超时
    do {
        log.trace("Requesting metadata update for topic {}.", topic);
        metadata.add(topic);
        int version = metadata.requestUpdate(); // 返回当前版本号,初始值为0,每次更新时会自增,并将needUpdate设置为true
        sender.wakeup(); // 唤起sender,发送metadata请求
        try {
            metadata.awaitUpdate(version, remainingWaitMs); // 等待metadata的更新
        } catch (TimeoutException ex) {
            // Rethrow with original maxWaitMs to prevent logging exception with remainingWaitMs
            throw new TimeoutException("Failed to update metadata after " + maxWaitMs + " ms.");
        }
        cluster = metadata.fetch();
        elapsed = time.milliseconds() - begin;
        if (elapsed >= maxWaitMs)
            throw new TimeoutException("Failed to update metadata after " + maxWaitMs + " ms."); // 超时
        if (cluster.unauthorizedTopics().contains(topic))
            throw new TopicAuthorizationException(topic); // 认证失败
        if (cluster.invalidTopics().contains(topic))
            throw new InvalidTopicException(topic);
        remainingWaitMs = maxWaitMs - elapsed;
        partitionsCount = cluster.partitionCountForTopic(topic);
    } while (partitionsCount == null); // 不停循环,直到partitionsCount不为null(直到metadata出现这个topic的相关信息)

    if (partition != null && partition >= partitionsCount) {
        throw new KafkaException(
                String.format("Invalid partition given with record: %d is not in the range [0...%d).", partition, partitionsCount));
    }

    return new ClusterAndWaitTime(cluster, elapsed);
}
```
#### Metadata更新操作
```java
// 更新metadata信息(根据version值判断)
public synchronized void awaitUpdate(final int lastVersion, final long maxWaitMs) throws InterruptedException {
    if (maxWaitMs < 0)
        throw new IllegalArgumentException("Max time to wait for metadata updates should not be < 0 milliseconds");
    long begin = System.currentTimeMillis();
    long remainingWaitMs = maxWaitMs;
    while ((this.version <= lastVersion) && !isClosed()) { // 不断循环,直到metadata更新成功,version自增
        AuthenticationException ex = getAndClearAuthenticationException();
        if (ex != null)
            throw ex;
        if (remainingWaitMs != 0)
            wait(remainingWaitMs); // 阻塞线程,等待metadata更新
        long elapsed = System.currentTimeMillis() - begin;
        if (elapsed >= maxWaitMs) // 超时
            throw new TimeoutException("Failed to update metadata after " + maxWaitMs + " ms.");
        remainingWaitMs = maxWaitMs - elapsed;
    }
    if (isClosed())
        throw new KafkaException("Requested metadata update after close");
}
```
至此,Producer线程会阻塞在两个while循环中,直到metadata更新.metadata更新主要通过sender.wakeup()来唤醒sender线程,间接唤醒NetworkClient线程,NetworkClient线程来负责发送Metadata请求,并处理Server端的响应.在唤醒NetworkClient后会调用poll方法进行实际操作,如下:
```java
@Override
public List<ClientResponse> poll(long timeout, long now) {
    if (!abortedSends.isEmpty()) {
        // If there are aborted sends because of unsupported version exceptions or disconnects,
        // handle them immediately without waiting for Selector#poll.
        List<ClientResponse> responses = new ArrayList<>();
        handleAbortedSends(responses);
        completeResponses(responses);
        return responses;
    }

    long metadataTimeout = metadataUpdater.maybeUpdate(now); // 判断是否需要更新meta,如果需要就更新(请求更新metadata的地方)
    try {
        this.selector.poll(Utils.min(timeout, metadataTimeout, defaultRequestTimeoutMs));
    } catch (IOException e) {
        log.error("Unexpected error during I/O", e);
    }

    // process completed actions
    long updatedNow = this.time.milliseconds();
    List<ClientResponse> responses = new ArrayList<>();
    handleCompletedSends(responses, updatedNow); // // 通过selector中获取Server端的response
    handleCompletedReceives(responses, updatedNow); // 在返回的handler中,会处理metadata的更新
    handleDisconnections(responses, updatedNow);
    handleConnections();
    handleInitiateApiVersionRequests(updatedNow);
    handleTimedOutRequests(responses, updatedNow);
    completeResponses(responses);

    return responses;
}
```
判断Metadata是否需要更新,如果需要更新,先与Broker建立连接,然后发送更新metadata请求
```java
public long maybeUpdate(long now) {
    // should we update our metadata?
    // metadata是否应该更新
    long timeToNextMetadataUpdate = metadata.timeToNextUpdate(now); // metadata下次更新的时间(需要判断是强制更新还是metadata过期更新,前者是立马更新,后者是计算metadata的过期时间)
    // 如果一条metadata的fetch请求还未从server收到回复,那么时间设置为waitForMetadataFetch(默认30s)
    long waitForMetadataFetch = this.metadataFetchInProgress ? defaultRequestTimeoutMs : 0;

    long metadataTimeout = Math.max(timeToNextMetadataUpdate, waitForMetadataFetch);

    if (metadataTimeout > 0) { // 时间未到时,直接返回下次应该更新的时间
        return metadataTimeout;
    }

    // 选择一个连接数最小的节点
    Node node = leastLoadedNode(now);
    if (node == null) {
        log.debug("Give up sending metadata request since no node is available");
        return reconnectBackoffMs;
    }

    return maybeUpdate(now, node); // 可以发送metadata请求的话,就发送metadata请求
}

// 判断是否可以发送请求,可以的话将metadata请求加入到发送列表中
private long maybeUpdate(long now, Node node) {
    String nodeConnectionId = node.idString();
    if (canSendRequest(nodeConnectionId, now)) { // 通道已经准备好,并且支持发送更多的请求
        this.metadataFetchInProgress = true; // 准备开始发送数据,将metadataFetchInProgress置为true
        MetadataRequest.Builder metadataRequest; // // 创建metadata请求
        if (metadata.needMetadataForAllTopics()) // 强制更新所有topic的metadata(虽然默认不会更新所有topic的 metadata信息,但是每个Broker会保存所有topic的meta信息)
            metadataRequest = MetadataRequest.Builder.allTopics();
        else // 只更新metadata中的topics列表(列表中的topics由metadata.add()得到)
            metadataRequest = new MetadataRequest.Builder(new ArrayList<>(metadata.topics()),
                    metadata.allowAutoTopicCreation());
        log.debug("Sending metadata request {} to node {}", metadataRequest, node);
        sendInternalMetadataRequest(metadataRequest, nodeConnectionId, now); // 发送metadata请求
        return defaultRequestTimeoutMs;
    }
    // 如果client正在与任何一个node的连接状态是connecting,那么就进行等待
    if (isAnyNodeConnecting()) {
        // Strictly the timeout we should return here is "connect timeout", but as we don't
        // have such application level configuration, using reconnect backoff instead.
        return reconnectBackoffMs;
    }
    // 如果没有连接这个node,那就初始化连接
    if (connectionStates.canConnect(nodeConnectionId, now)) {
        // we don't have a connection to this node right now, make one
        log.debug("Initialize connection to node {} for sending metadata request", node);
        initiateConnect(node, now); // 初始化连接
        return reconnectBackoffMs;
    }
    // connected, but can't send more OR connecting
    // In either case, we just need to wait for a network event to let us know the selected
    // connection might be usable again.
    return Long.MAX_VALUE;
}

// 发送metadata请求
private void sendInternalMetadataRequest(MetadataRequest.Builder builder,String nodeConnectionId, long now) {
    ClientRequest clientRequest = newClientRequest(nodeConnectionId, builder, now, true);
    doSend(clientRequest, true, now);
}
```
每次Producer请求更新metadata时的情况
- 如果node可以发送请求,则直接发送请求
- 如果该node正在建立连接,则直接返回
- 如果该node还没建立连接,则向broker初始化连接

KafkaProducer线程被两个while循环中,知道metadata更新
- sender线程第一次调用poll,初始化与node的连接
- sender线程第二次调用poll,发送Metadata请求
- sender线程第三次调用poll,获取metadataResponse,更新metadata

当不阻塞之后,Producer才会开始发送信息
NetworkClient接收到Server端对Metadata请求的响应后,更新metadata信息
```java
// 处理任何已经完成的接收响应
private void handleCompletedReceives(List<ClientResponse> responses, long now) {
    for (NetworkReceive receive : this.selector.completedReceives()) {
        String source = receive.source();
        InFlightRequest req = inFlightRequests.completeNext(source);
        Struct responseStruct = parseStructMaybeUpdateThrottleTimeMetrics(receive.payload(), req.header,
            throttleTimeSensor, now);
        if (log.isTraceEnabled()) {
            log.trace("Completed receive from node {} for {} with correlation id {}, received {}", req.destination,
                req.header.apiKey(), req.header.correlationId(), responseStruct);
        }
        // If the received response includes a throttle delay, throttle the connection.
        AbstractResponse body = AbstractResponse.parseResponse(req.header.apiKey(), responseStruct);
        maybeThrottle(body, req.header.apiVersion(), req.destination, now);
        if (req.isInternalRequest && body instanceof MetadataResponse) // 如果是meta响应
            metadataUpdater.handleCompletedMetadataResponse(req.header, now, (MetadataResponse) body);
        else if (req.isInternalRequest && body instanceof ApiVersionsResponse)
            handleApiVersionsResponse(responses, req, now, (ApiVersionsResponse) body);
        else
            responses.add(req.completed(body, now));
    }
}

// 处理Server端对Metadata请求处理后的响应
@Override
public void handleCompletedMetadataResponse(RequestHeader requestHeader, long now, MetadataResponse response) {
    this.metadataFetchInProgress = false;
    Cluster cluster = response.cluster();

    // If any partition has leader with missing listeners, log a few for diagnosing broker configuration
    // issues. This could be a transient issue if listeners were added dynamically to brokers.
    List<TopicPartition> missingListenerPartitions = response.topicMetadata().stream().flatMap(topicMetadata ->
        topicMetadata.partitionMetadata().stream()
            .filter(partitionMetadata -> partitionMetadata.error() == Errors.LISTENER_NOT_FOUND)
            .map(partitionMetadata -> new TopicPartition(topicMetadata.topic(), partitionMetadata.partition())))
        .collect(Collectors.toList());
    if (!missingListenerPartitions.isEmpty()) {
        int count = missingListenerPartitions.size();
        log.warn("{} partitions have leader brokers without a matching listener, including {}",
                count, missingListenerPartitions.subList(0, Math.min(10, count)));
    }

    // check if any topics metadata failed to get updated
    Map<String, Errors> errors = response.errors();
    if (!errors.isEmpty())
        log.warn("Error while fetching metadata with correlation id {} : {}", requestHeader.correlationId(), errors);

    // don't update the cluster if there are no valid nodes...the topic we want may still be in the process of being
    // created which means we will get errors and no nodes until it exists
    if (cluster.nodes().size() > 0) {
        // 更新meta信息
        this.metadata.update(cluster, response.unavailableTopics(), now);
    } else {
        // 如果metadata中node信息无效,则不更新信息
        log.trace("Ignoring empty metadata response with correlation id {}.", requestHeader.correlationId());
        this.metadata.failedUpdate(now, null);
    }
}
```
#### Metadata更新策略
```
KafkaProducer第一次发送信息时强制更新,其他时间周期性更新,通过lastRefreshMs,lastSuccessfulRefreshMs两个字段实现
强制更新:调用Metadata.requestUpdate()将needUpdate置为true

强制更新触发:
    initConnect()初始化连接
    poll()对handleDisconnections()处理连接断开情况
    poll()对handleTimedOutRequests()处理请求超时
    发送信息时找不到partition的leader
    处理Producer响应(handleProduceResponse),如果返回关于metadata过期的异常

强制更新主要用于处理各种异常情况
```
### key和value序列化
```java
// 内部提供了一些序列化方法
props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

// 当然,也可以自定义序列化的具体实现
```
### 获取Partition值
```java
// 1.指明partition的情况下,直接将指明的值作为partition值
// 2.没有指明partition值但有key的情况下,将key的hash值与topic的partition数进行取余得到partition值
// 3.既没有partition值又没有key值,第一次调用时随机生成一个整数(后面每次调用在这个整数上自增),将这个值与topic的partition数进行取余得到partition值(Round-robin算法)

// record有partition值时直接返回,不然调用partitioner的partition方法去计算
private int partition(ProducerRecord<K, V> record, byte[] serializedKey, byte[] serializedValue, Cluster cluster) {
    Integer partition = record.partition();
    return partition != null ?
            partition :
            partitioner.partition(
                    record.topic(), record.key(), serializedKey, record.value(), serializedValue, cluster);
}

// Producer默认使用DefaultPartitioner,可以自定义partition策略
public int partition(String topic, Object key, byte[] keyBytes, Object value, byte[] valueBytes, Cluster cluster) {
    List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
    int numPartitions = partitions.size();
    if (keyBytes == null) { // 没有Key的情况下
        int nextValue = nextValue(topic); // 第一次生成随机整数,后面每次调用都自增
        List<PartitionInfo> availablePartitions = cluster.availablePartitionsForTopic(topic);
        // leader不为null,即为可用的partition
        if (availablePartitions.size() > 0) {
            int part = Utils.toPositive(nextValue) % availablePartitions.size();
            return availablePartitions.get(part).partition();
        } else {
            // no partitions are available, give a non-available partition
            return Utils.toPositive(nextValue) % numPartitions;
        }
    } else { // 有Key的情况,使用key的hash值进行计算
        // hash the keyBytes to choose a partition
        return Utils.toPositive(Utils.murmur2(keyBytes)) % numPartitions;
    }
}

private int nextValue(String topic) {
    AtomicInteger counter = topicCounterMap.get(topic);
    if (null == counter) { // 第一次调用,随机整数
        counter = new AtomicInteger(ThreadLocalRandom.current().nextInt());
        AtomicInteger currentCounter = topicCounterMap.putIfAbsent(topic, counter);
        if (currentCounter != null) {
            counter = currentCounter;
        }
    }
    return counter.getAndIncrement(); // 自增
}
```
### 向Accumulator写数据
```java
// Producer先将record写入到buffer中,当达到一个batch.size的大小时,唤起sender线程取发送ProducerBatch
// Producer通过RecordAccumulator实例追加数据,主要变量为ConcurrentMap<TopicPartition, Deque<ProducerBatch>> batches
// 每个TopicPartition都对应一个Deque<ProducerBatch>
// 当添加数据时,会向其topic-partition对应的这个queue最新创建的一个ProducerBatch中添加record
// 而发送数据时,则会先从queue中最老的那个RecordBatch开始发送

// 向accumulator添加一条record,并返回添加后的结果(结果包含,future metadata,batch是否满的标志以及新batch是否创建)
// 其中,maxTimeToBlock是buffer.memory的block的最大时间
public RecordAppendResult append(TopicPartition tp,
                                     long timestamp,
                                     byte[] key,
                                     byte[] value,
                                     Header[] headers,
                                     Callback callback,
                                     long maxTimeToBlock) throws InterruptedException {
    // We keep track of the number of appending thread to make sure we do not miss batches in
    // abortIncompleteBatches().
    appendsInProgress.incrementAndGet();
    ByteBuffer buffer = null;
    if (headers == null) headers = Record.EMPTY_HEADERS;
    try {
        // check if we have an in-progress batch
        Deque<ProducerBatch> dq = getOrCreateDeque(tp); // 每个topicPartition对应一个queue
        synchronized (dq) { // 在对一个queue进行操作时,会保证线程安全
            if (closed)
                throw new KafkaException("Producer closed while send in progress");
            RecordAppendResult appendResult = tryAppend(timestamp, key, value, headers, callback, dq); // 追加数据
            if (appendResult != null)
                return appendResult; // 这个topic-partition已经有记录了
        }

        // we don't have an in-progress record batch try to allocate a new batch
        // 为topic-partition创建一个新的ProducerBatch,需要初始化相应的ProducerBatch,要为其分配的大小是:max(batch.size,加上头文件的本条消息的大小)
        byte maxUsableMagic = apiVersions.maxUsableProduceMagic();
        int size = Math.max(this.batchSize, AbstractRecords.estimateSizeInBytesUpperBound(maxUsableMagic, compression, key, value, headers));
        log.trace("Allocating a new {} byte message buffer for topic {} partition {}", size, tp.topic(), tp.partition());
        buffer = free.allocate(size, maxTimeToBlock); // 给这个ProducerBatch初始化一个buffer
        synchronized (dq) {
            // Need to check if producer is closed again after grabbing the dequeue lock.
            if (closed)
                throw new KafkaException("Producer closed while send in progress");

            RecordAppendResult appendResult = tryAppend(timestamp, key, value, headers, callback, dq);
            if (appendResult != null) { // 如果突然发现这个queue已经存在,直接返回
                // Somebody else found us a batch, return the one we waited for! Hopefully this doesn't happen often...
                return appendResult;
            }

            // 给topic-partition创建一个ProducerBatch
            MemoryRecordsBuilder recordsBuilder = recordsBuilder(buffer, maxUsableMagic);
            ProducerBatch batch = new ProducerBatch(tp, recordsBuilder, time.milliseconds());
            // 向新的ProducerBatch中追加数据
            FutureRecordMetadata future = Utils.notNull(batch.tryAppend(timestamp, key, value, headers, callback, time.milliseconds()));

            // 将RecordBatch添加到对应的queue中
            dq.addLast(batch);
            // 向未ack的batch集合添加这个batch
            incomplete.add(batch);

            // Don't deallocate this buffer in the finally block as it's being used in the record batch
            buffer = null;
            // 如果dp.size()>1就证明这个queue有一个batch是可以发送了
            return new RecordAppendResult(future, dq.size() > 1 || batch.isFull(), true);
        }
    } finally {
        if (buffer != null)
            free.deallocate(buffer);
        appendsInProgress.decrementAndGet();
    }
}
```
### 发送ProducerBatch
```java
// 当record写入成功后,如果发现ProducerBatch满足发送的条件(通常是queue中有多个Batch,那么最先添加的batch肯定是可以发送的)
// 那么就会唤醒sender线程,发送ProducerBatch
// sender线程对ProducerBatch的处理是在run()方法中进行的
void run(long now) {
    if (transactionManager != null) {
        try {
            if (transactionManager.shouldResetProducerStateAfterResolvingSequences())
                // Check if the previous run expired batches which requires a reset of the producer state.
                transactionManager.resetProducerId();
            if (!transactionManager.isTransactional()) {
                // this is an idempotent producer, so make sure we have a producer id
                maybeWaitForProducerId();
            } else if (transactionManager.hasUnresolvedSequences() && !transactionManager.hasFatalError()) {
                transactionManager.transitionToFatalError(
                    new KafkaException("The client hasn't received acknowledgment for " +
                        "some previously sent messages and can no longer retry them. It isn't safe to continue."));
            } else if (transactionManager.hasInFlightTransactionalRequest() || maybeSendTransactionalRequest(now)) {
                // as long as there are outstanding transactional requests, we simply wait for them to return
                client.poll(retryBackoffMs, now);
                return;
            }

            // do not continue sending if the transaction manager is in a failed state or if there
            // is no producer id (for the idempotent case).
            if (transactionManager.hasFatalError() || !transactionManager.hasProducerId()) {
                RuntimeException lastError = transactionManager.lastError();
                if (lastError != null)
                    maybeAbortBatches(lastError);
                client.poll(retryBackoffMs, now);
                return;
            } else if (transactionManager.hasAbortableError()) {
                accumulator.abortUndrainedBatches(transactionManager.lastError());
            }
        } catch (AuthenticationException e) {
            // This is already logged as error, but propagated here to perform any clean ups.
            log.trace("Authentication exception while processing transactional request: {}", e);
            transactionManager.authenticationFailed(e);
        }
    }

    // 发送Producer数据
    long pollTimeout = sendProducerData(now);
    client.poll(pollTimeout, now);
}

private long sendProducerData(long now) {
    Cluster cluster = metadata.fetch();
    // 获取那些已经可以发送的ProducerBatch对应的nodes
    RecordAccumulator.ReadyCheckResult result = this.accumulator.ready(cluster, now);

    // 如果有topic-partition的leader是未知的,就强制更新metadata
    if (!result.unknownLeaderTopics.isEmpty()) {
        for (String topic : result.unknownLeaderTopics)
            this.metadata.add(topic);

        log.debug("Requesting metadata update due to unknown leader topics from the batched records: {}",
            result.unknownLeaderTopics);
        this.metadata.requestUpdate();
    }

    // 如果与node没有连接(如果可以连接,同时初始化该连接),就证明该node暂时不能发送数据,暂时移除该node
    Iterator<Node> iter = result.readyNodes.iterator();
    long notReadyTimeout = Long.MAX_VALUE;
    while (iter.hasNext()) {
        Node node = iter.next();
        if (!this.client.ready(node, now)) {
            iter.remove();
            notReadyTimeout = Math.min(notReadyTimeout, this.client.pollDelayMs(node, now));
        }
    }

    // 返回该node对应的所有可以发送的ProducerBatch组成的batches(key是node.id),并将ProducerBatch从对应的queue中移除
    Map<Integer, List<ProducerBatch>> batches = this.accumulator.drain(cluster, result.readyNodes, this.maxRequestSize, now);
    addToInflightBatches(batches);
    if (guaranteeMessageOrder) {
        // 记录将要发送的ProducerBatch
        for (List<ProducerBatch> batchList : batches.values()) {
            for (ProducerBatch batch : batchList)
                this.accumulator.mutePartition(batch.topicPartition);
        }
    }

    accumulator.resetNextBatchExpiryTime();
    List<ProducerBatch> expiredInflightBatches = getExpiredInflightBatches(now);
    List<ProducerBatch> expiredBatches = this.accumulator.expiredBatches(now);
    expiredBatches.addAll(expiredInflightBatches);

    if (!expiredBatches.isEmpty())
        log.trace("Expired {} batches in accumulator", expiredBatches.size());
    // 将由于元数据不可用而导致发送超时的ProducerBatch移除
    for (ProducerBatch expiredBatch : expiredBatches) {
        String errorMessage = "Expiring " + expiredBatch.recordCount + " record(s) for " + expiredBatch.topicPartition
            + ":" + (now - expiredBatch.createdMs) + " ms has passed since batch creation";
        failBatch(expiredBatch, -1, NO_TIMESTAMP, new TimeoutException(errorMessage), false);
        if (transactionManager != null && expiredBatch.inRetry()) {
            transactionManager.markSequenceUnresolved(expiredBatch.topicPartition);
        }
    }
    sensors.updateProduceRequestMetrics(batches);

    long pollTimeout = Math.min(result.nextReadyCheckDelayMs, notReadyTimeout);
    pollTimeout = Math.min(pollTimeout, this.accumulator.nextExpiryTimeMs() - now);
    pollTimeout = Math.max(pollTimeout, 0);
    if (!result.readyNodes.isEmpty()) {
        log.trace("Nodes with data ready to send: {}", result.readyNodes);
        pollTimeout = 0;
    }
    // 发送ProducerBatch
    sendProduceRequests(batches, now);
    return pollTimeout;
}

private void sendProduceRequests(Map<Integer, List<ProducerBatch>> collated, long now) {
    for (Map.Entry<Integer, List<ProducerBatch>> entry : collated.entrySet())
        sendProduceRequest(now, entry.getKey(), acks, requestTimeoutMs, entry.getValue());
}

// 发送哦Produce请求
// 将batches中leader为同一个node的所有ProducerBatch放在一个请求中进行发送
private void sendProduceRequest(long now, int destination, short acks, int timeout, List<ProducerBatch> batches) {
    if (batches.isEmpty())
        return;

    Map<TopicPartition, MemoryRecords> produceRecordsByPartition = new HashMap<>(batches.size());
    final Map<TopicPartition, ProducerBatch> recordsByPartition = new HashMap<>(batches.size());

    // find the minimum magic version used when creating the record sets
    byte minUsedMagic = apiVersions.maxUsableProduceMagic();
    for (ProducerBatch batch : batches) {
        if (batch.magic() < minUsedMagic)
            minUsedMagic = batch.magic();
    }

    for (ProducerBatch batch : batches) {
        TopicPartition tp = batch.topicPartition;
        MemoryRecords records = batch.records();

        // down convert if necessary to the minimum magic used. In general, there can be a delay between the time
        // that the producer starts building the batch and the time that we send the request, and we may have
        // chosen the message format based on out-dated metadata. In the worst case, we optimistically chose to use
        // the new message format, but found that the broker didn't support it, so we need to down-convert on the
        // client before sending. This is intended to handle edge cases around cluster upgrades where brokers may
        // not all support the same message format version. For example, if a partition migrates from a broker
        // which is supporting the new magic version to one which doesn't, then we will need to convert.
        if (!records.hasMatchingMagic(minUsedMagic))
            records = batch.records().downConvert(minUsedMagic, 0, time).records();
        produceRecordsByPartition.put(tp, records);
        recordsByPartition.put(tp, batch);
    }

    String transactionalId = null;
    if (transactionManager != null && transactionManager.isTransactional()) {
        transactionalId = transactionManager.transactionalId();
    }
    ProduceRequest.Builder requestBuilder = ProduceRequest.Builder.forMagic(minUsedMagic, acks, timeout,
            produceRecordsByPartition, transactionalId);
    RequestCompletionHandler callback = new RequestCompletionHandler() {
        public void onComplete(ClientResponse response) {
            handleProduceResponse(response, recordsByPartition, time.milliseconds());
        }
    };

    String nodeId = Integer.toString(destination);
    ClientRequest clientRequest = client.newClientRequest(nodeId, requestBuilder, now, acks != 0,
            requestTimeoutMs, callback);
    client.send(clientRequest, now);
    log.trace("Sent produce request to {}: {}", nodeId, requestBuilder);
}
```
