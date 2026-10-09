-- Preserve existing orders/counters; only change future creation and staff permissions.
create or replace function public.add_collection_order(target_business uuid, customer_name text default '', requested_number integer default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.businesses; result uuid; n integer;
begin
  if not public.is_business_member(target_business) then raise exception 'Business access denied'; end if;
  -- Keep the legacy signature for callers passing null; overrides are no longer allowed.
  if requested_number is not null then raise exception 'Order numbers are assigned automatically'; end if;
  select * into b from public.businesses where id = target_business for update;
  n := case when b.queue_style = 'name' then null else b.next_number end;
  -- Preserve protection against numbers occupied by legacy orders.
  if n is not null then
    while exists(select 1 from public.collection_orders where business_id = b.id and number = n and status <> 'collected') loop n := n + 1; end loop;
  end if;
  insert into public.collection_orders(business_id,number,customer_name,type)
    values(b.id,n,trim(customer_name),b.queue_style) returning id into result;
  if n is not null then update public.businesses set next_number = greatest(next_number,n+1) where id = b.id; end if;
  return result;
end;
$$;

-- Names and statuses remain editable, but assigned numbers are immutable for staff.
revoke update(number) on public.collection_orders from authenticated;
