---
title: Mac基于M1芯片安装Tensorflow
date: 2021-04-21 21:00:08
categories: 搭建
tags: learn
---

> 机器学习Tensorflow环境搭建教程

<!-- more -->

## 安装工作
```
1.下载tensorflow
https://github.com/apple/tensorflow_macos/releases
选择tensorflow_macos-0.1alpha3.tar.gz

2.下载anaconda_arm
https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-MacOSX-arm64.sh

3.安装anaconda(安装后重启终端)
/bin/bash ./Miniforge3-MacOSX-arm64.sh

4.创建虚拟环境
conda create -n tensorflow_env python=3.8
# conda activate tensorflow_env 激活虚拟环境
# conda deactivate 退出虚拟环境

5.查看Python路径
which python

6.安装tensorflow
tar -zxvf tensorflow_macos-0.1alpha3.tar.gz -C /Users/xz/Local/Envs
libs="/Users/xz/Local/Envs/tensorflow_macos/arm64"
env="/Users/xz/miniforge3/envs/tensorflow_env"
pip install --upgrade pip wheel setuptools cached-property six
pip install --upgrade -t "$env/lib/python3.8/site-packages/" --no-dependencies --force "$libs/grpcio-1.33.2-cp38-cp38-macosx_11_0_arm64.whl"
pip install --upgrade -t "$env/lib/python3.8/site-packages/" --no-dependencies --force "$libs/h5py-2.10.0-cp38-cp38-macosx_11_0_arm64.whl"
pip install --upgrade -t "$env/lib/python3.8/site-packages/" --no-dependencies --force "$libs/numpy-1.18.5-cp38-cp38-macosx_11_0_arm64.whl"
pip install --upgrade -t "$env/lib/python3.8/site-packages/" --no-dependencies --force "$libs/tensorflow_addons_macos-0.1a3-cp38-cp38-macosx_11_0_arm64.whl"
pip install absl-py astunparse flatbuffers gast google_pasta keras_preprocessing opt_einsum protobuf tensorflow_estimator termcolor typing_extensions wrapt wheel tensorboard typeguard
pip install --upgrade -t "$env/lib/python3.8/site-packages/" --no-dependencies --force "$libs/tensorflow_macos-0.1a3-cp38-cp38-macosx_11_0_arm64.whl"
```

---

## 试验
```
# 注意是在虚拟环境下执行
python
import tensorflow
# 成功即证明安装成功
```
