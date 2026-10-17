-- ADT Stock V344: developer-only reset for a team's manager login password.
-- Run once in Supabase SQL Editor before using the new UI button.
create or replace function public.adt_stock_dev_reset_team_manager_password_v344(
  p_dev_pin text,
  p_device_id text,
  p_team_id text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_team_id uuid;
  v_updated integer := 0;
begin
  perform public.adt_stock_dev_verify(p_dev_pin,p_device_id);

  if char_length(coalesce(p_password,'')) < 6 then
    return false;
  end if;

  begin
    v_team_id := p_team_id::uuid;
  exception when others then
    return false;
  end;

  update public.team_members
     set member_password_hash = crypt(p_password, gen_salt('bf'))
   where team_id = v_team_id
     and role = 'manager';
  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;

revoke all on function public.adt_stock_dev_reset_team_manager_password_v344(text,text,text,text) from public;
grant execute on function public.adt_stock_dev_reset_team_manager_password_v344(text,text,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
select 'ADT Stock V344 manager password reset installed' as result;
