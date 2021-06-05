---
title: Flink动态CEP实例
date: 2021-06-02 18:30:43
categories: 大数据
tags: flink
---

> 在使用CEP时,需要动态改变规则,且不停用程序

<!-- more -->

## 整体思路
```
1.参考刘博大佬给出的方案进行复现
    https://developer.aliyun.com/article/738454
    https://blog.csdn.net/u013516966/article/details/110412808
2.对外开放一个接口,方便自定义外部规则以及对比规则是否变化
    org.apache.flink.cep.functions.InjectionPatternFunction
3.需要修改CEP涉及的底层对象(我这边使用的是scala)
    将DataStream转换为PatternStream以执行CEP的实用方法
        scala/org.apache.flink.cep.scala.CEP --> CEP1
        java/org.apache.flink.cep.CEP --> CEP1
    用于CEP模式检测的流抽象,模式流是将检测到的模式序列作为与其名称相关联的事件的映射而发出的流
    使用Nfa检测该模式.为了处理检测到的序列,用户必须指定PatternSelectFunction或PatternsFlatSelectFunction
        java/org.apache.flink.cep.PatternStream
    创建模式流的方式
        java/org.apache.flink.cep.PatternStreamBuilder
    键控输入流的CEP模式运算符.对于每个键,操作符创建一个NFA和一个优先级队列来缓冲无序元素
    这两种数据结构都使用托管键控状态存储
        java/org.apache.flink.cep.operator.CepOperator

4.修改底层构造方法,将自定义接口传入到CepOperator中
5.在CepOperator中实现ProcessingTimeCallback回调接口
6.启动监听器按固定频次触发规则监测
```

---

## 具体实现(按步骤进行)
### InjectionPatternFunction
```java
package org.apache.flink.cep.functions;

import org.apache.flink.api.common.functions.Function;
import org.apache.flink.cep.pattern.Pattern;
import java.io.Serializable;

public interface InjectionPatternFunction<T> extends Function, Serializable {
    /**
     * 初始化外部连接
     */
    public void init() throws Exception;


    /**
     * 动态规则注入
     *
     * @return
     */
    public Pattern<T, T> inject() throws Exception;


    /**
     * 轮询周期(监听不需要)
     *
     * @return
     */
    public long getPeriod() throws Exception;


    /**
     * 规则是否发生变更
     *
     * @return
     */
    public boolean isChanged() throws Exception;
}
```
### CEP1(scala)
```scala
package org.apache.flink.cep.scala

import org.apache.flink.cep.functions.InjectionPatternFunction
import org.apache.flink.cep.{EventComparator, CEP1 => JCEP}
import org.apache.flink.cep.scala.pattern.Pattern
import org.apache.flink.streaming.api.scala.DataStream

object CEP1 {
  def pattern[T](input: DataStream[T], pattern: Pattern[T, _ <: T]): PatternStream[T] = {
    wrapPatternStream(JCEP.pattern(input.javaStream, pattern.wrappedPattern))
  }

  def pattern[T](
                  input: DataStream[T],
                  pattern: Pattern[T, _ <: T],
                  comparator: EventComparator[T]): PatternStream[T] = {
    wrapPatternStream(JCEP.pattern(input.javaStream, pattern.wrappedPattern, comparator))
  }
  // 新增传入外部接口的调用方法
  def injectionPattern[T](
    input: DataStream[T],
    injectionPatternFunction: InjectionPatternFunction[T]): PatternStream[T]= {
    // 调用java中的CEP1类
    wrapPatternStream(JCEP.injectionPattern(input.javaStream,injectionPatternFunction))
  }
}
```

