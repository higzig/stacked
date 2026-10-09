begin;

-- NULL means Off. Existing and new workspaces receive the same ten-minute default.
alter table public.businesses add column ready_auto_clear_seconds integer default 600
  check (ready_auto_clear_seconds in (300,600,900,1200,1800));
grant update(ready_auto_clear_seconds) on public.businesses to authenticated;
create index collection_ready_expiry on public.collection_orders(business_id,ready_at) where status = 'ready';

-- Only the database scheduler/trusted administration may invoke this worker.
-- Expired workspaces are also tidied; this grants no extra access to their members.
create function public.auto_collect_ready_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with due as (
    select o.id from public.collection_orders o
    join public.businesses b on b.id = o.business_id
    where o.status = 'ready' and b.ready_auto_clear_seconds is not null
      and o.ready_at <= statement_timestamp() - make_interval(secs => b.ready_auto_clear_seconds)
    for update of o skip locked
  )
  update public.collection_orders o set status = 'collected'
    from due where o.id = due.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.auto_collect_ready_orders() from public,anon,authenticated;
grant execute on function public.auto_collect_ready_orders() to service_role;

-- No browser heartbeat or client time participates in expiry.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('popbia-auto-collect-ready','30 seconds','select public.auto_collect_ready_orders()');
commit;
