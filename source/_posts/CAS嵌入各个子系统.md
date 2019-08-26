---
title: CAS嵌入各个子系统(Confluence)
date: 2019-07-25 09:05:40
categories: 搭建
tags: cas
---
> 基本上的操作并不会改变多少,只是看认证方式复杂程度,因为这一块需要自己实现.这里使用Confluence做一个简单的Demo.

<!-- more -->

## 安装破解Confluence
破解工具[confluence_keygen.jar](https://github.com/jxeditor/Software/blob/master/cas/confluence_keygen.jar)
```
我使用的是Confluence6.6.15

将Confluence安装好之后不启动Confluence

将Confluence安装目录D:\Atlassian\Confluence\confluence\WEB-INF\lib下的atlassian-extras-decoder-v2-3.2.jar复制到其他位置并改名为atlassian-extras-2.4.jar

使用破解工具的.patch!将刚复制的atlassian-extras-2.4.jar进行破解

成功后将atlassian-extras-2.4.jar改名为atlassian-extras-decoder-v2-3.2.jar

替换安装目录的jar文件

启动Confluence

选择产品验证

使用破解工具,随便输入数据,将Confluence自身的Server ID复制到指定栏

点击.gen!,复制生成Key,破解完成
```

---

## Confluence的Cas依赖包
- [cas-client-core-3.3.3.jar](https://github.com/jxeditor/Software/blob/master/cas/cas-client-core-3.3.3.jar)
- [cas-client-integration-atlassian-3.3.3.jar](https://github.com/jxeditor/Software/blob/master/cas/cas-client-integration-atlassian-3.3.3.jar)
将上述依赖包复制到Confluence安装目录D:\Atlassian\Confluence\confluence\WEB-INF\lib下

---

## Cas服务架构
我们使用Cas自带的Overlay来架构自己的Cas服务,有Gradle和Maven
我选Maven模式5.3版本的**GitHub分支**
Cas服务下载[GitHub](https://github.com/apereo/cas-overlay-template/tree/5.3)
```
下载好之后执行./build package
其实README上都有详细的介绍

执行之后会出现target目录,目录中有war包

新建Maven项目,将cas-overlay-template的pom文件内容复制到项目pom文件中

项目中新建webapp文件

将war包中的内容解压到webapp中
webapp
--META-INF
--org
--WEB-INF

配置下Tomcat,就可以直接启动Cas服务了

Cas的配置都在webapp/WEB-INF/classes/application.properties中
```

---

## 需要修改的3个Confluence文件
| 文件名 | 路径 |
| :-: | :-: |
| web.xml | D:\Atlassian\Confluence\confluence\WEB-INF\web.xml |
| seraph-config.xml | D:\Atlassian\Confluence\confluence\WEB-INF\classes\seraph-config.xml |
| xwork.xml | D:\Atlassian\Confluence\confluence\WEB-INF\classes\xwork.xml |
**其中xwork.xml来自D:\Atlassian\Confluence\confluence\WEB-INF\lib\confluence-6.6.15.jar,将其复制到classes文件夹内**

---

## 配置web.xml
### 所有filter之后
```xml
<!--配置过滤器和cas 以及本地服务的路径信息-->
<!-- CAS:START - Java Client Filters -->
<filter>
    <filter-name>CasSingleSignOutFilter</filter-name>
    <filter-class>org.jasig.cas.client.session.SingleSignOutFilter</filter-class>
    <init-param>
        <param-name>casServerLoginUrl</param-name>
        <param-value>http://192.168.40.124:8080/login</param-value>
    </init-param>
    <init-param>
        <param-name>serverName</param-name>
        <param-value>http://192.168.40.124:8090/</param-value>
    </init-param>
</filter>
<filter>
    <filter-name>CasAuthenticationFilter</filter-name>
    <filter-class>org.jasig.cas.client.authentication.AuthenticationFilter</filter-class>
    <init-param>
        <param-name>casServerLoginUrl</param-name>
        <param-value>http://192.168.40.124:8080/login</param-value>
    </init-param>
    <init-param>
        <param-name>serverName</param-name>
        <param-value>http://192.168.40.124:8090/</param-value>
    </init-param>
</filter>
<filter>
    <filter-name>CasValidationFilter</filter-name>
    <filter-class>org.jasig.cas.client.validation.Cas20ProxyReceivingTicketValidationFilter</filter-class>
    <init-param>
        <param-name>casServerUrlPrefix</param-name>
        <param-value>http://192.168.40.124:8080</param-value>
    </init-param>
    <init-param>
        <param-name>serverName</param-name>
        <param-value>http://192.168.40.124:8090/</param-value>
    </init-param>
    <init-param>
        <param-name>redirectAfterValidation</param-name>
        <param-value>true</param-value>
    </init-param>
</filter>
<!--- CAS:END -->
```
### login之前
```xml
<!--配置过滤器-->
<!-- CAS:START - Java Client Filter Mappings -->
<filter-mapping>
    <filter-name>CasSingleSignOutFilter</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
<filter-mapping>
    <filter-name>CasAuthenticationFilter</filter-name>
    <url-pattern>/login.action</url-pattern>
</filter-mapping>
<filter-mapping>
    <filter-name>CasValidationFilter</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
<!-- CAS:END -->
```
### Servlet Context Listeners之后
```xml
<!--配置单点登出的监听器-->
<!-- CAS:START - Java Client Single Sign Out Listener -->
<listener>
    <listener-class>org.jasig.cas.client.session.SingleSignOutHttpSessionListener</listener-class>
</listener>
<!-- CAS:END -->
```

---

## 配置seraph-config.xml
```xml
<init-param>
    <param-name>login.url</param-name>
    <!--<param-value>/login.action?os_destination=${originalurl}</param-value>-->
    <param-value>http://192.168.40.124:8080/login?service=${originalurl}</param-value>
</init-param>
<init-param>
    <param-name>link.login.url</param-name>
    <!--<param-value>/login.action</param-value>-->
    <param-value>http://192.168.40.124:8080/login?service=${originalurl}</param-value>
</init-param>

<!--配置confluence通过cas的方式来验证服务-->
<!-- CAS:START - Java Client Confluence Authenticator -->
<authenticator class="org.jasig.cas.client.integration.atlassian.ConfluenceCasAuthenticator"/>
<!-- CAS:END -->
```

---

## 配置xwork.xml
```xml
<action name="logout" class="com.atlassian.confluence.user.actions.LogoutAction">
    <interceptor-ref name="defaultStack"/>
    <!-- <result name="error" type="velocity">/logout.vm</result> -->
    <!-- CAS:START - CAS Logout Redirect -->
    <result name="success" type="redirect">http://192.168.40.124:8080/logout</result>
    <!-- CAS:END -->
</action>
```

---

## 注意点
- 依赖包一定要3.3.3版本的,我下3.5.1版本的会报错
- Cas服务需要修改支持http,修改WEB-INF\classes\services\HTTPSandIMAPS-10000001.json
- 出现403错误ticket验证不了需要使用IP的方式,不能使用localhost

---

## application.properties配置
```
# 出现服务未定义时,需要加上这个配置
cas.serviceRegistry.initFromJson=true
cas.serviceRegistry.json.location=classpath:/services

##
# CAS Authentication Credentials
#
#cas.authn.accept.users=superadmin::system
#数据库配置
#配置密码加密
cas.authn.jdbc.query[0].passwordEncoder.type=DEFAULT
cas.authn.jdbc.query[0].passwordEncoder.characterEncoding=UTF-8
cas.authn.jdbc.query[0].passwordEncoder.encodingAlgorithm=MD5

cas.authn.jdbc.query[0].sql=SELECT * FROM global_users WHERE user_name =?
#select * from cms_auth_user where user_name=?
cas.authn.jdbc.query[0].healthQuery=
cas.authn.jdbc.query[0].isolateInternalQueries=false
cas.authn.jdbc.query[0].url=jdbc:mysql://dmysql01:3306/fdfs?useUnicode=true&characterEncoding=UTF-8&autoReconnect=true&useSSL=false
#cas.authn.jdbc.query[0].failFast=true
#cas.authn.jdbc.query[0].isolationLevelName=ISOLATION_READ_COMMITTED
cas.authn.jdbc.query[0].dialect=org.hibernate.dialect.MySQLDialect
cas.authn.jdbc.query[0].leakThreshold=10
#cas.authn.jdbc.query[0].propagationBehaviorName=PROPAGATION_REQUIRED
cas.authn.jdbc.query[0].batchSize=1
cas.authn.jdbc.query[0].user=root
#cas.authn.jdbc.query[0].ddlAuto=create-drop
#cas.authn.jdbc.query[0].maxAgeDays=180
cas.authn.jdbc.query[0].password=123456
cas.authn.jdbc.query[0].autocommit=false
cas.authn.jdbc.query[0].driverClass=com.mysql.jdbc.Driver
cas.authn.jdbc.query[0].idleTimeout=5000
# cas.authn.jdbc.query[0].credentialCriteria=
# cas.authn.jdbc.query[0].name=
# cas.authn.jdbc.query[0].order=0
# cas.authn.jdbc.query[0].dataSourceName=
# cas.authn.jdbc.query[0].dataSourceProxy=false
cas.authn.jdbc.query[0].fieldPassword=PASSWORD

```