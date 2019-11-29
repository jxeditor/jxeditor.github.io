---
title: KMeans算法实现逻辑及代码
date: 2019-11-29 10:58:09
categories: 算法
tags: algorithm
---

> 将KMeans算法整个逻辑梳理出来,容易理解,并实现代码

<!-- more -->

## 什么是KMeans
**注意：**需要与KNN区分开来
```
Kmeans是聚类算法的一种,是一种迭代求解的聚类分析算法。
其步骤是随机选取K个对象作为初始的聚类中心，然后计算每个对象与各个种子聚类中心之间的距离，把每个对象分配给距离它最近的聚类中心。
聚类中心以及分配给它们的对象就代表一个聚类。
每分配一个样本，聚类的聚类中心会根据聚类中现有的对象被重新计算。
这个过程将不断重复直到满足某个终止条件。
终止条件可以是没有（或最小数目）对象被重新分配给不同的聚类，没有（或最小数目）聚类中心再发生变化，误差平方和局部最小。
```

---

## 实现步骤
```
1.选取K个类中心
迭代{
    2.计算每个点到K个类中心的距离
    3.把数据点分配给距离最近的一个类中心
    4.计算新的类中心(对该类中的所有点取均值)
}
5.满足终止条件后终止迭代
    a.不再有重新分配
    b.最大迭代数
    c.所有类中心移动小于某一值
```

---

## 实现代码
### Point类(数据点)
```java
package com.test.algorithm.kmeans;

import com.alibaba.fastjson.JSONObject;

public class Point {
    private float[] localArray;
    private int id;
    private int clusterId;  // 类中心的ID(记录最近的类中心)
    private float dist;     // 到类中心的距离(记录最近的类中心)
    private Point clusterPoint;//中心点信息

    public Point getClusterPoint() {
        return clusterPoint;
    }

    public void setClusterPoint(Point clusterPoint) {
        this.clusterPoint = clusterPoint;
    }

    public float[] getLocalArray() {
        return localArray;
    }

    public void setLocalArray(float[] localArray) {
        this.localArray = localArray;
    }

    public int getClusterId() {
        return clusterId;
    }


    public Point(int id, float[] localArray) {
        this.id = id;
        this.localArray = localArray;
    }

    public Point(float[] localArray) {
        this.id = -1; //表示不属于任意一个类
        this.localArray = localArray;
    }

    public float[] getlocalArray() {
        return localArray;
    }

    public int getId() {
        return id;
    }

    public void setClusterId(int clusterId) {
        this.clusterId = clusterId;
    }

    public int getClusterid() {
        return clusterId;
    }

    public float getDist() {
        return dist;
    }

    public void setDist(float dist) {
        this.dist = dist;
    }

    @Override
    public String toString() {
        return JSONObject.toJSONString(this);
    }

    public void setId(int id) {
        this.id = id;
    }


    @Override
    public boolean equals(Object obj) {
        if (obj == null || getClass() != obj.getClass())
            return false;

        Point point = (Point) obj;
        if (point.localArray.length != localArray.length)
            return false;

        for (int i = 0; i < localArray.length; i++) {
            if (Float.compare(point.localArray[i], localArray[i]) != 0) {
                return false;
            }
        }
        return true;
    }

    @Override
    public int hashCode() {
        float x = localArray[0];
        float y = localArray[localArray.length - 1];
        long temp = x != +0.0d ? Double.doubleToLongBits(x) : 0L;
        int result = (int) (temp ^ (temp >>> 32));
        temp = y != +0.0d ? Double.doubleToLongBits(y) : 0L;
        result = 31 * result + (int) (temp ^ (temp >>> 32));
        return result;
    }
}
```

