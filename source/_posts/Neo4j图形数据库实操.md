---
title: Neo4j图形数据库实操
date: 2019-10-08 14:22:56
categories: 教程
tags: neo4j
---

> 针对于知识图谱项目进行neo4j实际操作

<!-- more -->

---

## 推荐网站
[北航知行中文图谱管理系统](http://www.actkg.com/)
[复旦CN-DBpedia](http://kw.fudan.edu.cn/cndbpedia/search/)
[复旦CN-Probase](http://kw.fudan.edu.cn/cnprobase/search/)
[中文开放知识图谱OpenKG](http://openkg.cn/home)
[大词林](http://www.bigcilin.com/WSDTest/?q=)

---

## 个人理解
谈到图形数据库,最直接的就是知识图谱,一个数据大屏,上面是各个实体和各个实体的连接.我个人理解,建立一个知识图谱需要的数据有三个,一是实体,实体有属性与属性值;二是关系,表示实体与实体间的关系;三是三元组,用来将实体连接成知识图谱.

Nodes[node01,node02,node03]
Links[link01,link02]

node01[id,neoId,category,name]
link01[id,source,target,name]

通过这些数据,我们就可以得到一张知识图谱

---

## Neo4j使用
### CREATE命令
```
# CREATE命令语法
CREATE (<node-name>:<label-name>)

CREATE (emp:Employee)
CREATE (dept:Dept)

# 创建具有属性的节点
CREATE (
   <node-name>:<label-name>
   { 	
      <Property1-name>:<Property1-Value>
      ........
      <Propertyn-name>:<Propertyn-Value>
   }
)

CREATE (emp:Employee{id:123,name:"Lokesh",sal:35000,deptno:10})
CREATE (dept:Dept { deptno:10,dname:"Accounting",location:"Hyderabad" })
```

### MATCH命令<不单独使用>
```
# MATCH命令语法
MATCH 
(
   <node-name>:<label-name>
)

# 检索数据
MATCH (dept:Dept)
```

### RETURN命令<不单独使用>
```
# RETURN命令语法
RETURN 
   <node-name>.<property1-name>,
   ........
   <node-name>.<propertyn-name>

# 检索节点和关联关系的所有属性
RETURN dept.deptno
```

### MATCH & RETURN匹配和返回
```
# MATCH RETURN命令语法
MATCH Command
RETURN Command

# 匹配和返回
MATCH (dept: Dept)
RETURN dept

MATCH (dept: Dept)
RETURN dept.deptno,dept.dname
```

### CREATE+MATCH+RETURN命令
```
# 创建
CREATE (e:Customer{id:"1001",name:"Abc",dob:"01/10/1982"})
CREATE (cc:CreditCard{id:"5001",number:"1234567890",cvv:"888",expiredate:"20/17"})

# 查看
MATCH (e:Customer)
RETURN e.id,e.name,e.dob

MATCH (cc:CreditCard)
RETURN cc.id,cc.number,cc.cvv,cc.expiredate
```

### 关系基础
#### 没有属性的关系
```
# 语法
MATCH (<node1-label-name>:<node1-name>),(<node2-label-name>:<node2-name>)
CREATE  
	(<node1-label-name>)-[<relationship-label-name>:<relationship-name>]->(<node2-label-name>)
RETURN <relationship-label-name>

# 验证节点
MATCH (e:Customer) 
RETURN e

MATCH (cc:CreditCard) 
RETURN cc

# 创建关系
MATCH (e:Customer),(cc:CreditCard) 
CREATE (e)-[r:DO_SHOPPING_WITH ]->(cc) 

# 查看关系
MATCH (e)-[r:DO_SHOPPING_WITH ]->(cc) 
RETURN r

# 使用新节点创建
CREATE (fb1:FaceBookProfile1)-[like:LIKES]->(fb2:FaceBookProfile2) 
RETURN like

# 如果再进行相反的创建操作,则会得到一个双向关系
```
#### 有属性的关系
```
# 语法
MATCH (<node1-label-name>:<node1-name>),(<node2-label-name>:<node2-name>)
CREATE  
	(<node1-label-name>)-[<relationship-label-name>:<relationship-name>
	{<define-properties-list>}]->(<node2-label-name>)
RETURN <relationship-label-name>

# 验证
...

# 创建关系
MATCH (e:Customer),(cc:CreditCard) 
CREATE (e)-[r:DO_SHOPPING_WITH{shopdate:"12/12/2014",price:55000}]->(cc) 
RETURN r

# 使用新节点创建
CREATE (video1:YoutubeVideo1{title:"Action Movie1",updated_by:"Abc",uploaded_date:"10/10/2010"})
-[movie:ACTION_MOVIES{rating:1}]->
(video2:YoutubeVideo2{title:"Action Movie2",updated_by:"Xyz",uploaded_date:"12/12/2012"}) 
RETURN movie
```

### CREATE创建标签
```
# 单个标签到节点
CREATE (<node-name>:<label-name>)
CREATE (google1:GooglePlusProfile)

# 多个标签到节点
CREATE (<node-name>:<label-name1>:<label-name2>.....:<label-namen>)
CREATE (m:Movie:Cinema:Film:Picture)

# 单个标签到关系
CREATE (<node1-name>:<label1-name>)-
	[(<relationship-name>:<relationship-label-name>)]
	->(<node2-name>:<label2-name>)
CREATE (p1:Profile1)-[r1:LIKES]->(p2:Profile2)
```

### WHERE子句
```
# 语法
WHERE <condition>
WHERE <condition> <boolean-operator> <condition>
# <condition>语法
<property-name> <comparison-operator> <value>

# 布尔运算符
AND OR NOT XOR

# 比较运算符
= <> < > <= >=

# 匹配
MATCH (emp:Employee) 
WHERE emp.name = 'Abc'
RETURN emp

# 使用WHERE子句创建关系
MATCH (<node1-label-name>:<node1-name>),(<node2-label-name>:<node2-name>) 
WHERE <condition>
CREATE (<node1-label-name>)-[<relationship-label-name>:<relationship-name>
       {<relationship-properties>}]->(<node2-label-name>) 
       
MATCH (cust:Customer),(cc:CreditCard) 
WHERE cust.id = "1001" AND cc.id= "5001" 
CREATE (cust)-[r:DO_SHOPPING_WITH{shopdate:"12/12/2014",price:55000}]->(cc) 
RETURN r
```

### DELETE删除<节点和关系>
```
# DELETE节点子句语法
DELETE <node-name-list>
MATCH (e: Employee) DELETE e

# DELETE节点和关系子句语法
DELETE <node1-name>,<node2-name>,<relationship-name>
MATCH (cc: CreditCard)-[rel]-(c:Customer) 
DELETE cc,c,rel
```

### REMOVE删除<标签和属性>
```
# REMOVE属性子句语法
REMOVE <property-name-list>

# 创建
CREATE (book:Book {id:122,title:"Neo4j Tutorial",pages:340,price:250}) 

# 删除
MATCH (book { id:122 })
REMOVE book.price
RETURN book

# REMOVE一个Label子句语法
REMOVE <label-name-list> 

# 删除
MATCH (m:Movie) 
REMOVE m:Picture
```

### SET子句
```
# 语法
SET  <property-name-list>

MATCH (dc:DebitCard)
SET dc.atm_pin = 3456
RETURN dc
```

### Sorting排序
```
# ORDER BY子句语法
ORDER BY  <property-name-list>  [DESC]	 

MATCH (emp:Employee)
RETURN emp.empid,emp.name,emp.salary,emp.deptno
ORDER BY emp.name

MATCH (emp:Employee)
RETURN emp.empid,emp.name,emp.salary,emp.deptno
ORDER BY emp.name DESC
```

### UNION合并
```
# UNION语法
<MATCH Command1>
UNION
<MATCH Command2>

MATCH (cc:CreditCard)
RETURN cc.id as id,cc.number as number,cc.name as name,
   cc.valid_from as valid_from,cc.valid_to as valid_to
UNION
MATCH (dc:DebitCard)
RETURN dc.id as id,dc.number as number,dc.name as name,
   dc.valid_from as valid_from,dc.valid_to as valid_to
   
# UNION ALL语法
<MATCH Command1>
UNION ALL
<MATCH Command2>

MATCH (cc:CreditCard)
RETURN cc.id as id,cc.number as number,cc.name as name,
   cc.valid_from as valid_from,cc.valid_to as valid_to
UNION ALL
MATCH (dc:DebitCard)
RETURN dc.id as id,dc.number as number,dc.name as name,
   dc.valid_from as valid_from,dc.valid_to as valid_to
```

### LIMIT和SKIP子句
```
# 底部
MATCH (emp:Employee) 
RETURN emp
LIMIT 2

# 顶部
MATCH (emp:Employee) 
RETURN emp
SKIP 2
```

### MERGE命令
```
MERGE = CREATE + MATCH

# MERGE语法
MERGE (<node-name>:<label-name>
{
   <Property1-name>:<Pro<rty1-Value>
   .....
   <Propertyn-name>:<Propertyn-Value>
})

# 只有不存在时才会添加
MERGE (gp2:GoogleProfile2{ Id: 201402,Name:"Nokia"})
```

### NULL值
```
MATCH (e:Employee) 
WHERE e.id IS NOT NULL
RETURN e.id,e.name,e.sal,e.deptno

MATCH (e:Employee) 
WHERE e.id IS NULL
RETURN e.id,e.name,e.sal,e.deptno
```

### IN操作符
```
MATCH (e:Employee) 
WHERE e.id IN [123,124]
RETURN e.id,e.name,e.sal,e.deptno
```

### ID属性
```
# ID是节点和关系的默认内部属性
# 节点的ID属性的最大值约为35亿
# ID的最大值关系的属性的大约35亿
```

### 字符串函数
```
# 大写
MATCH (e:Employee) 
RETURN e.id,UPPER(e.name),e.sal,e.deptno
# 小写
MATCH (e:Employee) 
RETURN e.id,LOWER(e.name),e.sal,e.deptno
# 切割<右闭>
MATCH (e:Employee) 
RETURN e.id,SUBSTRING(e.name,0,2),e.sal,e.deptno
```

### 聚合函数
```
# COUNT
MATCH (e:Employee) RETURN COUNT(*)
# MAX & MIN
MATCH (e:Employee) 
RETURN MAX(e.sal),MIN(e.sal)
# AVG & SUM
MATCH (e:Employee) 
RETURN SUM(e.sal),AVG(e.sal)
```

### 关系函数
```
# 检索开始节点
MATCH (a)-[movie:ACTION_MOVIES]->(b) 
RETURN STARTNODE(movie)
# 检索结束节点
MATCH (a)-[movie:ACTION_MOVIES]->(b) 
RETURN ENDNODE(movie)
# 检索关系的ID和类型详细信息
MATCH (a)-[movie:ACTION_MOVIES]->(b) 
RETURN ID(movie),TYPE(movie)
```