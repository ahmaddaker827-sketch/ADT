begin;

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
      -- جرد سريع له تفعيل مستقل عن جـرد مـحلـک.
      and coalesce(t.features->>'grocery_audit','false')='true'
      and (m.role='manager' or coalesce(m.can_grocery_audit,false))
  );
$$;

revoke all on function public.adt_get_grocery_audit_permission(text,text) from public;
grant execute on function public.adt_get_grocery_audit_permission(text,text) to anon,authenticated;

-- تفعيل/إلغاء جرد سريع من المطور بشكل مستقل عن جـرد مـحلـک.
create or replace function public.adt_stock_dev_set_grocery_audit_feature(
  p_dev_pin text,
  p_device_id text,
  p_team_id text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ok boolean;
begin
  select public.adt_verify_dev_pin(p_dev_pin, p_device_id) into v_ok;
  if coalesce(v_ok,false) is not true then
    raise exception 'DEVELOPER_AUTH_REQUIRED';
  end if;

  update public.teams
  set features = jsonb_set(
    coalesce(features,'{}'::jsonb),
    '{grocery_audit}',
    to_jsonb(coalesce(p_enabled,false)),
    true
  )
  where id::text = p_team_id;

  if not found then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  return true;
end;
$$;

revoke all on function public.adt_stock_dev_set_grocery_audit_feature(text,text,text,boolean) from public;
grant execute on function public.adt_stock_dev_set_grocery_audit_feature(text,text,text,boolean) to anon,authenticated;

commit;

notify pgrst,'reload schema';
select 'V271 grocery audit permission + independent developer feature installed' as result;
