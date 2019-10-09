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
# 新点击事件
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

# http://localhost:1114/re对应页面
<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<html>
<head>
    <title>Title</title>
</head>
<script>
    function re() {
        window.opener.postMessage(document.getElementById("url").value,"*");
        window.close();
    }
    function test1() {
        alert(document.getElementById("url").value)
    }
</script>
<body>
<input type="button" value="返回值" onclick="re()">
<br>
<input type="button" value="显示返回值" onclick="test1()">
<br>
<div id="root">
</div>
<script src="../demo/js/jquery-2.2.4.js"></script>
<script src="../demo/js/bootstrap-3.3.7.js"></script>
<script src="../window/demo.js"></script>
</body>
</html>

# demo.js
$("#root").html("<select name='url' id='url' style='margin-right: 2.2em;'></select>")
FillUnit();
function FillUnit() {
    var url = "/mysql/selectUrlData";
    $.ajax({
        async: false,
        type: "get",
        url: url,
        dataType: "json",
        success: function (data) {
            var str = "<option value=''>---</option>";
            for (var i = 0; i < data.length; i++) {
                str += "<option value='" + data[i].id + "'>" + data[i].name + "</option>"
            }
            $("#url").html(str)
        },
        error: function () {
            alert('ERROR')
        }
    })
}

# /mysql/selectUrlData接口实现
@RequestMapping("/selectUrlData")
public String selectUrlData() {
    DBContextHolder.setDbType("secondary");
    String sql = "SELECT id, file_name `name` FROM url_sample;";
    List<JSONObject> list = jdbcTemplate.query(sql, new RowMapper<JSONObject>() {
        @Override
        public JSONObject mapRow(ResultSet resultSet, int i) throws SQLException {
            JSONObject json = new JSONObject();
            json.put("id", resultSet.getString("id"));
            json.put("name", resultSet.getString("name"));
            return json;
        }
    });
    JSONArray array = new JSONArray();
    for (JSONObject json : list) {
        array.put(json);
    }
    return array.toString();
}
```

---

## 增加目录树排序功能
```
# changeSort接口实现
@RequestMapping("/changeSort")
public void changeSort(String value) {
    String[] arr = value.split("\\|");
    ArrayList<String> list = new ArrayList();
    System.out.println(value);
    for (String v : arr) {
        String s = v.split(":")[2];
        System.out.println(s.substring(0,s.lastIndexOf(".")));
        list.add(s.substring(0,s.lastIndexOf(".")));
    }
    // 将数据库中的sort字段修改
    DBContextHolder.setDbType("primary");
    for (int i = 0; i < list.size(); i++) {
        String sql = "UPDATE xwikispace SET XWS_RANK = '" + (list.size() - i) + "' WHERE XWS_REFERENCE = '" + list.get(i) + "';";
        jdbcTemplate.execute(sql);
    }
}

# 在wiki/resources/js/custom目录下实现,并在changesort方法之上重写jquery-2.2.4.js,将jQuery改为kQuery
function changesort(){
	var list = new Array()
	kQuery.each($("#sorttree li"), function(k,v){
		list.push(v.getAttribute('id'))
	})
	var data = ""
	for(var i=0;i<list.size();i++){
		if(i != list.size()-1){
			data = data + list[i] + "|"
		}else{
			data = data + list[i]
		}
	}
	var url = "http://localhost:1114/mysql/changeSort";
    kQuery.ajax({
        async: false,
        type: "get",
        url: url,
        data: {value: data},
        dataType: "jsonp",
        success: function (data) {
        },
        error: function () {
        }
    })
}

# 修改xar文件
xwiki-platform-panels-ui的NavigationConfigurationSection.xml
{{html clean=false}}
  &lt;fieldset&gt;
    &lt;input type="hidden" name="form_token" value="$!services.csrf.token" /&gt;
    &lt;input type="hidden" name="comment" value="$escapetool.xml($services.localization.render(
      'platform.panels.navigation.configuration.saveComment'))" /&gt;
  &lt;/fieldset&gt;
  &lt;div class="bottombuttons"&gt;
    &lt;p class="admin-buttons"&gt;
      &lt;span class="buttonwrapper"&gt;
        &lt;input class="button" type="submit" name="action_saveandcontinue"
          value="$services.localization.render('admin.save')" /&gt;
		  &lt;input class="button" type="button" name="提交修改" onclick="changesort()"
          value="提交修改" /&gt;
      &lt;/span&gt;
    &lt;/p&gt;
  &lt;/div&gt;
&lt;/form&gt;
&lt;script type='text/javascript' src='/wiki/resources/js/custom/demo.js'&gt;&lt;/script&gt;
{{/html}}

# 重新导入xar文件

# 修改xwiki-platform-index-tree-api下的hbm.xml文件
# 根据XWS_RANK进行排序
```

## XWiki整合Cas
```
# 准备jar
cas-client-core-3.3.3.jar
xmlsec-1.3.0.jar
xwiki-cas.jar
# 拷贝进wiki/WEB_INF/lib下
# 修改xwiki.conf
xwiki.authentication.authclass=org.xwiki.contrib.authentication.cas.XWikiCASAuthenticator
xwiki.authentication.cas.server=http://localhost:8443/cas
xwiki.authentication.cas.protocol=CAS20
xwiki.authentication.cas.create_user=1
xwiki.authentication.cas.update_user=1
```