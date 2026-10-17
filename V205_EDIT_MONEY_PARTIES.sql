-- ADT Stock V205 — تعديل بيانات عميل/مورد في سجلات الدفعات والاستلامات
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

create or replace function public.adt_money_party_update(
  p_team_id text,
  p_user_id text,
  p_party_id text,
  p_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare r public.adt_money_parties%rowtype;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'INVALID_NAME'; end if;

  update public.adt_money_parties
  set name=left(btrim(p_name),160),
      phone=nullif(left(btrim(coalesce(p_phone,'')),40),'')
  where team_id::text=p_team_id and id::text=p_party_id
  returning * into r;

  if r.id is null then raise exception 'PARTY_NOT_FOUND'; end if;
  return to_jsonb(r);
end;
$$;

revoke all on function public.adt_money_party_update(text,text,text,text,text) from public;
grant execute on function public.adt_money_party_update(text,text,text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V205 money party edit installed' as result;
