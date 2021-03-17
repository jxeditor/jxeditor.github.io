---
title: GreenPlum日常整理
date: 2021-03-11 17:25:17
categories: 大数据
tags: greenplum
---

> 新知识结构，记录下日常使用

<!-- more -->

## GP的函数创建
```sql
-- GP实现REGEXP_LIKE函数
CREATE OR REPLACE FUNCTION regexp_like(str character, reg character)
  RETURNS boolean AS
$BODY$
declare
v_match  text;
begin
select regexp_matches(str,reg) into v_match;
if v_match is not NULL then
return true;
else
return false;
end if;
end;
$BODY$
  LANGUAGE plpgsql VOLATILE;
```