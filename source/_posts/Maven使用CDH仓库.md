---
title: Maven使用CDH仓库
date: 2018-03-29 09:43:11
categories: 编译
tags: maven
---

> 解决maven默认地址CDH依赖不足,或下载速度较慢,解决方式选择一种即可

<!-- more -->

## 修改setting文件
**注意** id不要乱写哟
```
<profile>
    <id>remote-repo</id>
    <repositories>
        <repository>
            <id>nexus-aliyun</id>
            <name>Nexus aliyun</name>  
            <url>http://maven.aliyun.com/nexus/content/groups/public</url>
            <release><enable>true</enable></release>
            <snapshot><enable>true</enable></snapshot>
        </repository>
        <repository>
            <id>cloudera</id>
            <name>Cloudera Repo</name>
            <!--<url>https://repository.cloudera.com/artifactory/cloudera-repos</url>-->
            <url>https://repository.cloudera.com/content/repositories/releases/</url>
            <releases>
            <enabled>true</enabled>
            </releases>
            <snapshots>
            <enabled>false</enabled>
            </snapshots>
        </repository>
    </repositories>
</profile>
```

---

## 修改pom文件
```
<repositories>
    <repository>
        <id>cloudera</id>
        <url>https://repository.cloudera.com/artifactory/cloudera-repos</url>
        <releases>
            <enabled>true</enabled>
        </releases>
        <snapshots>
            <enabled>false</enabled>
        </snapshots>
    </repository>
</repositories>
```