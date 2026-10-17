-- ADT Stock V201 — حذف عميل/مورد من سجلات الاستلام والدفعات
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

create or replace function public.adt_money_party_delete(
  p_team_id text,
  p_user_id text,
  p_party_id text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then
    raise exception 'NOT_ALLOWED';
  end if;

  delete from public.adt_money_parties
  where team_id::text=p_team_id
    and id::text=p_party_id;

  if not found then
    raise exception 'PARTY_NOT_FOUND';
  end if;

  -- عمليات هذا الاسم تُحذف تلقائياً بسبب ON DELETE CASCADE.
  return true;
end;
$$;

revoke all on function public.adt_money_party_delete(text,text,text) from public;
grant execute on function public.adt_money_party_delete(text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
select 'ADT Stock V201 money party delete installed' as result;