## CEP1(java)
```java
package org.apache.flink.cep;

import org.apache.flink.cep.functions.InjectionPatternFunction;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.streaming.api.datastream.DataStream;

public class CEP1 {
    
    public static <T> PatternStream<T> pattern(DataStream<T> input, Pattern<T, ?> pattern) {
        return new PatternStream<>(input, pattern);
    }

    public static <T> PatternStream<T> pattern(
            DataStream<T> input, Pattern<T, ?> pattern, EventComparator<T> comparator) {
        final PatternStream<T> stream = new PatternStream<>(input, pattern);
        return stream.withComparator(comparator);
    }

    // 新增传入外部接口的调用方法
    public static <T> PatternStream<T> injectionPattern(DataStream<T> input, InjectionPatternFunction<T> injectionPatternFunction) throws Exception {
        return new PatternStream<>(input, injectionPatternFunction);
    }
}
```
### PatternStream
```java
public class PatternStream<T> {

    private final PatternStreamBuilder<T> builder;

    ......

    // 新增构造方法
    PatternStream(final DataStream<T> inputStream, final InjectionPatternFunction<T> injectionPatternFunction) {
        this(PatternStreamBuilder.forStreamAndPattern(inputStream, injectionPatternFunction));
    }
    
    ......
}
```
### PatternStreamBuilder
```java
@Internal
final class PatternStreamBuilder<IN> {
    
    ......
    
    private InjectionPatternFunction<IN> injectionPatternFunction;

    ......
    
    // 添加构造函数
    private PatternStreamBuilder(
        final DataStream<IN> inputStream,
        final InjectionPatternFunction<IN> injectionPatternFunction,
        final TimeBehaviour timeBehaviour,
        @Nullable final EventComparator<IN> comparator,
        @Nullable final OutputTag<IN> lateDataOutputTag) {
        this.inputStream = checkNotNull(inputStream);
        this.injectionPatternFunction = injectionPatternFunction;
        this.timeBehaviour = checkNotNull(timeBehaviour);
        this.comparator = comparator;
        this.lateDataOutputTag = lateDataOutputTag;
    }
    
    ......
    
    <OUT, K> SingleOutputStreamOperator<OUT> build(
            final TypeInformation<OUT> outTypeInfo,
            final PatternProcessFunction<IN, OUT> processFunction)  {

        checkNotNull(outTypeInfo);
        checkNotNull(processFunction);

        final TypeSerializer<IN> inputSerializer =
                inputStream.getType().createSerializer(inputStream.getExecutionConfig());
        final boolean isProcessingTime = timeBehaviour == TimeBehaviour.ProcessingTime;

        final boolean timeoutHandling = processFunction instanceof TimedOutPartialMatchHandler;
        final NFACompiler.NFAFactory<IN> nfaFactory =
                NFACompiler.compileFactory(pattern, timeoutHandling);

        CepOperator<IN, K, OUT> operator = null;
        // 当外部接口方法不为空时,构造自定义的CepOperator
        if (injectionPatternFunction == null) {
            operator = new CepOperator<>(
                    inputSerializer,
                    isProcessingTime,
                    nfaFactory,
                    comparator,
                    pattern.getAfterMatchSkipStrategy(),
                    processFunction,
                    lateDataOutputTag);
        } else {
            try {
                operator = new CepOperator<>(
                        inputSerializer,
                        isProcessingTime,
                        injectionPatternFunction,
                        comparator,
                        null,
                        processFunction,
                        lateDataOutputTag);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        final SingleOutputStreamOperator<OUT> patternStream;
        if (inputStream instanceof KeyedStream) {
            KeyedStream<IN, K> keyedStream = (KeyedStream<IN, K>) inputStream;

            patternStream = keyedStream.transform("CepOperator", outTypeInfo, operator);
        } else {
            KeySelector<IN, Byte> keySelector = new NullByteKeySelector<>();

            patternStream =
                    inputStream
                            .keyBy(keySelector)
                            .transform("GlobalCepOperator", outTypeInfo, operator)
                            .forceNonParallel();
        }

        return patternStream;
    }
    
    ......
    
}
```
### CepOperator
```java
@Internal
public class CepOperator<IN, KEY, OUT>
        extends AbstractUdfStreamOperator<OUT, PatternProcessFunction<IN, OUT>>
        implements OneInputStreamOperator<IN, OUT>, Triggerable<KEY, VoidNamespace>, ProcessingTimeCallback {
    
    ......
    
    private InjectionPatternFunction<IN> injectionPatternFunction;

    ......
    
    // 添加构造方法
    public CepOperator(
            final TypeSerializer<IN> inputSerializer,
            final boolean isProcessingTime,
            InjectionPatternFunction<IN> injectionPatternFunction,
            @Nullable final EventComparator<IN> comparator,
            @Nullable final AfterMatchSkipStrategy afterMatchSkipStrategy,
            final PatternProcessFunction<IN, OUT> function,
            @Nullable final OutputTag<IN> lateDataOutputTag) throws Exception {
        super(function);

        this.inputSerializer = Preconditions.checkNotNull(inputSerializer);
        this.injectionPatternFunction = injectionPatternFunction;
        this.isProcessingTime = isProcessingTime;
        this.comparator = comparator;
        this.lateDataOutputTag = lateDataOutputTag;

        if (afterMatchSkipStrategy == null) {
            this.afterMatchSkipStrategy = AfterMatchSkipStrategy.noSkip();
        } else {
            this.afterMatchSkipStrategy = afterMatchSkipStrategy;
        }
    }

    ......
    
    @Override
    public void open() throws Exception {
        super.open();
        timerService =
                getInternalTimerService(
                        "watermark-callbacks", VoidNamespaceSerializer.INSTANCE, this);
        // 初始化NFA
        if (injectionPatternFunction != null) {
            injectionPatternFunction.init();
            Pattern pattern = injectionPatternFunction.inject();
            boolean timeoutHandling = getUserFunction() instanceof TimedOutPartialMatchHandler;
            nfaFactory = NFACompiler.compileFactory(pattern, timeoutHandling);
            long period = injectionPatternFunction.getPeriod();
            // 注册了一个定时检测规则是否变更的定时器
            if (period > 0) {
                getProcessingTimeService().registerTimer(timerService.currentProcessingTime() + period, this::onProcessingTime);
            }
        }
        nfa = nfaFactory.createNFA();
        nfa.open(cepRuntimeContext, new Configuration());

        context = new ContextFunctionImpl();
        collector = new TimestampedCollector<>(output);
        cepTimerService = new TimerServiceImpl();

        // metrics
        this.numLateRecordsDropped = metrics.counter(LATE_ELEMENTS_DROPPED_METRIC_NAME);
    }

    // 监听回调方法
    @Override
    public void onProcessingTime(long timestamp) throws Exception {
        if (injectionPatternFunction.isChanged()) {
            System.err.println("状态改变");
            //重新注入
            Pattern pattern = injectionPatternFunction.inject();
            boolean timeoutHandling = getUserFunction() instanceof TimedOutPartialMatchHandler;
            // 重新生成NFA
            nfaFactory = NFACompiler.compileFactory(pattern, timeoutHandling);


            nfa = nfaFactory.createNFA();
            nfa.open(cepRuntimeContext, new Configuration());
        }
        //重新注册监听器
        if (injectionPatternFunction.getPeriod() > 0) {
            System.err.println(timerService.currentProcessingTime());
            getProcessingTimeService().registerTimer(timerService.currentProcessingTime() + injectionPatternFunction.getPeriod(), this::onProcessingTime);
        }
    }
    
    ......
    
}
```

