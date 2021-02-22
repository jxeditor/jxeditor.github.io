---
title: JdbcRowDataLookupFunction缓存逻辑问题
date: 2021-02-19 17:01:31
categories: 大数据
tags: flink
---

> 修复下设置缓存导致关联不上数据的问题[issue](https://issues.apache.org/jira/projects/FLINK/issues/FLINK-21415)

<!-- more -->

## 问题再现
```
不太能理解TTL期间对于未命中的key,为什么保留,虽然减少了IO,也增加了数据的不准确性

使用FlinkSQL创建MySQL维表时,使用了缓存
lookup.cache.ttl
lookup.max-retries
lookup.cache.max-rows
发现和不使用缓存得到的数据存在明显差异
同一订单,不同状态,假如产生2条数据
不使用缓存,当关联维表时因为操作延迟原因可能出现关联不上的情况,等到第二次关联时,基本上可以关联上
使用缓存,第一次关联不上,之后的数据也关联不上
```

---

## 问题原因
```java
使用缓存后,对于查询不到的数据也进行了缓存
// JdbcRowDataLookupFunction
public void eval(Object... keys) {
    RowData keyRow = GenericRowData.of(keys);
    if (cache != null) {
        List<RowData> cachedRows = cache.getIfPresent(keyRow);
        if (cachedRows != null) {
            for (RowData cachedRow : cachedRows) {
                collect(cachedRow);
            }
            return;
        }
    }

    for (int retry = 0; retry <= maxRetryTimes; retry++) {
        try {
            statement.clearParameters();
            statement = lookupKeyRowConverter.toExternal(keyRow, statement);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (cache == null) {
                    while (resultSet.next()) {
                        collect(jdbcRowConverter.toInternal(resultSet));
                    }
                } else {
                    ArrayList<RowData> rows = new ArrayList<>();
                    while (resultSet.next()) {
                        RowData row = jdbcRowConverter.toInternal(resultSet);
                        rows.add(row);
                        collect(row);
                    }
                    rows.trimToSize();
                    // 即便resultSet没有查询到数据,也会将rows放入缓存
                    cache.put(keyRow, rows);
                }
            }
            break;
        } catch (SQLException e) {
            ...
    }
}
```

---

## 解决
```java
if(rows.size() > 0) {
    cache.put(keyRow, rows);
}
```