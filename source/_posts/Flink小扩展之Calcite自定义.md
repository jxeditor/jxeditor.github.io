---
title: Flink小扩展之Calcite自定义JDBCDriver
date: 2020-07-03 15:20:27
categories: 大数据
tags: flink
---

> 其实这一部分已经偏离Flink了,但是能够扩展自己知识面-[传送门](https://blog.csdn.net/dafei1288/article/details/103485689)

<!-- more -->

## JDBCURL的组成
```
URL: jdbc:json:./src/main/resource
协议规范: jdbc:json
加载路径: ./src/main/resource
    ./user.json
    ./order.json
表名:user,order

数据
# user.json
[{
  "uid": 1,
  "name": "dafei1288",
  "age": 33,
  "aka": "+7"
},
  {
    "uid": 2,
    "name": "libailu",
    "age": 1,
    "aka": "maimai"
  },
  {
    "uid": 3,
    "name": "libaitian",
    "age": 1,
    "aka": "doudou"
  }
]
# order.json
[
  {
    "oid": 1,
    "uid": 1,
    "value": 11
  },
  {
    "oid": 2,
    "uid": 2,
    "value": 15
  }
]
```

---

## 项目构建
### pom依赖添加
```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
    <version>1.2.72</version>
</dependency>
<dependency>
    <groupId>com.google.guava</groupId>
    <artifactId>guava</artifactId>
    <version>29.0-jre</version>
</dependency>
```
### 编写自定义Schema类
```java
package org.example.jdbc;

import com.google.common.collect.Maps;
import org.apache.calcite.DataContext;
import org.apache.calcite.linq4j.AbstractEnumerable;
import org.apache.calcite.linq4j.Enumerable;
import org.apache.calcite.linq4j.Enumerator;
import org.apache.calcite.linq4j.Linq4j;
import org.apache.calcite.linq4j.tree.Expression;
import org.apache.calcite.linq4j.tree.Expressions;
import org.apache.calcite.linq4j.tree.Types;
import org.apache.calcite.rel.type.RelDataType;
import org.apache.calcite.rel.type.RelDataTypeFactory;
import org.apache.calcite.schema.ScannableTable;
import org.apache.calcite.schema.SchemaPlus;
import org.apache.calcite.schema.Schemas;
import org.apache.calcite.schema.Statistic;
import org.apache.calcite.schema.Statistics;
import org.apache.calcite.schema.Table;
import org.apache.calcite.schema.impl.AbstractSchema;
import org.apache.calcite.schema.impl.AbstractTable;
import org.apache.calcite.util.BuiltInMethod;
import org.apache.calcite.util.Pair;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * @author XiaShuai on 2020/7/3.
 */
public class JsonSchema extends AbstractSchema {
    static Map<String, Table> table = Maps.newHashMap();
    private String target;
    private String topic;

    public JsonSchema() {
        super();
    }

    public JsonSchema(String topic, String target) {
        super();
        this.put(topic, target);
    }

    public void put(String topic, String target) {
        this.topic = topic;
        if (!target.startsWith("[")) {
            this.target = '[' + target + ']';
        } else {
            this.target = target;
        }
        final Table table = fieldRelation();
        if (table != null) {
            this.table.put(topic, table);
        }

    }

    @Override
    public String toString() {
        return "JsonSchema(topic=" + topic + ":target=" + target + ")" + this.table;
    }

    public String getTarget() {
        return target;
    }

    @Override
    protected Map<String, Table> getTableMap() {
        return table;
    }

    Expression getTargetExpression(SchemaPlus parentSchema, String name) {
        return Types.castIfNecessary(target.getClass(),
                Expressions.call(Schemas.unwrap(getExpression(parentSchema, name), JsonSchema.class),
                        BuiltInMethod.REFLECTIVE_SCHEMA_GET_TARGET.method));
    }

    private <T> Table fieldRelation() {
        JSONArray jsonarr = JSON.parseArray(target);
        // final Enumerator<Object> enumerator = Linq4j.enumerator(list);
        return new JsonTable(jsonarr);
    }

    private static class JsonTable extends AbstractTable implements ScannableTable {
        private final JSONArray jsonarr;

        // private final Enumerable<Object> enumerable;
        public JsonTable(JSONArray obj) {
            this.jsonarr = obj;
        }

        public RelDataType getRowType(RelDataTypeFactory typeFactory) {
            final List<RelDataType> types = new ArrayList<RelDataType>();
            final List<String> names = new ArrayList<String>();
            JSONObject jsonobj = jsonarr.getJSONObject(0);
            for (String string : jsonobj.keySet()) {
                final RelDataType type;
                type = typeFactory.createJavaType(jsonobj.get(string).getClass());
                names.add(string);
                types.add(type);
            }
            if (names.isEmpty()) {
                names.add("line");
                types.add(typeFactory.createJavaType(String.class));
            }
            return typeFactory.createStructType(Pair.zip(names, types));
        }

        public Statistic getStatistic() {
            return Statistics.UNKNOWN;
        }

        public Enumerable<Object[]> scan(DataContext root) {
            return new AbstractEnumerable<Object[]>() {
                public Enumerator<Object[]> enumerator() {
                    return new JsonEnumerator(jsonarr);
                }
            };
        }
    }

    public static class JsonEnumerator implements Enumerator<Object[]> {

        private Enumerator<Object[]> enumerator;

        public JsonEnumerator(JSONArray jsonarr) {
            List<Object[]> objs = new ArrayList<Object[]>();
            for (Object obj : jsonarr) {
                objs.add(((JSONObject) obj).values().toArray());
            }
            enumerator = Linq4j.enumerator(objs);
        }

        public Object[] current() {
            return (Object[]) enumerator.current();
        }

        public boolean moveNext() {
            return enumerator.moveNext();
        }

        public void reset() {
            enumerator.reset();
        }

        public void close() {
            enumerator.close();
        }
    }
}
```
### 实现自定义Driver
```java
package org.example.jdbc;


import org.apache.calcite.jdbc.CalciteConnection;
import org.apache.calcite.jdbc.Driver;
import org.apache.calcite.schema.SchemaPlus;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Properties;

/**
 * @author XiaShuai on 2020/7/3.
 */
public class JsonDriver extends Driver {
    public static final String CONNECT_STRING_PREFIX = "jdbc:json:";

    static {
        new JsonDriver().register();
    }

    @Override
    protected String getConnectStringPrefix() {
        return CONNECT_STRING_PREFIX;
    }
    
    @Override
    public Connection connect(String url, Properties info) throws SQLException {
        Connection c = super.connect(url, info);
        CalciteConnection optiqConnection = c.unwrap(CalciteConnection.class);
        SchemaPlus rootSchema = optiqConnection.getRootSchema();
        String[] pars = url.split(":");
        Path f = Paths.get(pars[2]);
        try {
            JsonSchema js = new JsonSchema();
            Files.list(f).forEach(it -> {
                File file = it.getName(it.getNameCount() - 1).toFile();
                String filename = file.getName();
                filename = filename.substring(0, filename.lastIndexOf("."));
                String json = "";
                try {
                    json = String.join("", Files.readAllLines(it.toAbsolutePath()));//.forEach(line->{ sb.append(line);
                } catch (Exception e) {
                    e.printStackTrace();
                }
                js.put(filename, json);
            });
            rootSchema.add(f.getFileName().toString(), js);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return c;
    }
}
```
### 测试代码实现
```java
// 注意:IDEA可能SQL语句会报红,需要修改IDEA的SQL方言
// File->Settings->Languages & Frameworks->SQL Dialects
package org.example.devlop;

import com.alibaba.fastjson.JSONObject;

import java.sql.*;

/**
 * @author XiaShuai on 2020/7/3.
 */
public class ExampleJsonRunner {
    public static void main(String[] args) throws Exception {

        Class.forName("org.example.jdbc.JsonDriver");
        Connection connection = DriverManager.getConnection("jdbc:json:./src/main/resources/");
        Statement statement = connection.createStatement();
        ResultSet resultSet = resultSet = statement.executeQuery(
                "select \"user\".\"uid\" from \"resources\".\"user\" ");
        printResultSet(resultSet);
        resultSet = statement.executeQuery(
                "select * from \"resources\".\"order\" ");
        printResultSet(resultSet);
        resultSet = statement.executeQuery(
                "select * from \"resources\".\"user\" inner join \"resources\".\"order\"  on \"user\".\"uid\" = \"order\".\"uid\"");
        printResultSet(resultSet);
    }

    public static void printResultSet(ResultSet resultSet) throws SQLException {
        while (resultSet.next()) {
            JSONObject jo = new JSONObject();
            int n = resultSet.getMetaData().getColumnCount();
            for (int i = 1; i <= n; i++) {
                jo.put(resultSet.getMetaData().getColumnName(i), resultSet.getObject(i));
            }
            System.out.println(jo.toJSONString());
        }
    }
}
```