### Cluster类(类中心)
```java
package com.test.algorithm.kmeans;

import java.util.ArrayList;
import java.util.List;

public class Cluster {
    private int id;// 标识
    private Point center;// 中心
    private List<Point> members = new ArrayList<Point>();// 成员

    public Cluster(int id, Point center) {
        this.id = id;
        this.center = center;
    }

    public Cluster(int id, Point center, List<Point> members) {
        this.id = id;
        this.center = center;
        this.members = members;
    }

    public void addPoint(Point newPoint) {
        if (!members.contains(newPoint)) {
            members.add(newPoint);
        } else {
            System.out.println("样本数据点 {" + newPoint.toString() + "} 已经存在！");
        }
    }

    public int getId() {
        return id;
    }

    public Point getCenter() {
        return center;
    }

    public void setCenter(Point center) {
        this.center = center;
    }

    public List<Point> getMembers() {
        return members;
    }

    @Override
    public String toString() {
        String toString = "Cluster \n" + "Cluster_id=" + this.id + ", center:{" + this.center.toString() + "}";
        for (Point point : members) {
            toString += "\n" + point.toString();
        }
        return toString + "\n";
    }
}
```

### DistanceCompute类(求距离工具)
```java
package com.test.algorithm.kmeans;

public class DistanceCompute {
    /**
     * 求欧式距离
     */
    public double getEuclideanDis(Point p1, Point p2) {
        double count_dis = 0;
        float[] p1_local_array = p1.getlocalArray();
        float[] p2_local_array = p2.getlocalArray();
 
        if (p1_local_array.length != p2_local_array.length) {
            throw new IllegalArgumentException("length of array must be equal!");
        }
 
        for (int i = 0; i < p1_local_array.length; i++) {
            count_dis += Math.pow(p1_local_array[i] - p2_local_array[i], 2);
        }
 
        return Math.sqrt(count_dis);
    }
}
```

