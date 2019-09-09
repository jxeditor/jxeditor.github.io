---
title: 基于CentOS7.6搭建K8S-Dashboard篇
date: 2019-09-06 08:01:07
categories: 搭建
tags: docker
---

> 在集群搭建篇中,已经有了一个测试K8S集群,现在为它装上Dashboard

<!-- more -->

## 部署仪表板UI,最新版<坑很多,未完成>
```
# 下述步骤会需要镜像(所有节点都进行镜像导入)
wget https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta4/aio/deploy/recommended.yaml
cat recommended.yaml | grep -i image
docker pull kubernetesui/dashboard:v2.0.0-beta4
docker pull kubernetesui/metrics-scraper:v1.0.1

# 默认情况下不部署仪表板UI。要部署它，请运行以下命令：
# 主节点
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta4/aio/deploy/recommended.yaml

# 这时候访问WEB可能会出现问题,需要知道Dashboard的pod被部署到哪一个节点
kubectl get pods --all-namespaces -o wide

# 执行上述命令看到以下结果,则Dashboard部署完成,restart12次是因为部署时node02/node03没有镜像导致的
kubernetes-dashboard   dashboard-metrics-scraper-fb986f88d-9zplq   1/1     Running   0          51m   192.168.186.193   node03   <none>           <none>
kubernetes-dashboard   kubernetes-dashboard-6bb65fcc49-lm2qr       1/1     Running     12         51m   192.168.140.65    node02   <none>           <none>

# 查看日志
kubectl logs kubernetes-dashboard-6bb65fcc49-rbghp --namespace=kubernetes-dashboard

# 有可能kubernetes-dashboard-*一直处于CrashLoopBackOff,进行删除
kubectl delete -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta4/aio/deploy/recommended.yaml
```

---

## 部署仪表板UI,v1.10.1
```
wget https://raw.githubusercontent.com/kubernetes/dashboard/v1.10.1/src/deploy/recommended/kubernetes-dashboard.yaml
cat kubernetes-dashboard.yaml |grep image
# 去国内下载,然后修改tag
docker pull mirrorgooglecontainers/kubernetes-dashboard-amd64:v1.10.1
docker tag mirrorgooglecontainers/kubernetes-dashboard-amd64:v1.10.1 k8s.gcr.io/kubernetes-dashboard-amd64:v1.10.1
docker rmi mirrorgooglecontainers/kubernetes-dashboard-amd64:v1.10.1

# 修改kubernetes-dashboard.yaml(其实就是将dashbroad部署到master节点上)
# 默认DashBroad部署到Worker节点,但是kube-apiserver在master节点上,Worker节点访问不到kube-apiserver
# ------------------- Dashboard Deployment ------------------- #
kind: Deployment
apiVersion: apps/v1
metadata:
  # 省略
spec:
  # 不修改
  template:
    # 不修改
    spec:
      nodeSelector:
        type: master # 新增
      containers:
      - name: kubernetes-dashboard
        image: k8s.gcr.io/kubernetes-dashboard-amd64:v1.10.1
        imagePullPolicy: IfNotPresent # 新增
        # 不修改
        
# 部署
kubectl label node node01 type=master
kubectl apply -f kubernetes-dashboard.yaml
kubectl get pods --all-namespaces -o wide
```

---

## 访问仪表盘<不要用谷歌,推荐用火狐>
### Proxy<代理可以通过设置开启跳过进行DashBoard使用>
```
# 只能从执行命令的机器访问UI
kubectl proxy
# 在其他机器上进行访问
kubectl proxy --address=192.168.17.129 --disable-filter=true
# UI地址
http://192.168.17.129:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
# 注意: 使用Proxy进行登陆很多坑
```
### NodePort<推荐>
```
# 修改NodePort
kubectl patch svc -n kube-system kubernetes-dashboard -p '{"spec":{"type":"NodePort"}}'
kubectl -n kube-system get service kubernetes-dashboard
kubernetes-dashboard   NodePort   10.102.188.96   <none>        443:31031/TCP   3h39m
# UI地址(https)
https://192.168.17.132:31031/#!/login
```
### 开启跳过
```
kubectl edit deploy -n=kube-system kubernetes-dashboard
# 在containers下面的args输入
- --enable-skip-login
```
### kubeconfig和token登陆
```
# 创建Dashboard管理用户
kubectl create serviceaccount dashboard-admin -n kube-system
# 绑定用户为集群管理用户
kubectl create clusterrolebinding dashboard-cluster-admin --clusterrole=cluster-admin --serviceaccount=kube-system:dashboard-admin
# 获取tocken
kubectl get secret -n kube-system
kubectl describe secret -n kube-system dashboard-admin-token-l7kpn
# 在dashboard后台使用tocken方式登录即可
# 生成kubeconfig文件
DASH_TOCKEN=$(kubectl get secret -n kube-system dashboard-admin-token-l7kpn -o jsonpath={.data.token}|base64 -d)
kubectl config set-cluster kubernetes --server=192.168.17.132:6443 --kubeconfig=/root/dashbord-admin.conf
kubectl config set-credentials dashboard-admin --token=$DASH_TOCKEN --kubeconfig=/root/dashbord-admin.conf
kubectl config set-context dashboard-admin@kubernetes --cluster=kubernetes --user=dashboard-admin --kubeconfig=/root/dashbord-admin.conf
kubectl config use-context dashboard-admin@kubernetes --kubeconfig=/root/dashbord-admin.conf
# 生成的dashbord-admin.conf即可用于登录dashboard
```