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

---

## GP解锁操作
```
# 查看segment锁情况
select gp_execution_dbid(),pid,relation::regclass,locktype,mode,granted
from gp_dist_random('pg_locks');

# 查看具体什么语句持有的锁
select gp_execution_dbid() dbid,procpid,current_query
from gp_dist_random('pg_stat_activity')  
where procpid in (
    select pid 
    from gp_dist_random('pg_locks')
    where locktype='relation' and mode='ExclusiveLock'
);

# 连接相关segment
PGOPTIONS="-c gp_session_role=utility" psql -h localhost -p 5432 -d gpdb

# 在segment查询相关锁情况
select
    w.current_query as waiting_query,
    w.procpid as w_pid,
    w.usename as w_user,
    l.current_query as locking_query,
    l.procpid as l_pid,
    l.usename as l_user,
    t.schemaname || '.' || t.relname as tablename
from pg_stat_activity w
join pg_locks l1 
on w.procpid = l1.pid 
and not l1.granted
join pg_locks l2 
on l1.relation = l2.relation 
and l2.granted
join pg_stat_activity l 
on l2.pid = l.procpid
join pg_stat_user_tables t 
on l1.relation = t.relid
where w.waiting;

# 处理持有锁的pid
select pg_terminate_backend('procpid');

# GP查看锁
select pid,rolname,rsqname,granted,current_query,datname
from pg_roles,gp_toolkit.gp_resqueue_status,pg_locks,pg_stat_activity
WHERE pg_roles.rolresqueue=pg_locks.objid
AND pg_locks.objid=gp_toolkit.gp_resqueue_status.queueid
AND pg_stat_activity.procpid=pg_locks.pid;
 
# GP解除锁定
pg_cancel_backend(#pid)
```