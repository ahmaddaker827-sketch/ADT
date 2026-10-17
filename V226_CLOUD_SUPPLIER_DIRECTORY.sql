-- ADT Stock V226: حفظ دليل الموردين في Supabase بدلاً من الهاتف فقط.
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.adt_supplier_directory (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  phone text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists adt_supplier_directory_team_name_uidx
  on public.adt_supplier_directory(team_id,lower(btrim(name)));
create index if not exists adt_supplier_directory_team_idx
  on public.adt_supplier_directory(team_id,updated_at desc);

alter table public.adt_supplier_directory enable row level security;
revoke all on table public.adt_supplier_directory from public,anon,authenticated;

create or replace function public.adt_supplier_directory_access(p_team_id text,p_user_id text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.team_members m
    where m.team_id::text=p_team_id and m.user_id=p_user_id and m.status='approved'
      and case when p_write then m.role in ('manager','sub_manager')
               else (m.role in ('manager','sub_manager') or coalesce(m.can_manage_shortages,false)) end
  );
$$;
revoke all on function public.adt_supplier_directory_access(text,text,boolean) from public;

create or replace function public.adt_supplier_directory_fetch(p_team_id text,p_user_id text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not public.adt_supplier_directory_access(p_team_id,p_user_id,false) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into result
  from (select id,name,phone,created_at,updated_at from public.adt_supplier_directory where team_id::text=p_team_id order by name) x;
  return result;
end $$;
revoke all on function public.adt_supplier_directory_fetch(text,text) from public;
grant execute on function public.adt_supplier_directory_fetch(text,text) to anon,authenticated;

create or replace function public.adt_supplier_directory_add(p_team_id text,p_user_id text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adt_supplier_directory%rowtype; clean_name text;
begin
  if not public.adt_supplier_directory_access(p_team_id,p_user_id,true) then raise exception 'NOT_ALLOWED'; end if;
  clean_name=left(btrim(coalesce(p_name,'')),160);if clean_name='' then raise exception 'INVALID_NAME'; end if;
  insert into public.adt_supplier_directory(team_id,name,phone,created_by)
  values(p_team_id::uuid,clean_name,nullif(left(btrim(coalesce(p_phone,'')),40),''),p_user_id)
  on conflict do nothing returning * into r;
  if r.id is null then select * into r from public.adt_supplier_directory where team_id::text=p_team_id and lower(btrim(name))=lower(clean_name) limit 1; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.adt_supplier_directory_add(text,text,text,text) from public;
grant execute on function public.adt_supplier_directory_add(text,text,text,text) to anon,authenticated;

create or replace function public.adt_supplier_directory_update(p_team_id text,p_user_id text,p_supplier_id text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adt_supplier_directory%rowtype; clean_name text;
begin
  if not public.adt_supplier_directory_access(p_team_id,p_user_id,true) then raise exception 'NOT_ALLOWED'; end if;
  clean_name=left(btrim(coalesce(p_name,'')),160);if clean_name='' then raise exception 'INVALID_NAME'; end if;
  update public.adt_supplier_directory set name=clean_name,phone=nullif(left(btrim(coalesce(p_phone,'')),40),''),updated_at=now()
  where team_id::text=p_team_id and id::text=p_supplier_id returning * into r;
  if r.id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.adt_supplier_directory_update(text,text,text,text,text) from public;
grant execute on function public.adt_supplier_directory_update(text,text,text,text,text) to anon,authenticated;

create or replace function public.adt_supplier_directory_delete(p_team_id text,p_user_id text,p_supplier_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.adt_supplier_directory_access(p_team_id,p_user_id,true) then raise exception 'NOT_ALLOWED'; end if;
  delete from public.adt_supplier_directory where team_id::text=p_team_id and id::text=p_supplier_id;
  if not found then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  return true;
end $$;
revoke all on function public.adt_supplier_directory_delete(text,text,text) from public;
grant execute on function public.adt_supplier_directory_delete(text,text,text) to anon,authenticated;

-- حالة سحابية للبيانات التجارية الصغيرة التي لا تملك جداول مستقلة.
create table if not exists public.adt_team_cloud_state (
  team_id uuid not null references public.teams(id) on delete cascade,
  state_key text not null,
  state_value jsonb not null default '{}'::jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key(team_id,state_key),
  check(state_key in ('invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit'))
);
alter table public.adt_team_cloud_state enable row level security;
revoke all on table public.adt_team_cloud_state from public,anon,authenticated;

create or replace function public.adt_cloud_state_allowed(p_team_id text,p_user_id text,p_state_key text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.team_members m
    where m.team_id::text=p_team_id and m.user_id=p_user_id and m.status='approved'
      and (
        (not p_write and p_state_key in ('invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit'))
        or (p_write and p_state_key='invoice_history' and (m.role='manager' or coalesce(m.can_create_invoices,false)))
        or (p_write and p_state_key in ('retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit') and (m.role='manager' or coalesce(m.can_audit,false)))
      )
  );
$$;
revoke all on function public.adt_cloud_state_allowed(text,text,text,boolean) from public;

create or replace function public.adt_cloud_state_get(p_team_id text,p_user_id text,p_state_keys text[])
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not exists(select 1 from unnest(coalesce(p_state_keys,array[]::text[])) k where public.adt_cloud_state_allowed(p_team_id,p_user_id,k,false)) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(jsonb_object_agg(s.state_key,s.state_value),'{}'::jsonb) into result
  from public.adt_team_cloud_state s
  where s.team_id::text=p_team_id and s.state_key=any(coalesce(p_state_keys,array[]::text[]))
    and public.adt_cloud_state_allowed(p_team_id,p_user_id,s.state_key,false);
  return result;
end $$;
revoke all on function public.adt_cloud_state_get(text,text,text[]) from public;
grant execute on function public.adt_cloud_state_get(text,text,text[]) to anon,authenticated;

create or replace function public.adt_cloud_state_set(p_team_id text,p_user_id text,p_state_key text,p_state_value jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.adt_cloud_state_allowed(p_team_id,p_user_id,p_state_key,true) then raise exception 'NOT_ALLOWED'; end if;
  if p_state_value is null then raise exception 'INVALID_STATE'; end if;
  insert into public.adt_team_cloud_state(team_id,state_key,state_value,updated_by)
  values(p_team_id::uuid,p_state_key,p_state_value,p_user_id)
  on conflict(team_id,state_key) do update set state_value=excluded.state_value,updated_by=excluded.updated_by,updated_at=now();
  return true;
end $$;
revoke all on function public.adt_cloud_state_set(text,text,text,jsonb) from public;
grant execute on function public.adt_cloud_state_set(text,text,text,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V226 cloud persistence installed' as result;
