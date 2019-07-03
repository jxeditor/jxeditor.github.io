---
title: Hexo设置Blog的分类与标签
date: 2016-04-29 22:59:01
categories: 搭建
tags: hexo
---

## 1.添加关于页面
```
hexo new page "about"
# 修改themes/chan/_config.yml
nav:
    name: 关于
    url: /about
```
<!-- more -->
## 2.添加分类-标签页面
```
---
title: 标题
date: 时间
categories: 分类
tags: 标签
---
```

## 3.设置阅读全文
```
# 将下面语句写在需要出现的位置，自定义预览长度
<!-- more -->
```

## 4.设置文档模板
修改scaffolds目录下的post文件
```
---
title: {{ title }}
date: {{ date }}
categories:
tags:
---
```