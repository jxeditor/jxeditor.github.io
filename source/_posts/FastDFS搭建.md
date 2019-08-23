---
title: FastDFS搭建
date: 2019-05-20 14:24:27
categories: 搭建
tags: oss
---

> FastDFS是一款开源的轻量级分布式文件系统，纯C实现，支持Linux、FreeBSD等Unix系统。

<!-- more -->

## 安装包需要
- fastdfs-5.11.tar.gz
- fastdfs-nginx-module-master.zip
- libfastcommon-1.0.39.tar.gz
- nginx-1.15.8.tar.gz
- pcre-8.43.tar.gz

---

## 安装环境
两台服务器,IP192.168.1.128和IP192.168.1.129
```
mkdir /home/fdfs/fastdfs
cd /home/fdfs/fastdfs

tar xf libfastcommon-1.0.39.tar.gz
cd libfastcommon-1.0.39
./make.sh
./make.sh install

tar xf fastdfs-5.11.tar.gz 
cd fastdfs-5.11
./make.sh
./make.sh install
```

## 配置文件
配置文件默认在/etc/fdfs下
默认脚本在/etc/init.d下
```
# 创建必须的目录,用来存放数据
mkdir -p /home/fdfs/fastdfs/data/fdfs_storage/base
mkdir -p /home/fdfs/fastdfs/data/fdfs_storage/storage0
mkdir -p /home/fdfs/fastdfs/data/fdfs_storage/storage1
mkdir -p /home/fdfs/fastdfs/data/fdfs_tracker

# 复制配置文件
cd /etc/fdfs/
cp storage.conf.sample storage.conf
cp tracker.conf.sample tracker.conf

# 配置tracker.conf
vi tracker.conf
base_path=/home/fdfs/fastdfs/data/fdfs_tracker
#上传文件时选择group的方法
#0:轮询，1:指定组，2:选择剩余空间最大
store_lookup=2
#上传文件时选择server的方法
#0:轮询，1:按IP地址排序，2:通过权重排序
store_server=0

# 配置storage.conf
vi storage.conf
base_path=/home/fdfs/fastdfs/data/fdfs_storage/base
store_path_count=2
store_path0=/home/fdfs/fastdfs/data/fdfs_storage/storage0
store_path1=/home/fdfs/fastdfs/data/fdfs_storage/storage1
#跟踪服务器
tracker_server=192.168.1.222:22122
tracker_server=192.168.1.233:22122

# 启动服务
/etc/init.d/fdfs_trackerd start
/etc/init.d/fdfs_storaged start

# 查看服务是否启动
ps -ef|grep fdfs
netstat -nltp
```

---

## 测试FastDFS
```
mkdir -p /home/fdfs/fastdfs/data/client

# 配置client文件
cd /etc/fdfs
cp client.conf.sample client.conf
vi client.conf
#存放日志目录
base_path=/home/fdfs/fastdfs/data/client
#跟踪服务器
tracker_server=192.168.1.128:22122
tracker_server=192.168.1.129:22122

# 上传文件
echo "12345678" >> /home/fdfs/1.txt
fdfs_upload_file /etc/fdfs/client.conf /home/fdfs/1.txt
group1/M00/00/00/wKgBgF1bnnqAGbnKAAAACZ8EQKA111.txt

# 下载文件
fdfs_download_file /etc/fdfs/client.conf group1/M00/00/00/wKgBgF1bnnqAGbnKAAAACZ8EQKA111.txt

# 查看文件信息
fdfs_file_info /etc/fdfs/client.conf group1/M00/00/00/wKgBgF1bnnqAGbnKAAAACZ8EQKA111.txt

# 追加文件
echo "hello" >> /home/fdfs/2.txt
fdfs_upload_appender /etc/fdfs/client.conf /home/fdfs/1.txt
group1/M01/00/00/wKgBgF1bnwaEcGKzAAAAAJ8EQKA863.txt
fdfs_append_file /etc/fdfs/client.conf group1/M01/00/00/wKgBgF1bnwaEcGKzAAAAAJ8EQKA863.txt /home/fdfs/2.txt

# 删除文件
fdfs_delete_file /etc/fdfs/client.conf group1/M01/00/00/wKgBgF1bnwaEcGKzAAAAAJ8EQKA863.txt

# 查看集群
fdfs_monitor /etc/fdfs/client.conf
```

---

## 配置Nginx模块
```
# 创建用户
useradd -s /sbin/nologin -M nginx

# 安装pcre
tar xf pcre-8.43.tar.gz
cd pcre-8.43
./configure --prefix=/home/fdfs/fastdfs/data/pcre # 报错则yum install -y gcc-c++
make && make install

# 安装nginx
yum install zlib-devel openssl-devel
unzip fastdfs-nginx-module-master.zip 
tar xf nginx-1.15.8.tar.gz 
cd nginx-1.15.8/
./configure --prefix=/home/fdfs/fastdfs/data/nginx \
--with-pcre=/home/fdfs/fastdfs/pcre-8.43 \
--user=nginx \
--group=nginx \
--with-http_ssl_module \
--with-http_realip_module \
--with-http_stub_status_module \
--add-module=/home/fdfs/fastdfs/fastdfs-nginx-module-master/src
# 执行报错,修改fastdfs-nginx-module-master/src/config
ngx_module_incs="/usr/include/fastdfs /usr/include/fastcommon"
CORE_INCS="$CORE_INCS /usr/include/fastdfs /usr/include/fastcommon"
make & make install

# 拷贝配置文件
cd /home/fdfs/fastdfs/fastdfs-nginx-module-master/src
cp mod_fastdfs.conf /etc/fdfs/
cd /home/fdfs/fastdfs/fastdfs-5.11/conf
cp anti-steal.jpg http.conf mime.types /etc/fdfs/

# 修改nginx.conf
vi /home/fdfs/fastdfs/data/nginx/conf/nginx.conf
location ~ /group[0-9]/M00 {
    ngx_fastdfs_module;
}

# 修改mod_fastdfs.conf
vi /etc/fdfs/mod_fastdfs.conf
tracker_server=192.168.1.128:22122
tracker_server=192.168.1.129:22122
url_have_group_name = true
store_path_count=2
store_path0=/home/fdfs/fastdfs/data/fdfs_storage/storage0
store_path1=/home/fdfs/fastdfs/data/fdfs_storage/storage1

# 启动nginx
/home/fdfs/fastdfs/data/nginx/sbin/nginx

# 启动报错,查看error.log发现没有权限
chmod 777 -R /home

# 路径不应该放在home底下的,或者说不应该放到其他用户目录下
# 最好是重装,上述修改权限的方式并不可取
```

