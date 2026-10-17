-- شغّل ADT_CONTROL_MULTI_APP.sql أولاً إن لم تكن شغّلته سابقاً، ثم شغّل هذا الملف.
-- أول تسجيل دخول صحيح برمز المطور يربط ADT Control بهذا الجهاز وحده.
create extension if not exists pgcrypto;

create table if not exists public.adt_control_owner_device (
  singleton boolean primary key default true check (singleton),
  device_id text not null,
  bound_at timestamptz not null default now()
);
alter table public.adt_control_owner_device enable row level security;
revoke all on public.adt_control_owner_device from public, anon, authenticated;

create or replace function public.adt_control_assert_developer(p_dev_pin text,p_device_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner text;
begin
  if length(coalesce(p_device_id,''))<16 or
     public.adt_verify_dev_pin(p_dev_pin,p_device_id) is distinct from true then
    raise exception 'DEVELOPER_AUTH_FAILED';
  end if;
  insert into public.adt_control_owner_device(singleton,device_id)
  values(true,p_device_id) on conflict (singleton) do nothing;
  select device_id into v_owner from public.adt_control_owner_device where singleton=true;
  if v_owner is distinct from p_device_id then raise exception 'OWNER_DEVICE_ONLY'; end if;
end $$;
revoke all on function public.adt_control_assert_developer(text,text) from public,anon,authenticated;

-- كل شاشات فرق ADT Control تمر عبر تحقق جهاز المالك، وليس رمز المطور فقط.
create or replace function public.adt_control_admin_list_teams(p_dev_pin text,p_device_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; v_first jsonb;
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  select coalesce(jsonb_agg(to_jsonb(row_data)),'[]'::jsonb) into v_rows
  from public.adt_admin_list_teams(p_dev_pin,p_device_id) row_data;
  if jsonb_array_length(v_rows)=1 then
    v_first:=v_rows->0;
    if jsonb_typeof(v_first)='array' then return v_first; end if;
    if jsonb_typeof(v_first->'adt_admin_list_teams')='array' then return v_first->'adt_admin_list_teams'; end if;
  end if;
  return v_rows;
end $$;
create or replace function public.adt_control_admin_extend_subscription(p_dev_pin text,p_team_id text,p_days integer,p_device_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  perform public.adt_admin_extend_subscription(p_dev_pin,p_team_id,p_days,p_device_id);
  return true;
end $$;
create or replace function public.adt_control_admin_set_frozen(p_dev_pin text,p_team_id text,p_frozen boolean,p_device_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  perform public.adt_admin_set_frozen(p_dev_pin,p_team_id,p_frozen,p_device_id);
  return true;
end $$;

create or replace function public.adt_control_admin_list_stock_users(p_dev_pin text,p_device_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'team_id',m.team_id,'team_name',t.name,'team_code',t.code,
    'user_name',m.user_name,'phone',m.member_phone,'role',m.role,'status',m.status,
    'device_id',m.user_id,'created_at',m.created_at,
    'can_edit_products',m.can_edit_products,'can_manage_shortages',m.can_manage_shortages,
    'can_edit_debts',m.can_edit_debts,'can_manage_money_records',m.can_manage_money_records,
    'can_audit',m.can_audit,'can_view_cost',m.can_view_cost,
    'can_create_invoices',m.can_create_invoices,'can_manage_daily_sales',m.can_manage_daily_sales,
    'can_edit_sell_price',m.can_edit_sell_price,'can_manage_catalog',m.can_manage_catalog
  ) order by t.name,m.created_at) from public.team_members m join public.teams t on t.id=m.team_id),'[]'::jsonb);
end $$;

create or replace function public.adt_control_admin_member_action(
  p_dev_pin text,p_device_id text,p_member_id text,p_action text,p_payload jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_member public.team_members%rowtype; v_password text;
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  select * into v_member from public.team_members where id::text=p_member_id for update;
  if not found or v_member.role='manager' then return false; end if;
  if p_action='approve' then
    update public.team_members set status='approved' where id=v_member.id;
  elsif p_action='remove' then
    delete from public.team_members where id=v_member.id;
  elsif p_action='permissions' then
    if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then return false; end if;
    update public.team_members set
      role=case when coalesce((p_payload->>'sub_manager')::boolean,false) then 'sub_manager' else 'member' end,
      can_edit_products=coalesce((p_payload->>'can_edit_products')::boolean,false),
      can_manage_shortages=coalesce((p_payload->>'can_manage_shortages')::boolean,false),
      can_edit_debts=coalesce((p_payload->>'can_edit_debts')::boolean,false),
      can_manage_money_records=coalesce((p_payload->>'can_manage_money_records')::boolean,false),
      can_audit=coalesce((p_payload->>'can_audit')::boolean,false),
      can_view_cost=coalesce((p_payload->>'can_view_cost')::boolean,false),
      can_create_invoices=coalesce((p_payload->>'can_create_invoices')::boolean,false),
      can_manage_daily_sales=coalesce((p_payload->>'can_manage_daily_sales')::boolean,false),
      can_edit_sell_price=coalesce((p_payload->>'can_edit_sell_price')::boolean,false),
      can_manage_catalog=coalesce((p_payload->>'can_manage_catalog')::boolean,false)
    where id=v_member.id;
  elsif p_action='reset_password' then
    v_password:=p_payload->>'password';
    if length(coalesce(v_password,''))<6 then return false; end if;
    update public.team_members set member_password_hash=crypt(v_password,gen_salt('bf')) where id=v_member.id;
  else
    return false;
  end if;
  return found;
end $$;

-- الجرد ميزة مدفوعة للمتجر كله؛ صلاحية العضو تبقى شرطاً إضافياً داخل التطبيق.
create or replace function public.adt_control_admin_set_audit_feature(
  p_dev_pin text,p_device_id text,p_team_id text,p_enabled boolean
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_team public.teams%rowtype;
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  select * into v_team from public.teams where id::text=p_team_id for update;
  if not found or upper(trim(coalesce(v_team.code,'')))='086' then return false; end if;
  update public.teams set features=coalesce(features,'{}'::jsonb)||jsonb_build_object('audit',coalesce(p_enabled,false))
  where id=v_team.id;
  return found;
end $$;

create or replace function public.adt_control_audit_entitlement(p_team_id text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select upper(trim(coalesce(t.code,'')))='086' or
                        coalesce(t.features->>'audit','false')='true'
                   from public.teams t where t.id::text=p_team_id),false);
$$;

revoke all on function public.adt_control_admin_list_teams(text,text) from public;
revoke all on function public.adt_control_admin_extend_subscription(text,text,integer,text) from public;
revoke all on function public.adt_control_admin_set_frozen(text,text,boolean,text) from public;
revoke all on function public.adt_control_admin_member_action(text,text,text,text,jsonb) from public;
revoke all on function public.adt_control_admin_set_audit_feature(text,text,text,boolean) from public;
revoke all on function public.adt_control_audit_entitlement(text) from public;
grant execute on function public.adt_control_admin_list_teams(text,text) to anon,authenticated;
grant execute on function public.adt_control_admin_extend_subscription(text,text,integer,text) to anon,authenticated;
grant execute on function public.adt_control_admin_set_frozen(text,text,boolean,text) to anon,authenticated;
grant execute on function public.adt_control_admin_member_action(text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.adt_control_admin_set_audit_feature(text,text,text,boolean) to anon,authenticated;
grant execute on function public.adt_control_audit_entitlement(text) to anon,authenticated;
notify pgrst,'reload schema';

-- V4: لوحة التحكم مخصصة لـADT Stock وحده. لا نحذف أي بيانات لتطبيقات أخرى قديمة.
create or replace function public.adt_control_admin_list_apps(p_dev_pin text,p_device_id text)
returns setof public.adt_control_apps language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  return query select * from public.adt_control_apps where app_id='adt-stock';
end $$;

create or replace function public.adt_control_admin_save_app(
 p_dev_pin text,p_device_id text,p_app_id text,p_app_name text,p_package_name text,
 p_status text,p_maintenance_message text,p_version_code integer,p_version_name text,
 p_update_url text,p_required_update boolean,p_features jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  if p_app_id is distinct from 'adt-stock' or p_status not in ('active','maintenance','disabled') or
     p_version_code is null or p_version_code<1 or
     (nullif(trim(coalesce(p_update_url,'')),'') is not null and p_update_url !~* '^https://[^[:space:]]+$') then
    return false;
  end if;
  insert into public.adt_control_apps
    (app_id,app_name,package_name,status,maintenance_message,version_code,version_name,update_url,required_update,features,updated_at)
  values ('adt-stock','ADT Stock',coalesce(nullif(trim(p_package_name),''),'com.adt.pro'),p_status,
     left(coalesce(p_maintenance_message,''),500),p_version_code,left(coalesce(nullif(trim(p_version_name),''),p_version_code::text),40),
     nullif(trim(coalesce(p_update_url,'')),''),coalesce(p_required_update,false),coalesce(p_features,'{}'::jsonb),now())
  on conflict(app_id) do update set status=excluded.status,maintenance_message=excluded.maintenance_message,
     version_code=excluded.version_code,version_name=excluded.version_name,update_url=excluded.update_url,
     required_update=excluded.required_update,features=excluded.features,updated_at=now();
  return true;
end $$;

create or replace function public.adt_control_admin_send_notice(
 p_dev_pin text,p_device_id text,p_app_id text,p_title text,p_message text,p_notice_type text default 'message'
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.adt_control_assert_developer(p_dev_pin,p_device_id);
  if p_app_id is distinct from 'adt-stock' or char_length(trim(coalesce(p_message,'')))<1 then return false; end if;
  update public.adt_control_notices set active=false where app_id='adt-stock' and active=true;
  insert into public.adt_control_notices(app_id,title,message,notice_type)
  values('adt-stock',left(coalesce(nullif(trim(p_title),''),'إشعار من المطور'),100),left(trim(p_message),1000),
    case when p_notice_type in ('message','force_reload','maintenance') then p_notice_type else 'message' end);
  return true;
end $$;

notify pgrst,'reload schema';
