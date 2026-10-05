begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  display_id uuid not null unique default gen_random_uuid(),
  queue_style text not null default 'number-name' check (queue_style in ('number','name','number-name')),
  overdue_seconds integer not null default 600 check (overdue_seconds in (10,30,600)),
  ready_chime boolean not null default true,
  next_number integer not null default 1 check (next_number > 0),
  created_at timestamptz not null default now()
);
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (business_id,user_id)
);
create index business_members_user_idx on public.business_members(user_id);
create table public.collection_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  number integer check (number > 0),
  customer_name text not null default '' check (length(customer_name) <= 120),
  type text not null check (type in ('number','name','number-name')),
  status text not null default 'preparing' check (status in ('preparing','ready','collected')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  collected_at timestamptz,
  check ((type = 'name' and length(trim(customer_name)) > 0) or (type in ('number','number-name') and number is not null))
);
create index collection_orders_business_status_idx on public.collection_orders(business_id,status,created_at);
create unique index collection_orders_active_number_idx on public.collection_orders(business_id,number) where status <> 'collected' and number is not null;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.collection_orders enable row level security;
create function public.is_business_member(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_members where business_id = target and user_id = (select auth.uid()));
$$;
revoke all on function public.is_business_member(uuid) from public, anon, authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy member_business on public.businesses for select to authenticated using (public.is_business_member(id));
create policy update_business on public.businesses for update to authenticated using (public.is_business_member(id)) with check (public.is_business_member(id));
create policy own_membership on public.business_members for select to authenticated using (user_id = (select auth.uid()));
create policy member_orders on public.collection_orders for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
revoke all on public.profiles, public.businesses, public.business_members, public.collection_orders from anon, authenticated;
grant select on public.profiles, public.businesses, public.business_members, public.collection_orders to authenticated;
grant update(queue_style,overdue_seconds,ready_chime) on public.businesses to authenticated;
grant update(number,customer_name,status), delete on public.collection_orders to authenticated;

create function public.create_business(business_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- Serialize onboarding retries for this individual; membership remains many-to-many.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select business_id into result from public.business_members where user_id = auth.uid() order by business_id limit 1;
  if result is not null then return result; end if;
  insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
  insert into public.businesses(name) values(trim(business_name)) returning id into result;
  insert into public.business_members values(result,auth.uid());
  return result;
end;
$$;
create function public.add_collection_order(target_business uuid, customer_name text default '', requested_number integer default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.businesses; result uuid; n integer;
begin
  if not public.is_business_member(target_business) then raise exception 'Business access denied'; end if;
  select * into b from public.businesses where id = target_business for update;
  n := case when b.queue_style = 'name' then null else coalesce(requested_number,b.next_number) end;
  -- Edits may have occupied the next automatic number; never strand the counter.
  if requested_number is null and n is not null then
    while exists(select 1 from public.collection_orders where business_id = b.id and number = n and status <> 'collected') loop n := n + 1; end loop;
  end if;
  insert into public.collection_orders(business_id,number,customer_name,type)
    values(b.id,n,trim(customer_name),b.queue_style) returning id into result;
  if n is not null then update public.businesses set next_number = greatest(next_number,n+1) where id = b.id; end if;
  return result;
end;
$$;
create function public.order_timestamps() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.ready_at := case when new.status = 'ready' then now() when new.status = 'preparing' then null else old.ready_at end;
    new.collected_at := case when new.status = 'collected' then now() else null end;
  end if;
  return new;
end;
$$;
create trigger order_timestamps before update on public.collection_orders for each row execute function public.order_timestamps();

-- Anonymous visitors can call this projection only with a venue's unguessable display identifier.
-- No table is anonymous-readable; no email, membership, internal business ID or history is returned.
create function public.collection_display(display uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name',b.name,'queue_style',b.queue_style,'overdue_seconds',b.overdue_seconds,'ready_chime',b.ready_chime,
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'customer_name',o.customer_name,'type',o.type,'status',o.status,'created_at',o.created_at,'ready_at',o.ready_at) order by o.created_at)
      from public.collection_orders o where o.business_id=b.id and o.status <> 'collected'),'[]'::jsonb))
  from public.businesses b where b.display_id = display;
$$;
-- Notifications contain no row payload. Display identifiers scope public invalidations;
-- each recipient fetches its authorized snapshot rather than trusting broadcast content.
create function public.collection_changed() returns trigger language plpgsql security definer set search_path = '' as $$
declare display uuid; target uuid;
begin
  if tg_table_name = 'businesses' then display := new.display_id;
  else
    target := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
    select display_id into display from public.businesses where id = target;
  end if;
  if display is not null then perform realtime.send('{}'::jsonb,'changed','collection:' || display::text,false); end if;
  return null;
end;
$$;
create trigger collection_orders_changed after insert or update or delete on public.collection_orders for each row execute function public.collection_changed();
create trigger collection_business_changed after update on public.businesses for each row execute function public.collection_changed();
revoke all on function public.create_business(text), public.add_collection_order(uuid,text,integer), public.collection_display(uuid), public.order_timestamps(), public.collection_changed() from public, anon, authenticated;
grant execute on function public.create_business(text), public.add_collection_order(uuid,text,integer) to authenticated;
grant execute on function public.collection_display(uuid) to anon, authenticated;
commit;
