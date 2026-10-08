begin;

-- One entitlement per workspace. Billing cadence does not change features.
create table public.business_entitlements (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_status text not null check (subscription_status in ('trialing','active','expired','past_due','cancelled')),
  plan text check (plan in ('monthly','annual')),
  current_period_end timestamptz,
  legacy_access boolean not null default false,
  check ((trial_started_at is null and trial_ends_at is null) or
    (trial_started_at is not null and trial_ends_at = trial_started_at + interval '336 hours')),
  check (subscription_status <> 'trialing' or trial_ends_at is not null),
  check (not legacy_access or subscription_status = 'active')
);
alter table public.business_entitlements enable row level security;
revoke all on public.business_entitlements from anon, authenticated;
grant select on public.business_entitlements to authenticated;
grant all on public.business_entitlements to service_role;
create policy member_entitlement on public.business_entitlements for select to authenticated
  using (public.is_business_member(business_id));

-- Preserve all pre-migration development/test businesses, without a fabricated paid plan.
insert into public.business_entitlements(business_id,subscription_status,legacy_access)
  select id,'active',true from public.businesses;

create function public.start_collection_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare started timestamptz := clock_timestamp();
begin
  insert into public.business_entitlements(business_id,trial_started_at,trial_ends_at,subscription_status)
    values(new.id,started,started + interval '336 hours','trialing');
  return new;
end;
$$;
create trigger start_collection_trial after insert on public.businesses
  for each row execute function public.start_collection_trial();

-- No client clock, local storage, or cached status participates in authorization.
create function public.collection_access_allowed(target uuid) returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce((select
    (e.subscription_status = 'trialing' and clock_timestamp() < e.trial_ends_at)
    or (e.subscription_status = 'active' and
        (e.legacy_access or clock_timestamp() < e.current_period_end))
    from public.business_entitlements e where e.business_id = target),false);
$$;

-- Member-only server snapshot. Expiry is materialized here, but writes are blocked
-- at the deadline even if nobody has requested this snapshot (no cron dependency).
create function public.collection_entitlement(target_business uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.business_entitlements; server_time timestamptz := clock_timestamp(); allowed boolean;
begin
  if not public.is_business_member(target_business) then raise exception 'Business access denied'; end if;
  update public.business_entitlements set subscription_status = 'expired'
    where business_id = target_business and subscription_status = 'trialing' and trial_ends_at <= server_time;
  select * into e from public.business_entitlements where business_id = target_business;
  if not found then raise exception 'Workspace entitlement unavailable'; end if;
  allowed := public.collection_access_allowed(target_business);
  return jsonb_build_object('subscription_status',case when e.subscription_status in ('trialing','active') and not allowed then 'expired' else e.subscription_status end,
    'plan',e.plan,'trial_started_at',e.trial_started_at,'trial_ends_at',e.trial_ends_at,
    'current_period_end',e.current_period_end,'server_time',server_time,'access_allowed',allowed,
    'days_remaining',case when e.subscription_status = 'trialing' and allowed then
      greatest(0,ceil(extract(epoch from (e.trial_ends_at-server_time))/86400)) else 0 end);
end;
$$;

-- Retain member reads so expired workspaces keep their history. Gate every write.
drop policy member_orders on public.collection_orders;
create policy member_orders_read on public.collection_orders for select to authenticated
  using (public.is_business_member(business_id));
create policy entitled_orders_update on public.collection_orders for update to authenticated
  using (public.is_business_member(business_id) and public.collection_access_allowed(business_id))
  with check (public.is_business_member(business_id) and public.collection_access_allowed(business_id));
create policy entitled_orders_delete on public.collection_orders for delete to authenticated
  using (public.is_business_member(business_id) and public.collection_access_allowed(business_id));
drop policy update_business on public.businesses;
create policy update_business on public.businesses for update to authenticated
  using (public.is_business_member(id) and public.collection_access_allowed(id))
  with check (public.is_business_member(id) and public.collection_access_allowed(id));

-- SECURITY DEFINER add_collection_order bypasses RLS: the trigger is a second
-- enforcement boundary covering that RPC, direct inserts, edits, deletes and settings.
create function public.enforce_collection_entitlement() returns trigger
language plpgsql set search_path = '' as $$
declare target uuid;
begin
  -- Trusted administration only; browser JWT roles cannot become service_role.
  if current_user = 'service_role' or (current_user = 'postgres' and auth.uid() is null) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'businesses' then target := new.id;
  else target := case when tg_op = 'DELETE' then old.business_id else new.business_id end; end if;
  if not public.is_business_member(target) or not public.collection_access_allowed(target) then
    raise exception 'Collection access has ended. Contact PopBia to continue.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger enforce_order_entitlement before insert or update or delete on public.collection_orders
  for each row execute function public.enforce_collection_entitlement();
create trigger enforce_settings_entitlement before update on public.businesses
  for each row execute function public.enforce_collection_entitlement();

create or replace function public.collection_display(display uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object('name',b.name,'queue_style',b.queue_style,'overdue_seconds',b.overdue_seconds,'ready_chime',b.ready_chime,
    'inactive',not public.collection_access_allowed(b.id),
    'orders',case when public.collection_access_allowed(b.id) then coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'number',o.number,'customer_name',o.customer_name,'type',o.type,'status',o.status,'created_at',o.created_at,'ready_at',o.ready_at) order by o.created_at)
      from public.collection_orders o where o.business_id=b.id and o.status <> 'collected'),'[]'::jsonb) else '[]'::jsonb end)
  from public.businesses b where b.display_id = display;
$$;
revoke all on function public.start_collection_trial(), public.collection_access_allowed(uuid),
  public.collection_entitlement(uuid), public.enforce_collection_entitlement() from public,anon,authenticated;
grant execute on function public.collection_access_allowed(uuid), public.collection_entitlement(uuid) to authenticated;
-- collection_display retains its existing anonymous-only projection grants.
commit;
