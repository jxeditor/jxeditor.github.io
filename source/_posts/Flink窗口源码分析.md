---
title: Flink窗口源码分析
date: 2020-05-04 15:51:50
categories: 大数据
tags: flink
---

> 深入源码层面,学习Flink窗口操作的原理,这里只挑了各部分的一个进行分析

<!-- more -->

## 依赖关系
```
Window
    GlobalWindow(放置所有数据的默认窗口)
    TimeWindow(表示一段时间间隔的窗口)

WindowAssigner
    -MerginWindowAssigner(窗口是可以合并的)
        -DynamicEventTimeSessionWindows
        -DynamicProcessingTimeSessionWindows
        -EventTimeSessionWindows
        -ProcessingTimeSessionWindows
    -SlidingEventTimeWindows(滑动窗口)
        -SlidingTimeWindows
    -SlidingProcessingTimeWindows(滑动窗口)
    -TumblingEventTimeWindows(滚动窗口)
        -TumblingTimeWindows
    -TumblingProcessionTimeWindows(滚动窗口)
    -GlobalWindwos(将所有元素分配在一个窗口中)
    
Trigger
    -ContinuousEventTimeTrigger(基于给定时间间隔连续触发,计算基于水印)
    -ContinuousProcessingTimeTrigger(基于给定时间间隔连续触发,计算基于ProcessingTime)
    -CountTrigger(每maxCount触发一次计算)
        -用于DataStream
        -用于KeyedStream
    -DeltaTrigger(此触发器计算上次触发的数据点与当前到达的数据点之间的增量。如果增量高于指定的阈值，则会触发。)
        需要用户自己实现DeltaFunction
    -EventTimeTrigger(按照EventTime判断是否触发计算)
        -用于EventTimeWindows
    -NeverTrigger(一个从不触发的触发器，作为GlobalWindows的默认触发器)
        -用于GlobalWindows
    -ProcessingTimeTrigger(按照ProcessingTime判断是否触发计算)
        -用于ProcessingTimeWindows
    -PurgingTrigger(包装类,将TriggerResult为FIRE的改为FIRE_AND_PURGE)
        -用于DataStream
        -用于KeyedStream
        -用于DataStreamGroupWindowAggregateBase
    -StateCleaningCountTrigger(GlobalWindow)(触发清理定时器触发或元素达到maxCount触发)
        -用于DataStreamGroupWindowAggregateBase

TriggerResult
    CONTINUE(不做任何操作)
    FIRE_AND_PURGE
    FIRE(处理窗口数据)
    PURGE(移除窗口和窗口中的数据)
    
Evictor
    -CountEvictor(以maxCount为判断标准,决定元素是否被移除)
    -DeltaEvictor(计算每个元素与最后一个元素的Delta值,与threshold进行对比,如果大于等于,则移除该元素)
    -TimeEvictor(以时间为判断标准,决定元素是否会被移除)

Timer
```

## SlidingEventTimeWindows
```
# 成员变量
size:窗口大小,slide窗口步长,offset偏移量

# 划分窗口
数组结构ArrayList<TimeWindow>:大小为size/slide
窗口开始时间:timestamp - (timestamp - offset + slide) % slide;
数组内窗口:new TimeWindow(start, start + size)

# 默认Trigger
EventTimeTrigger

# 使用
DataStream<Tuple2<String, Integer>> in = ...;
KeyedStream<Tuple2<String, Integer>, String> keyed = in.keyBy(...);
WindowedStream<Tuple2<String, Integer>, String, TimeWindow> windowed = keyed.window(SlidingEventTimeWindows.of(Time.minutes(1), Time.seconds(10)));
```

---

## EventTimeTrigger
```
# 如果window中的最大时间戳小于当前水印
FIRE
# 如果window中的最大时间戳大于当前水印
注册Timer定时器
CONTINUE

# 注册事件时间回调。当当前水印通过时，将使用此处指定的时间调用指定的时间。
Trigger
    TriggerContext.registerEventTimeTimer(long time)

# WindowOperator
    Context.registerEventTimeTimer(long time)

# InternalTimerService
    registerEventTimeTimer(N namespace, long time)
    
# 注册事件时间水印超过给定时间时要触发的计时器。计时器触发时，将提供您在此处传递的命名空间。
InternalTimerServiceImpl
    registerEventTimeTimer(N namespace, long time)

# 当前正在运行的EventTime定时器队列
KeyGroupedInternalPriorityQueue
    add(new TimerHeapInternalTimer<>(time, (K) keyContext.getCurrentKey(), namespace))
```

---

## CountEvictor
```
evict方法
如果size小于设置的最大数值,则可以返回
否则将迭代元素,并删除多出的元素
int evictedCount = 0;
for (Iterator<TimestampedValue<Object>> iterator = elements.iterator(); iterator.hasNext();){
    iterator.next();
    evictedCount++;
    if (evictedCount > size - maxCount) {
        break;
    } else {
        iterator.remove();
    }
}
```