### KMeansRun类(算法执行类)
```java
package com.test.algorithm.kmeans;

import java.util.*;

public class KMeansRun {
    private int kNum;                             //类中心的个数
    private int iterNum = 10;                     //迭代次数

    private int iterMaxTimes = 100000;            //单次迭代最大运行次数
    private int iterRunTimes = 0;                 //单次迭代实际运行次数
    private float disDiff = (float) 0.01;         //单次迭代终止条件，两次运行中类中心的距离差

    private List<float[]> original_data = null;    //用于存放，原始数据集
    private static List<Point> pointList = null;  //用于存放，原始数据集所构建的点集
    private DistanceCompute disC = new DistanceCompute();
    private int len = 0;                          //用于记录每个数据点的维度

    public KMeansRun(int k, List<float[]> original_data) {
        this.kNum = k;
        this.original_data = original_data;
        this.len = original_data.get(0).length;
        //检查规范
        check();
        //初始化点集
        init();
    }

    /**
     * 检查规范
     */
    private void check() {
        if (kNum == 0) {
            throw new IllegalArgumentException("k must be the number > 0");
        }
        if (original_data == null) {
            throw new IllegalArgumentException("program can't get real data");
        }
    }

    /**
     * 初始化数据集，把数组转化为Point类型。
     */
    private void init() {
        pointList = new ArrayList<Point>();
        for (int i = 0, j = original_data.size(); i < j; i++) {
            pointList.add(new Point(i, original_data.get(i)));
        }
    }

    /**
     * 随机选取中心点，构建成中心类。
     */
    private Set<Cluster> chooseCenterCluster() {
        Set<Cluster> clusterSet = new HashSet<Cluster>();
        Random random = new Random();
        for (int id = 0; id < kNum; ) {
            Point point = pointList.get(random.nextInt(pointList.size()));
            // 用于标记是否已经选择过该数据
            boolean flag = true;
            for (Cluster cluster : clusterSet) {
                if (cluster.getCenter().equals(point)) {
                    flag = false;
                }
            }
            // 如果随机选取的点没有被选中过，则生成一个类中心
            if (flag) {
                Cluster cluster = new Cluster(id, point);
                clusterSet.add(cluster);
                id++;
            }
        }
        return clusterSet;
    }

    /**
     * 为每个点分配一个类！
     * 为每个点选择最近的中心点,以及到中心点的位置
     * 然后为中心点设置成员,成员就是那些选择了该中心点的点
     */
    public void cluster(Set<Cluster> clusterSet) {
        // 计算每个点到K个中心的距离，并且为每个点标记类别号
        for (Point point : pointList) {
            float min_dis = Integer.MAX_VALUE;
            for (Cluster cluster : clusterSet) {
                float tmp_dis = (float) Math.min(disC.getEuclideanDis(point, cluster.getCenter()), min_dis);
                if (tmp_dis != min_dis) {
                    min_dis = tmp_dis;
                    point.setClusterId(cluster.getId());
                    point.setDist(min_dis);
                }
            }
        }
        // 新清除原来所有的类中成员。把所有的点，分别加入每个类别
        for (Cluster cluster : clusterSet) {
            cluster.getMembers().clear();
            for (Point point : pointList) {
                if (point.getClusterid() == cluster.getId()) {
                    cluster.addPoint(point);
                }
            }
        }
    }

    /**
     * 计算每个类的中心位置！
     */
    public boolean calculateCenter(Set<Cluster> clusterSet) {
        boolean ifNeedIter = false;
        for (Cluster cluster : clusterSet) {
            List<Point> point_list = cluster.getMembers();
            float[] sumAll = new float[len];
            // 所有点，对应各个维度进行求和
            for (int i = 0; i < len; i++) {
                for (int j = 0; j < point_list.size(); j++) {
                    sumAll[i] += point_list.get(j).getlocalArray()[i];
                }
            }
            // 计算平均值
            for (int i = 0; i < sumAll.length; i++) {
                sumAll[i] = (float) sumAll[i] / point_list.size();
            }
            // 计算两个新、旧中心的距离，如果任意一个类中心移动的距离大于dis_diff则继续迭代。
            if (disC.getEuclideanDis(cluster.getCenter(), new Point(sumAll)) > disDiff) {
                ifNeedIter = true;
            }
            // 设置新的类中心位置
            cluster.setCenter(new Point(sumAll));
        }
        return ifNeedIter;
    }

    /**
     * 运行 k-means
     */
    public Set<Cluster> run() {
        Set<Cluster> clusterSet = chooseCenterCluster();
        boolean ifNeedIter = true;
        while (ifNeedIter) {
            cluster(clusterSet);
            ifNeedIter = calculateCenter(clusterSet);
            iterRunTimes++;
        }
        return clusterSet;
    }

    /**
     * 返回实际运行次数
     */
    public int getIterTimes() {
        return iterRunTimes;
    }
}
```

### Main类(主函数)
```java
package com.test.algorithm.kmeans;

import java.util.ArrayList;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        ArrayList<float[]> dataSet = new ArrayList<float[]>();
        dataSet.add(new float[]{1, 2, 3});
        dataSet.add(new float[]{3, 3, 3});
        dataSet.add(new float[]{3, 4, 4});
        dataSet.add(new float[]{5, 6, 5});
        dataSet.add(new float[]{8, 9, 6});
        dataSet.add(new float[]{4, 5, 4});
        dataSet.add(new float[]{6, 4, 2});
        dataSet.add(new float[]{3, 9, 7});
        dataSet.add(new float[]{5, 9, 8});
        dataSet.add(new float[]{4, 2, 10});
        dataSet.add(new float[]{1, 9, 12});
        dataSet.add(new float[]{7, 8, 112});
        dataSet.add(new float[]{7, 8, 4});

        KMeansRun kRun = new KMeansRun(3, dataSet);
        Set<Cluster> clusterSet = kRun.run();
        System.out.println("单次迭代运行次数：" + kRun.getIterTimes());
        for (Cluster cluster : clusterSet) {
            System.out.println(cluster);
        }
    }
}
```