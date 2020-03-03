---
title: Ververica&Flink入门之九SQL编程
date: 2020-04-30 11:18:18
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Window Aggregation
```sql
# 三种内置函数
TUMBLE(t, INTERVAL '2' HOUR)滚动,2小时一个窗口
HOP(t, INTERVAL '2' HOUR, INTERVAL '1' HOUR)滑动,每1小时聚合前2小时窗口
SESSION(t,INTERVAL '30' MINUTE)会话,30分钟无响应化为一个窗口

# 实例:每小时每个用户点击的次数
clicks:user, cTime, url
SELECT 
    user,
    TUMBLE_END(cTime, INTERVAL '1' HOURS) AS endT,
    COUNT(url) as cnt
FROM clicks
GROUP BY
    user,
    TUMBLE(cTime, INTERVAL '1' HOURS)

# WindowAgg & GroupAgg区别
输出模式
    Window按时输出
    Group提前输出
输出量
    Window只输出一次结果
    Group Per Key输出N个结果(Sink压力)
输出流
    Window AppendStream
    Group UpdateStream
状态清理
    Window及时清理过期数据
    Group状态无限增长
Sink
    Window均可
    Group可更新的结果表
    
# 实例: 纽约每个区块每5分钟的进入的车辆数,只关心至少有5辆车子进入的区块
SELECT 
  toAreaId(lon, lat) AS area, 
  TUMBLE_END(rideTime, INTERVAL '5' MINUTE) AS window_end, 
  COUNT(*) AS cnt 
FROM Rides 
WHERE isInNYC(lon, lat) and isStart
GROUP BY 
  toAreaId(lon, lat), 
  TUMBLE(rideTime, INTERVAL '5' MINUTE) 
HAVING COUNT(*) >= 5;
```

---

# 疑问
```
Window的Start和End的时间怎么恰好划分为整分的
```