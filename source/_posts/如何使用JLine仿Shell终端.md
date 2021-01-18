---
title: 如何使用JLine仿Shell终端
date: 2021-01-15 13:50:00
categories: 系统
tags: tools
---

> JLine是用于处理控制台输入的Java库

<!-- more -->

## 依赖
```xml
<dependency>
    <groupId>org.jline</groupId>
    <artifactId>jline</artifactId>
    <version>3.18.0</version>
</dependency>
```

---

## 简单实现
以Flink的SqlClient为例
```java
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.UserInterruptException;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;


/**
 * @author jxeditor by 2021/1/18
 */
public class JlineDemo {

        static final String MESSAGE_WELCOME = "                                   \u2592\u2593\u2588\u2588\u2593\u2588\u2588\u2592\n" +
            "                               \u2593\u2588\u2588\u2588\u2588\u2592\u2592\u2588\u2593\u2592\u2593\u2588\u2588\u2588\u2593\u2592\n" +
            "                            \u2593\u2588\u2588\u2588\u2593\u2591\u2591        \u2592\u2592\u2592\u2593\u2588\u2588\u2592  \u2592\n" +
            "                          \u2591\u2588\u2588\u2592   \u2592\u2592\u2593\u2593\u2588\u2593\u2593\u2592\u2591      \u2592\u2588\u2588\u2588\u2588\n" +
            "                          \u2588\u2588\u2592         \u2591\u2592\u2593\u2588\u2588\u2588\u2592    \u2592\u2588\u2592\u2588\u2592\n" +
            "                            \u2591\u2593\u2588            \u2588\u2588\u2588   \u2593\u2591\u2592\u2588\u2588\n" +
            "                              \u2593\u2588       \u2592\u2592\u2592\u2592\u2592\u2593\u2588\u2588\u2593\u2591\u2592\u2591\u2593\u2593\u2588\n" +
            "                            \u2588\u2591 \u2588   \u2592\u2592\u2591       \u2588\u2588\u2588\u2593\u2593\u2588 \u2592\u2588\u2592\u2592\u2592\n" +
            "                            \u2588\u2588\u2588\u2588\u2591   \u2592\u2593\u2588\u2593      \u2588\u2588\u2592\u2592\u2592 \u2593\u2588\u2588\u2588\u2592\n" +
            "                         \u2591\u2592\u2588\u2593\u2593\u2588\u2588       \u2593\u2588\u2592    \u2593\u2588\u2592\u2593\u2588\u2588\u2593 \u2591\u2588\u2591\n" +
            "                   \u2593\u2591\u2592\u2593\u2588\u2588\u2588\u2588\u2592 \u2588\u2588         \u2592\u2588    \u2588\u2593\u2591\u2592\u2588\u2592\u2591\u2592\u2588\u2592\n" +
            "                  \u2588\u2588\u2588\u2593\u2591\u2588\u2588\u2593  \u2593\u2588           \u2588   \u2588\u2593 \u2592\u2593\u2588\u2593\u2593\u2588\u2592\n" +
            "                \u2591\u2588\u2588\u2593  \u2591\u2588\u2591            \u2588  \u2588\u2592 \u2592\u2588\u2588\u2588\u2588\u2588\u2593\u2592 \u2588\u2588\u2593\u2591\u2592\n" +
            "               \u2588\u2588\u2588\u2591 \u2591 \u2588\u2591          \u2593 \u2591\u2588 \u2588\u2588\u2588\u2588\u2588\u2592\u2591\u2591    \u2591\u2588\u2591\u2593  \u2593\u2591\n" +
            "              \u2588\u2588\u2593\u2588 \u2592\u2592\u2593\u2592          \u2593\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2593\u2591       \u2592\u2588\u2592 \u2592\u2593 \u2593\u2588\u2588\u2593\n" +
            "           \u2592\u2588\u2588\u2593 \u2593\u2588 \u2588\u2593\u2588       \u2591\u2592\u2588\u2588\u2588\u2588\u2588\u2593\u2593\u2592\u2591         \u2588\u2588\u2592\u2592  \u2588 \u2592  \u2593\u2588\u2592\n" +
            "           \u2593\u2588\u2593  \u2593\u2588 \u2588\u2588\u2593 \u2591\u2593\u2593\u2593\u2593\u2593\u2593\u2593\u2592              \u2592\u2588\u2588\u2593           \u2591\u2588\u2592\n" +
            "           \u2593\u2588    \u2588 \u2593\u2588\u2588\u2588\u2593\u2592\u2591              \u2591\u2593\u2593\u2593\u2588\u2588\u2588\u2593          \u2591\u2592\u2591 \u2593\u2588\n" +
            "           \u2588\u2588\u2593    \u2588\u2588\u2592    \u2591\u2592\u2593\u2593\u2588\u2588\u2588\u2593\u2593\u2593\u2593\u2593\u2588\u2588\u2588\u2588\u2588\u2588\u2593\u2592            \u2593\u2588\u2588\u2588  \u2588\n" +
            "          \u2593\u2588\u2588\u2588\u2592 \u2588\u2588\u2588   \u2591\u2593\u2593\u2592\u2591\u2591   \u2591\u2593\u2588\u2588\u2588\u2588\u2593\u2591                  \u2591\u2592\u2593\u2592  \u2588\u2593\n" +
            "          \u2588\u2593\u2592\u2592\u2593\u2593\u2588\u2588  \u2591\u2592\u2592\u2591\u2591\u2591\u2592\u2592\u2592\u2592\u2593\u2588\u2588\u2593\u2591                            \u2588\u2593\n" +
            "          \u2588\u2588 \u2593\u2591\u2592\u2588   \u2593\u2593\u2593\u2593\u2592\u2591\u2591  \u2592\u2588\u2593       \u2592\u2593\u2593\u2588\u2588\u2593    \u2593\u2592          \u2592\u2592\u2593\n" +
            "          \u2593\u2588\u2593 \u2593\u2592\u2588  \u2588\u2593\u2591  \u2591\u2592\u2593\u2593\u2588\u2588\u2592            \u2591\u2593\u2588\u2592   \u2592\u2592\u2592\u2591\u2592\u2592\u2593\u2588\u2588\u2588\u2588\u2588\u2592\n" +
            "           \u2588\u2588\u2591 \u2593\u2588\u2592\u2588\u2592  \u2592\u2593\u2593\u2592  \u2593\u2588                \u2588\u2591      \u2591\u2591\u2591\u2591   \u2591\u2588\u2592\n" +
            "           \u2593\u2588   \u2592\u2588\u2593   \u2591     \u2588\u2591                \u2592\u2588              \u2588\u2593\n" +
            "            \u2588\u2593   \u2588\u2588         \u2588\u2591                 \u2593\u2593        \u2592\u2588\u2593\u2593\u2593\u2592\u2588\u2591\n" +
            "             \u2588\u2593 \u2591\u2593\u2588\u2588\u2591       \u2593\u2592                  \u2593\u2588\u2593\u2592\u2591\u2591\u2591\u2592\u2593\u2588\u2591    \u2592\u2588\n" +
            "              \u2588\u2588   \u2593\u2588\u2593\u2591      \u2592                    \u2591\u2592\u2588\u2592\u2588\u2588\u2592      \u2593\u2593\n" +
            "               \u2593\u2588\u2592   \u2592\u2588\u2593\u2592\u2591                         \u2592\u2592 \u2588\u2592\u2588\u2593\u2592\u2592\u2591\u2591\u2592\u2588\u2588\n" +
            "                \u2591\u2588\u2588\u2592    \u2592\u2593\u2593\u2592                     \u2593\u2588\u2588\u2593\u2592\u2588\u2592 \u2591\u2593\u2593\u2593\u2593\u2592\u2588\u2593\n" +
            "                  \u2591\u2593\u2588\u2588\u2592                          \u2593\u2591  \u2592\u2588\u2593\u2588  \u2591\u2591\u2592\u2592\u2592\n" +
            "                      \u2592\u2593\u2593\u2593\u2593\u2593\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2591\u2591\u2593\u2593  \u2593\u2591\u2592\u2588\u2591\n" +
            "          \n" +
            "    ______ _ _       _       _____  ____  _         _____ _ _            _  BETA   \n" +
            "   |  ____| (_)     | |     / ____|/ __ \\| |       / ____| (_)          | |  \n" +
            "   | |__  | |_ _ __ | | __ | (___ | |  | | |      | |    | |_  ___ _ __ | |_ \n" +
            "   |  __| | | | '_ \\| |/ /  \\___ \\| |  | | |      | |    | | |/ _ \\ '_ \\| __|\n" +
            "   | |    | | | | | |   <   ____) | |__| | |____  | |____| | |  __/ | | | |_ \n" +
            "   |_|    |_|_|_| |_|_|\\_\\ |_____/ \\___\\_\\______|  \\_____|_|_|\\___|_| |_|\\__|\n" +
            "          \n" +
            "        Welcome! Enter 'HELP;' to list all available commands. 'QUIT;' to exit.\n\n";


    public static void main(String[] args) throws Exception {

        // 创建终端
        Terminal terminal = TerminalBuilder.builder()
                .system(true)
                .build();

        // 读取终端输入
        LineReader lineReader = LineReaderBuilder.builder()
                .terminal(terminal)
                .build();

        // 输出欢迎语
        terminal.writer().append(JlineDemo.MESSAGE_WELCOME);

        // 提示符
        String prompt = "Flink SQL> ";
        while (true) {
            terminal.writer().append("\n");
            terminal.flush();

            final String line;
            try {
                line = lineReader.readLine(prompt);
            } catch (UserInterruptException e) {
                // user cancelled line with Ctrl+C
                continue;
            } catch (EndOfFileException e) {
                // user cancelled application with Ctrl+D or kill
                break;
            } catch (Throwable t) {
                throw new Exception("Could not read from command line.", t);
            }
            if (line == null) {
                continue;
            }
            // 获取输入,根据输入做对应的操作,CommandCall
            System.out.println(line);
        }
    }
}
```

---

## 更多操作
```java
// 自动补全,在Windows下测试发现TAB建补全有些问题
Completer commandCompleter = new StringsCompleter("CREATE", "SELECT", "INSERT", "SHOW");
LineReader lineReader = LineReaderBuilder.builder()
    .terminal(terminal)
    .completer(commandCompleter)
    .build();

// 历史命令,存储以及加载历史命令的位置
lineReader.setVariable(LineReader.HISTORY_FILE, new File("E:/history.log"));

// 更多可以看下Jline源码
// https://github.com/jline/jline3
```