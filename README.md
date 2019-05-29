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
