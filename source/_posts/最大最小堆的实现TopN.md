---
title: 最大最小堆的实现TopN
date: 2021-02-20 15:35:01
categories: 算法
tags: learn
---

> 需要手撸的一道面试题

<!-- more -->

## 理解
```
堆->完全二叉树
对于完全二叉树
    有子节点的节点遵循下标小于等于一个定式值(length / 2 - 1)
左叶子节点 = (i + 1) << 1 - 1
右叶子节点 = (i + 1) << 1

最小堆(父节点一定小于等于子节点)
最大堆(父节点一定大于等于子节点)

遍历有叶子节点的节点
最小堆比较顺序:
    左子节点<父节点,进行交换
    右子节点<父节点,进行交换
最大堆比较顺序:
    左子节点>父节点,进行交换
    右子节点>父节点,进行交换

注意:
    添加新节点时需要重新构建堆
```

---

## 实现
```java
public class Heap {
    // 堆的存储结构 - 数组
    private int[] data;

    // 将一个数组传入构造方法，并转换成一个堆
    public Heap(int[] data) {
        this.data = data;
        buildHeap();
    }

    // 将数组转换成堆
    private void buildHeap() {
        for (int i = (data.length) / 2 - 1; i >= 0; i--) {
            // 对有子结点的元素heapify
            heapify(i, data.length);
        }
    }

    private void heapify(int i, int length) {
        // 获取左右结点的数组下标
        int l = left(i);
        int r = right(i);

        // 这是一个临时变量，表示 跟结点、左结点、右结点中最小的值的结点的下标
        int smallest = i;
        // 存在左结点，且左结点的值小于根结点的值
        if (l < length && data[l] < data[smallest])
            smallest = l;
        // 存在右结点，且右结点的值小于以上比较的较小值
        if (r < length && data[r] < data[smallest])
            smallest = r;
        // 左右结点的值都大于根节点，直接return，不做任何操作
        if (i == smallest)
            return;
        // 交换根节点和左右结点中最小的那个值，把根节点的值替换下去
        swap(i, smallest);
        // 由于替换后左右子树会被影响，所以要对受影响的子树再进行heapify
        heapify(smallest, length);
    }

    public void sort() {
        // 交换堆顶元素和最后一个元素,再重新heapify可以排序,堆排序
        for (int i = data.length - 1; i >= 0; i--) {
            swap(i, 0);
            heapify(0, i);
        }
    }

    // 获取右结点的数组下标
    private int right(int i) {
        return (i + 1) << 1;
    }

    // 获取左结点的数组下标
    private int left(int i) {
        return ((i + 1) << 1) - 1;
    }

    // 交换元素位置
    private void swap(int i, int j) {
        int tmp = data[i];
        data[i] = data[j];
        data[j] = tmp;
    }

    // 获取堆中的最小的元素，根元素
    public int getRoot() {
        return data[0];
    }

    // 替换根元素，并重新heapify
    public void setRoot(int root) {
        data[0] = root;
        heapify(0, data.length);
    }
}

// 测试,此时堆中是没有顺序的
public class HeapDemo {
    public static void main(String[] args) {
        // 源数据
        int[] data = {1, 6, 3, 4, 5, 2, 8, 9, 7, 10};

        // 获取Top5
        int[] top5 = topK(data, 5);

        for (int i = 0; i < top5.length; i++) {
            System.out.println(top5[i]);
        }
    }

    // 从data数组中获取最大的k个数
    private static int[] topK(int[] data, int k) {
        // 先取K个元素放入一个数组topk中
        int[] topk = new int[k];
        for (int i = 0; i < k; i++) {
            topk[i] = data[i];
        }

        Heap heap = new Heap(topk);

        // 从k开始，遍历data
        for (int i = k; i < data.length; i++) {
            heap.sort();
            int root = heap.getRoot();

            // 当数据大于堆中最小的数（根节点）时，替换堆中的根节点，再转换成堆
            if (data[i] > root) {
                heap.setRoot(data[i]);
            }
        }
        return topk;
    }
}
```