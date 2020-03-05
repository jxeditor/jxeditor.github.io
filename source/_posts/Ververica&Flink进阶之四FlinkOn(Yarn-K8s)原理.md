---
title: Ververica&Flink进阶之四FlinkOn(Yarn|K8s)原理
date: 2019-05-29 15:13:45
categories: 大数据
tags: flink
---

> B站Flink教程视频观看

<!-- more -->

# Flink架构概览
```
Job层面
    DataStreamAPI,DataSetAPI,TableAPI,SQL编写Flink任务,生成StreamGraph和JobGraph
    JobGraph由算子组成,提交给Flink后可以以Local,Standalone,Yarn,K8s四种模式运行
    
JobManager层面
    将JobGraph转换成ExecutionGraph
    Scheduler组件负责Task的调度
    CK Coordinator组件负责协调整个任务的CK,包括CK的开始和完成
    Actor System与TM进行通信
    Recovery Metadata用于进行故障恢复时,可以从Metadata里面读取数据

TaskManager层面
    Memory & I/O Manager,内存I/O的管理
    Network Manager,用来对网络方面的管理
    Actor System,负责网络通信
    TaskManager被分成很多个TaskSlot,每个任务都要运行在一个TaskSlot里面,TaskSlot是调度资源里的最小单位
```

---

# Standalone模式
```
在Standalone模式下,Master和TaskManager可以运行在同一台机器上,也可以运行在不同的机器上

在Master进程中,Standalone ResourceManager的作用是对资源进行管理
当用户通过Flink Cluster Client将JobGraph提交给Master时,JobGraph先经过Dispatcher

当Dispatcher收到客户端的请求之后,生成一个JobManager
接着JobManager进程向Standalone ResourceManager申请资源,最终再启动TaskManager

TaskManager启动之后,会有一个注册的过程,注册之后JobManager再将具体的Task任务分发给这个TaskManager去执行
```

---

# Yarn
```
# Per-Job
首先Client提交Yarn App,比如JobGraph或者JARs

接下来Yarn的ResourceManager会申请第一个Container
这个Container通过Application Master启动进程
Application Master里面运行的是Flink程序
即Flink-Yarn ResourceManager和JobManager

最后Flink-Yarn ResourceManager向Yarn ResourceManager申请资源
当分配到资源后,启动TaskManager
TaskManager启动后向Flink-Yarn ResourceManager进行注册
注册成功后JobManager就会分配具体的任务给TaskManager开始执行

# Session
在Per Job模式中,执行完任务后整个资源就会释放,包括JobManager,TaskManager都全部退出
而Session模式则不一样,它的Dispatcher和ResourceManager是可以复用的
Session模式下,当Dispatcher在收到请求之后,会启动JobManager(A),让JobManager(A)来完成启动TaskManager
接着会启动JobManager(B)和对应的TaskManager的运行
当A、B任务运行完成后,资源并不会释放
Session模式也称为多线程模式,其特点是资源会一直存在不会释放
多个JobManager共享一个Dispatcher,而且还共享Flink-YARN ResourceManager

# 应用场景
Session模式和Per Job模式的应用场景不一样
Per Job模式比较适合那种对启动时间不敏感,运行时间较长的任务
Seesion模式适合短时间运行的任务,一般是批处理任务
若用Per Job模式去运行短时间的任务,那就需要频繁的申请资源
运行结束后,还需要资源释放,下次还需再重新申请资源才能运行
显然,这种任务会频繁启停的情况不适用于Per Job模式,更适合用Session模式
```

---

