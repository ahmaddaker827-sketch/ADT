-- ADT Stock V212: نفذ الملف مرة واحدة بعد كود V206 المجمع في Supabase SQL Editor.
-- لا يحتاج تطبيق تحكم منفصل، ولا ملفات ADT_CONTROL_* السابقة.
-- يعتمد على public.adt_verify_dev_pin و public.teams و public.team_members من المشروع الأصلي.
create extension if not exists pgcrypto;
create table if not exists public.adt_control_apps (
  app_id text primary key,
  app_name text not null,
  package_name text not null default '',
  status text not null default 'active' check(status in ('active','maintenance','disabled')),
  maintenance_message text not null default '',
  version_code integer not null default 1 check(version_code>0),
  version_name text not null default '1.0.0',
  update_url text,
  required_update boolean not null default false,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.adt_control_notices (
  id bigint generated always as identity primary key,
  app_id text references public.adt_control_apps(app_id) on delete cascade,
  title text not null default 'إشعار من المطور',
  message text not null check(char_length(message) between 1 and 1000),
  notice_type text not null default 'message' check(notice_type in ('message','force_reload','maintenance')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.adt_control_apps enable row level security;
alter table public.adt_control_notices enable row level security;
revoke all on public.adt_control_apps,public.adt_control_notices from public,anon,authenticated;
insert into public.adt_control_apps(app_id,app_name,package_name,version_code,version_name)
values('adt-stock','ADT Stock','com.adt.pro',212,'2.12.0') on conflict(app_id) do nothing;

create or replace function public.adt_stock_dev_verify(p_dev_pin text,p_device_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.adt_verify_dev_pin(p_dev_pin,p_device_id) is distinct from true then
    raise exception 'DEVELOPER_AUTH_FAILED';
  end if;
end $$;
revoke all on function public.adt_stock_dev_verify(text,text) from public,anon,authenticated;

create or replace function public.adt_control_get_app_config(p_app_id text,p_installed_version integer default 0)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
   'status',a.status,'maintenance_message',a.maintenance_message,
   'version_code',a.version_code,'version_name',a.version_name,'update_url',a.update_url,
   'required_update',a.required_update,
   'notice',(select jsonb_build_object('id',n.id,'title',n.title,'message',n.message)
     from public.adt_control_notices n where n.app_id='adt-stock' and n.active=true order by n.id desc limit 1))
  from public.adt_control_apps a where a.app_id='adt-stock' and p_app_id='adt-stock';
$$;
create or replace function public.adt_stock_dev_get_settings(p_dev_pin text,p_device_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  select jsonb_build_object('status',status,'maintenance_message',maintenance_message,'version_code',version_code,
    'version_name',version_name,'update_url',update_url,'required_update',required_update)
    into v_result from public.adt_control_apps where app_id='adt-stock';
  return v_result;
end $$;
create or replace function public.adt_stock_dev_set_maintenance(p_dev_pin text,p_device_id text,p_enabled boolean,p_message text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  if p_enabled and length(trim(coalesce(p_message,'')))<8 then return false; end if;
  update public.adt_control_apps set status=case when p_enabled then 'maintenance' else 'active' end,
    maintenance_message=left(trim(coalesce(p_message,'')),500),updated_at=now() where app_id='adt-stock';
  return found;
end $$;
create or replace function public.adt_stock_dev_send_maintenance_notice(p_dev_pin text,p_device_id text,p_message text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  if length(trim(coalesce(p_message,'')))<8 then return false; end if;
  update public.adt_control_notices set active=false where app_id='adt-stock' and active=true;
  insert into public.adt_control_notices(app_id,title,message,notice_type)
  values('adt-stock','إشعار قبل الصيانة',left(trim(p_message),1000),'maintenance');
  return true;
end $$;

-- بيانات تعريفية فقط. كلمة المرور والهاش لا يرجعان إلى الواجهة إطلاقاً.
create or replace function public.adt_stock_dev_list_users(p_dev_pin text,p_device_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'team_id',m.team_id,'team_name',t.name,'team_code',t.code,
    'user_name',m.user_name,'phone',m.member_phone,'role',m.role,'status',m.status,
    'created_at',m.created_at) order by t.name,m.created_at)
    from public.team_members m join public.teams t on t.id=m.team_id),'[]'::jsonb);
end $$;
-- يمكن تعيين كلمة مرور جديدة للعضو، من دون قراءة الكلمة القديمة.
create or replace function public.adt_stock_dev_reset_member_password(p_dev_pin text,p_device_id text,p_member_id text,p_password text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  if char_length(coalesce(p_password,''))<6 then return false; end if;
  update public.team_members set member_password_hash=crypt(p_password,gen_salt('bf'))
    where id::text=p_member_id and role<>'manager';
  return found;
end $$;
create or replace function public.adt_stock_dev_set_audit_feature(p_dev_pin text,p_device_id text,p_team_id text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);
  update public.teams set features=coalesce(features,'{}'::jsonb)||jsonb_build_object('audit',coalesce(p_enabled,false))
  where id::text=p_team_id and upper(trim(coalesce(code,'')))<>'086';
  return found;
end $$;
create or replace function public.adt_control_audit_entitlement(p_team_id text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select upper(trim(coalesce(t.code,'')))='086' or coalesce(t.features->>'audit','false')='true'
   from public.teams t where t.id::text=p_team_id),false);
$$;
revoke all on function public.adt_control_get_app_config(text,integer) from public;
revoke all on function public.adt_stock_dev_get_settings(text,text) from public;
revoke all on function public.adt_stock_dev_set_maintenance(text,text,boolean,text) from public;
revoke all on function public.adt_stock_dev_send_maintenance_notice(text,text,text) from public;
revoke all on function public.adt_stock_dev_list_users(text,text) from public;
revoke all on function public.adt_stock_dev_reset_member_password(text,text,text,text) from public;
revoke all on function public.adt_stock_dev_set_audit_feature(text,text,text,boolean) from public;
revoke all on function public.adt_control_audit_entitlement(text) from public;
grant execute on function public.adt_control_get_app_config(text,integer) to anon,authenticated;
grant execute on function public.adt_stock_dev_get_settings(text,text) to anon,authenticated;
grant execute on function public.adt_stock_dev_set_maintenance(text,text,boolean,text) to anon,authenticated;
grant execute on function public.adt_stock_dev_send_maintenance_notice(text,text,text) to anon,authenticated;
grant execute on function public.adt_stock_dev_list_users(text,text) to anon,authenticated;
grant execute on function public.adt_stock_dev_reset_member_password(text,text,text,text) to anon,authenticated;
grant execute on function public.adt_stock_dev_set_audit_feature(text,text,text,boolean) to anon,authenticated;
grant execute on function public.adt_control_audit_entitlement(text) to anon,authenticated;
notify pgrst,'reload schema';
