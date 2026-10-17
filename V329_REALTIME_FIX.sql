begin;

-- ADT Stock V329 secure Realtime repair.
-- Run this migration in Supabase SQL Editor before installing V329.
-- It does NOT disable RLS and does NOT make team channels public.

create extension if not exists pgcrypto;

create table if not exists public.adt_realtime_device_credentials (
  team_id uuid not null,
  user_id text not null,
  device_id text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(team_id,user_id,device_id)
);
alter table public.adt_realtime_device_credentials enable row level security;
revoke all on table public.adt_realtime_device_credentials from public,anon,authenticated;

create or replace function public.adt_realtime_register_device_v320(
 p_team_id text,p_user_id text,p_device_id text,p_phone text,p_password text,p_device_secret text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare r jsonb; team text:=trim(coalesce(p_team_id,'')); usr text:=trim(coalesce(p_user_id,'')); dev text:=trim(coalesce(p_device_id,'')); sec text:=coalesce(p_device_secret,'');
begin
 if team='' or usr='' or dev='' or trim(coalesce(p_phone,''))='' or coalesce(p_password,'')='' or length(sec)<32 then raise exception 'INVALID_REALTIME_DEVICE_PROOF'; end if;
 r:=public.adt_account_login_v198(p_phone,p_password,p_device_id);
 if coalesce(r->'team'->>'id','')<>team or coalesce(r->'member'->>'user_id','')<>usr then raise exception 'REALTIME_IDENTITY_MISMATCH'; end if;
 insert into public.adt_realtime_device_credentials(team_id,user_id,device_id,secret_hash,updated_at,revoked_at)
 values(team::uuid,usr,dev,crypt(sec,gen_salt('bf')),now(),null)
 on conflict(team_id,user_id,device_id) do update set secret_hash=excluded.secret_hash,updated_at=now(),revoked_at=null;
 return true;
end $$;
revoke all on function public.adt_realtime_register_device_v320(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.adt_realtime_register_device_v320(text,text,text,text,text,text) to anon,authenticated;

create or replace function public.adt_realtime_verify_device_v320(p_team_id text,p_user_id text,p_device_id text,p_device_secret text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare h text; ok boolean:=false; team text:=trim(coalesce(p_team_id,'')); usr text:=trim(coalesce(p_user_id,'')); dev text:=trim(coalesce(p_device_id,'')); sec text:=coalesce(p_device_secret,'');
begin
 if team='' or usr='' or dev='' or length(sec)<32 then return false; end if;
 begin select secret_hash into h from public.adt_realtime_device_credentials where team_id=team::uuid and user_id=usr and device_id=dev and revoked_at is null; exception when invalid_text_representation then return false; end;
 if not found or h is null or h<>crypt(sec,h) then return false; end if;
 select exists(select 1 from public.team_members m where m.team_id=team::uuid and m.user_id=usr and m.status='approved') into ok;
 if not ok then return false; end if;
 update public.adt_realtime_device_credentials set updated_at=now() where team_id=team::uuid and user_id=usr and device_id=dev;
 return true;
end $$;
revoke all on function public.adt_realtime_verify_device_v320(text,text,text,text) from public,anon,authenticated;
grant execute on function public.adt_realtime_verify_device_v320(text,text,text,text) to service_role;

create or replace function public.adt_realtime_broadcast_changes()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare team text; topic text; payload jsonb; n jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD);
begin
 if TG_TABLE_NAME='teams' then team:=coalesce(n->>'id',o->>'id'); else team:=coalesce(n->>'team_id',o->>'team_id'); end if;
 if coalesce(team,'')='' then return coalesce(NEW,OLD); end if;
 topic:='adt:team:'||team;
 if TG_TABLE_NAME='products' then
   payload=jsonb_build_object('table','products','operation',TG_OP,
     'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('id',n->'id','team_id',n->'team_id','name',n->'name','buy_price',n->'buy_price','sell_price',n->'sell_price','supplier_name',n->'supplier_name','updated_at',n->'updated_at','price_updated_at',n->'price_updated_at','audit_qty',n->'audit_qty','pack_qty',n->'pack_qty','pack_name',n->'pack_name','piece_name',n->'piece_name') end,
     'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('id',o->'id','team_id',o->'team_id','name',o->'name','buy_price',o->'buy_price','sell_price',o->'sell_price','supplier_name',o->'supplier_name','updated_at',o->'updated_at','price_updated_at',o->'price_updated_at','audit_qty',o->'audit_qty','pack_qty',o->'pack_qty','pack_name',o->'pack_name','piece_name',o->'piece_name') end);
 elsif TG_TABLE_NAME='adt_team_cloud_state' then
   payload=jsonb_build_object('table','adt_team_cloud_state','operation',TG_OP,'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('team_id',n->'team_id','state_key',n->'state_key','updated_at',n->'updated_at') end,'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('team_id',o->'team_id','state_key',o->'state_key','updated_at',o->'updated_at') end);
 elsif TG_TABLE_NAME='team_members' then
   payload=jsonb_build_object('table','team_members','operation',TG_OP,'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('id',n->'id','team_id',n->'team_id','user_id',n->'user_id','role',n->'role','status',n->'status','can_grocery_audit',n->'can_grocery_audit') end,'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('id',o->'id','team_id',o->'team_id','user_id',o->'user_id','role',o->'role','status',o->'status') end);
 elsif TG_TABLE_NAME='teams' then
   payload=jsonb_build_object('table','teams','operation',TG_OP,'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('id',n->'id','features',n->'features') end,'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('id',o->'id','features',o->'features') end);
 else return coalesce(NEW,OLD); end if;
 perform realtime.send(payload,TG_OP,topic,true);
 return coalesce(NEW,OLD);
end $$;
revoke all on function public.adt_realtime_broadcast_changes() from public,anon,authenticated;

drop trigger if exists adt_products_realtime_broadcast on public.products;
create trigger adt_products_realtime_broadcast after insert or update or delete on public.products for each row execute function public.adt_realtime_broadcast_changes();
drop trigger if exists adt_cloud_state_realtime_broadcast on public.adt_team_cloud_state;
create trigger adt_cloud_state_realtime_broadcast after insert or update or delete on public.adt_team_cloud_state for each row execute function public.adt_realtime_broadcast_changes();
drop trigger if exists adt_team_members_realtime_broadcast on public.team_members;
create trigger adt_team_members_realtime_broadcast after insert or update or delete on public.team_members for each row execute function public.adt_realtime_broadcast_changes();
drop trigger if exists adt_teams_realtime_broadcast on public.teams;
create trigger adt_teams_realtime_broadcast after insert or update or delete on public.teams for each row execute function public.adt_realtime_broadcast_changes();

drop policy if exists "adt_realtime_team_broadcast_read" on realtime.messages;
create policy "adt_realtime_team_broadcast_read" on realtime.messages for select to authenticated using (
 extension='broadcast' and split_part(realtime.topic(),':',1)='adt' and split_part(realtime.topic(),':',2)='team'
 and split_part(realtime.topic(),':',3)=coalesce(auth.jwt()->>'adt_team_id','')
 and exists(select 1 from public.team_members m where m.team_id::text=coalesce(auth.jwt()->>'adt_team_id','') and m.user_id=coalesce(auth.jwt()->>'adt_user_id','') and m.status='approved')
);

commit;
notify pgrst,'reload schema';
select 'ADT Stock V329 Realtime repair installed' as result;
