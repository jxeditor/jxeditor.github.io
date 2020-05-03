---
title: Hue-Hive权限设置
date: 2020-05-03 15:11:26
categories: 大数据
tags: 
    - hive
---

> 设置Hive-Hue权限,库,表以及分区字段

<!-- more -->

### 元数据
```
# 一般在metastore库中

# 库权限
db_privs

# 表权限
tbl_privs

# 分区字段权限
part_col_privs
```

### 开启Hive权限控制
```xml
# 修改Hive配置项
CDH-Hive-配置-<Hive客户端高级配置代码段(安全阀),HiveServer2高级配置代码段(安全阀)>
<property>
    <!-- 开启权限控制 -->
    <name>hive.security.authorization.enabled</name>
    <value>true</value>
</property>
<property>
    <!-- 创建该表的用户对这个表拥有的权限,设置的是所有 -->
    <name>hive.security.authorization.createtable.owner.grants</name>
    <value>ALL</value>
</property>
<property>
    <name>hive.security.authorization.task.factory</name>
    <value>org.apache.hadoop.hive.ql.parse.authorization.HiveAuthorizationTaskFactoryImpl</value>
</property>
<property>
    <!-- 超级管理员,设置成hive用户 -->
    <name>hive.users.in.admin.role</name>
    <value>hive</value>
</property>
```

---

### Hue创建非Admin账户
```
# 用户添加
管理用户-添加组-设置权限-添加用户-设置组

# 权限设置
beeswax.access,rdbms.access,impala.access,pig.access

# 用户
guest

# 组
guest
```

---

### Hive设置用户角色以及权限
```
# 创建Linux用户
useradd guest
passwd guest
gpasswd -a guest guest

# 需要使用超级管理员-hive
su hive

# 默认角色为public
set role admin;

# 查看当前角色
show current roles;

# 查看所有角色
show roles;

# 新建一个角色
create role guest;

# 将角色赋给Linux用户
grant role guest to user guest;

# 赋予用户查询default库的权限
grant select on database default to user guest;

# 赋予角色查询default库的权限
# 按理来说拥有这个角色的用户都会获取到权限才对
# 但是没有反应
grant select on database default to role guest;

# 收回权限
revoke select on database default from role guest;

# 查看权限
show grant user guest;
show grant user guest on database default;
show grant user guest on table default.test;
```

---

### 注意
在使用权限控制后,如果发现权限设置无效,可能是需要指定角色导致,默认角色是`public`
并且,对用户或角色赋予数据库的权限,并没有用,只能设置表权限才能生效