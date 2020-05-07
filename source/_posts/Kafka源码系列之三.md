---
title: Kafka源码系列之三ProducerNIO网络模型
date: 2020-05-06 17:57:40
categories: 大数据
tags: kafka
---

> Producer的网络模型,与JavaNIO模型之间关系,以及整体流程

<!-- more -->

## Producer流程概览
```
涉及类
KafkaProducer
 ->Sender
  ->NetworkClient
   ->Selector
    ->JavaNIO接口

涉及方法
KafkaProducer.doSend()
 ->Sender.run()
  ->NetworkClient.poll()
   ->Selector.poll()
```

---

## 流程详解
### KafkaProducer.doSend()
```
waitOnMetadata(): 请求更新tp(topic-partition) meta,中间调用sender.wakeup()
accumulator.append(): 将信息写入tp对应的deque中,如果tp对应的deque新建了Batch,最后也会调用sender.wakeup()
```
#### sender.wakeup()
```java
// org.apache.kafka.clients.producer.internals.Sender
public void wakeup() {
    this.client.wakeup();
}

// KafkaClient
void wakeup();

// org.apache.kafka.clients.NetworkClient
@Override
public void wakeup() {
    this.selector.wakeup();
}

// Selectable
void wakeup();

// org.apache.kafka.common.network.Selector
@Override
public void wakeup() {
    this.nioSelector.wakeup();
}
```
### Sender.run()
```
此处详细在源码系列一中有详细说明
sendProducerData()

1.accumulator.ready(): 遍历所有的tp,如果其对应的ProducerBatch可以发送,就将其对应的leader选出来
    最后会返回一个可以发送ProduceRequest的Set<Node>(实际是ReadyCheckResult,Set<Node>是最主要的成员变量)

2.如果发现tp没有leader,那么将会调用requestUpdate()更新metadata
    实际上还是在第一步对tp的遍历中,遇到没有leader的tp就将其加入到unknownLeaderTopics的set中
    然后会请求这个tp的meta

3.accumulator.drain(): 遍历每个leader上的所有tp,如果该tp对应的ProducerBatch不在backoff期间
    并且加上这个ProducerBatch大小不超过maxSize(一个request的最大限制,默认1MB)
    那么就把这个ProducerBatch添加到list中,最终返回Map<Integer,List<ProducerBatch>>
    key为leaderId,value为要发送的ProducerBatch列表
    如果ProducerBatch没有达到要求,还是有可能发送
    这样可以减少request的频率,有利于提高发送效率

4.sendProduceRequests(): 发送Produce请求,这个方法会调用NetworkClient.send()来发送clientRequest

5.NetworkClient.poll(): 关于socket的IO操作都是在这个方法进行的,调用Selector进行的相应操作
    而Selector底层则封装的JavaNIO的相关接口
```
### NetworkClient.poll()
```
如果有需要更新的Metadata,就发送metadata请求
调用Selector进行相应的IO操作
处理Server端的response以及其他一些操作
```
### Selector.poll()
```java
// Kafka对JavaNIO相关接口的封装
@Override
public void poll(long timeout) throws IOException {
    if (timeout < 0)
        throw new IllegalArgumentException("timeout should be >= 0");

    boolean madeReadProgressLastCall = madeReadProgressLastPoll;
    // 清除相关记录
    clear();

    boolean dataInBuffers = !keysWithBufferedRead.isEmpty();

    if (hasStagedReceives() || !immediatelyConnectedKeys.isEmpty() || (madeReadProgressLastCall && dataInBuffers))
        timeout = 0;

    if (!memoryPool.isOutOfMemory() && outOfMemory) {
        //we have recovered from memory pressure. unmute any channel not explicitly muted for other reasons
        log.trace("Broker no longer low on memory - unmuting incoming sockets");
        for (KafkaChannel channel : channels.values()) {
            if (channel.isInMutableState() && !explicitlyMutedChannels.contains(channel)) {
                channel.maybeUnmute();
            }
        }
        outOfMemory = false;
    }

    /* check ready keys */
    // 获取就绪事件的数量
    long startSelect = time.nanoseconds();
    int numReadyKeys = select(timeout);
    long endSelect = time.nanoseconds();
    this.sensors.selectTime.record(endSelect - startSelect, time.milliseconds());

    // 处理IO操作
    if (numReadyKeys > 0 || !immediatelyConnectedKeys.isEmpty() || dataInBuffers) {
        Set<SelectionKey> readyKeys = this.nioSelector.selectedKeys();

        // Poll from channels that have buffered data (but nothing more from the underlying socket)
        if (dataInBuffers) {
            keysWithBufferedRead.removeAll(readyKeys); //so no channel gets polled twice
            Set<SelectionKey> toPoll = keysWithBufferedRead;
            keysWithBufferedRead = new HashSet<>(); //poll() calls will repopulate if needed
            pollSelectionKeys(toPoll, false, endSelect);
        }

        // Poll from channels where the underlying socket has more data
        pollSelectionKeys(readyKeys, false, endSelect);
        // Clear all selected keys so that they are included in the ready count for the next select
        readyKeys.clear();

        pollSelectionKeys(immediatelyConnectedKeys, true, endSelect);
        immediatelyConnectedKeys.clear();
    } else {
        madeReadProgressLastPoll = true; //no work is also "progress"
    }

    long endIo = time.nanoseconds();
    this.sensors.ioTime.record(endIo - endSelect, time.milliseconds());

    // Close channels that were delayed and are now ready to be closed
    completeDelayedChannelClose(endIo);

    // we use the time at the end of select to ensure that we don't close any connections that
    // have just been processed in pollSelectionKeys
    // 每次poll之后会调用一次,连接虽然关闭,但是Client端的缓存依然存在
    maybeCloseOldestConnection(endSelect);

    // Add to completedReceives after closing expired connections to avoid removing
    // channels with completed receives until all staged receives are completed.
    // 将处理得到的stagedReceives添加到completedReceives
    addToCompletedReceives();
}
```
#### clear()
```
clear方法是在每次poll()执行的第一步
清理上一次poll过程产生的部分缓存
```
#### select()
```
如果在一次轮询,只要有一个Channel的事件就绪,就立刻返回
```
#### pollSelectionKeys()
```
第一次调用:处理已经就绪的事件,进行相应的IO操作
第二次调用:处理新建立的那些连接,添加缓存以及传输层的握手与认证
```
#### addToCompletedReceives
```
处理接收到的Receive,在Client和Server端都会调用

Server端:
    为保证消息的时序性,在Selector中提供了mute(String id)和unmute(String id)
    对该KafkaChannel做标记来保证同时只能处理这个Channel的一个request(排它锁)
    当Server端接收到request后,先将其放入stageReceives集合中
    此时该Channel还未mute,这个Receive会被放入completedReceives集合中
    Server在对completedReceives集合中的request进行处理时,先对该Channel mute
    处理后的response发送完成后再对该Channel unmute
    然后才处理该Channel的其他请求
Client端:
    Client不会调用Selector的mute()和unmute
    Client的时序性通过InFlightRequests和RecordAccumulator的mutePartition来保证
    对于Client端而言,接收到的所有Receives都会放入到completedReceives的集合中等待后续处理
```

