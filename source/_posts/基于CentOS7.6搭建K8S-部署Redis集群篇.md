---
title: 基于CentOS7.6搭建K8S-部署Redis集群篇
date: 2019-09-10 10:59:15
categories: 搭建
tags: docker
---

> 搭建redis集群

<!-- more -->

## 安装NFS(共享存储)
```
# 所有节点安装nfs+rpcbind
yum -y install nfs-utils rpcbind

# node01设置需要共享的路径
# rw表示读写权限
# all_squash表示客户机上的任何用户访问该共享目录时都映射成服务器上的匿名用户(默认为nfsnobody)
# *表示任意主机都可以访问该共享目录,也可以填写指定主机地址,同时支持正则
vi /etc/exports
/usr/local/kubernetes/redis/pv1 *(rw,all_squash)
/usr/local/kubernetes/redis/pv2 *(rw,all_squash)
/usr/local/kubernetes/redis/pv3 *(rw,all_squash)
/usr/local/kubernetes/redis/pv4 *(rw,all_squash)
/usr/local/kubernetes/redis/pv5 *(rw,all_squash)
/usr/local/kubernetes/redis/pv6 *(rw,all_squash)
# 创建目录修改权限
mkdir -p /usr/local/kubernetes/redis/pv{1..6}
chmod 777 /usr/local/kubernetes/redis/pv{1..6}
# 启动服务
systemctl enable nfs 
systemctl enable rpcbind
systemctl start nfs
systemctl start rpcbind

# 测试一下,在node02上执行挂载
mount -t nfs 192.168.17.129:/usr/local/kubernetes/redis/pv1 /mnt
cd /mnt
touch test
# 可以在node01上看到这个文件则表示成功
[root@node01 ~]# ll /usr/local/kubernetes/redis/pv1/
total 0
-rw-r--r--. 1 nfsnobody nfsnobody 0 Sep 10 15:03 test
```

---

## 创建PV
    供pvc挂载使用,每一个Redis Pod都需要一个独立的PV来存储自己的数据
```
vi redis_pv.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv1
spec:
  capacity:
    storage: 200M      #磁盘大小200M
  accessModes:
    - ReadWriteMany    #多客户可读写
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv1"

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-vp2
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv2"

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv3
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv3"

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv4
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv4"

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv5
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv5"

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv6
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.17.129
    path: "/usr/local/kubernetes/redis/pv6"

# 字段说明
apiversion: api版本
kind: 这个yaml是生成pv的
metadata: 元数据
spec.capacity: 进行资源限制的
spec.accessmodes: 访问模式(读写模式)
spec.nfs: 这个pv卷名是通过nfs提供的

# 创建
kubectl apply -f redis_pv.yaml
kubectl get pv # 查看PV
```

---

## 创建ConfigMap(redis.conf文件不要有注释)
    用来存放redis的配置文件,方便后期修改
```
vi redis.conf
appendonly yes # 开启Redis的AOF持久化
cluster-enabled yes # 集群模式打开
cluster-config-file /var/lib/redis/nodes.conf # 保存节点配置文件的路径
cluster-node-timeout 5000 # 节点超时时间
dir /var/lib/redis # AOF持久化文件存在的位置
port 6379 # 开启的端口

# 创建名为redis-conf的ConfigMap
kubectl create configmap redis-conf --from-file=redis.conf
kubectl describe cm redis-conf # 查看
```

---

## 创建Headless Service
    Headless Service是StatefulSet实现稳定网络标识的基础
```
vi headless-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  labels:
    app: redis
spec:
  ports:
  - name: redis-port
    port: 6379
  clusterIP: None
  selector:
    app: redis
    appCluster: redis-cluster
    
# 创建
kubectl apply -f headless-service.yaml
kubectl get service redis-service # 查看
# CLUSTER-IP为None,无头服务
```

---

