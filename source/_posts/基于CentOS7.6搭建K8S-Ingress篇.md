---
title: 基于CentOS7.6搭建K8S-Ingress篇
date: 2019-09-09 08:51:46
categories: 搭建
tags: docker
---

> 在Dashboard篇中,UI界面已经存在,现在加上Ingress

<!-- more -->

## Ingress
    Ingress的主要作用是可以利用nginx，haproxy，envoy,traefik等负载均衡器来暴露集群内部服务。

包含两个组件
- Ingress
将Nginx的配置抽象成一个Ingress对象，每添加一个新的服务只需写一个新的Ingress的yaml文件即可
- Ingress Controller
将新加入的Ingress转化成Nginx的配置文件并使之生效

---

## 