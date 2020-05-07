---
title: Kafka源码系列之五ConsumerGroup建立
date: 2020-05-07 11:19:46
categories: 大数据
tags: kafka
---

> 描述consumer实例怎么样加入的group

<!-- more -->

## GroupCoordinator角色
```
GroupCoordinator角色是负责ConsumerGroup Member管理以及Offset管理

每一个ConsumerGroup都有其对应的GroupCoordinator

具体由哪个GroupCoordinator负责与groupId的hash值有关
通过abs(GroupId.hashCode()) % NumPartitions来计算出一个值
Numpartitions是__consumer_offsets的partition数,默认50
这个值代表__consumer_offsets的一个partition
这个partition的leader即为这个groupId要交互的GroupCoordinator所在节点
```

---

## KafkaConsumer做了什么
```java
private ConsumerRecords<K, V> poll(final Timer timer, final boolean includeMetadataInTimeout) {
    acquireAndEnsureOpen();
    try {
        if (this.subscriptions.hasNoSubscriptionOrUserAssignment()) {
            throw new IllegalStateException("Consumer is not subscribed to any topics or assigned any partitions");
        }

        // poll for new data until the timeout expires
        do {
            client.maybeTriggerWakeup();

            if (includeMetadataInTimeout) {
                // 判断是否需要更新
                if (!updateAssignmentMetadataIfNeeded(timer)) {
                    return ConsumerRecords.empty();
                }
            } else {
                // 阻塞等待metadata响应
                while (!updateAssignmentMetadataIfNeeded(time.timer(Long.MAX_VALUE))) {
                    log.warn("Still waiting for metadata");
                }
            }

            // 获取Fetcher已经拉取到的数据
            final Map<TopicPartition, List<ConsumerRecord<K, V>>> records = pollForFetches(timer);
            if (!records.isEmpty()) {
                // 由于消耗的位置已经更新,在返回提取的记录之前,我们不能允许触发唤醒或任何其他错误
                if (fetcher.sendFetches() > 0 || client.hasPendingRequests()) {
                    client.pollNoWakeup();
                }

                return this.interceptors.onConsume(new ConsumerRecords<>(records));
            }
        } while (timer.notExpired());

        return ConsumerRecords.empty();
    } finally {
        release();
    }
}


private Map<TopicPartition, List<ConsumerRecord<K, V>>> pollForFetches(Timer timer) {
    long pollTimeout = Math.min(coordinator.timeToNextPoll(timer.currentTimeMs()), timer.remainingMs());
    // 如果数据已经可用,请立即返回
    final Map<TopicPartition, List<ConsumerRecord<K, V>>> records = fetcher.fetchedRecords();
    if (!records.isEmpty()) {
        return records;
    }
    // 向订阅的所有partition发送fetch请求,会从多个partition拉取数据
    fetcher.sendFetches();
    // We do not want to be stuck blocking in poll if we are missing some positions
    // since the offset lookup may be backing off after a failure
    // NOTE: the use of cachedSubscriptionHashAllFetchPositions means we MUST call
    // updateAssignmentMetadataIfNeeded before this method.
    if (!cachedSubscriptionHashAllFetchPositions && pollTimeout > retryBackoffMs) {
        pollTimeout = retryBackoffMs;
    }
    Timer pollTimer = time.timer(pollTimeout);
    // 调用poll方法发送数据
    client.poll(pollTimer, () -> {
        // since a fetch might be completed by the background thread, we need this poll condition
        // to ensure that we do not block unnecessarily in poll()
        return !fetcher.hasCompletedFetches();
    });
    timer.update(pollTimer.currentTimeMs());
    // after the long poll, we should check whether the group needs to rebalance
    // prior to returning data so that the group can stabilize faster
    // 如果group需要rebalance,直接返回空数据,这样能更快的让group进入稳定状态
    if (coordinator.rejoinNeededOrPending()) {
        return Collections.emptyMap();
    }
    return fetcher.fetchedRecords();
}

// 1.updateAssignmentMetadataIfNeeded调用GroupCoordinator的poll方法,获取其分配的tp列表
// 2.更新这些分配的tp列表的the last committed offset
// 3.调用Fetcher获取拉取的数据,如果有数据立即返回
// 4.调用Fetcher发送fetch请求(加入队列,并没有真正发送)
// 5.调用ConsumerNetworkClient.poll发送请求
// 6.如果group需要rebalance,直接返回空集合
```
可以看出,GroupCoordinator.poll才是创建一个Group的真正执行

