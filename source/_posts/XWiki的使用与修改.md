---
title: XWiki的使用与修改
date: 2019-06-28 08:53:01
categories: 搭建
tags: 
    - xwiki
---

## 安装搭建
> - 下载官方最新版本...war
> - 部署到Tomcat
> - 启动 localhost:8080/xwiki
<!-- more -->

---

## 启动管理员
> 修改Tomcat下的webapps\wiki\WEB-INF\xwiki.cfg

> **xwiki.superadminpassword=system**

---

## 整理样式
> - 可以下载官方一体包,然后将data/extension目录下的文件复制到Tomcat下的work\Catalina\localhost\xwiki
> - 将上述目录下的xar文件复制到Tomcat下的webapps\xwiki\WEB-INF\extensions
> - 使用import功能导入xar文件

---

## 全面汉化
### 基础汉化
> - 进入Tomcat下的webapps\wiki\WEB-INF\lib目录
> - 找到xwiki-platform-legacy-oldcore-x.x.x.jar文件
> - 将ApplicationResources_zh.properties文件复制出来
> - 使用**native2ascii -reverse ApplicationResources_zh.properties ApplicationResources_zh1.properties**命令将unicode编码文件转成本地编码文件
> - 对文件内容进行汉化
> - 使用**native2ascii ApplicationResources_zh1.properties ApplicationResources_zh.properties**命令将本地文件转换成unicode编码文件
> - 替换jar包中的文件

### xar汉化
> - 进入Tomcat下的work\Catalina\localhost\xwiki目录
> - 修改xar文件中的xml文件
> - 将文件内容汉化
> - 替换xar包中的文件
> - 重新导入xar文件

---

## 修改SQL
> - 进入Tomcat下的webapps\wiki\WEB-INF\lib目录
> - 修改hbm.xml类似文件
> - queries.hbm.xml可以控制查询的排序
> - xwiki.hbm.xml是数据库表的映射
> - 修改xwiki.hbm.xml和xwiki-platform-legacy-oldcore-x.x.x.jar中的class文件可以添加表映射

---

## 修改ckeditor
> - 进入Tomcat下的work\Catalina\localhost\wiki\extension\repository目录
> - 找到org%2Exwiki%2Econtrib%3Aapplication-ckeditor-webjar.jar文件
> - 修改META-INF\resources\webjars\application-ckeditor-webjar\1.33\plugins\\xwiki-resource目录下的resourcePicker.bundle.min.js文件
> - 注释掉**c.prop("disabled",g);g&&c.attr("disabled","disabled");**
> - 可以添加新的点击事件

```
m = function (h) {
    h = a(this);
    var b = h.closest(".resourcePicker"), c = k(b.prev("input"));
    c.type !== h.val() && (c = {type: h.val(), reference: b.find("input.resourceReference").val()});
    if(c.type == 'url'){
        window.open("http://localhost:1114/re",window,"height=400,width=400");
    }else if(c.type == 'mailto'){
    }else{
        e.pickers[c.type](c).done(a.proxy(l, b))
    }
}
```