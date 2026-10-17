-- ADT Stock V206 — صلاحية الدفعات والاستلامات للأعضاء
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

alter table public.team_members
  add column if not exists can_manage_money_records boolean not null default false;

create or replace function public.adt_can_manage_money_records(p_team_id text,p_user_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.team_members m
    where m.team_id::text=p_team_id and m.user_id=p_user_id and m.status='approved'
      and (m.role='manager' or coalesce(m.can_manage_money_records,false)=true)
  );
$$;
revoke all on function public.adt_can_manage_money_records(text,text) from public;
grant execute on function public.adt_can_manage_money_records(text,text) to anon,authenticated;

create or replace function public.adt_manager_member_action(p_team_id text,p_manager_user_id text,p_member_id text,p_action text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_allowed boolean; v_sub boolean;
begin
  begin v_team:=p_team_id::uuid; exception when others then return false; end;
  select exists(select 1 from public.team_members m where m.team_id=v_team and m.user_id=p_manager_user_id and m.status='approved' and m.role='manager') into v_allowed;
  if not v_allowed then return false; end if;
  if not exists(select 1 from public.team_members where id::text=p_member_id and team_id=v_team and role<>'manager') then return false; end if;
  if p_action='approve' then
    update public.team_members set status='approved' where id::text=p_member_id and team_id=v_team;
  elsif p_action in ('reject','remove') then
    delete from public.team_members where id::text=p_member_id and team_id=v_team and role<>'manager';
  elsif p_action='permissions' then
    v_sub:=coalesce((p_payload->>'sub_manager')::boolean,false);
    update public.team_members set
      role=case when v_sub then 'sub_manager' else 'member' end,
      can_edit_products=v_sub or coalesce((p_payload->>'can_edit_products')::boolean,false),
      can_manage_shortages=v_sub or coalesce((p_payload->>'can_manage_shortages')::boolean,false),
      can_edit_debts=v_sub or coalesce((p_payload->>'can_edit_debts')::boolean,false),
      can_manage_money_records=coalesce((p_payload->>'can_manage_money_records')::boolean,false),
      can_audit=v_sub or coalesce((p_payload->>'can_audit')::boolean,false),
      can_view_cost=v_sub or coalesce((p_payload->>'can_view_cost')::boolean,false),
      can_create_invoices=v_sub or coalesce((p_payload->>'can_create_invoices')::boolean,false),
      can_edit_sell_price=case when p_payload?'can_edit_sell_price' then v_sub or coalesce((p_payload->>'can_edit_sell_price')::boolean,false) else can_edit_sell_price end,
      can_manage_catalog=case when p_payload?'can_manage_catalog' then v_sub or coalesce((p_payload->>'can_manage_catalog')::boolean,false) else can_manage_catalog end,
      can_manage_daily_sales=coalesce((p_payload->>'can_manage_daily_sales')::boolean,false)
    where id::text=p_member_id and team_id=v_team and role<>'manager';
  else return false;
  end if;
  return found;
end;
$$;
revoke all on function public.adt_manager_member_action(text,text,text,text,jsonb) from public;
grant execute on function public.adt_manager_member_action(text,text,text,text,jsonb) to anon,authenticated;

create or replace function public.adt_money_party_add(p_team_id text,p_user_id text,p_party_type text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_parties%rowtype;
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_party_type not in ('supplier','customer') or btrim(coalesce(p_name,''))='' then raise exception 'INVALID_DATA'; end if;
  insert into public.adt_money_parties(team_id,party_type,name,phone,created_by) values(p_team_id::uuid,p_party_type,left(btrim(p_name),160),nullif(left(btrim(coalesce(p_phone,'')),40),''),p_user_id) returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.adt_money_record_add(p_team_id text,p_user_id text,p_party_id text,p_amount numeric,p_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_records%rowtype; v_type text;
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'INVALID_AMOUNT'; end if;
  select party_type into v_type from public.adt_money_parties where id::text=p_party_id and team_id::text=p_team_id;
  if v_type is null then raise exception 'PARTY_NOT_FOUND'; end if;
  insert into public.adt_money_records(team_id,party_id,amount,reference,note,recorded_by) values(p_team_id::uuid,p_party_id::uuid,round(p_amount,2),nullif(left(btrim(coalesce(p_reference,'')),120),''),nullif(left(btrim(coalesce(p_note,'')),250),''),p_user_id) returning * into r;
  return to_jsonb(r)||jsonb_build_object('party_type',v_type);
end; $$;

create or replace function public.adt_money_records_fetch(p_team_id text,p_user_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p jsonb; r jsonb;
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into p from (select id,party_type,name,phone,created_at from public.adt_money_parties where team_id::text=p_team_id order by created_at desc) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc),'[]'::jsonb) into r from (select m.id,m.party_id,m.amount,m.reference,m.note,m.recorded_at,p.party_type from public.adt_money_records m join public.adt_money_parties p on p.id=m.party_id where m.team_id::text=p_team_id order by m.recorded_at desc limit 3000) x;
  return jsonb_build_object('parties',p,'logs',r);
end; $$;

create or replace function public.adt_money_record_delete(p_team_id text,p_user_id text,p_record_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  delete from public.adt_money_records where team_id::text=p_team_id and id::text=p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if; return true;
end; $$;

create or replace function public.adt_money_party_delete(p_team_id text,p_user_id text,p_party_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  delete from public.adt_money_parties where team_id::text=p_team_id and id::text=p_party_id;
  if not found then raise exception 'PARTY_NOT_FOUND'; end if; return true;
end; $$;

create or replace function public.adt_money_party_update(p_team_id text,p_user_id text,p_party_id text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_parties%rowtype;
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'INVALID_NAME'; end if;
  update public.adt_money_parties set name=left(btrim(p_name),160),phone=nullif(left(btrim(coalesce(p_phone,'')),40),'') where team_id::text=p_team_id and id::text=p_party_id returning * into r;
  if r.id is null then raise exception 'PARTY_NOT_FOUND'; end if; return to_jsonb(r);
end; $$;

revoke all on function public.adt_money_party_add(text,text,text,text,text) from public;
revoke all on function public.adt_money_record_add(text,text,text,numeric,text,text) from public;
revoke all on function public.adt_money_records_fetch(text,text) from public;
revoke all on function public.adt_money_record_delete(text,text,text) from public;
revoke all on function public.adt_money_party_delete(text,text,text) from public;
revoke all on function public.adt_money_party_update(text,text,text,text,text) from public;
grant execute on function public.adt_money_party_add(text,text,text,text,text) to anon,authenticated;
grant execute on function public.adt_money_record_add(text,text,text,numeric,text,text) to anon,authenticated;
grant execute on function public.adt_money_records_fetch(text,text) to anon,authenticated;
grant execute on function public.adt_money_record_delete(text,text,text) to anon,authenticated;
grant execute on function public.adt_money_party_delete(text,text,text) to anon,authenticated;
grant execute on function public.adt_money_party_update(text,text,text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V206 member money records permission installed' as result;
