begin;

-- V295: صلاحية الجرد السريع + قراءة سحابية مستقرة للعضو.
alter table public.team_members
  add column if not exists can_grocery_audit boolean not null default false;

create or replace function public.adt_get_grocery_audit_permission(
  p_team_id text,
  p_user_id text
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.team_members m
    join public.teams t on t.id=m.team_id
    where m.team_id::text=p_team_id
      and m.user_id=p_user_id
      and (m.status='approved' or m.role='manager')
      and coalesce(t.features->>'grocery_audit','false')='true'
      and (m.role='manager' or coalesce(m.can_grocery_audit,false)=true)
  );
$$;

revoke all on function public.adt_get_grocery_audit_permission(text,text) from public;
grant execute on function public.adt_get_grocery_audit_permission(text,text) to anon,authenticated;

-- ضمان أن حفظ صلاحية العضو لا يربطها بصلاحية جرد محلک.
create or replace function public.adt_manager_member_action(
  p_team_id text,
  p_manager_user_id text,
  p_member_id text,
  p_action text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team uuid;
  v_allowed boolean;
  v_sub boolean;
begin
  begin v_team:=p_team_id::uuid; exception when others then return false; end;

  select exists(
    select 1 from public.team_members m
    where m.team_id=v_team
      and m.user_id=p_manager_user_id
      and m.status='approved'
      and m.role='manager'
  ) into v_allowed;
  if not v_allowed then return false; end if;

  if not exists(select 1 from public.team_members where id::text=p_member_id and team_id=v_team and role<>'manager') then
    return false;
  end if;

  if p_action='permissions' then
    v_sub:=coalesce((p_payload->>'sub_manager')::boolean,false);
    update public.team_members set
      role=case when v_sub then 'sub_manager' else 'member' end,
      can_edit_products=v_sub or coalesce((p_payload->>'can_edit_products')::boolean,false),
      can_manage_shortages=v_sub or coalesce((p_payload->>'can_manage_shortages')::boolean,false),
      can_edit_debts=v_sub or coalesce((p_payload->>'can_edit_debts')::boolean,false),
      can_manage_money_records=coalesce((p_payload->>'can_manage_money_records')::boolean,false),
      can_audit=coalesce((p_payload->>'can_audit')::boolean,false),
      can_grocery_audit=coalesce((p_payload->>'can_grocery_audit')::boolean,false),
      can_view_cost=v_sub or coalesce((p_payload->>'can_view_cost')::boolean,false),
      can_create_invoices=v_sub or coalesce((p_payload->>'can_create_invoices')::boolean,false),
      can_manage_daily_sales=coalesce((p_payload->>'can_manage_daily_sales')::boolean,false)
    where id::text=p_member_id and team_id=v_team and role<>'manager';
  elsif p_action='approve' then
    update public.team_members set status='approved' where id::text=p_member_id and team_id=v_team;
  elsif p_action in ('reject','remove') then
    delete from public.team_members where id::text=p_member_id and team_id=v_team and role<>'manager';
  else
    return false;
  end if;
  return found;
end;
$$;

revoke all on function public.adt_manager_member_action(text,text,text,text,jsonb) from public;
grant execute on function public.adt_manager_member_action(text,text,text,text,jsonb) to anon,authenticated;

commit;
notify pgrst,'reload schema';
