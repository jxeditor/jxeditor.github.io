---
title: Shell总体归纳
date: 2016-05-31 21:15:39
categories: 运维
tags: shell
---
### 一. 约定标记
```
#!/bin/bash
```

<!-- more -->

---

### 二. 变量
#### 1. 定义变量
- 变量名和等号之间**不能有空格**
- 首个字符必须为字母(a-z,A-Z)
- 中间不能有空格,可以使用下划线
- 不能使用标点符号
- 不能使用bash里的关键字
```
country="china"
```
#### 2. 使用变量
> 只需要在一个定义过的变量前面加上美元符号$就可以了,另外,对于变量的{}是可以选择的,它的目的为帮助解释器识别变量的边界

```
echo $country
echo ${country}
echo "I love my ${country}abcd!"
```

#### 3. 重定义变量
```
country="China"
country="USA"
```

#### 4. 只读变量
```
readonly country="China"
或
country="China"
readonly country
```

#### 5. 删除变量
```
unset country
```

#### 6. 特殊变量

**变量** | **含义**
---|---
$0 | 当前脚本的文件名
$n | 传递给脚本或函数的参数.n是一个数字,表示第几个参数
$# | 传递给脚本或函数的参数个数
$* | 传递给脚本或函数的所有参数
$@ | 传递给脚本或函数的所有参数
$? | 上个命令的退出状态,或函数的返回值
$$ | 当前Shell进程ID
```
$* 和 $@ 的区别为: 
    1. $* 和 $@ 都表示传递给函数或脚本的所有参数，不被双引号(" ")包含时，都以"$1" "$2" … "$n" 的形式输出所有参数。
    2. 当它们被双引号(" ")包含时，"$*" 会将所有的参数作为一个整体，以"$1 $2 … $n"的形式输出所有参数；"$@" 会将各个参数分开，以"$1" "$2" … "$n" 的形式输出所有参数。
一般直接使用$@

$? 可以获取上一个命令的退出状态。所谓退出状态，就是上一个命令执行后的返回结果。退出状态是一个数字，一般情况下，大部分命令执行成功会返回 0，失败返回 1。
```

---

### 三. Shell的替换
#### 1. 转义符

header 1 | header 2
---|---
\a | 发出警告声； 
\b | 删除前一个字符； 
\c | 最后不加上换行符号； 
\f | 换行但光标仍旧停留在原来的位置； 
\n | 换行且光标移至行首； 
\r | 光标移至行首，但不换行； 
\t | 插入tab； 
\v | 与\f相同； 
\ | 插入\字符； 
\nnn | 插入nnn（八进制）所代表的ASCII字符；

> 使用 echo 命令的 –E 选项禁止转义，默认也是不转义的；

> 使用 –n 选项可以禁止插入换行符；

> 使用 echo 命令的 –e 选项可以对转义字符进行替换.

```
echo "\\"           #得到 \
echo -e "\\"        #得到 \

echo "\\\\"         #得到 \\
echo -e "\\"        #得到 \

使用-e 如果存在其他转义字符,那么\\\\等于\
echo -e "aa\\\\aa"  #得到 aa\aa
echo -e "aa\\aa"    #得到 aaa
```

#### 2. 命令替换
> 把一个命令的输出赋值给一个变量,方法为把命令用**反引号**(在Esc下方)引起来
```
directory=`pwd`
echo $directory
```

#### 3. 变量替换
> 可以根据变量的状态（是否为空、是否定义等）来改变它的值

形式 | 说明
---|---
${var} | 变量本来的值
${var:-word} | 如果变量var为空或已被删除(unset),那么返回word,但不改变var的值
${var:=word} | 如果变量var为空或已被删除(unset),那么返回word,并将var的值设置为word
${var:?message} | 如果变量var为空或已被删除(unset),那么将消息message送到标准错误输出,可以用来检测变量var是否可以被正常赋值.**若此替换出现在Shell脚本中,那么脚本将停止运行**
${var:+word} | 如果变量var被定义,那么返回word,但不改变var的值

---

### 四. Shell的运算符
#### 1. 算数运算符
运算符 | 说明 | 举例
---|---|---
+ | 加法 | `expr $a + $b`
- | 减法 | `expr $a - $b`
* | 乘法 | `expr $a \* $b`
/ | 除法 | `expr $a / $b`
% | 取余 | `expr $a % $b`
= | 赋值 | a=$b
== | 相等 | [ $a == $b ]
!= | 不相等 | [ $a != $b ]

> 在expr中的乖号为：\*

> 在expr中的表达式与运算符之间要有空格，否则错误；

> 在[ $a == $b ]与[ $a != $b ]中，要需要在方括号与变量以及变量与运算符之间也需要有括号， 否则为错误的。

