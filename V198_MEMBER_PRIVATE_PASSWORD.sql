-- ADT Stock V198
-- دخول العضو برقم الهاتف وكلمة مرور خاصة، بدون كود المتجر بعد الانضمام.
-- شغّل الملف مرة واحدة كاملاً داخل Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.team_members
  add column if not exists member_password_hash text;

create or replace function public.adt_request_join_team_v198(
  p_team_code text,
  p_team_password text,
  p_member_password text,
  p_user_id text,
  p_user_name text,
  p_member_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(trim(coalesce(p_team_code,'')));
  v_phone text := regexp_replace(coalesce(p_member_phone,''), '[^0-9+]', '', 'g');
  v_alt text;
  v_team public.teams%rowtype;
  v_member public.team_members%rowtype;
  v_hash text;
  v_result jsonb;
  v_team_id text;
begin
  if v_code='' or v_phone='' or coalesce(trim(p_user_name),'')='' or
     coalesce(p_team_password,'')='' or length(coalesce(p_member_password,'')) < 6 or
     coalesce(trim(p_user_id),'')='' then
    raise exception 'INVALID_JOIN_DATA';
  end if;

  v_alt := case when left(v_phone,1)='0' then substr(v_phone,2) else '0'||v_phone end;

  select t.* into v_team from public.teams t
  where upper(trim(t.code))=v_code limit 1;
  if not found then raise exception 'INVALID_TEAM_CREDENTIALS'; end if;

  select s.password_hash into v_hash from public.team_secrets s where s.team_id=v_team.id;
  if not found or v_hash <> crypt(p_team_password,v_hash) then
    raise exception 'INVALID_TEAM_CREDENTIALS';
  end if;

  -- رقم الهاتف هو هوية فريدة. العضو القديم في نفس المتجر يستطيع تعيين
  -- كلمته الخاصة مرة واحدة من شاشة الانضمام دون إنشاء حساب مكرر.
  -- المدير الجديد يملك كلمة مرور حساب مستقلة عن كلمة مرور المحل.
  select m.* into v_member from public.team_members m
  where m.role = 'manager' and coalesce(m.member_password_hash,'') <> '' and (
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_phone or
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_alt
  ) order by m.created_at asc nulls last limit 1 for update;

  if found then
    if coalesce(v_member.status,'approved') <> 'approved' then raise exception 'MEMBER_NOT_APPROVED'; end if;
    v_ok := v_member.member_password_hash=crypt(p_password,v_member.member_password_hash);
    perform public.adt_auth_record(v_scope,p_device_id,v_ok);
    if not v_ok then raise exception 'INVALID_LOGIN'; end if;
    update public.team_members set user_id=p_device_id,member_phone=v_phone where id=v_member.id;
    select * into v_member from public.team_members where id=v_member.id;
    select * into v_team from public.teams where id=v_member.team_id;
    update public.teams set last_seen_at=now() where id=v_team.id;
    return jsonb_build_object('team',to_jsonb(v_team)-'password'-'lock_pin',
      'member',to_jsonb(v_member)-'member_password_hash','role','manager','session_token','');
  end if;

  select m.* into v_member from public.team_members m
  where m.role <> 'manager' and (
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_phone or
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_alt
  ) order by m.created_at asc nulls last limit 1 for update;

  if found then
    if v_member.team_id::text <> v_team.id::text then raise exception 'PHONE_ALREADY_USED'; end if;
    if coalesce(v_member.member_password_hash,'')<>'' then raise exception 'ACCOUNT_ALREADY_EXISTS'; end if;
    if coalesce(v_member.user_id,'')<>p_user_id then raise exception 'PHONE_ALREADY_USED'; end if;
    update public.team_members set
      member_password_hash=crypt(p_member_password,gen_salt('bf')),
      user_id=p_user_id,
      user_name=coalesce(nullif(trim(p_user_name),''),user_name),
      member_phone=v_phone
    where id=v_member.id;
    select * into v_member from public.team_members where id=v_member.id;
    return jsonb_build_object('team',to_jsonb(v_team)-'password'-'lock_pin',
      'member',to_jsonb(v_member)-'member_password_hash','role',coalesce(v_member.role,'member'),
      'status',coalesce(v_member.status,'pending'),'session_token','');
  end if;

  -- المسار الأصلي ينشئ طلب الانضمام ويحافظ على كل قواعد الصلاحيات الحالية.
  v_result := public.adt_request_join_team(
    p_team_code => v_code,
    p_password => p_team_password,
    p_user_id => p_user_id,
    p_user_name => p_user_name,
    p_member_phone => v_phone
  );
  v_team_id := coalesce(v_result->'team'->>'id','');
  if v_team_id='' then raise exception 'JOIN_FAILED'; end if;

  update public.team_members set member_password_hash=crypt(p_member_password,gen_salt('bf'))
  where team_id::text=v_team_id and user_id=p_user_id and role <> 'manager';

  select * into v_member from public.team_members
  where team_id::text=v_team_id and user_id=p_user_id and role <> 'manager'
  order by created_at desc nulls last limit 1;

  return jsonb_set(v_result,'{member}',to_jsonb(v_member)-'member_password_hash',true);
end;
$$;

create or replace function public.adt_account_login_v198(
  p_phone text,
  p_password text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  v_alt text;
  v_scope text;
  v_member public.team_members%rowtype;
  v_team public.teams%rowtype;
  v_ok boolean := false;
begin
  if v_phone='' or coalesce(p_password,'')='' or coalesce(trim(p_device_id),'')='' then
    raise exception 'INVALID_LOGIN';
  end if;
  v_alt := case when left(v_phone,1)='0' then substr(v_phone,2) else '0'||v_phone end;
  v_scope := 'account_login:'||lower(v_phone);
  if not public.adt_auth_is_allowed(v_scope,p_device_id) then raise exception 'TOO_MANY_ATTEMPTS'; end if;

  select m.* into v_member from public.team_members m
  where m.role <> 'manager' and (
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_phone or
    regexp_replace(coalesce(m.member_phone,''), '[^0-9+]', '', 'g')=v_alt
  ) order by m.created_at asc nulls last limit 1 for update;

  if found then
    if coalesce(v_member.status,'pending') <> 'approved' then raise exception 'MEMBER_NOT_APPROVED'; end if;
    if coalesce(v_member.member_password_hash,'')='' then raise exception 'PASSWORD_SETUP_REQUIRED'; end if;
    v_ok := v_member.member_password_hash=crypt(p_password,v_member.member_password_hash);
    perform public.adt_auth_record(v_scope,p_device_id,v_ok);
    if not v_ok then raise exception 'INVALID_LOGIN'; end if;
    update public.team_members set user_id=p_device_id,member_phone=v_phone where id=v_member.id;
    select * into v_member from public.team_members where id=v_member.id;
    select * into v_team from public.teams where id=v_member.team_id;
    update public.teams set last_seen_at=now() where id=v_team.id;
    return jsonb_build_object('team',to_jsonb(v_team)-'password'-'lock_pin',
      'member',to_jsonb(v_member)-'member_password_hash','role',coalesce(v_member.role,'member'),
      'session_token','');
  end if;

  -- إن لم يكن الرقم لعضو، نستخدم تسجيل المدير الحالي كما هو.
  begin
    return public.adt_unified_login(p_phone,p_password,p_device_id);
  exception when others then
    perform public.adt_auth_record(v_scope,p_device_id,false);
    raise exception 'INVALID_LOGIN';
  end;
end;
$$;

revoke all on function public.adt_request_join_team_v198(text,text,text,text,text,text) from public;
revoke all on function public.adt_account_login_v198(text,text,text) from public;
grant execute on function public.adt_request_join_team_v198(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.adt_account_login_v198(text,text,text) to anon, authenticated;

select 'ADT Stock V198 member private password installed' as result;


-- V276: إنشاء الحساب والمدير والمحل في عملية واحدة، مع كلمتي مرور منفصلتين.
create or replace function public.create_team_with_activation_v276(
  p_activation_key text,
  p_team_name text,
  p_team_code text,
  p_team_password text,
  p_manager_password text,
  p_manager_name text,
  p_manager_phone text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  k public.adt_activation_keys%rowtype;
  t public.teams%rowtype;
  v_exp timestamptz;
  v_phone text := regexp_replace(coalesce(p_manager_phone,''), '[^0-9+]', '', 'g');
begin
  if length(coalesce(p_manager_password,'')) < 6 then raise exception 'WEAK_MANAGER_PASSWORD'; end if;
  if length(coalesce(p_team_password,'')) < 6 then raise exception 'WEAK_PASSWORD'; end if;
  if coalesce(trim(p_manager_name),'')='' or v_phone='' then raise exception 'MISSING_MANAGER_DATA'; end if;

  select * into k from public.adt_activation_keys
  where activation_key=upper(trim(p_activation_key))
  for update;
  if not found then raise exception 'INVALID_ACTIVATION'; end if;
  if k.used then raise exception 'ACTIVATION_ALREADY_USED'; end if;

  if exists(select 1 from public.team_members where regexp_replace(coalesce(member_phone,''), '[^0-9+]', '', 'g')=v_phone and role='manager') then
    raise exception 'PHONE_ALREADY_USED';
  end if;
  if exists(select 1 from public.teams where upper(trim(code))=upper(trim(p_team_code))) then
    raise exception 'TEAM_CODE_ALREADY_EXISTS';
  end if;

  v_exp := case lower(coalesce(k.duration,''))
    when '1year' then now()+interval '1 year'
    when '6months' then now()+interval '6 months'
    when '6month' then now()+interval '6 months'
    when '1month' then now()+interval '1 month'
    when 'lifetime' then null
    else null end;

  insert into public.teams(name,code,password,manager_name,manager_phone,expires_at,features,is_frozen,is_locked,created_at,last_seen_at)
  values(left(trim(p_team_name),200),upper(trim(p_team_code)),p_team_password,left(trim(p_manager_name),150),v_phone,v_exp,
         jsonb_build_object('catalog',false,'shortages',false),false,false,now(),now())
  returning * into t;

  insert into public.team_members(team_id,user_id,user_name,role,status,can_edit_products,can_manage_shortages,can_edit_debts,can_audit,can_view_cost,created_at,member_phone,member_password_hash)
  values(t.id,p_device_id,left(trim(p_manager_name),150),'manager','approved',true,true,true,true,true,now(),v_phone,crypt(p_manager_password,gen_salt('bf')));

  update public.adt_activation_keys
  set used=true,used_at=now(),used_team_id=t.id
  where activation_key=k.activation_key;

  select * into t from public.teams where id=t.id;
  return jsonb_build_object('team',to_jsonb(t)-'password'-'lock_pin','manager_name',t.manager_name,'manager_phone',t.manager_phone);
end;
$$;

revoke all on function public.create_team_with_activation_v276(text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_team_with_activation_v276(text,text,text,text,text,text,text,text) to anon, authenticated;