---

## WindowOperator工作流程
```java
@Override
public void processElement(StreamRecord<IN> element) throws Exception {
    // 1.获取element归属的windows
    final Collection<W> elementWindows = windowAssigner.assignWindows(
        element.getValue(), element.getTimestamp(), windowAssignerContext);

    // 如果元素不是由指定的元素窗口处理的
    boolean isSkippedElement = true;

    // 获取element对应的Key
    final K key = this.<K>getKeyedStateBackend().getCurrentKey();

    if (windowAssigner instanceof MergingWindowAssigner) {
        // 合并窗口
        MergingWindowSet<W> mergingWindows = getMergingWindowSet();

        for (W window: elementWindows) {

            // 添加新窗口可能会导致合并，在这种情况下，实际窗口是合并的窗口，我们使用它。如果不合并，则实际窗口==窗口
            W actualWindow = mergingWindows.addWindow(window, new MergingWindowSet.MergeFunction<W>() {
                @Override
                public void merge(W mergeResult,
                        Collection<W> mergedWindows, W stateWindowResult,
                        Collection<W> mergedStateWindows) throws Exception {

                    if ((windowAssigner.isEventTime() && mergeResult.maxTimestamp() + allowedLateness <= internalTimerService.currentWatermark())) {
                        throw new UnsupportedOperationException("The end timestamp of an " +
                                "event-time window cannot become earlier than the current watermark " +
                                "by merging. Current watermark: " + internalTimerService.currentWatermark() +
                                " window: " + mergeResult);
                    } else if (!windowAssigner.isEventTime()) {
                        long currentProcessingTime = internalTimerService.currentProcessingTime();
                        if (mergeResult.maxTimestamp() <= currentProcessingTime) {
                            throw new UnsupportedOperationException("The end timestamp of a " +
                                "processing-time window cannot become earlier than the current processing time " +
                                "by merging. Current processing time: " + currentProcessingTime +
                                " window: " + mergeResult);
                        }
                    }

                    triggerContext.key = key;
                    triggerContext.window = mergeResult;

                    triggerContext.onMerge(mergedWindows);

                    for (W m: mergedWindows) {
                        triggerContext.window = m;
                        triggerContext.clear();
                        deleteCleanupTimer(m);
                    }

                    // 将合并的状态窗口合并到新生成的状态窗口中
                    windowMergingState.mergeNamespaces(stateWindowResult, mergedStateWindows);
                }
            });

            // 3.如果是延迟窗口,跳过
            if (isWindowLate(actualWindow)) {
                mergingWindows.retireWindow(actualWindow);
                continue;
            }
            isSkippedElement = false;

            W stateWindow = mergingWindows.getStateWindow(actualWindow);
            if (stateWindow == null) {
                throw new IllegalStateException("Window " + window + " is not in in-flight window set.");
            }

            // 4.将element存入windowState
            windowState.setCurrentNamespace(stateWindow);
            windowState.add(element.getValue());

            // 5.判断element是否触发trigger
            triggerContext.key = key;
            triggerContext.window = actualWindow;
            TriggerResult triggerResult = triggerContext.onElement(element);
            if (triggerResult.isFire()) {
                // 6.获取windowState,注入windowFunction
                ACC contents = windowState.get();
                if (contents == null) {
                    continue;
                }
                emitWindowContents(actualWindow, contents);
            }

            // 7.清除windowState
            if (triggerResult.isPurge()) {
                windowState.clear();
            }
            
            // 8.注册timer,到窗口结束时清理window
            registerCleanupTimer(actualWindow);
        }

        // 需要确保更新状态中的合并状态
        mergingWindows.persist();
    } else {
        // 非合并窗口
        for (W window: elementWindows) {

            if (isWindowLate(window)) {
                continue;
            }
            isSkippedElement = false;

            windowState.setCurrentNamespace(window);
            windowState.add(element.getValue());

            triggerContext.key = key;
            triggerContext.window = window;

            TriggerResult triggerResult = triggerContext.onElement(element);

            if (triggerResult.isFire()) {
                ACC contents = windowState.get();
                if (contents == null) {
                    continue;
                }
                emitWindowContents(window, contents);
            }

            if (triggerResult.isPurge()) {
                windowState.clear();
            }
            registerCleanupTimer(window);
        }
    }

    // 如果已设置未由任何窗口延迟到达标记处理的元素，则侧输出输入事件windowAssigner为事件时间和当前时间戳+允许的延迟不小于元素时间戳
    if (isSkippedElement && isElementLate(element)) {
        if (lateDataOutputTag != null){
            sideOutput(element);
        } else {
            this.numLateRecordsDropped.inc();
        }
    }
}
```