#### 2. 关系运算符
> 只支持数字，不支持字符串，除非字符串的值是数字。

运算符 | 说明 | 举例
---|---|---
-eq | 相等返回true | [ $a -eq $b ]
-ne | 不相等返回true | [ $a -ne $b ]
-gt | 大于返回true | [ $a -gt $b ]
-lt | 小于返回true | [ $a -lt $b ]
-ge | 大于等于返回true | [ $a -ge $b ]
-le | 小于等于返回true | [ $a -le $b ]

#### 3. 布尔运算符
运算符 | 说明 | 举例
---|---|---
! | 非运算,表达式为true则返回false,否则返回true | [ !false ]返回true
-o | 或运算,有true返回true | [ $a -lt 20 -o $b -gt 100 ]
-a | 与运算,有false返回false | [ $a -lt 20 -a $b -gt 100 ]

#### 4. 字符串运算符
运算符 | 说明 | 举例
---|---|---
= | 相等返回true | [ $a = $b ]
!= | 不相等返回true | [ $a != $b ]
-z | 检测字符串长度是否为0,为0返回true | [ -z $a ]
-n | 检测字符串长度是否为0,不为0返回true | [ -n $a ]
str | 检测字符串是否为空,不为空返回true | [ $a ]

#### 5. 文件测试运算符
运算符 | 说明 | 举例
---|---|---
-b file | 检测文件是否是块设备文件 | [ -b $file ]
-c file | 检测文件是否是字符设备文件 | [ -c $file ]
-d file | 检测文件是否是目录 | [ -d $file ]
-f file | 检测文件是否是普通文件 | [ -f $file ]
-g file | 检测文件是否设置了SGID位 | [ -g $file ]
-k file | 检测文件是否设置了黏着位 | [ -k $file ]
-p file | 检测文件是否是具名管道 | [ -p $file ]
-u file | 检测文件是否设置了SUID位 | [ -u $file ]
-r file | 检测文件是否可读 | [ -r $file ]
-w file | 检测文件是否可写 | [ -w $file ]
-x file | 检测文件是否可执行 | [ -x $file ]
-s file | 检测文件是否为空(文件大小是否大于0) | [ -s $file ]
-e file | 检测文件(目录)是否存在 | [ -e $file ]

---

### 五. Shell的字符串
#### 1. 单引号
> - 单引号里的任何字符都会原样输出，单引号字符串中的变量是无效的；

> - 单引号字串中不能出现单引号（对单引号使用转义符后也不行）。

#### 2. 双引号
> - 双引号里可以有变量

> - 双引号里可以出现转义字符

#### 3. 拼接字符串
```
country="China"
echo "hello, $country"
或
echo "hello, "$country" "
```

#### 4. 获取字符串长度
```
string="abcd"
echo ${#string} #输出 4
或
echo `expr length abcde` #输出 5
```

#### 5. 提取子字符串
```
string="alibaba is a great company"
echo ${string:1:4} #输出 liba
或
echo `expr substr abcde 2 3` #输出 bcd
```

#### 6. 查找字符下标:
```
string="alibaba is a great company"
echo `expr index "$string" i` #输出 3
```

#### 7. 处理路径的字符串
```
basename
basename /home/yin/1.txt #输出 1.txt
basename /home/yin/1.txt .txt #输出 1

dirname
dirname /usr/bin/ #输出 /usr
dirname /usr/bin/sort #输出 /usr/bin
dirname 1.txt #输出 .
```

---

### 六. Shell的数组
> bash支持一维数组,不支持多维数组,它的下标从0开始编号.用下标[n]获取数组元素；

#### 1. 定义数组
> 用括号来表示数组，数组元素用"空格"符号分割开。

```
declare -a array_name
或
array_name=(value0 value1 value2 value3)
或
array_name[0]=value0
array_name[1]=value1
array_name[2]=value2
```

#### 2. 读取数组
```
读取某个下标的元素
${array_name[index]}

读取数组的全部元素
${array_name[*]}
${array_name[@]}
```

#### 3. 获取数组信息
```
arr_name=(1 2 3 4)

取得数组元素的个数
length=${#array_name[@]}
或
length=${#array_name[*]}
#输出 4

获取数组的下标
length=${!array_name[@]}
或
length=${!array_name[*]}
#输出 0 1 2 3

取得数组单个元素的长度
lengthn=${#array_name[n]}
#输出 1
```

---

### 七. printf函数
> - printf 命令不用加括号
> - format-string 可以没有引号，但最好加上，单引号双引号均可。
> - 参数多于格式控制符(%)时，format-string 可以重用，可以将所有参数都转换。
> - arguments 使用空格分隔，不用逗号。