# K8S
```
Kubernetes 是 Google 开源的容器集群管理系统，其提供应用部署、维护、扩展机制等功能，利用 Kubernetes 能方便地管理跨机器运行容器化的应用。
Kubernetes 和 Yarn 相比，相当于下一代的资源管理系统，但是它的能力远远不止这些。

# Kubernetes–基本概念
Kubernetes（k8s）中的 Master 节点，负责管理整个集群，含有一个集群的资源数据访问入口，还包含一个 Etcd 高可用键值存储服务。

Master 中运行着 API Server，Controller Manager 及 Scheduler 服务。

Node 为集群的一个操作单元，是 Pod 运行的宿主机。
Node 节点里包含一个 agent 进程，能够维护和管理该 Node 上的所有容器的创建、启停等。
Node 还含有一个服务端 kube-proxy，用于服务发现、反向代理和负载均衡。
Node 底层含有 docker engine，docker 引擎主要负责本机容器的创建和管理工作。

Pod 运行于 Node 节点上，是若干相关容器的组合。在 K8s 里面 Pod 是创建、调度和管理的最小单位。

# Kubernetes–架构图
Kubernetes 的架构如图所示，从这个图里面能看出 Kubernetes 的整个运行过程。

API Server 相当于用户的一个请求入口，用户可以提交命令给 Etcd，这时会将这些请求存储到 Etcd 里面去。

Etcd 是一个键值存储，负责将任务分配给具体的机器，在每个节点上的 Kubelet 会找到对应的 container 在本机上运行。

用户可以提交一个 Replication Controller 资源描述，Replication Controller 会监视集群中的容器并保持数量；
用户也可以提交 service 描述文件，并由 kube proxy 负责具体工作的流量转发。

# Kubernetes–核心概念
Kubernetes 中比较重要的概念有：
    Replication Controller (RC) 用来管理 Pod 的副本。
    RC 确保任何时候 Kubernetes 集群中有指定数量的 pod 副本(replicas) 在运行， 如果少于指定数量的 pod 副本，RC 会启动新的 Container，反之会杀死多余的以保证数量不变。
    
    Service 提供了一个统一的服务访问入口以及服务代理和发现机制
    
    Persistent Volume(PV) 和 Persistent Volume Claim(PVC) 用于数据的持久化存储。
    
    ConfigMap 是指存储用户程序的配置文件，其后端存储是基于 Etcd。

# Flink on Kubernetes–架构
Flink on Kubernetes 的架构如图所示，Flink 任务在 Kubernetes 上运行的步骤有：

首先往 Kubernetes 集群提交了资源描述文件后，会启动 Master 和 Worker 的 container。

Master Container 中会启动 Flink Master Process，包含 Flink-Container ResourceManager、JobManager 和 Program Runner。

Worker Container 会启动 TaskManager，并向负责资源管理的 ResourceManager 进行注册，注册完成之后，由 JobManager 将具体的任务分给 Container，再由 Container 去执行。

需要说明的是，在 Flink 里的 Master 和 Worker 都是一个镜像，只是脚本的命令不一样，通过参数来选择启动 master 还是启动 Worker。

# Flink on Kubernetes–JobManager
JobManager 的执行过程分为两步:
    首先，JobManager 通过 Deployment 进行描述，保证 1 个副本的 Container 运行 JobManager，可以定义一个标签，例如 flink-jobmanager。
    
    其次，还需要定义一个 JobManager Service，通过 service name 和 port 暴露 JobManager 服务，通过标签选择对应的 pods。

# Flink on Kubernetes–TaskManager
TaskManager 也是通过 Deployment 来进行描述，保证 n 个副本的 Container 运行 TaskManager，同时也需要定义一个标签，例如 flink-taskmanager。

对于 JobManager 和 TaskManager 运行过程中需要的一些配置文件，如：flink-conf.yaml、hdfs-site.xml、core-site.xml，可以通过将它们定义为 ConfigMap 来实现配置的传递和读取。

# Flink on Kubernetes–交互
整个交互的流程比较简单，用户往 Kubernetes 集群提交定义好的资源描述文件即可，例如 deployment、configmap、service 等描述。
后续的事情就交给 Kubernetes 集群自动完成。Kubernetes 集群会按照定义好的描述来启动 pod，运行用户程序。
各个组件的具体工作如下：
    Service: 通过标签(label selector)找到 job manager 的 pod 暴露服务。
    Deployment：保证 n 个副本的 container 运行 JM/TM，应用升级策略。
    ConfigMap：在每个 pod 上通过挂载 /etc/flink 目录，包含 flink-conf.yaml 内容。
```