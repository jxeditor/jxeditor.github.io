---
title: Linux下软件版本控制的使用
date: 2020-01-17 16:52:22
categories: 系统
tags: os
---

> 方便多个版本之间的来回切换

<!-- more -->

## 创建脚本的软连接
```
ln  -s /usr/local/pushgateway-0.9.0/pushgateway /usr/bin/pushgateway09
ln  -s /usr/local/pushgateway-1.0.1/pushgateway /usr/bin/pushgateway10
```

---

## 使用alternatives
```
# 设置多个版本
alternatives --install /usr/bin/pushgateway pushgateway /usr/local/pushgateway-0.9.0/pushgateway 1400
alternatives --install /usr/bin/pushgateway pushgateway /usr/local/pushgateway-1.0.1/pushgateway 1500

# 切换版本
alternatives --config pushgateway
```