---

## ConsumerCoordinator.poll()具体实现
```java
// 确保Group的Coordinator是已知的,并且这个Consumer已经加入到组中,也用于offset的周期性提交
public boolean poll(Timer timer) {
        invokeCompletedOffsetCommitCallbacks();

        if (subscriptions.partitionsAutoAssigned()) {
            // 更新hearbeat,防因为不活动导致hearbeat线程主动离开group
            pollHeartbeat(timer.currentTimeMs());
            // 如果Coordinator未知且Coordinator没有准备好,直接返回false
            if (coordinatorUnknown() && !ensureCoordinatorReady(timer)) {
                return false;
            }

            // 判断是否需要重新加入group,如果partition变化或分配的partition变化,需要rejoin
            if (rejoinNeededOrPending()) {
                // 重新加入group之前先刷新一下metadata(AUTO_PATTERN)
                if (subscriptions.hasPatternSubscription()) {
                    if (this.metadata.timeToAllowUpdate(time.milliseconds()) == 0) {
                        this.metadata.requestUpdate();
                    }

                    if (!client.ensureFreshMetadata(timer)) {
                        return false;
                    }
                }
                // 确保group是active,加入group,分配订阅的partition
                if (!ensureActiveGroup(timer)) {
                    return false;
                }
            }
        } else {
            // 发送更新metadata请求
            if (metadata.updateRequested() && !client.hasReadyNodes(timer.currentTimeMs())) {
                client.awaitMetadataUpdate(timer);
            }
        }

        // 自动commit时,当定时达到时,进行自动commit
        maybeAutoCommitOffsetsAsync(timer.currentTimeMs());
        return true;
    }
```
### ensureCoordinatorReady()
```
选择一个连接数最小的broker,向其发送GroupCoordinator请求,并建立相应的TCP连接
    lookupCoordinator()->sendFindCoordinatorRequest()->FindCoordinatorResponseHandler回调
如果Client获取到Server Response,那么就会与GroupCoordinator建立连接
```
### ensureActiveGroup()
```
向GroupCoordinator发送join-group,sync-group请求,获取assign的TP-list
    ensureCoordinatorReady()->startHeartbeatThreadIfNeeded()->joinGroupIfNeeded()
    joinGroupIfNeeded()->initiateJoinGroup()->sendJoinGroupRequest()->JoinGroupResponseHandler.handle()->onJoinLeader/onJoinFollower->sendSyncGroupRequest()->SyncGroupResponseHandler
    onJoinComplete
    
1.如果Group是新的GroupId,那么此时group初始化状态为Empty
2.当GroupCoordinator接收到consumer的join-group请求后,group的member列表为空,第一个被加入的member被选为leader
3.如果GroupCoordinator接收到leader发送join-group请求,将会触发rebalance,group状态变为PreparingRebalance
4.此时GroupCoordinator将会等待,在一定时间内,接收到join-group请求的consumer将被认为是存活的,此时group变为AwaitSync状态,并且GroupCoordinator会向这个group的所有member返回其response
5.consumer在接收到GroupCoordinator的response后,如果这个consumer是group的leader,那么这个consumer将会负责为整个group assign partition订阅安排,然后leader将分配后的信息以sendSyncGroupResult()请求的方式发给GroupCoordinator,而作为follower的consumer实例会发送一个空列表
6.GroupCoordinator在接收到leader发来的请求后,将assign的结果返回给所有已经发送sync-group请求的consumer实例,并且group的状态变为Stable,如果后续再收到sync-group请求,将会直接返回其分配结果

当一个consumer实例加入group成功后,触发onJoinComplete()
更新订阅的tp列表,更新其对应的metadata以及触发注册的listener

```