---
title: 基于CentOS7.6搭建K8S-集群搭建篇
date: 2019-09-04 15:46:35
categories: 搭建
tags: docker
---

> 针对内网机器搭建K8S集群,先联网机器将依赖之类的进行downloadonly,然后将依赖打包拷贝到不能联网机器
> 离线环境需要准备CentOS7.6的DVD版的ISO文件

<!-- more -->

## 节点内容
```
# 每个节点都有docker+k8s,并且k8s所需镜像都得有
k8s.gcr.io/kube-proxy
k8s.gcr.io/kube-apiserver
k8s.gcr.io/kube-scheduler
k8s.gcr.io/kube-controller-manager
k8s.gcr.io/coredns
k8s.gcr.io/etcd
k8s.gcr.io/pause
# 每个节点都需要网络镜像
calico/node
calico/cni
calico/pod2daemon-flexvol
calico/kube-controllers 
```

---

## 节点准备
```
# CentOS7.6三台
vi /etc/sysconfig/network-scripts/ifcfg-ens33
onboot=yes
service network restart
ip addr

192.168.17.129
192.168.17.130
192.168.17.131

# 配置阿里yum源--联网操作
[base]
name=CentOS-$releasever - Base - mirrors.aliyun.com
failovermethod=priority
baseurl=http://mirrors.aliyun.com/centos/$releasever/os/$basearch/
gpgcheck=1
gpgkey=http://mirrors.aliyun.com/centos/RPM-GPG-KEY-CentOS-7
 
#released updates 
[updates]
name=CentOS-$releasever - Updates - mirrors.aliyun.com
failovermethod=priority
baseurl=http://mirrors.aliyun.com/centos/$releasever/updates/$basearch/
gpgcheck=1
gpgkey=http://mirrors.aliyun.com/centos/RPM-GPG-KEY-CentOS-7
 
#additional packages that may be useful
[extras]
name=CentOS-$releasever - Extras - mirrors.aliyun.com
failovermethod=priority
baseurl=http://mirrors.aliyun.com/centos/$releasever/extras/$basearch/
gpgcheck=1
gpgkey=http://mirrors.aliyun.com/centos/RPM-GPG-KEY-CentOS-7
 
#additional packages that extend functionality of existing packages
[centosplus]
name=CentOS-$releasever - Plus - mirrors.aliyun.com
failovermethod=priority
baseurl=http://mirrors.aliyun.com/centos/$releasever/centosplus/$basearch/
gpgcheck=1
enabled=0
gpgkey=http://mirrors.aliyun.com/centos/RPM-GPG-KEY-CentOS-7
 
#contrib - packages by Centos Users
[contrib]
name=CentOS-$releasever - Contrib - mirrors.aliyun.com
failovermethod=priority
baseurl=http://mirrors.aliyun.com/centos/$releasever/contrib/$basearch/
gpgcheck=1
enabled=0
gpgkey=http://mirrors.aliyun.com/centos/RPM-GPG-KEY-CentOS-7

yum clean all
yum makecache

# 关闭防火墙
systemctl stop firewalld & systemctl disable firewalld

# 关闭Swap
swapoff -a #临时关闭
sed -i '/ swap / s/^/#/' /etc/fstab #永久关闭

# 关闭Selinux
setenforce 0
```

---

## 安装Docker
```
mkdir /root/yum
yum install --downloadonly --downloaddir=/root/yum/ yum-utils device-mapper-persistent-data lvm2
yum install yum-utils device-mapper-persistent-data lvm2
# 添加仓库--联网操作
yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
# 安装
yum install --downloadonly --downloaddir=/root/yum/ docker-ce
yum install  docker-ce
# 启动docker服务并开机启动
systemctl start docker & systemctl enable docker
docker version
```

