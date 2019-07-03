---
title: Hexo+Github搭建个人Blog
date: 2016-04-29 21:59:01
categories: 搭建
tags: 
    - hexo
    - git
---
## 1.环境安装
- 下载Git
- 下载Node.js
- 下载HexoEditor
- **注意：**Git，Node.js和HexoEditor都已经下载好在[Github](https://github.com/jxeditor/jxeditor.github.io)上

<!-- more -->
## 2.Hexo安装命令与免密配置
- 进入blog的文件夹
- 右键Git Bash Here
- 执行下列命令

```bash
# 根据具体node的安装目录而定，设置全局module和缓存
npm config set prefix "C:/Program Files/nodejs/npm_global"
npm config set cache "C:/Program Files/nodejs/npm_cache"
# 设置系统变量和用户变量（Windows）
系统变量NODE_PATH=C:/Program Files/nodejs/npm_global/node_modules
用户变量PATH=C:/Program Files/nodejs/npm_global

# 如果默认存放在C盘，可以没有权限，需要管理员权限运行
npm install -g hexo-cli
npm install hexo-deployer-git --save

# 进入Blog目录，下载hexo
npm install hexo --save

# 免密配置
ssh-keygen -t rsa -C "账号"
# 复制~/.ssh/id_rsa.pub内容
# 添加到GitHub的ssh key
```

## 3.启动Hexo
```bash
# 修改目录配置文件_config.yml的deploy
deploy:
  type: git
  repository: git@github.com:jxeditor/jxeditor.github.io.git
  branch: master
hexo g # 生成静态页面
hexo s # 启动本地服务
hexo d # 部署到远程
```

## 4.Git初始化并将项目推送到分支
```bash
# 将项目推送到GitHub的分支
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
git init
git remote add origin https://github.com/jxeditor/jxeditor.github.io.git

# 修改git remote的模式
git remote -v
# 将https方式修改成主机:仓库的形式
git remote add origin https://github.com/jxeditor/jxeditor.github.io.git
git remote rm origin
git remote add origin git@github.com:jxeditor/jxeditor.github.io.git

git pull origin 远程分支 # 远程分支没有可以不进行拉取
# 进行一系列操作
git add *
git commit -m "注释"
git push origin 本地分支:远程分支
```

## 5.Git进行push时项目含有子项目
```bash
# 删除子项目的.git文件夹
git rm --cached file_path
git add file_path
git commit -m "注释"
git push origin 分支
```

## 6.Git新建切换分支
```bash
git branch 分支
git checkout 分支
```

## 7.Git出现error:failed to push some refs ...
```
# 原因是远程分支有文件，但是本地进行文件操作时，并没有去拉去远程文件
git pull origin 分支
# 进行一系列修改
git add *
git commit -m "注释"
git push origin 分支
```

## 8.Git大文件上传
```bash
git lfs install
git lfs track "*.psd" # 追踪规则，后缀psd文件超过限制
git add .gitattributes
git add file.psd
git commit -m "Add design file"
git push origin 本地分支:远程分支
```
