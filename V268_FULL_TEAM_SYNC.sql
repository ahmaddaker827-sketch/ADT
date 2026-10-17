begin;

alter table public.team_members
  add column if not exists can_grocery_audit boolean not null default false;

alter table public.adt_team_cloud_state
  drop constraint if exists adt_team_cloud_state_state_key_check;

alter table public.adt_team_cloud_state
  add constraint adt_team_cloud_state_state_key_check check(state_key in (
    'invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit',
    'audit_history','sale_audit','grocery_audit_v249','wholesale_unit_audit_v264'
  ));

create or replace function public.adt_cloud_state_allowed(
  p_team_id text,p_user_id text,p_state_key text,p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.team_members m
    where m.team_id::text=p_team_id
      and m.user_id=p_user_id
      and m.status='approved'
      and (
        (not p_write and p_state_key in (
          'invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit',
          'audit_history','sale_audit','grocery_audit_v249','wholesale_unit_audit_v264'
        ))
        or (p_write and p_state_key='invoice_history' and (m.role='manager' or coalesce(m.can_create_invoices,false)))
        or (p_write and p_state_key in ('retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit','wholesale_unit_audit_v264') and (m.role='manager' or coalesce(m.can_audit,false)))
        or (p_write and p_state_key in ('sale_audit','grocery_audit_v249') and (m.role='manager' or coalesce(m.can_grocery_audit,false)))
        or (p_write and p_state_key='audit_history' and (m.role='manager' or coalesce(m.can_audit,false) or coalesce(m.can_grocery_audit,false)))
      )
  );
$$;

revoke all on function public.adt_cloud_state_allowed(text,text,text,boolean) from public;

commit;

notify pgrst,'reload schema';
select 'V268 full team synchronization installed' as result;
