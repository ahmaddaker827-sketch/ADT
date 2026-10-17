begin;

-- صلاحيات جرد تفصيلية. صلاحية العرض منفصلة (can_audit / can_grocery_audit)،
-- وكل عملية داخل الجرد لها مفتاح مستقل يمنحه المدير الرئيسي فقط.
alter table public.team_members
  add column if not exists can_audit_add boolean not null default false,
  add column if not exists can_audit_edit_qty boolean not null default false,
  add column if not exists can_audit_edit_price boolean not null default false,
  add column if not exists can_audit_delete boolean not null default false,
  add column if not exists can_audit_export boolean not null default false,
  add column if not exists can_audit_reset boolean not null default false,
  add column if not exists can_audit_restore boolean not null default false,
  add column if not exists can_audit_delete_history boolean not null default false;

-- المدير الرئيسي فقط يستطيع تعديل صلاحيات أي عضو.
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
  begin
    v_team:=p_team_id::uuid;
  exception when others then
    return false;
  end;

  select exists(
    select 1 from public.team_members m
    where m.team_id=v_team
      and m.user_id=p_manager_user_id
      and m.status='approved'
      and m.role='manager'
  ) into v_allowed;

  if not v_allowed then return false; end if;
  if not exists(
    select 1 from public.team_members
    where id::text=p_member_id and team_id=v_team and role<>'manager'
  ) then return false; end if;

  if p_action='approve' then
    update public.team_members set status='approved'
    where id::text=p_member_id and team_id=v_team;
  elsif p_action in ('reject','remove') then
    delete from public.team_members
    where id::text=p_member_id and team_id=v_team and role<>'manager';
  elsif p_action='permissions' then
    v_sub:=coalesce((p_payload->>'sub_manager')::boolean,false);
    update public.team_members set
      role=case when v_sub then 'sub_manager' else 'member' end,
      can_edit_products=v_sub or coalesce((p_payload->>'can_edit_products')::boolean,false),
      can_manage_shortages=v_sub or coalesce((p_payload->>'can_manage_shortages')::boolean,false),
      can_edit_debts=v_sub or coalesce((p_payload->>'can_edit_debts')::boolean,false),
      can_manage_money_records=coalesce((p_payload->>'can_manage_money_records')::boolean,false),
      -- عرض الجرد نفسه يحدده المدير الرئيسي صراحة حتى للمدير المساعد.
      can_audit=coalesce((p_payload->>'can_audit')::boolean,false),
      can_grocery_audit=coalesce((p_payload->>'can_grocery_audit')::boolean,false),
      can_view_cost=v_sub or coalesce((p_payload->>'can_view_cost')::boolean,false),
      can_create_invoices=v_sub or coalesce((p_payload->>'can_create_invoices')::boolean,false),
      can_edit_sell_price=case when p_payload?'can_edit_sell_price' then v_sub or coalesce((p_payload->>'can_edit_sell_price')::boolean,false) else can_edit_sell_price end,
      can_manage_catalog=case when p_payload?'can_manage_catalog' then v_sub or coalesce((p_payload->>'can_manage_catalog')::boolean,false) else can_manage_catalog end,
      can_manage_daily_sales=coalesce((p_payload->>'can_manage_daily_sales')::boolean,false),
      can_audit_add=case when p_payload?'can_audit_add' then coalesce((p_payload->>'can_audit_add')::boolean,false) else can_audit_add end,
      can_audit_edit_qty=case when p_payload?'can_audit_edit_qty' then coalesce((p_payload->>'can_audit_edit_qty')::boolean,false) else can_audit_edit_qty end,
      can_audit_edit_price=case when p_payload?'can_audit_edit_price' then coalesce((p_payload->>'can_audit_edit_price')::boolean,false) else can_audit_edit_price end,
      can_audit_delete=case when p_payload?'can_audit_delete' then coalesce((p_payload->>'can_audit_delete')::boolean,false) else can_audit_delete end,
      can_audit_export=case when p_payload?'can_audit_export' then coalesce((p_payload->>'can_audit_export')::boolean,false) else can_audit_export end,
      can_audit_reset=case when p_payload?'can_audit_reset' then coalesce((p_payload->>'can_audit_reset')::boolean,false) else can_audit_reset end,
      can_audit_restore=case when p_payload?'can_audit_restore' then coalesce((p_payload->>'can_audit_restore')::boolean,false) else can_audit_restore end,
      can_audit_delete_history=case when p_payload?'can_audit_delete_history' then coalesce((p_payload->>'can_audit_delete_history')::boolean,false) else can_audit_delete_history end
    where id::text=p_member_id and team_id=v_team and role<>'manager';
  else
    return false;
  end if;

  return found;
end;
$$;

revoke all on function public.adt_manager_member_action(text,text,text,text,jsonb) from public;
grant execute on function public.adt_manager_member_action(text,text,text,text,jsonb) to anon,authenticated;

-- نفس بوابة المزامنة، لكن عضو العرض فقط لا يستطيع كتابة حالة الجرد إلى السحابة.
create or replace function public.adt_cloud_state_allowed(
  p_team_id text,p_user_id text,p_state_key text,p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with k as (
    select regexp_replace(coalesce(p_state_key,''),'__adt_meta_v273$','') as base_key
  )
  select exists(
    select 1 from public.team_members m, k
    where m.team_id::text=p_team_id
      and m.user_id=p_user_id
      and m.status='approved'
      and (
        (not p_write and k.base_key in (
          'invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit',
          'audit_history','sale_audit','grocery_audit_v249','wholesale_unit_audit_v264'
        ))
        or (p_write and k.base_key='invoice_history' and (m.role='manager' or coalesce(m.can_create_invoices,false)))
        or (p_write and k.base_key='audit_only_prices' and (m.role='manager' or coalesce(m.can_audit_edit_price,false)))
        or (p_write and k.base_key in ('retail_audit','wholesale_unit_audit_v264') and (
          m.role='manager' or coalesce(m.can_audit_add,false) or coalesce(m.can_audit_edit_qty,false)
          or coalesce(m.can_audit_edit_price,false) or coalesce(m.can_audit_delete,false)
          or coalesce(m.can_audit_reset,false) or coalesce(m.can_audit_restore,false)
        ))
        or (p_write and k.base_key in ('sale_audit','grocery_audit_v249') and (
          m.role='manager' or coalesce(m.can_audit_add,false) or coalesce(m.can_audit_edit_qty,false)
          or coalesce(m.can_audit_edit_price,false) or coalesce(m.can_audit_delete,false)
          or coalesce(m.can_audit_reset,false) or coalesce(m.can_audit_restore,false)
        ))
        or (p_write and k.base_key in ('last_retail_audit','last_wholesale_audit') and (
          m.role='manager' or coalesce(m.can_audit_reset,false) or coalesce(m.can_audit_restore,false)
        ))
        or (p_write and k.base_key='audit_history' and (
          m.role='manager' or coalesce(m.can_audit_reset,false) or coalesce(m.can_audit_restore,false)
          or coalesce(m.can_audit_delete_history,false)
        ))
      )
  );
$$;

revoke all on function public.adt_cloud_state_allowed(text,text,text,boolean) from public;

commit;

notify pgrst,'reload schema';
select 'Granular audit permissions installed' as result;
