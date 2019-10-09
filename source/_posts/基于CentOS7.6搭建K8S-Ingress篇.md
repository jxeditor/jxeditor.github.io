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

## 导入镜像
```
wget https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/mandatory.yaml
cat mandatory.yaml|grep image
docker pull image: quay.io/kubernetes-ingress-controller/nginx-ingress-controller:0.25.1
# 分发给其他机器
docker sava -o ingress.tar 0439eb3e11f1
docker load -i ingress.tar
docker tag 0439eb3e11f1 quay.io/kubernetes-ingress-controller/nginx-ingress-controller:0.25.1
```

---

## 安装
```
# 强制命令
kubectl apply -f mandatory.yaml
# 编辑mandatory.yaml,在containers上添加
vi mandatory.yaml
spec:
      hostNetwork: true
      serviceAccountName: nginx-ingress-serviceaccount
      containers:
# 基于Bare-metal安装
wget https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/provider/baremetal/service-nodeport.yaml
kubectl apply -f service-nodeport.yaml
# 验证安装
kubectl get pods --all-namespaces -l app.kubernetes.io/name=ingress-nginx --watch
```

---

## 测试
```
# mandatory.yaml装的是Ingress Controller
# service-nodeport装的是服务
# 自己编写一个Ingress的yaml文件,如下
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: test-ingress
  namespace: ingress-nginx # 与service的命名空间一致
spec:
  rules:
  - host: node01 # host可以自定义
    http:
      paths:
      - path: / # 自定义
        backend:
          serviceName: ingress-nginx # 服务名
          servicePort: 10254 # service的内部端口(内部端口:宿主机端口)
# 测试一下,IP地址是Ingress Controller所在节点IP
curl -v http://192.168.17.131 -H 'host: node01'
```

---

## 附加测试-ingress-tomcat
```
# 首先创建Service和Deployment(默认default命名空间)
vi tomcat-deploy.yaml 
apiVersion: v1
kind: Service
metadata:
  name: tomcat
  namespace: default
spec:
  selector:
    app: tomcat
    release: canary
  ports:
  - name: http
    targetPort: 8080
    port: 8080
  - name: ajp
    targetPort: 8009
    port: 8009
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tomcat-deploy
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: tomcat
      release: canary
  template:
    metadata:
      labels:
        app: tomcat
        release: canary
    spec:
      containers:
      - name: tomcat
        image: tomcat
        ports:
        - name: http
          containerPort: 8080

kubectl apply -f tomcat-deploy.yaml

# 创建Ingress
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: ingress-tomcat
  namespace: default
  annotations:
    kubernetes.io/ingress.class: "nginx"
spec:
  rules:
  - host: www.tomcat.com
    http:
      paths:
      - path:
        backend:
          serviceName: tomcat
          servicePort: 8080

kubectl apply -f ingress-tomcat.yaml 

# 修改hosts
IP(Ingress Controller所在IP)    www.tomcat.com
# 访问
http://www.tomcat.com/
```

---

## 启用Https
```
# 生成私钥 tls.key, 密钥位数是 2048
openssl genrsa -out tls.key 2048
# 使用 tls.key 生成自签证书
openssl req -new -x509 -key tls.key -out tls.crt -subj /C=CN/ST=GuangDong/L=Guangzhou/O=DevOps/CN=www.tomcat.com
kubectl create secret tls tomcat-ingress-secret --cert=tls.crt --key=tls.key 
kubectl get secret
kubectl describe secret tomcat-ingress-secret

# 创建Ingress
vi ingress-tomcat-tls.yaml 
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: ingress-tomcat-tls
  namespace: default
  annotations:
    kubernetes.io/ingress.class: "nginx"
spec:
  tls:
  - hosts: 
    - www.tomcat.com
    secretName: tomcat-ingress-secret
  rules:
  - host: www.tomcat.com
    http:
      paths:
      - path:
        backend:
          serviceName: tomcat
          servicePort: 8080
          
kubectl apply -f ingress-tomcat-tls.yaml 
kubectl get ingress
kubectl describe ingress ingress-tomcat-tls

# 访问
https://www.tomcat.com/
```