## 安装Kubernetes
```
# 配置yum源
vi /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=http://mirrors.aliyun.com/kubernetes/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=0
repo_gpgcheck=0
gpgkey=http://mirrors.aliyun.com/kubernetes/yum/doc/yum-key.gpg
        http://mirrors.aliyun.com/kubernetes/yum/doc/rpm-package-key.gpg

yum clean all
yum makecache

yum install --downloadonly --downloaddir=/root/yum/ kubelet kubeadm kubectl
yum install kubelet kubeadm kubectl

# 启动kubelet
systemctl enable kubelet

# 配置kubelet的cgroup drive
docker info | grep -i Cgroup
vi /etc/docker/daemon.json #手动创建
{
    "exec-opts": ["native.cgroupdriver=systemd"]
}
systemctl daemon-reload && systemctl enable docker && systemctl restart docker


# 初始化Master(需要翻墙拉取镜像)
kubeadm init

# kubeadm的配置文件
/usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf

# 修改配置文件需要重启kubelet
systemctl daemon-reload
systemctl restart kubelet

# 查看需要用到的镜像<不需要翻墙的做法>
kubeadm config images list
# 拉取镜像
kubeadm config images list |sed -e 's/^/docker pull /g' -e 's#k8s.gcr.io#mirrorgooglecontainers#g' |sh -x
# kube-apiserver拉取失败
docker pull registry.cn-hangzhou.aliyuncs.com/google_containers/kube-apiserver:v1.15.3
# coredns需要从其他仓库下载
docker pull coredns/coredns:1.3.1
# 修改tag,将镜像标记为k8s.gcr.io
docker images |grep mirrorgooglecontainers |awk '{print "docker tag ",$1":"$2,$1":"$2}' |sed -e 's#mirrorgooglecontainers#k8s.gcr.io#2' |sh -x
docker tag coredns/coredns:1.3.1 k8s.gcr.io/coredns:1.3.1
docker tag registry.cn-hangzhou.aliyuncs.com/google_containers/kube-apiserver:v1.15.3 k8s.gcr.io/kube-apiserver:v1.15.3
# 删除没用的镜像
docker images | grep mirrorgooglecontainers | awk '{print "docker rmi "  $1":"$2}' | sh -x
docker rmi registry.cn-hangzhou.aliyuncs.com/google_containers/kube-apiserver:v1.15.3 
docker rmi coredns/coredns:1.3.1
# 查看已有镜像
docker images
# 初始化指定k8s版本
kubeadm init --kubernetes-version=1.15.3
```

---

## 集群启动
```
# 需要创建另一个网卡,VMware直接手动添加一个网络适配器
ip a
cd /etc/sysconfig/network-scripts/
cp ./ifcfg-ens33 ./ifcfg-ens37
vi ifcfg-ens37
# Master(node01)启动
kubeadm init --pod-network-cidr=192.168.0.0/16 --kubernetes-version=v1.15.3 --apiserver-advertise-address=192.168.17.132

# 执行完上述命令后,会有提示,根据提示执行命令,同时记住join命令
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
# kubeadm join 192.168.17.132:6443 --token df7sdx.l8bag75r4lgvlgbk \
    --discovery-token-ca-cert-hash sha256:1cd49129a02067b6512288e543554416aeaa0765c563c2d13f303c7ad23ed111 

# 创建网络需要引入docker镜像,如果需要在内网部署,则提前save好镜像文件,版本与calico.yaml内版本一致
calico/node
calico/cni
calico/kube-controllers
calico/pod2daemon-flexvol

# 创建网络(calico.yaml可以下载下来,链接可能更新,可以在官网自行找到)
kubectl apply -f https://docs.projectcalico.org/v3.8/manifests/calico.yaml

# 重启/删除集群(删除.kube很重要)
kubectl reset
rm -rf $HOME/.kube
kubectl init
```

---

## 设置集群
```
# 将Master作为工作节点
kubectl taint nodes --all node-role.kubernetes.io/master-

# 将其他节点加入集群(其他节点执行join命令即可)
kubeadm join 192.168.17.132:6443 --token df7sdx.l8bag75r4lgvlgbk \
    --discovery-token-ca-cert-hash sha256:1cd49129a02067b6512288e543554416aeaa0765c563c2d13f303c7ad23ed111 

# 查看节点
kubectl get nodes

# 查看pod状态
kubectl get pod -n kube-system

# 查看所有pod状态
kubectl get pods -n kube-system
```

---

