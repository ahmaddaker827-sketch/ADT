-- ADT Stock V195 — سجل إثبات التحويلات والاستلامات المستقل عن الديون
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.adt_money_parties (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  party_type text not null check (party_type in ('supplier','customer')),
  name text not null,
  phone text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.adt_money_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  party_id uuid not null references public.adt_money_parties(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  reference text,
  note text,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists adt_money_parties_team_type_idx on public.adt_money_parties(team_id,party_type,name);
create index if not exists adt_money_records_team_party_date_idx on public.adt_money_records(team_id,party_id,recorded_at desc);
alter table public.adt_money_parties enable row level security;
alter table public.adt_money_records enable row level security;
revoke all on table public.adt_money_parties from public,anon,authenticated;
revoke all on table public.adt_money_records from public,anon,authenticated;

create or replace function public.adt_money_party_add(p_team_id text,p_user_id text,p_party_type text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_parties%rowtype;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_party_type not in ('supplier','customer') or btrim(coalesce(p_name,''))='' then raise exception 'INVALID_DATA'; end if;
  insert into public.adt_money_parties(team_id,party_type,name,phone,created_by)
  values(p_team_id::uuid,p_party_type,left(btrim(p_name),160),nullif(left(btrim(coalesce(p_phone,'')),40),''),p_user_id)
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.adt_money_party_add(text,text,text,text,text) from public;
grant execute on function public.adt_money_party_add(text,text,text,text,text) to anon,authenticated;

create or replace function public.adt_money_record_add(p_team_id text,p_user_id text,p_party_id text,p_amount numeric,p_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_records%rowtype; v_type text;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'INVALID_AMOUNT'; end if;
  select party_type into v_type from public.adt_money_parties where id::text=p_party_id and team_id::text=p_team_id;
  if v_type is null then raise exception 'PARTY_NOT_FOUND'; end if;
  insert into public.adt_money_records(team_id,party_id,amount,reference,note,recorded_by)
  values(p_team_id::uuid,p_party_id::uuid,round(p_amount,2),nullif(left(btrim(coalesce(p_reference,'')),120),''),nullif(left(btrim(coalesce(p_note,'')),250),''),p_user_id)
  returning * into r;
  return to_jsonb(r)||jsonb_build_object('party_type',v_type);
end $$;
revoke all on function public.adt_money_record_add(text,text,text,numeric,text,text) from public;
grant execute on function public.adt_money_record_add(text,text,text,numeric,text,text) to anon,authenticated;

create or replace function public.adt_money_records_fetch(p_team_id text,p_user_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p jsonb; r jsonb;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into p from (
    select id,party_type,name,phone,created_at from public.adt_money_parties where team_id::text=p_team_id order by created_at desc
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc),'[]'::jsonb) into r from (
    select m.id,m.party_id,m.amount,m.reference,m.note,m.recorded_at,p.party_type
    from public.adt_money_records m join public.adt_money_parties p on p.id=m.party_id
    where m.team_id::text=p_team_id order by m.recorded_at desc limit 3000
  ) x;
  return jsonb_build_object('parties',p,'logs',r);
end $$;
revoke all on function public.adt_money_records_fetch(text,text) from public;
grant execute on function public.adt_money_records_fetch(text,text) to anon,authenticated;

create or replace function public.adt_money_record_delete(p_team_id text,p_user_id text,p_record_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  delete from public.adt_money_records where team_id::text=p_team_id and id::text=p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  return true;
end $$;
revoke all on function public.adt_money_record_delete(text,text,text) from public;
grant execute on function public.adt_money_record_delete(text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V195 independent money records installed' as result;