---

## 实现案例
### 案例描述
```
初始化规则为,同一userId连续出现两次状态为fail的情况,产生告警消息
希望转换的规则为同一userId连续出现两次状态为success的情况,产生告警
规则改变由本地文件控制
```
### 具体实现
```scala
package org.example.cep

import java.util
import java.util.Random

import org.apache.flink.cep.{PatternSelectFunction, pattern}
import org.apache.flink.cep.functions.InjectionPatternFunction
import org.apache.flink.cep.scala.{CEP1}
import org.apache.flink.cep.pattern.Pattern
import org.apache.flink.cep.pattern.conditions.{IterativeCondition, RichIterativeCondition}
import org.apache.flink.streaming.api.TimeCharacteristic
import org.apache.flink.streaming.api.functions.source.SourceFunction
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.streaming.api.windowing.time.Time
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.api.scala.DataStream

import scala.io.{BufferedSource, Source}


object LoginFailWithCustomCEP {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.setStreamTimeCharacteristic(TimeCharacteristic.EventTime)
    env.setParallelism(1)

    //自定义测试数据
    val loginStream = env.addSource(new CustomGenerator).assignAscendingTimestamps(_.eventTime)

    loginStream.print()


    //在输入流的基础上应用pattern,得到匹配的pattern stream

    val patternStream = CEP1.injectionPattern(loginStream.keyBy(_.userId), new InjectionPatternFunction[LoginEvent] {
      var current: String = null

      /**
       * 初始化外部连接
       */
      override def init(): Unit = {
        val source = Source.fromFile("/Users/xz/Local/Projects/LearnDemo/Flink_1_12/src/main/resources/rulestatus.txt", "UTF-8")
        val lines = source.getLines().toArray
        source.close()
        current = lines(0)
      }

      /**
       * 动态规则注入
       *
       * @return
       */
      override def inject(): pattern.Pattern[LoginEvent, LoginEvent] = {
        println(current)
        if (current == "a") {
          Pattern.begin[LoginEvent]("begin")
            .where(new RichIterativeCondition[LoginEvent]() {
              override def filter(value: LoginEvent, ctx: IterativeCondition.Context[LoginEvent]): Boolean = {
                value.eventTpye.equals("fail")
              }
            })
            .next("next")
            .where(new RichIterativeCondition[LoginEvent]() {
              override def filter(value: LoginEvent, ctx: IterativeCondition.Context[LoginEvent]): Boolean = {
                value.eventTpye.equals("fail")
              }
            })
        } else {
          Pattern.begin[LoginEvent]("begin")
            .where(new RichIterativeCondition[LoginEvent]() {
              override def filter(value: LoginEvent, ctx: IterativeCondition.Context[LoginEvent]): Boolean = {
                value.eventTpye.equals("success")
              }
            })
            .next("next")
            .where(new RichIterativeCondition[LoginEvent]() {
              override def filter(value: LoginEvent, ctx: IterativeCondition.Context[LoginEvent]): Boolean = {
                value.eventTpye.equals("success")
              }
            })
        }
      }

      /**
       * 轮询周期(监听不需要)
       *
       * @return
       */
      override def getPeriod: Long = 5000

      /**
       * 规则是否发生变更
       *
       * @return
       */
      override def isChanged: Boolean = {
        val source = Source.fromFile("/Users/xz/Local/Projects/LearnDemo/Flink_1_12/src/main/resources/rulestatus.txt", "UTF-8")
        val lines = source.getLines().toArray
        source.close()
        val tempStatus = current
        current = lines(0)
        !lines(0).equals(tempStatus)
      }
    })

    val loginFailDataStream = patternStream.select(new MySelectFunction())

    //将得到的警告信息流输出sink
    loginFailDataStream.print("warning")

    env.execute("Login Fail Detect with CEP")
  }
}


//登录样例类
case class LoginEvent(userId: Long, ip: String, eventTpye: String, eventTime: Long)

//输出报警信息样例类
case class Warning(userId: Long, firstFailTime: Long, lastFailTime: Long, warningMSG: String)

class MySelectFunction() extends PatternSelectFunction[LoginEvent, Warning] {
  override def select(patternEvents: util.Map[String, util.List[LoginEvent]]): Warning = {
    val firstFailEvent = patternEvents.getOrDefault("begin", null).iterator().next()
    val secondEvent = patternEvents.getOrDefault("next", null).iterator().next()
    Warning(firstFailEvent.userId, firstFailEvent.eventTime, secondEvent.eventTime, "login fail warning")
  }
}

class CustomGenerator extends SourceFunction[LoginEvent] {
  private var running = true

  override def run(ctx: SourceFunction.SourceContext[LoginEvent]): Unit = {
    // 随机数生成器
    val state = Array("fail", "success")
    while (running) {
      // 利用ctx上下文将数据返回
      ctx.collect(LoginEvent(scala.util.Random.nextInt(10), "192.168.0.1", state(scala.util.Random.nextInt(2)), System.currentTimeMillis()))
      Thread.sleep(500)
    }
  }

  override def cancel(): Unit = {
    running = false
  }
}
```

---

## 改进方向
```
1.状态存储可以加上
2.规则定义可以放在外部数据存储中,然后使用ScriptEvaluator进行Pattern类生成(也可以选用其他的方式生成,有很多种方式)
```