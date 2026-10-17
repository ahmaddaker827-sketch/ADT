begin;

-- ADT Stock V273: metadata sidecars + atomic state/meta save.
-- This closes the race where an older device write could overwrite a newer audit while
-- the revision metadata was being saved in a second request.

alter table public.adt_team_cloud_state
  drop constraint if exists adt_team_cloud_state_state_key_check;

alter table public.adt_team_cloud_state
  add constraint adt_team_cloud_state_state_key_check check(state_key in (
    'invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit',
    'audit_history','sale_audit','grocery_audit_v249','wholesale_unit_audit_v264',
    'invoice_history__adt_meta_v273','retail_audit__adt_meta_v273','audit_only_prices__adt_meta_v273',
    'last_retail_audit__adt_meta_v273','last_wholesale_audit__adt_meta_v273',
    'audit_history__adt_meta_v273','sale_audit__adt_meta_v273','grocery_audit_v249__adt_meta_v273',
    'wholesale_unit_audit_v264__adt_meta_v273'
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
  with k as (
    select regexp_replace(coalesce(p_state_key,''),'__adt_meta_v273$','') as base_key
  )
  select exists(
    select 1
    from public.team_members m, k
    where m.team_id::text=p_team_id
      and m.user_id=p_user_id
      and m.status='approved'
      and (
        (not p_write and k.base_key in (
          'invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit',
          'audit_history','sale_audit','grocery_audit_v249','wholesale_unit_audit_v264'
        ))
        or (p_write and k.base_key='invoice_history' and (m.role='manager' or coalesce(m.can_create_invoices,false)))
        or (p_write and k.base_key in ('retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit','wholesale_unit_audit_v264') and (m.role='manager' or coalesce(m.can_audit,false)))
        or (p_write and k.base_key in ('sale_audit','grocery_audit_v249') and (m.role='manager' or coalesce(m.can_grocery_audit,false)))
        or (p_write and k.base_key='audit_history' and (m.role='manager' or coalesce(m.can_audit,false) or coalesce(m.can_grocery_audit,false)))
      )
  );
$$;

revoke all on function public.adt_cloud_state_allowed(text,text,text,boolean) from public;

create or replace function public.adt_cloud_state_set_pair(
  p_team_id text,
  p_user_id text,
  p_state_key text,
  p_state_value jsonb,
  p_meta_value jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_meta_key text := p_state_key || '__adt_meta_v273';
begin
  if p_state_value is null or p_meta_value is null then
    raise exception 'INVALID_STATE';
  end if;
  if not public.adt_cloud_state_allowed(p_team_id,p_user_id,p_state_key,true)
     or not public.adt_cloud_state_allowed(p_team_id,p_user_id,v_meta_key,true) then
    raise exception 'NOT_ALLOWED';
  end if;

  insert into public.adt_team_cloud_state(team_id,state_key,state_value,updated_by)
  values(p_team_id::uuid,p_state_key,p_state_value,p_user_id)
  on conflict(team_id,state_key) do update
    set state_value=excluded.state_value,updated_by=excluded.updated_by,updated_at=now();

  insert into public.adt_team_cloud_state(team_id,state_key,state_value,updated_by)
  values(p_team_id::uuid,v_meta_key,p_meta_value,p_user_id)
  on conflict(team_id,state_key) do update
    set state_value=excluded.state_value,updated_by=excluded.updated_by,updated_at=now();

  return true;
end;
$$;

revoke all on function public.adt_cloud_state_set_pair(text,text,text,jsonb,jsonb) from public;
grant execute on function public.adt_cloud_state_set_pair(text,text,text,jsonb,jsonb) to anon,authenticated;

commit;

notify pgrst,'reload schema';
select 'ADT Stock V273 data-safety metadata + atomic state save installed' as result;