---

## 另一个流程分支
### 概览
```
Sender.doSend()->sendProducerData->sendProduceRequests->sendProduceRequest
    ->KafkaClient.send()->NetworkClient.send()
        ->NetworkClient.doSend()
            ->Selector.send()
                ->KafkaChannel.setSend()
```
### NetworkClient.doSend()
```java
private void doSend(ClientRequest clientRequest, boolean isInternalRequest, long now, AbstractRequest request) {
    String destination = clientRequest.destination();
    // 检查版本信息,并根据apiKey构建Request
    RequestHeader header = clientRequest.makeHeader(request.version());
    if (log.isDebugEnabled()) {
        int latestClientVersion = clientRequest.apiKey().latestVersion();
        if (header.apiVersion() == latestClientVersion) {
            log.trace("Sending {} {} with correlation id {} to node {}", clientRequest.apiKey(), request,
                    clientRequest.correlationId(), destination);
        } else {
            log.debug("Using older server API v{} to send {} {} with correlation id {} to node {}",
                    header.apiVersion(), clientRequest.apiKey(), request, clientRequest.correlationId(), destination);
        }
    }
    // 创建NetworkSend实例
    Send send = request.toSend(destination, header);
    InFlightRequest inFlightRequest = new InFlightRequest(
            clientRequest,
            header,
            isInternalRequest,
            request,
            send,
            now);
    this.inFlightRequests.add(inFlightRequest);
    // 调用Selector.send发送该Send
    selector.send(send);
}
```
### Selector.send()
```java
public void send(Send send) {
    String connectionId = send.destination();
    // 获取Send对应的KafkaChannel
    KafkaChannel channel = openOrClosingChannelOrFail(connectionId);
    if (closingChannels.containsKey(connectionId)) {
        // ensure notification via `disconnected`, leave channel in the state in which closing was triggered
        this.failedSends.add(connectionId);
    } else {
        try {
            // 调用setSend()注册Write事件
            channel.setSend(send);
        } catch (Exception e) {
            // update the state for consistency, the channel will be discarded after `close`
            channel.state(ChannelState.FAILED_SEND);
            // ensure notification via `disconnected` when `failedSends` are processed in the next poll
            this.failedSends.add(connectionId);
            close(channel, CloseMode.DISCARD_NO_NOTIFY);
            if (!(e instanceof CancelledKeyException)) {
                log.error("Unexpected exception during send, closing connection {} and rethrowing exception {}",
                        connectionId, e);
                throw e;
            }
        }
    }
}
```
### KafkaChannel.setSend()
```java
setSend()方法需要配置write()(在Selector.poll中调用pollSelectionKeys时使用)方法一起分析

// 每次调用都会注册一个OP_WRITE事件
public void setSend(Send send) {
    if (this.send != null)
        throw new IllegalStateException("Attempt to begin a send operation with prior send operation still in progress, connection id is " + id);
    this.send = send;
    this.transportLayer.addInterestOps(SelectionKey.OP_WRITE);
}

// 调用send()发送Send
public Send write() throws IOException {
    Send result = null;
    if (send != null && send(send)) {
        result = send;
        send = null;
    }
    return result;
}

// 发送完成后,删除这个OP_WRITE事件
private boolean send(Send send) throws IOException {
    send.writeTo(transportLayer);
    if (send.completed())
        transportLayer.removeInterestOps(SelectionKey.OP_WRITE);
    return send.completed();
}
```