```
# format-string为双引号
printf "%d %s\n" 1 "abc"
#输出 1 abc

# 单引号与双引号效果一样 
printf '%d %s\n' 1 "abc" 
#输出 1 abc

# 没有引号也可以输出
printf %s abcdef
#输出 abcdef

# 格式只指定了一个参数，但多出的参数仍然会按照该格式输出，format-string 被重用
printf %s abc def
#输出 abcdef
printf "%s\n" abc def
#输出
# abc
# def
printf "%s %s %s\n" a b c d e f g h i j
#输出
# a b c
# d e f
# g h i
# j

# 如果没有 arguments，那么 %s 用NULL代替，%d 用 0 代替
printf "%s and %d \n" 
#输出 and 0

# 如果以 %d 的格式来显示字符串，那么会有警告，提示无效的数字，此时默认置为 0
printf "The first program always prints'%s,%d\n'" Hello Shell
#输出
# -bash: printf: Shell: invalid number
# The first program always prints 'Hello,0'
```

---

### 八. Shell中条件语句
#### 1. if语句
> - if [ 表达式 ] then  语句  fi
> - if [ 表达式 ] then 语句 else 语句 fi
> - if [ 表达式] then 语句  elif[ 表达式 ] then 语句 elif[ 表达式 ] then 语句   …… fi

```
a=10
b=20
if [ $a == $b ]
then
   echo "a is equal to b"
else
   echo "a is not equal to b"
fi
或
if test $[2*3] -eq $[1+5]; then echo 'The two numbers are equal!'; fi;
```
> test 命令用于检查某个条件是否成立，与方括号([ ])类似

#### 2. case语句
> - 取值后面必须为关键字**in**，每一模式必须以**右括号**结束。
> - 取值可以为**变量**或**常数**。
> - 匹配发现取值符合某一模式后，其间所有命令开始**执行至;;处**。
> - **;;与其他语言中的break类似**，意思是跳到整个**case**语句的最后。
> - 如果无一匹配模式，使用**星号\*捕获**该值，再执行后面的命令。
```
case 值 in
模式1)
    command1
    command2
    command3
    ;;
模式2）
    command1
    command2
    command3
    ;;
*)
    command1
    command2
    command3
    ;;
esac
```

---

### 九. Shell中循环语句
#### 1. for循环
> - 列表是一组值（数字、字符串等）组成的序列，每个值通过空格分隔。
> - 每循环一次，就将列表中的下一个值赋给变量。

```
for 变量 in 列表
do
    command1
    command2
    ...
    commandN
done

for loop in 1 2 3 4 5
do
    echo "The value is: $loop"
done

#!/bin/bash
for FILE in $HOME/.bash*
do
   echo $FILE
done
```

#### 2. while循环
```
while command
do
   Statement(s) to be executed if command is true
done

COUNTER=0
while [ $COUNTER -lt 5 ]
do
    COUNTER='expr $COUNTER+1'
    echo $COUNTER
done
```

#### 3. until循环
> - until 循环执行一系列命令直至条件为 true 时停止。
> - until 循环与 while 循环在处理方式上刚好相反。

```
until command
do
   Statement(s) to be executed until command is true
done

command 一般为条件表达式，如果返回值为false，则继续执行循环体内的语句，否则跳出循环。
类似地，在循环中使用 break 与 continue 跳出循环。
另外，break 命令后面还可以跟一个整数，表示跳出第几层循环。
```

---

### 十. Shell的函数
```
Shell函数必须先定义后使用
function_name () {
    list of commands
    [ return value ]
}

也可以加上function关键字：
function function_name () {
    list of commands
    [ return value ]
}
```

>- 调用函数只需要给出函数名，不需要加括号。
>- 函数返回值，可以显式增加return语句；如果不加，会将最后一条命令运行结果作为返回值。
>- Shell 函数返回值只能是整数，一般用来表示函数执行成功与否，0表示成功，其他值表示失败。
>- 函数的参数可以通过 $n

```
funWithParam(){
    echo "The value of the first parameter is $1 !"
    echo "The value of the second parameter is $2 !"
    echo "The value of the tenth parameter is ${10} !"
    echo "The value of the eleventh parameter is ${11} !"
    echo "The amount of the parameters is $# !"  # 参数个数
    echo "The string of the parameters is $* !"  # 传递给函数的所有参数
}
funWithParam 1 2 3 4 5 6 7 8 9 34 73
```
>- 像删除变量一样，删除函数也可以使用 unset 命令，不过要加上 .f 选项

```
unset .f function_name
```

---

### 十一. Shell的文件包含
>- 两种方式的效果相同，简单起见，一般使用点号(.)，但是注意点号(.)和文件名中间有一空格。
>- 被包含脚本不需要有执行权限.

