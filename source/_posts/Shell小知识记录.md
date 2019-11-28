---
title: Shell小知识记录
date: 2018-11-28 16:32:05
categories: 运维
tags: shell
---

> 记录一下日常脚本的使用

<!-- more -->

## =~的使用
```
# 正则匹配,用来判断左侧的参数是否符合右边的规则
$: 以什么结尾
^: 以什么开头
例子: 输出/root/目录下以.jar结尾的文件
for row in `ls -l /root/ | awk '{print $9}'`; do
	if [[ "$row" =~ \.jar$ ]]; then
		echo "$row"
	fi
done
```

---

## readlink的使用
```
# 直接输出java脚本的真正位置
readlink -f /usr/bin/java
```