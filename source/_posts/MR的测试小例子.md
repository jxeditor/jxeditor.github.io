---
title: MR的测试小例子
date: 2017-09-24 09:33:59
categories: 大数据
tags: mr
---
> 入门测试,测试数据可能得自己看代码捋一捋,挺有意思的

<!-- more -->
## 递归关系物品分类
```java
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.io.LongWritable;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Job;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;
import org.apache.hadoop.mapreduce.lib.input.FileInputFormat;
import org.apache.hadoop.mapreduce.lib.output.FileOutputFormat;
import org.apache.hadoop.util.Tool;
import org.apache.hadoop.util.ToolRunner;
import org.apache.log4j.LogManager;
import org.apache.log4j.Logger;
import org.apache.log4j.PropertyConfigurator;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class RelationDemo implements Tool {
    public static class RelationMapper extends Mapper<LongWritable, Text, Text, Text> {

        Text k = new Text();
        Text v = new Text();

        @Override
        protected void map(LongWritable key, Text value, Context context) throws IOException, InterruptedException {
            String line = value.toString();
            String[] cp = line.split("\t");
            // 1    0   家电
            // 0    1_家电
            k.set(cp[1]);
            v.set(cp[0] + "_" + cp[2]);
            context.write(k, v);
        }
    }

    public static class RelationReducer extends Reducer<Text, Text, Text, Text> {
        Text k = new Text();
        Text v = new Text();
        Map<String, List<String>> relaMap = new TreeMap<>();

        @Override
        protected void reduce(Text key, Iterable<Text> values, Context context) throws IOException, InterruptedException {
            // 0    <1_家电,2_服装,3_食品>
            // 1    <4_洗衣机,5_冰箱>
            // 2    <6_男装,7_女装>
            // 3    <8_零食,9_水果>
            // 4    <10_美的>
            // 5    <11_海尔>
            // 6    <12_衬衫>
            // 7    <13_蓬蓬裙>
            // 8    <14_牛奶>
            // 14   <15_特仑苏>
            List<String> list = new ArrayList<>();
            for (Text value : values) {
                list.add(value.toString());
            }
            relaMap.put(key.toString(), list);
        }

        @Override
        protected void cleanup(Context context) throws IOException, InterruptedException {
            List<String> list = relaMap.get("0");
            for (String c : list) {
                String name = c.split("_")[1];
                k.set(name);
                String str = relation(c);
                String[] split = str.split(name);
                for (String s : split) {
                    if (s.length() != 0) {
                        v.set(s.trim());
                        context.write(k, v);
                    }
                }
            }
        }

        // 传进来的是1_家电
        public String relation(String str) {
            // 考虑物品名称含有key值,不好进行切割
            // 所以将带编号的key一起传进,有待优化
            String result = "";
            String[] info = str.split("_");
            String index = info[0];
            String name = info[1];
            if (relaMap.containsKey(index)) {
                List<String> child = relaMap.get(index);
                for (String s : child) {
                    result += name + " " + relation(s) + " ";
                }
            } else {
                return name;
            }
            return result;
        }
    }

    @Override
    public int run(String[] args) throws Exception {
        Configuration conf = getConf();

        Job job = Job.getInstance(conf);
        job.setJarByClass(RelationDemo.class);

        // 设置输入输出参数
        setInputAndOutput(job, conf, args);

        // 设置输入
        job.setMapperClass(RelationMapper.class);
        job.setMapOutputKeyClass(Text.class);
        job.setMapOutputValueClass(Text.class);

        // 设置输出
        job.setReducerClass(RelationReducer.class);
        job.setOutputKeyClass(Text.class);
        job.setOutputValueClass(Text.class);

        // 提交并退出
        boolean res = job.waitForCompletion(true);
        return res ? 0 : 1;
    }

    @Override
    public void setConf(Configuration conf) {
    }

    @Override
    public Configuration getConf() {
        return new Configuration();
    }

    public static void setInputAndOutput(Job job, Configuration conf, String[] args) {

        if (args.length != 2) {
            System.out.println("usage:yarn jar /*.jar package.className inputPath outputPath ");
            return;
        }
        try {
            FileInputFormat.addInputPath(job, new Path(args[0]));

            // 获取文件系统
            FileSystem fs = FileSystem.get(conf);
            Path outputPath = new Path(args[1]);
            if (fs.exists(outputPath)) {
                fs.delete(outputPath, true);
            }

            FileOutputFormat.setOutputPath(job, new Path(args[1]));
        } catch (Exception e) {
            e.printStackTrace();
        }

    }

    // 主方法
    public static void main(String[] args) throws Exception {
        PropertyConfigurator.configure("D:\\log4j.properties");// 加载.properties文件
        Logger logger = LogManager.getLogger("MyTestLog");
        int isOk = ToolRunner.run(new Configuration(), new RelationDemo(), args);
        System.exit(isOk);
    }
}
```