## kubeadm init参数
```
--apiserver-advertise-address string
API Server将要广播的监听地址。如指定为 `0.0.0.0` 将使用缺省的网卡地址。

--apiserver-bind-port int32     缺省值: 6443
API Server绑定的端口

--apiserver-cert-extra-sans stringSlice
可选的额外提供的证书主题别名（SANs）用于指定API Server的服务器证书。可以是IP地址也可以是DNS名称。

--cert-dir string     缺省值: "/etc/kubernetes/pki"
证书的存储路径。

--config string
kubeadm配置文件的路径。警告：配置文件的功能是实验性的。

--cri-socket string     缺省值: "/var/run/dockershim.sock"
指明要连接的CRI socket文件

--dry-run
不会应用任何改变；只会输出将要执行的操作。

--feature-gates string
键值对的集合，用来控制各种功能的开关。可选项有:
Auditing=true|false (当前为ALPHA状态 - 缺省值=false)
CoreDNS=true|false (缺省值=true)
DynamicKubeletConfig=true|false (当前为BETA状态 - 缺省值=false)

-h, --help
获取init命令的帮助信息

--ignore-preflight-errors stringSlice
忽视检查项错误列表，列表中的每一个检查项如发生错误将被展示输出为警告，而非错误。 例如: 'IsPrivilegedUser,Swap'. 如填写为 'all' 则将忽视所有的检查项错误。

--kubernetes-version string     缺省值: "stable-1"
为control plane选择一个特定的Kubernetes版本。

--node-name string
指定节点的名称。

--pod-network-cidr string
指明pod网络可以使用的IP地址段。 如果设置了这个参数，control plane将会为每一个节点自动分配CIDRs。

--service-cidr string     缺省值: "10.96.0.0/12"
为service的虚拟IP地址另外指定IP地址段

--service-dns-domain string     缺省值: "cluster.local"
为services另外指定域名, 例如： "myorg.internal".

--skip-token-print
不打印出由 `kubeadm init` 命令生成的默认令牌。

--token string
这个令牌用于建立主从节点间的双向受信链接。格式为 [a-z0-9]{6}\.[a-z0-9]{16} - 示例： abcdef.0123456789abcdef

--token-ttl duration     缺省值: 24h0m0s
令牌被自动删除前的可用时长 (示例： 1s, 2m, 3h). 如果设置为 '0', 令牌将永不过期。
```

---

## 镜像源
```
# 微软google gcr镜像源
#以gcr镜像为例，以下镜像无法直接拉取
docker pull gcr.io/google-containers/kube-apiserver:v1.15.2
#改为以下方式即可成功拉取：
docker pull gcr.azk8s.cn/google-containers/kube-apiserver:v1.15.2

# 微软coreos quay镜像源
#以coreos镜像为例，以下镜像无法直接拉取
docker pull quay.io/coreos/kube-state-metrics:v1.7.2
#改为以下方式即可成功拉取：
docker pull quay.azk8s.cn/coreos/kube-state-metrics:v1.7.2

# 微软dockerhub镜像源
#以下方式拉取镜像较慢
docker pull centos
#改为以下方式使用微软镜像源：
docker pull dockerhub.azk8s.cn/library/centos
docker pull dockerhub.azk8s.cn/willdockerhub/centos

# dockerhub google镜像源
#以gcr镜像为例，以下镜像无法直接拉取
docker pull gcr.io/google-containers/kube-apiserver:v1.15.2
#改为以下方式即可成功拉取：
docker pull mirrorgooglecontainers/google-containers/kube-apiserver:v1.15.2

# 阿里云google镜像源
#以gcr镜像为例，以下镜像无法直接拉取
docker pull gcr.io/google-containers/kube-apiserver:v1.15.2
#改为以下方式即可成功拉取：
docker pull registry.cn-hangzhou.aliyuncs.com/google_containers/kube-apiserver:v1.15.2
```

---

## 离线包制作
```
# 将上述操作产生的/root/yum文件打包,在内网机器进行createrepo
tar -zcvf yum.tgz /root/yum
# 内网机器操作
tar -zxvf yum.tgz
createrepo /root/yum
yum clean all
yum makecache
# 进行安装操作就行

# kubeadm所需要的镜像直接进行save,load
docker save -o kube-apiserver.tar kube-apiserver
docker load -i kube-apiserver.tar
```