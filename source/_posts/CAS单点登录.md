---
title: CAS单点登录
date: 2019-07-22 09:12:30
categories: 教程
tags: cas
---

> 使用Cas进行单点登录操作实践

<!-- more -->

## 设置Https
### 生成证书
```
keytool -genkey -alias tomcat -keyalg RSA -validity 3650 -keystore D:\tomcat.keystore
# 密钥库口令 changeit
# 名字与姓氏输入域名 service.cas.com
keytool -list -keystore D:\tomcat.keystore
keytool -export -alias tomcat -file D:\tomcat.cer -keystore D:\tomcat.keystore -validity 3650
keytool -import -keystore C:\Java\jdk1.8.0_191\jre\lib\security\cacerts -file D:\tomcat.cer -alias tomcat -storepass changeit
# 密钥库口令 changeit
# 删除操作
keytool -delete -alias tomcat -keystore C:\Java\jdk1.8.0_191\jre\lib\security\cacerts
keytool -list -v -keystore C:\Java\jdk1.8.0_191\jre\lib\security\cacerts
```

### PKIX问题
```
# 如果CasClient与CasServer不在同一服务器上
# 那么需要对将上述生成的tomcat.cer证书导入到JDK中
# 尤其注意JDK的位置,用IDEA很可能JDK在C盘目录下
```

### 配置tomcat
```
# 修改tomcat_path/conf/server.xml,添加内容:
<Connector port="8443" protocol="org.apache.coyote.http11.Http11NioProtocol"
    maxThreads="200" SSLEnabled="true" scheme="https"
    secure="true" clientAuth="false" sslProtocol="TLS"
    keystoreFile="D:\tomcat.keystore"
    keystorePass="changeit"/>
```

---

## Cas服务端
```
# 我使用的是5.3.9
https://github.com/apereo/cas-overlay-template.git
# 按照README.md进行编译,将target/cas下的文件复制
# 新建Maven项目,将文件复制在src/main/webapp文件下
# 复制pom.xml文件中的build,properties,repositories,profiles
# 如若加入JDBC,需要在pom文件profiles.profile.dependencies处添加依赖

# 修改application.properties
server.ssl.enabled=true
server.ssl.key-store=file:D:\tomcat.keystore
server.ssl.key-store-password=changeit
server.ssl.key-password=changeit
server.ssl.keyAlias=tomcat
# 支持JSON
cas.serviceRegistry.initFromJson=true
cas.logout.followServiceRedirects=true
cas.logout.redirectParameter=service
cas.logout.confirmLogout=false
cas.logout.removeDescendantTickets=true

# 支持Http,修改webapp/WEB-INF/classes/services/HTTPSandIMAPS-10000001.json
{
  "@class" : "org.apereo.cas.services.RegexRegisteredService",
  "serviceId" : "^(https|http|imaps)://.*",
  "name" : "HTTPS and IMAPS",
  "id" : 10000001,
  "description" : "This service definition authorizes all application urls that support HTTPS and IMAPS protocols.",
  "evaluationOrder" : 10000,
  "logoutUrl" : "https://service.cas.com:8443/logout"
}
```

---