## 求解共同朋友
```
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.io.LongWritable;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Job;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;
import org.apache.hadoop.mapreduce.lib.input.FileInputFormat;
import org.apache.hadoop.mapreduce.lib.jobcontrol.ControlledJob;
import org.apache.hadoop.mapreduce.lib.jobcontrol.JobControl;
import org.apache.hadoop.mapreduce.lib.output.FileOutputFormat;

import java.io.IOException;
import java.util.Arrays;

// 求解共同好友
public class FridensDemo {
    public static class StepOneMapper extends Mapper<LongWritable, Text, Text, Text> {
        Text k = new Text();
        Text v = new Text();

        @Override
        protected void map(LongWritable key, Text value, Context context) throws IOException, InterruptedException {
            // <A B,C,D,F,E,O>
            String[] fields = value.toString().split(":");
            String person = fields[0];
            String[] friends = fields[1].split(",");
            for (String friend : friends) {
                k.set(friend);
                v.set(person);
                context.write(k, v);
            }

            // 输出多个<firend,person>
        }
    }

    public static class StepOneReducer extends Reducer<Text, Text, Text, Text> {
        Text v = new Text();

        @Override
        protected void reduce(Text key, Iterable<Text> values, Context context) throws IOException, InterruptedException {
            // 接收,就是一个friend,多个person
            StringBuilder sb = new StringBuilder();
            for (Text value : values) {
                if (sb.length() != 0) {
                    sb.append(",");
                }
                sb.append(value.toString());
            }
            v.set(sb.toString());
            // 人,人,人..
            context.write(key, v);
        }
    }

    public static class StepTwoMapper extends Mapper<LongWritable, Text, Text, Text> {
        Text k = new Text();
        Text v = new Text();

        @Override
        protected void map(LongWritable key, Text value, Context context) throws IOException, InterruptedException {
            // <好友 人,人,人,人...>
            String[] fields = value.toString().split("\t");
            String friend = fields[0];
            String[] persons = fields[1].split(",");

            // 排序
            Arrays.sort(persons);

            // 输出<人-人,好友>
            for (int i = 0; i < persons.length - 2; i++) {
                for (int j = i + 1; j < persons.length - 1; j++) {
                    k.set(persons[i] + "-" + persons[j]);
                    v.set(friend);
                    context.write(k, v);
                }
            }
        }
    }

    public static class StepTwoReducer extends Reducer<Text, Text, Text, Text> {
        Text v = new Text();

        @Override
        protected void reduce(Text key, Iterable<Text> values, Context context) throws IOException, InterruptedException {
            // 接收多个<人-人,好友>对
            StringBuilder sb = new StringBuilder();
            for (Text value : values) {
                if (sb.length() != 0) {
                    sb.append(",");
                }
                sb.append(value.toString());
            }
            // 人,人,人..
            v.set(sb.toString());
            context.write(key, v);
        }
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        Configuration conf = new Configuration();
        Job oneJob = Job.getInstance(conf);

        oneJob.setJarByClass(FridensDemo.class);

        oneJob.setMapperClass(StepOneMapper.class);
        oneJob.setMapOutputKeyClass(Text.class);
        oneJob.setMapOutputValueClass(Text.class);
        FileInputFormat.addInputPath(oneJob, new Path(args[0]));

        oneJob.setReducerClass(StepOneReducer.class);
        oneJob.setOutputKeyClass(Text.class);
        oneJob.setOutputValueClass(Text.class);
        FileOutputFormat.setOutputPath(oneJob, new Path(args[1]));

        Job twoJob = Job.getInstance(conf);

        twoJob.setJarByClass(FridensDemo.class);

        twoJob.setMapperClass(StepTwoMapper.class);
        twoJob.setMapOutputKeyClass(Text.class);
        twoJob.setMapOutputValueClass(Text.class);
        FileInputFormat.addInputPath(twoJob, new Path(args[1]));

        twoJob.setReducerClass(StepTwoReducer.class);
        twoJob.setOutputKeyClass(Text.class);
        twoJob.setOutputValueClass(Text.class);
        FileOutputFormat.setOutputPath(twoJob, new Path(args[2]));


        // 我觉得最最主要的技术点为,用到了job链
        ControlledJob one = new ControlledJob(oneJob.getConfiguration());
        ControlledJob two = new ControlledJob(twoJob.getConfiguration());

        two.addDependingJob(one);

        JobControl jc = new JobControl("friend");
        jc.addJob(one);
        jc.addJob(two);

        Thread th = new Thread(jc);
        th.start();

        /*if (jc.allFinished()) {
            Thread.sleep(2000);
            jc.stop();
            th.stop();
            System.exit(0);
        }*/
    }
}
```