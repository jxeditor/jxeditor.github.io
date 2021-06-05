---
title: Flink复杂事件CEP
date: 2020-07-27 16:18:02
categories: 大数据
tags: flink
---

> flink复杂事件CEP理论篇+小例子

<!-- more -->
#### 什么是复杂事件CEP
```
一个或多个由简单事件构成的事件流通过一定的规则匹配,然后输出用户想得到的数据,满足规则的复杂事件
```

#### 特征
```
1.目标:从有序的简单事件流中发现一些高阶特征
2.输入:一个或多个由简单事件构成的事件流
3.处理:识别简单事件之间的内在联系,多个符合一定规则的简单事件构成复杂事件
4.输出:满足规则的复杂事件
```

#### CEP架构
```
多个数据源 -> CEP引擎 -> exactly once.高吞吐,低延迟,高可用,乱序消息处理,规则匹配
```

#### CEP-NFA是什么?
```
Flink的每个模式包含多个状态,模式匹配的过程就是状态转换的过程,每个状态(state)可以理解成由Pattern构成,为了从当前的状态转换成下一个状态,用户可以在pattern上指定条件,用于状态的过滤和转换

实际上Flink CEP首先需要用户创建定义一个个pattern,然后通过链表将由前后逻辑关系的pattern串在一起,构成模式匹配的逻辑表达;然后需要用户利用NFACompiler,将模式进行分拆,创建出NFA(非确定有限自动机)对象,NFA包含了该次模式匹配的各个状态和状态间转换的表达式
```

#### CEP-三种状态迁移边
```
1.take:表示事件匹配成功,将当前状态更新到新状态,并前进到"下一个"状态
2.procceed:当事件来到的时候,当前状态不发生变化,在状态转换图中事件直接"前进"到下一个目标状态
3.ignore:当事件来到的时候,如果匹配不成功,忽略当前事件,当前状态不发生任何变化
```
#### 为了更好的理解上述,举个实际应用例子
```
import java.util

import org.apache.flink.cep.PatternSelectFunction
import org.apache.flink.cep.scala.CEP
import org.apache.flink.cep.scala.pattern.Pattern
import org.apache.flink.streaming.api.TimeCharacteristic
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.streaming.api.windowing.time.Time
import org.apache.flink.streaming.api.scala._

//登录样例类
case class LoginEvent(userId:Long,ip:String,eventTpye:String,eventTime:Long)

//输出报警信息样例类
case class Warning(userId: Long,firstFailTime:Long,lastFailTime:Long,warningMSG:String)

object LoginFailWithCEP {
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.setStreamTimeCharacteristic(TimeCharacteristic.EventTime)
    env.setParallelism(1)

    //自定义测试数据
    val loginStream = env.fromCollection(List(
      LoginEvent(1,"192.168.0.1","fail",1558430842),
      LoginEvent(1,"192.168.0.2","success",1558430843),
      LoginEvent(3,"192.168.0.3","fail",1558430844),
      LoginEvent(3,"192.168.0.3","fail",1558430847),
      LoginEvent(3,"192.168.0.3","fail",1558430848),
      LoginEvent(4,"192.168.0.5","fail",1558430880),
      LoginEvent(2,"192.168.0.10","success",1558430950)
    )).assignAscendingTimestamps(_.eventTime*1000)

    //定义pattern.对事件流进行模式匹配
    val loginFailPattern = Pattern.begin[LoginEvent]("begin")
      .where(_.eventTpye.equals("fail"))
      .next("next")
      .where(_.eventTpye.equals("fail"))
//      .within(Time.seconds(2))

    //在输入流的基础上应用pattern,得到匹配的pattern stream
    val patternStream = CEP.pattern(loginStream.keyBy(_.userId),loginFailPattern)

    val loginFailDataStream = patternStream.select(new MySelectFunction())

    //将得到的警告信息流输出sink
    loginFailDataStream.print("warning")

    env.execute("Login Fail Detect with CEP")
  }
}

class MySelectFunction() extends PatternSelectFunction[LoginEvent,Warning]{
  override def select(patternEvents: util.Map[String, util.List[LoginEvent]]): Warning = {
    val firstFailEvent = patternEvents.getOrDefault("begin",null).iterator().next()
    val secondEvent = patternEvents.getOrDefault("next",null).iterator().next()
    Warning(firstFailEvent.userId,firstFailEvent.eventTime,secondEvent.eventTime,"login fail warning")
  }
}
```

#### 引入相关依赖包
```
<dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-cep-scala_2.11</artifactId>
    <version>1.10.0</version>
</dependency>
```