## Cas客户端
### 注意
```
# 我的2个Cas客户端与Cas服务端分布在3台服务器上
# 服务端使用https,客户端使用http
192.168.3.108 service.cas.com
192.168.3.109 app1.cas.com
192.168.3.110 app2.cas.com

# 配置application.yml时尤其注意cas.client-host-url
cas:
    # cas服务端前缀,不是登录地址
    server-url-prefix: https://service.cas.com:8443
    # cas的登录地址
    server-login-url: https://service.cas.com:8443/login
    # 当前客户端的地址<我们这里使用域名>
    # a.配置为IP时,调用退出时只会退出域名访问
    # b.配置为域名时,调用退出时只会退出IP访问
    client-host-url: http://app1.cas.com:8081
    # client-host-url: http://app2.cas.com:8082
    # Ticket校验器
    validation-type: CAS
```
### 代码<以Client1为例>
```
# Application类
@SpringBootApplication
@EnableCasClient
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

# 登出接口,退出时需要注意,将子系统的也进行退出,如果想继续重定向
@RequestMapping("/logout")
public String logout(HttpSession session) {
    session.invalidate();
    // 调用当前系统的退出,会去调用其他子系统的logoutRedirect接口去注销(因为使用域名所以域名不会注销)
    return "redirect:https://cas.com:8443/logout?service=http://app2.cas.com:8082/logoutRedirect";
}

@RequestMapping("/logoutRedirect")
public String logoutRedirect(HttpSession session){
    session.invalidate();
    // 重定向去其他页面,如果客户端多的话,只能重定向到下一个客户端的注销页面了,形成一个重定向流
    return "redirect:https://service.cas.com:8443";
}

# 如果有N个系统怎么办,让用户关闭网页么?
```

### 依赖
```
# 新建Maven项目,添加依赖
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.dev</groupId>
    <artifactId>cas</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>war</packaging>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>2.0.0.RELEASE</version>
    </parent>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <java.cas.client.version>3.5.0</java.cas.client.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>javax.servlet</groupId>
            <artifactId>jstl</artifactId>
        </dependency>
        <dependency>
            <groupId>org.apache.tomcat.embed</groupId>
            <artifactId>tomcat-embed-jasper</artifactId>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>org.mybatis.spring.boot</groupId>
            <artifactId>mybatis-spring-boot-starter</artifactId>
            <version>1.3.0</version>
        </dependency>
        <dependency>
            <groupId>mysql</groupId>
            <artifactId>mysql-connector-java</artifactId>
        </dependency>
        <dependency>
            <groupId>com.alibaba</groupId>
            <artifactId>druid-spring-boot-starter</artifactId>
            <version>1.1.9</version>
        </dependency>
        <dependency>
            <groupId>net.unicon.cas</groupId>
            <artifactId>cas-client-autoconfig-support</artifactId>
            <version>1.4.0-GA</version>
            <exclusions>
                <exclusion>
                    <groupId>org.jasig.cas.client</groupId>
                    <artifactId>cas-client-core</artifactId>
                </exclusion>
            </exclusions>
        </dependency>
        <dependency>
            <groupId>org.jasig.cas.client</groupId>
            <artifactId>cas-client-core</artifactId>
            <version>${java.cas.client.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-aop</artifactId>
        </dependency>
    </dependencies>

    <build>
        <!--打包后的项目名称  -->
        <finalName>cas-client</finalName>
        <plugins>
            <!-- java编译插件 -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <source>1.8</source>
                    <target>1.8</target>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>
            <!-- 打jar包的插件 -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-jar-plugin</artifactId>
                <configuration>
                    <archive>
                        <manifest>
                            <addClasspath>true</addClasspath>
                            <classpathPrefix>lib</classpathPrefix>
                            <!-- 程序启动入口 -->
                            <mainClass>com.dev.cas.Application</mainClass>
                        </manifest>
                        <manifestEntries>
                            <!-- 将lib包抽到上一层文件夹中, classpathPrefix属性是包名-->
                            <Class-Path>./</Class-Path>
                        </manifestEntries>
                    </archive>
                    <excludes>
                        <!-- 将config/**抽离出来 -->
                        <exclude>config/**</exclude>
                    </excludes>
                </configuration>
            </plugin>
            <plugin>
                <artifactId>maven-assembly-plugin</artifactId>
                <configuration>
                    <!-- not append assembly id in release file name -->
                    <appendAssemblyId>false</appendAssemblyId>
                    <descriptors>
                        <!-- 注意这里的路径 -->
                        <descriptor>src/main/build/package.xml</descriptor>
                    </descriptors>
                </configuration>
                <executions>
                    <execution>
                        <id>make-assembly</id>
                        <phase>package</phase>
                        <goals>
                            <goal>single</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```