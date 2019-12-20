---
title: CURL和WGET命令详解
date: 2016-08-30 14:34:09
categories: 运维
tags: tools
---

> 简单了解一下CURL和WGET命令的使用,毕竟也是常用到的命令

<!-- more -->

## CURL命令
curl是一种命令行工具，作用是发出网络请求，然后得到和提取数据
显示在"标准输出"（stdout）上面。
```
# 查看网页源码
curl www.baidu.com

# 保存网页或资源文件
curl -o test.html www.baidu.com
curl -o test.jpg https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 自动跳转
curl -L www.baidu.com

# 获取头信息(连带网页源码)-I则只显示头信息
curl -i www.baidu.com

# 显示通信过程
curl -v www.baidu.com
curl --trace output.txt www.baidu.com
curl --trace-ascii output.txt www.baidu.com

# 发送GET
curl https://www.baidu.com/s?wd=wget

# 发送POST
curl -X POST --data "wd=wget" https://www.baidu.com/s
curl -X POST --data-urlencode "wd=wget" https://www.baidu.com/s

# 支持HEAD GET POST PUT DELETE
```

---

## WGET命令
wget是一个下载文件的工具，它用在命令行下。
```
# 抓取整站
wget -r -p -np -k -E http://www.xxx.com 

# 抓取第一级
wget -l 1 -p -np -k http://www.xxx.com 

-r 递归抓取
-k 抓取之后修正链接，适合本地浏览

# 下载文件
wget https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 下载文件并自定义名称
wget -O test.jpg https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 限速下载
wget -limit-rate=300k https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 断点续传(服务器支持断点续传)
wget -c https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 后台下载
wget -b https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg
tail -f wget-log

# 伪装代理下载
wget -user-agent="Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204 Safari/534.16" https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 测试下载链接
wget -spider https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 重试次数(默认20次)
wget -tries=40 https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 下载多个文件(通过一份链接文件)
wget -i urlList.txt

# 镜像网站
wget -mirror -p -convert-links -P ./LOCAL URL 

# 过滤指定格式下载
wget --reject=gif https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 下载指定格式文件
wget -r -A.pdf https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 下载信息存入日志文件
wget -o download.log https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg

# 限制总下载文件大小(对单个文件下载不起作用)
wget -Q5m -i urlList.txt 

# FTP链接下载
wget -ftp https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg
wget -ftp-user=USERNAME -ftp-password=PASSWORD https://raw.githubusercontent.com/jxeditor/jxeditor.github.io/hexo/logo.jpg
```