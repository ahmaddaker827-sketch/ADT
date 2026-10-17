-- ADT Stock V243 — دمج أسماء الموردين المكررة في سجل الدفعات ومنع تكرارها مستقبلاً.
-- شغّل الملف مرة واحدة في Supabase SQL Editor.

begin;

-- نقل عمليات كل اسم مكرر إلى أقدم سجل، ثم حذف النسخ الخالية بعد النقل.
with ranked as (
  select id,team_id,party_type,
         first_value(id) over (
           partition by team_id,party_type,lower(btrim(name))
           order by created_at,id
         ) as keeper_id
  from public.adt_money_parties
  where party_type='supplier'
)
update public.adt_money_records r
set party_id=ranked.keeper_id
from ranked
where r.party_id=ranked.id and ranked.id<>ranked.keeper_id;

with ranked as (
  select id,
         first_value(id) over (
           partition by team_id,party_type,lower(btrim(name))
           order by created_at,id
         ) as keeper_id
  from public.adt_money_parties
  where party_type='supplier'
)
delete from public.adt_money_parties p
using ranked
where p.id=ranked.id and ranked.id<>ranked.keeper_id;

create unique index if not exists adt_money_parties_team_type_name_uidx
  on public.adt_money_parties(team_id,party_type,lower(btrim(name)));

create or replace function public.adt_money_party_add(
  p_team_id text,p_user_id text,p_party_type text,p_name text,p_phone text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.adt_money_parties%rowtype; clean_name text;
begin
  if not public.adt_is_primary_manager(p_team_id,p_user_id) then raise exception 'NOT_ALLOWED'; end if;
  clean_name=left(btrim(coalesce(p_name,'')),160);
  if p_party_type not in ('supplier','customer') or clean_name='' then raise exception 'INVALID_DATA'; end if;
  insert into public.adt_money_parties(team_id,party_type,name,phone,created_by)
  values(p_team_id::uuid,p_party_type,clean_name,nullif(left(btrim(coalesce(p_phone,'')),40),''),p_user_id)
  on conflict (team_id,party_type,lower(btrim(name))) do nothing
  returning * into r;
  if r.id is null then
    select * into r from public.adt_money_parties
    where team_id::text=p_team_id and party_type=p_party_type
      and lower(btrim(name))=lower(clean_name)
    limit 1;
  end if;
  return to_jsonb(r);
end $$;

revoke all on function public.adt_money_party_add(text,text,text,text,text) from public;
grant execute on function public.adt_money_party_add(text,text,text,text,text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
select 'ADT Stock V243 supplier duplicates fixed' as result;
