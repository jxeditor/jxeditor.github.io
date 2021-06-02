---
title: 规则引擎与敏捷开发语言入门Demo
date: 2021-05-28 15:08:30
categories: 工具
tags: learn
---

> 查漏补缺,扩展自己的宽度

<!-- more -->

## 规则引擎介绍
```sh
Drools
    业务代码和业务规则分离引擎

传送门: http://www.drools.org.cn/category/use

Aviator
    高性能,轻量级的Java语言实现的表达式求值引擎

MVEL
    基于Java应用程序的表达式语言
    
EasyRules
    Java规则引擎,提供Rule抽象以创建具有条件和动作的规则
```

---

## 入门使用
### Drools
```
# 引用依赖
<dependencies>
    <dependency>
        <groupId>org.kie</groupId>
        <artifactId>kie-api</artifactId>
        <version>6.5.0.Final</version>
    </dependency>
    <dependency>
        <groupId>org.drools</groupId>
        <artifactId>drools-compiler</artifactId>
        <version>6.5.0.Final</version>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>junit</groupId>
        <artifactId>junit</artifactId>
        <version>4.12</version>
    </dependency>
</dependencies>

resources/helloworld.drl文件
package helloworld;

rule "HelloWorld"
    when
        eval(true)
    then
        System.out.println("HelloWorld");
end

resources/META-INF/kmodule.xml文件
<?xml version="1.0" encoding="UTF-8" ?>
<kmodule xmlns="http://www.drools.org/xsd/kmodule">
    <kbase name="helloWorldBase">
        <ksession name="helloWorldSession"/>
    </kbase>
</kmodule>

public class HelloWorldTest {
    @Test
    public void testHelloWorld() {
        KieServices kieServices = KieServices.Factory.get();
        KieContainer kieContainer = kieServices.newKieClasspathContainer();
        KieSession kieSession = kieContainer.newKieSession("helloWorldSession");
        kieSession.fireAllRules();
        kieSession.dispose();
    }
}
```

### Aviator
```
# 引用依赖
<dependency>
    <groupId>com.googlecode.aviator</groupId>
    <artifactId>aviator</artifactId>
    <version>3.3.0</version>
</dependency>

import java.util.HashMap;
import java.util.Map;
 
import com.googlecode.aviator.AviatorEvaluator;
 
public class AviatorDemo {
 
    public static void main(String[] args) {
        String expression = "a + b + c";
 
        Map<String, Object> params = new HashMap<>();
        params.put("a", 1);
        params.put("b", 2);
        params.put("c", 3);
 
        long result = (long) AviatorEvaluator.execute(expression, params);
 
        System.out.printf("result : " + result);
    }
}
```

### MVEL
```
# 引用依赖
<dependency>
    <groupId>org.mvel</groupId>
    <artifactId>mvel2</artifactId>
    <version>2.4.12.Final</version>
</dependency>


public class MVELTest {
	public static void main(String[] args) {
		String expression = "foobar > 99";
 
		Map vars = new HashMap();
		vars.put("foobar", new Integer(100));
 
		// We know this expression should return a boolean.
		Boolean result = (Boolean) MVEL.eval(expression, vars);
 
		if (result.booleanValue()) {
			System.out.println("It works!");
		}
	}
}
```

### Easy Rules
```
引用依赖
<dependency>
    <groupId>org.jeasy</groupId>
    <artifactId>easy-rules-core</artifactId>
    <version>4.0.0</version>
</dependency>

import org.jeasy.rules.annotation.Action;
import org.jeasy.rules.annotation.Condition;
import org.jeasy.rules.annotation.Rule;

@Rule(name = "Hello World rule", description = "Always say hello world")
public class HelloWorldRule {

    @Condition
    public boolean when() {
        return true;
    }

    @Action
    public void then() throws Exception {
        System.out.println("hello world");
    }

}
```

### JavaScript
```
import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import javax.script.ScriptException;
 
public class ExpressionCalculate {
    public static void main(String[] args) {
        ScriptEngineManager scriptEngineManager = new ScriptEngineManager();
        ScriptEngine scriptEngine = scriptEngineManager.getEngineByName("nashorn");
        String expression = "10 * 2 + 6 / (3 - 1)";
 
        try {
            String result = String.valueOf(scriptEngine.eval(expression));
            System.out.println(result);
        } catch (ScriptException e) {
            e.printStackTrace();
        }
    }
}
```

### ScriptEvaluator
```
引用依赖
<dependency>
    <groupId>org.codehaus.janino</groupId>
    <artifactId>janino</artifactId>
    <version>3.0.7</version>
</dependency>

import org.codehaus.commons.compiler.CompileException;
import org.codehaus.janino.ScriptEvaluator;
import java.lang.reflect.InvocationTargetException;

public class ScriptEvaluatorTest {
    public static void main(String[] args) throws CompileException, InvocationTargetException {
        String value = "\"{'data': [-1, 2358513858109449, 1, 'ffffffff-d066-4f4b-ffff-ffffc64e4518', '1db8248e-2ca9-4337-9c8e-9765d3b21a63', null, '337956e4408101f716aefab6b0b7b0c4', 'f8ffc8c37ce4', 'QC_Reference_Phone,Xiaomi,armeabi-v7a,santoni,Xiaomi,Redmi 4X,santoni', 1576759226316], 'createTime': 1576759226316}\"";
        ScriptEvaluator se = new ScriptEvaluator();
        se.setReturnType(String.class);
        se.cook("import com.alibaba.fastjson.JSON;\n" +
                "        import com.alibaba.fastjson.JSONArray;\n" +
                "        import com.alibaba.fastjson.JSONObject;\n" +
                "        System.out.println(" + value + ");" +
                "        String valueData = " + value + ";\n" +
                "        JSONObject jsonObject = JSON.parseObject(valueData);\n" +
                "        JSONArray data = jsonObject.getJSONArray(\"data\");\n" +
                "        String adjustId = (String) data.get(3);\n" +
                "        return adjustId;");
        Object evaluate = se.evaluate(new Object[]{});
        System.out.println(evaluate.toString());
    }
}
```