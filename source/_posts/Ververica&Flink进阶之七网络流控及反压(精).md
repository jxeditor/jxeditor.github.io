---
title: Ververica&Flink进阶之七网络流控及反压(精)
date: 2019-06-14 15:13:45
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# 网络流控
```
当生产数据的速率远高于消费数据的速率
    消费端丢弃新到达的数据
    消费端的接收buffer持续扩张,最终耗尽消费端内存

静态限速
    限制住生产端的速率与消费端保持一致
    通常无法事先预估消费端能承受的最大速率
    消费端承受能力通常会动态的波动

动态反馈/自动反压
    负反馈
        接收速率小于发送速率时发生
    正反馈
        发送速率小于接收速率时发生
        
Storm和SparkStreaming都有反压机制
Flink1.5之前没有反压机制,为什么?
    TCP天然具备feedback流控机制,Flink基于它来实现反压

TCP流控:滑动窗口方式
    发送端初始3packets每秒
    消费端1packets每秒,window固定为5
    第一次
        P:[123]456789
        C:[12345]6789    #接收到123,窗口还剩2个
    第二次
        P:123[456]789
        C:1[23456]789    #消费了1,窗口还剩3个,刚好接收456
    第三次
        P:123456[7]89
        C:12[34567]89    #消费了2,窗口还剩1个,限定发送端速率降为1
    第四次
        P:1234567[]89    #定期发送zeroWindowProbe探测消息
        C:12[34567]89    #消费端出现问题,速率降为0了,发送端也会降为0

对应在Flink中
    Buffer被分为两种
        InputGate(InputChannel)    接收Buffer
        ResultPartition(ResultSubPartition)    发送Buffer
    跨TaskManager,反压如何从IC传播到RS
    TaskManager内,反压如何从RS传播到IC
```

---

# 跨TaskManager反压过程TCP
```
消费端ConsumerOperator在消费时速度匹配不上了
RecordReader读取数据过慢会导致InputChannel被写满
IC去LocalBufferPool申请位置,直到LBP写满
LBP写满会去向NetworkBufferPool申请位置
当IC,LBP,NBP都满了之后,Netty的AutoRead会被设置成disable
Netty将不再向Socket读取数据
当Socket也满了,将ACK Window = 0发送给发送端的Socket

发送端Socket接受到ACK Window = 0就会停止向消费端Socket发送数据
Socket慢慢也会变满,Netty就会停止写入Socket
Netty是无界的,有一个Watermark机制,当Netty内部数据超过Watermark
Netty的isWritable会返回false
RS就无法向Netty写入数据
RS写满后,向LBP申请
LBP满了之后,向NBP申请位置
NBP也满了,RecordWriter就会等待空闲
```

---

# TaskManager内反压过程TCP
```
假设RecordWriter被堵住了
那么RecordReader就不会向IC中读取数据
IC被打满数据,向LBP申请
LBP满了向NBP申请
NBP也满了,NettyAutoRead会被设置成disable
Netty将不再向Socket读取数据
当Socket也满了,将ACK Window = 0
```

---

# TCP反压的弊端
```
单个Task导致的反压,会阻断整个TM-TM的Socket
连CK Barrier也无法发出
反压传播路径太长,导致生效延迟比较大
```

---

# Credit反压
```
在Flink层面实现类似TCP流控的反压机制
Credit可类比TCP Window
ResultSubPartition发送Buffers的时候会附带一个BacklogSize积压数据大小
InputChannel会像ACK一样返回一个Credit
这个时候RS收到这么一个Credit之后才会发送对应Credit的数据

当Credit为0,RS就不会向Netty发送任何数据了
但是一样会有探测机制

可以对比TCP机制是类似的,但是比直接使用TCP反压要好
Netty和Socket不需要等待变满
Socket永远不会变满,TCP通信不会发生不了,CK机制不会被堵塞
```

---

# 总结
```
网络流控是为了在上下游速度不匹配的情况下,如何防止下游出现过载
网络流控有静态限速和动态反压两种手段
Flink1.5以前基于TCP流程控+BoundedBuffer来实现反压
Flink1.5之后实现自己托管的Credit流控机制,在应用层模拟TCP流控的机制
```

# 思考
```
外部数据存储到Sink的反压源头是否会触发?
    反压不一定会触发,得看Storage是否有限流机制,能不能很好的触发反压
静态限流的必要性
    向上一种情况,就可以通过静态限流来解决反压问题
```