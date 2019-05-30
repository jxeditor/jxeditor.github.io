# 原始文件

## 在新电脑进行Git操作
- 本地创建文件夹
- 进入文件夹，右键git bash here
- git config --global user.email "you@example.com"
- git config --global user.name "Your Name"
- git init
- git remote add origin https://github.com/jxeditor/jxeditor.github.io.git
- git add *
- git commit -m "注释" 
- git push origin 分支

## 安装hexo
- 去官网下载[node.js](https://nodejs.org/en/)
- npm install -g hexo-cli
- npm install hexo-deployer-git --save
- 修改目录配置文件_config.yml的deploy
- hexo g 生成静态页面
- hexo s 启动本地服务
- hexo d 部署到远程

## 解决push总是输入用户名密码
- ssh-keygen -t rsa -C "账号"
- 复制~/.ssh/id_rsa.pub内容
- 添加到GitHub的ssh key
- 修改git remote的模式
- git remote -v
- 将https方式修改成主机:仓库的形式
- git remote add origin https://github.com/jxeditor/jxeditor.github.io.git
- git remote rm origin
- git remote add origin git@github.com:jxeditor/jxeditor.github.io.git

## 当push时项目中含有其他子项目时
- 删除子项目的.git文件夹
- git rm --cached file_path
- git add file_path
- git commit -m "注释"
- git push origin 分支

## 为了让本地和远程的分支统一
本地和远程默认都是master分支
本地创建和切换分支
- git branch 分支
- git checkout 分支

## 出现error：failed to push some refs ...
原因是远程分支有文件，但是本地进行文件操作时，并没有去拉去远程文件
- git pull origin 分支
- 进行一些列修改
- git add *
- git commit -m "注释"
- git push origin 分支

## 本地分支与远程分支不一致，怎么push
- git push origin 本地分支:远程分支
