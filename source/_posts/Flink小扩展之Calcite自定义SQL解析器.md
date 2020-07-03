---
title: Flink小扩展之Calcite自定义SQL解析器
date: 2020-07-03 14:04:53
categories: 大数据
tags: flink
---

> FlinkSQL其底层的SQL解析流程使用的Calcite框架,参考[传送门](https://blog.csdn.net/dafei1288/article/details/102735371)

<!-- more -->

## 前期项目构建
### maven项目
```
<groupId>org.example</groupId>
<artifactId>calcite_test</artifactId>
<version>1.0</version>
```
### pom.xml
```xml
<dependencies>
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>1.7.25</version>
    </dependency>
    <dependency>
        <groupId>net.java.dev.javacc</groupId>
        <artifactId>javacc</artifactId>
        <version>7.0.9</version>
    </dependency>
    <dependency>
        <groupId>org.freemarker</groupId>
        <artifactId>freemarker</artifactId>
        <version>2.3.30</version>
    </dependency>
    <dependency>
        <groupId>org.apache.calcite</groupId>
        <artifactId>calcite-core</artifactId>
        <version>1.23.0</version>
    </dependency>

</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <version>3.2</version>
            <configuration>
                <source>1.8</source>
                <target>1.8</target>
            </configuration>
        </plugin>
        <plugin>
            <groupId>org.codehaus.mojo</groupId>
            <artifactId>javacc-maven-plugin</artifactId>
            <executions>
                <execution>
                    <id>javacc</id>
                    <goals>
                        <goal>javacc</goal>
                    </goals>
                    <configuration>
                        <sourceDirectory>${project.build.directory}/generated-sources/fmpp</sourceDirectory>
                        <includes>
                            <include>**/Parser.jj</include>
                        </includes>
                        <lookAhead>2</lookAhead>
                        <isStatic>false</isStatic>
                    </configuration>
                </execution>
                <execution>
                    <id>javacc-test</id>
                    <phase>generate-test-sources</phase>
                    <goals>
                        <goal>javacc</goal>
                    </goals>
                    <configuration>
                        <sourceDirectory>${project.build.directory}/generated-test-sources/fmpp</sourceDirectory>
                        <outputDirectory>${project.build.directory}/generated-test-sources/javacc</outputDirectory>
                        <includes>
                            <include>**/Parser.jj</include>
                        </includes>
                        <lookAhead>2</lookAhead>
                        <isStatic>false</isStatic>
                    </configuration>
                </execution>
            </executions>
        </plugin>
        <plugin>
            <groupId>org.apache.drill.tools</groupId>
            <artifactId>drill-fmpp-maven-plugin</artifactId>
            <executions>
                <execution>
                    <configuration>
                        <config>src/main/codegen/config.fmpp</config>
                        <output>${project.build.directory}/generated-sources/fmpp</output>
                        <templates>src/main/codegen/templates</templates>
                    </configuration>
                    <id>generate-fmpp-sources</id>
                    <phase>validate</phase>
                    <goals>
                        <goal>generate</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```
### 模板文件
```
# 复制Calcite源码
git clone https://github.com/apache/calcite.git
# 复制模板文件到自己的工程下
mv calcite\core\src\main\codegen calcite_test\src\main\

# 可以了解一下模板文件
compoundIdentifier.ftl
parserImpls.ftl
Parser.jj
config.fmpp
```

---

## 代码编写
### 自定义SqlNode
```java
// 需要在org.apache.calcite.sql包内,SqlNode没有public构造函数
package org.apache.calcite.sql;

import org.apache.calcite.sql.parser.SqlParserPos;
import org.apache.calcite.sql.util.SqlVisitor;
import org.apache.calcite.sql.validate.SqlValidator;
import org.apache.calcite.sql.validate.SqlValidatorScope;
import org.apache.calcite.util.Litmus;

/**
 * SQL解析树
 *
 * @author XiaShuai on 2020/7/3.
 */
public class SqlExample extends SqlNode {
    private String exampleString;
    private SqlParserPos pos;

    public SqlExample(SqlParserPos pos, String exampleString) {
        super(pos);
        this.pos = pos;
        this.exampleString = exampleString;
    }

    public String getExampleString() {
        System.out.println("getExampleString");
        return this.exampleString;
    }

    @Override
    public SqlNode clone(SqlParserPos sqlParserPos) {
        System.out.println("clone");
        return null;
    }

    @Override
    public void unparse(SqlWriter sqlWriter, int i, int i1) {
        sqlWriter.keyword("run");
        sqlWriter.keyword("example");
        sqlWriter.print("\n");
        sqlWriter.keyword(exampleString);
    }

    @Override
    public void validate(SqlValidator sqlValidator, SqlValidatorScope sqlValidatorScope) {
        System.out.println("validate");
    }

    @Override
    public <R> R accept(SqlVisitor<R> sqlVisitor) {
        System.out.println("validate");
        return null;
    }

    @Override
    public boolean equalsDeep(SqlNode sqlNode, Litmus litmus) {
        System.out.println("equalsDeep");
        return false;
    }
}
```
### 修改config.fmpp
```
找到package: "org.apache.calcite.sql.parser.impl"
修改下方class,替换成自己的类名ExampleSqlParserImpl
Flink也是这样处理FlinkSqlParserImpl
class: "ExampleSqlParserImpl"
```
### 修改Parser.jj文件
```
在import导入处,添加自定义SqlNode解析类的引入
import org.apache.calcite.sql.SQLExample;

在处理代码中加入解析逻辑,我是加在SqlStmtEof()后
SqlNode SqlExample() :
{
     SqlNode stringNode;
}
{
    <RUN> <EXAMPLE>
    stringNode = StringLiteral()
    {
        return new SqlExample(getPos(), token.image);
    }
}

找到声明语句的方法SqlNode SqlStmt() :
适当位置加入
|
    stmt = SqlExample()

在<DEFAULT, DQID, BTID> TOKEN :处加入关键字
|   < RUN: "RUN">
|   < EXAMPLE: "EXAMPLE">
```
### 编译
```sh
mvn clean compile
```
### 测试代码编写
```java
package org.example.devlop;

import org.apache.calcite.avatica.util.Casing;
import org.apache.calcite.avatica.util.Quoting;
import org.apache.calcite.sql.SqlNode;
import org.apache.calcite.sql.parser.SqlParser;
import org.apache.calcite.sql.parser.impl.ExampleSqlParserImpl;
import org.apache.calcite.tools.FrameworkConfig;
import org.apache.calcite.tools.Frameworks;

/**
 * @author XiaShuai on 2020/7/3.
 */
public class ExampleParser {
    public static void main(String[] args) {
        FrameworkConfig config = Frameworks.newConfigBuilder()
                .parserConfig(SqlParser.configBuilder()
                        .setParserFactory(ExampleSqlParserImpl.FACTORY)
                        .setCaseSensitive(false)
                        .setQuoting(Quoting.BACK_TICK)
                        .setQuotedCasing(Casing.TO_UPPER)
                        .setUnquotedCasing(Casing.TO_UPPER)
                        .build())
                .build();
        String sql = "run example 'select ids, name from test where id < 5'";
        SqlParser parser = SqlParser.create(sql, config.getParserConfig());
        try {
            SqlNode sqlNode = parser.parseStmt();
            System.out.println(sqlNode.toString());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```