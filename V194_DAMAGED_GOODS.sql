-- ADT Stock V194 — سجل البضاعة التالفة والمنتهية
-- شغّل الملف مرة واحدة في Supabase SQL Editor قبل استخدام الميزة.

create extension if not exists pgcrypto;

create table if not exists public.adt_damaged_goods (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_type text not null check (unit_type in ('pack','piece')),
  unit_name text not null default 'وحدة',
  buy_price numeric(18,4) not null check (buy_price >= 0),
  total_cost numeric(18,4) generated always as (round(quantity * buy_price,4)) stored,
  reason text not null check (reason in ('expired','damaged','other')),
  note text,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists adt_damaged_goods_team_date_idx
  on public.adt_damaged_goods(team_id,recorded_at desc);

alter table public.adt_damaged_goods enable row level security;
revoke all on table public.adt_damaged_goods from public,anon,authenticated;

create or replace function public.adt_damaged_goods_add(
  p_team_id text,
  p_user_id text,
  p_product_id text,
  p_product_name text,
  p_quantity numeric,
  p_unit_type text,
  p_unit_name text,
  p_buy_price numeric,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare r public.adt_damaged_goods%rowtype;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_quantity,0)<=0 or coalesce(p_buy_price,0)<0 then raise exception 'INVALID_VALUE'; end if;
  if p_unit_type not in ('pack','piece') or p_reason not in ('expired','damaged','other') then raise exception 'INVALID_TYPE'; end if;

  insert into public.adt_damaged_goods(
    team_id,product_id,product_name,quantity,unit_type,unit_name,buy_price,reason,note,recorded_by
  ) values (
    p_team_id::uuid,left(trim(p_product_id),120),left(trim(p_product_name),240),round(p_quantity,4),p_unit_type,
    left(trim(coalesce(p_unit_name,'وحدة')),60),round(p_buy_price,4),p_reason,nullif(left(trim(coalesce(p_note,'')),250),''),p_user_id
  ) returning * into r;
  return to_jsonb(r);
end;
$$;

revoke all on function public.adt_damaged_goods_add(text,text,text,text,numeric,text,text,numeric,text,text) from public;
grant execute on function public.adt_damaged_goods_add(text,text,text,text,numeric,text,text,numeric,text,text) to anon,authenticated;

create or replace function public.adt_damaged_goods_fetch(p_team_id text,p_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc),'[]'::jsonb) into result
  from (
    select id,product_id,product_name,quantity,unit_type,unit_name,buy_price,total_cost,reason,note,recorded_at
    from public.adt_damaged_goods where team_id::text=p_team_id order by recorded_at desc limit 1000
  ) x;
  return result;
end;
$$;

revoke all on function public.adt_damaged_goods_fetch(text,text) from public;
grant execute on function public.adt_damaged_goods_fetch(text,text) to anon,authenticated;

create or replace function public.adt_damaged_goods_delete(p_team_id text,p_user_id text,p_record_id text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  delete from public.adt_damaged_goods where team_id::text=p_team_id and id::text=p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  return true;
end;
$$;

revoke all on function public.adt_damaged_goods_delete(text,text,text) from public;
grant execute on function public.adt_damaged_goods_delete(text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V194 damaged goods installed' as result;