## 创建Redis集群节点
```
vi redis.yaml
apiVersion: apps/v1beta1
kind: StatefulSet
metadata:
  name: redis-app
spec:
  serviceName: "redis-service"
  replicas: 6
  template:
    metadata:
      labels:
        app: redis
        appCluster: redis-cluster
    spec:
      terminationGracePeriodSeconds: 20
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - redis
              topologyKey: kubernetes.io/hostname
      containers:
      - name: redis
        image: "redis"
        command:
          - "redis-server"                  #redis启动命令
        args:
          - "/etc/redis/redis.conf"         #redis-server后面跟的参数,换行代表空格
          - "--protected-mode"              #允许外网访问
          - "no"
        # command: redis-server /etc/redis/redis.conf --protected-mode no
        resources:                          #资源
          requests:                         #请求的资源
            cpu: "100m"                     #m代表千分之,相当于0.1 个cpu资源
            memory: "100Mi"                 #内存100m大小
        ports:
            - name: redis
              containerPort: 6379
              protocol: "TCP"
            - name: cluster
              containerPort: 16379
              protocol: "TCP"
        volumeMounts:
          - name: "redis-conf"              #挂载configmap生成的文件
            mountPath: "/etc/redis"         #挂载到哪个路径下
          - name: "redis-data"              #挂载持久卷的路径
            mountPath: "/var/lib/redis"
      volumes:
      - name: "redis-conf"                  #引用configMap卷
        configMap:
          name: "redis-conf"
          items:
            - key: "redis.conf"             #创建configMap指定的名称
              path: "redis.conf"            #里面的那个文件--from-file参数后面的文件
  volumeClaimTemplates:                     #进行pvc持久卷声明,
  - metadata:
      name: redis-data
    spec:
      accessModes:
      - ReadWriteMany
      resources:
        requests:
          storage: 200M

# 创建
kubectl apply -f redis.yaml
kubectl get pods -o wide # 查看
# 可以看到这些Pods在部署时是以{0..N-1}的顺序依次创建的,当redis-app-0启动后达到Running状态后,才会创建redis-app-1
# 同时每个Pod都会得到集群内的一个DNS域名,格式为$(podname).$(service name).$(namespace).svc.cluster.local
redis-app-0.redis-service.default.svc.cluster.local
redis-app-1.redis-service.default.svc.cluster.local
...以此类推...

# 宿主机的DNS解析
vi /etc/resolv.conf
search localdomain default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
nameserver 192.168.17.2

# 在K8S集群内部,这些Pod就可以利用该域名互相通信,我们可以使用busybox镜像的nslookup检验这些域名
kubectl run -i --tty --image busybox dns-test --restart=Never --rm /bin/sh
nslookup redis-app-1.redis-service.default.svc.cluster.local
```

---

## 初始化Redis集群
```
# 创建centos容器
kubectl run -i --tty centos --image=centos --restart=Never /bin/bash
cat >> /etc/yum.repos.d/epel.repo<<'EOF'
[epel]
name=Extra Packages for Enterprise Linux 7 - $basearch
baseurl=https://mirrors.tuna.tsinghua.edu.cn/epel/7/$basearch
#mirrorlist=https://mirrors.fedoraproject.org/metalink?repo=epel-7&arch=$basearch
failovermethod=priority
enabled=1
gpgcheck=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-EPEL-7
EOF

# 初始化redis集群
yum -y install redis-trib.noarch bind-utils
redis-trib create --replicas 1 \
`dig +short redis-app-0.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-1.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-2.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-3.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-4.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-5.redis-service.default.svc.cluster.local`:6379

# 进入redis pod检验
 kubectl exec -it redis-app-0 /bin/bash
/usr/local/bin/redis-cli -c
cluster info
cluster nodes

# 也可以在NFS查看Redis
tree /usr/local/kubernetes/redis/
```

---

## 创建Service
```
# 用于Redis集群访问与负载均衡
piVersion: v1
kind: Service
metadata:
  name: redis-access-service
  labels:
    app: redis
spec:
  ports:
  - name: redis-port
    protocol: "TCP"
    port: 6379
    targetPort: 6379
  selector:
    app: redis
    appCluster: redis-cluster
    
kubectl get svc redis-access-service -o wide
```

---

## 测试主从切换
```
# 找到一个master,查看他的slave
kubectl exec -it redis-app-2 /bin/bash
redis-cli
role

# 删除redis-app-2, IP会切换成salve的IP
kubectl delete pods redis-app-2
kubectl exec -it redis-app-2 /bin/bash
```

--- 

## 动态扩容
```
# 添加NFS共享目录
cat >> /etc/exports <<'EOF'
/usr/local/kubernetes/redis/pv5 *(rw,all_squash)
/usr/local/kubernetes/redis/pv6 *(rw,all_squash)
EOF

systemctl restart nfs rpcbind
mkdir /usr/local/kubernetes/redis/pv{7..8}
chmod 777 /usr/local/kubernetes/redis/*

# 添加PV
vi pv.yml
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv7
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.1.253
    path: "/usr/local/kubernetes/redis/pv7"
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv8
spec:
  capacity:
    storage: 200M
  accessModes:
    - ReadWriteMany
  nfs:
    server: 192.168.1.253
    path: "/usr/local/kubernetes/redis/pv8"
kubectl apply -f pv.yml
kubectl get pv

# 添加redis节点
# 更改redis的yml文件里面的replicas:字段,把这个字段改为8,然后升级运行
kubectl apply -f redis.yml
kubectl get  pods

# 添加集群节点
kubectl exec -it centos /bin/bash
redis-trib add-node \
`dig +short redis-app-6.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-0.redis-service.default.svc.cluster.local`:6379

redis-trib add-node \
`dig +short redis-app-7.redis-service.default.svc.cluster.local`:6379 \
`dig +short redis-app-0.redis-service.default.svc.cluster.local`:6379

# 重新分配哈希槽
redis-trib.rb reshard `dig +short redis-app-0.redis-service.default.svc.cluster.local`:6379
```