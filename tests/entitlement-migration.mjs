// Isolated PostgreSQL migration/backfill test. Never connects to hosted Supabase.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = process.env.SUPABASE_TEST_DB_CONTAINER || 'supabase_db_PopBia';
if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(container)) throw new Error('Local Supabase container required.');
const db = `popbia_trial_migration_${Date.now()}`;
const sql = input => execFileSync('docker', ['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'], { input, encoding:'utf8', stdio:['pipe','pipe','pipe'] });
execFileSync('docker',['exec',container,'psql','-U','postgres','-c',`create database ${db}`]);
try {
  sql(`create schema auth; create schema realtime;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ select $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  sql(readFileSync('supabase/migrations/202610050001_collection.sql','utf8'));
  sql(`insert into public.businesses(id,name) values('00000000-0000-0000-0000-000000000001','Legacy business');
    insert into public.collection_orders(business_id,number,type) values('00000000-0000-0000-0000-000000000001',47,'number');`);
  sql(readFileSync('supabase/migrations/202610070001_collection_entitlements.sql','utf8'));
  sql(readFileSync('supabase/migrations/202610090001_automatic_order_numbers.sql','utf8'));
  sql(`do $$ begin
    if (select next_number from public.businesses where id='00000000-0000-0000-0000-000000000001') <> 1 then raise exception 'Existing counter changed'; end if;
    if not exists(select 1 from public.collection_orders where number=47) then raise exception 'Existing number changed'; end if;
  end $$;`);
  // Cron itself is exercised in the main local Supabase database/browser suite.
  sql(readFileSync('supabase/migrations/202610090002_ready_auto_clear.sql','utf8').split('-- No browser heartbeat')[0] + '\ncommit;');
  sql(`do $$ begin
    if (select ready_auto_clear_seconds from public.businesses where id='00000000-0000-0000-0000-000000000001') <> 600 then raise exception 'Legacy default incorrect'; end if;
    if not exists(select 1 from public.collection_orders where number=47) then raise exception 'Existing order changed'; end if;
  end $$;`);
  sql(`do $$ declare e public.business_entitlements; begin
    select * into e from public.business_entitlements where business_id='00000000-0000-0000-0000-000000000001';
    if e.subscription_status <> 'active' or not e.legacy_access or e.trial_ends_at is not null or e.plan is not null then raise exception 'Legacy backfill incorrect'; end if;
    if not public.collection_access_allowed(e.business_id) then raise exception 'Legacy business locked'; end if;
    if not exists(select 1 from public.collection_orders where business_id=e.business_id and number=47) then raise exception 'Legacy data lost'; end if;
    insert into public.businesses(id,name) values('00000000-0000-0000-0000-000000000002','New trial');
    if (select ready_auto_clear_seconds from public.businesses where id='00000000-0000-0000-0000-000000000002') <> 600 then raise exception 'New workspace default incorrect'; end if;
    select * into e from public.business_entitlements where business_id='00000000-0000-0000-0000-000000000002';
    if e.subscription_status <> 'trialing' or e.legacy_access or e.trial_ends_at-e.trial_started_at <> interval '336 hours' then raise exception 'New trial incorrect'; end if;
    -- At the deadline, without materializing status, access is already denied.
    update public.business_entitlements set trial_started_at=statement_timestamp()-interval '336 hours',trial_ends_at=statement_timestamp() where business_id=e.business_id;
  end $$;`);
  sql(`do $$ begin
    if public.collection_access_allowed('00000000-0000-0000-0000-000000000002') then raise exception 'Deadline bypass'; end if;
    if not public.collection_access_allowed('00000000-0000-0000-0000-000000000001') then raise exception 'Legacy access changed'; end if;
  end $$;`);
  console.log('PASS: original schema → legacy business/order → migration preserves active non-expiring access; new businesses get exact 336-hour trials; deadline is enforced without a status refresh.');
} finally {
  execFileSync('docker',['exec',container,'psql','-U','postgres','-c',`drop database ${db} with (force)`]);
}
