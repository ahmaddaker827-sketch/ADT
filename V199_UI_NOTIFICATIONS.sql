-- ADT Stock V199 — دعم حذف سجل التالف بالكامل وتجهيز بيانات إشعارات العمليات
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor بعد ملفات V194 و V195.

create or replace function public.adt_damaged_goods_delete_all(p_team_id text,p_user_id text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  delete from public.adt_damaged_goods where team_id::text=p_team_id;
  return true;
end;
$$;

revoke all on function public.adt_damaged_goods_delete_all(text,text) from public;
grant execute on function public.adt_damaged_goods_delete_all(text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V199 UI and operations support installed' as result;