```
#脚本1 s1.sh
#!/bin/bash
echo "脚本1"

#脚本2 s2.sh
#!/bin/bash
echo "脚本2"
echo "调用脚本1"
. s1.sh
source s1.sh

# 调用脚本2
#输出
# 脚本2
# 调用脚本1
# 脚本1
# 脚本1
```

### 补充,内置命令,一些常用的命令
#### 1.awk&&sed 
```
# 将你找的字符串下一行,替换成指定字符串
sed -i '/你找的字符串/ { N; s/\n.*$/\n你要写的字符串/}' 你的文件

# 将文件大小大于0的打印出来
ll ./*.log| awk -F " " '{if($5>0){print $9}}'

# 可以去除文本中多打的分割符
awk -v OFS="\t" '{print $1,$2,$3,$4,$5,$6}' test.txt > test.bak

# 输出第一行
awk 'NR==1' test.txt

# 输出奇数行
awk 'NR%2' test.txt
awk '++i%2' test.txt
sed -n '1~2p' test1.txt

# 输出偶数行
awk '!(NR%2)' test.txt
awk 'i++%2' test.txt
sed -n '2~2p' test1.txt

# 行数对3取余,余数为1的输出
awk 'NR%3==1' test1.txt
```

#### 2. date
> 如果带时分秒,指定时间应放在日期操作后面

```
# 将输入日期转换成时间戳
START_DAY=$(date -d "2018-10-27" +%s)

# 指定日期两个月前的日期
date -d "2018-08-17 -2 month" +"%Y-%m-%d"

# 获取当前时间
date "+%Y-%m-%d %H:%M:%S"

# 将时间戳转成字符串
date -d @1287331200  "+%Y-%m-%d"

# 如果要得到指定日期的前后的日期
# 1.得到时间戳
seconds=`date -d "2010-10-18 00:00:00" +%s`       
# 2.加上一天的秒数86400
seconds_new=`expr $seconds + 86400`
# 3.获得指定日前加上一天的日期
date_new=`date -d @$seconds_new "+%Y-%m-%d"`   

# 获取前一秒时间
date -d "1 seconds ago" "+%Y-%m-%d %H:%M:%S"
date -d "1 seconds ago 2010-01-11 13:24:59" "+%Y-%m-%d %H:%M:%S"

# 获取前一分钟时间
date -d "1 minutes ago" "+%Y-%m-%d %H:%M:%S"
date -d "1 minutes ago 2010-01-11 13:24:59" "+%Y-%m-%d %H:%M:%S"

# 获取前一小时时间
date -d "1 hours ago" "+%Y-%m-%d %H:%M:%S"
date -d "1 hours ago 2010-01-11 13:24:59" "+%Y-%m-%d %H:%M:%S"

# 获取前一天的日期
date -d "1 days ago" +%Y-%m-%d
date -d "yesterday" +%Y-%m-%d
date -d "2018-12-17 -1 day" +%Y-%m-%d
date -d "-1 day 2018-12-17 13:24:59" "+%Y-%m-%d %H:%M:%S"

# 获取前一周的日期
date -d "1 weeks ago" +%Y-%m-%d
date -d "2018-12-18 -1 week" +%Y-%m-%d
```

#### 3. 截取字符串
> 从0开始计算下标
> 左边的第一个字符是用**0**表示，右边的第一个字符用**0-1**表示

```
# #号截取,删除左边字符,保留右边字符
# var 是变量名,# 号是运算符,*// 表示从左边开始删除第一个 // 号及左边的所有字符
var="http://www.aaa.com/123.html"
echo ${var#*//}
#输出 www.aaa.com/123.html

# ##号截取,删除左边字符,保留右边字符
# ##*/ 表示从左边开始删除最后（最右边）一个 / 号及左边的所有字符
echo ${var##*/}
#输出 123.html

# %号截取,删除右边字符,保留左边字符
# %/* 表示从右边开始,删除第一个 / 号及右边的字符
echo ${var%/*}
#输出 http://www.aaa.com

# %%号截取,删除右边字符,保留左边字符
# %%/* 表示从右边开始,删除最后（最左边）一个 / 号及右边的字符
echo ${var%%/*}
#输出 http:

# 截取从左边第几个字符开始，及字符的个数
# 其中的0表示左边第一个字符开始,5表示字符的总个数
echo ${var:0:5}
#输出 http:

# 从左边第几个字符开始,一直到结束
echo ${var:7}
#输出 www.aaa.com/123.html

# 从右边第几个字符开始,及字符的个数
# 其中的 0-8 表示右边算起第八个字符开始,3 表示字符的个数
echo ${var:0-8:3}
#输出 123

# 从右边第几个字符开始,一直到结束
# 表示从右边第八个字符开始,一直到结束
echo ${var:0-8}
#输出 123.html
```
