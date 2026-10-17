-- ADT Stock V244 — إصلاح آمن ونهائي لتكرار موردي سجل الدفعات.
-- شغّل الملف مرة واحدة في Supabase SQL Editor بعد أخذ نسخة احتياطية.

begin;

-- ضمان وجود صلاحية الدفعات والاستلامات حتى لو لم يُشغّل ملف V206 منفرداً.
alter table public.team_members
  add column if not exists can_manage_money_records boolean not null default false;

create or replace function public.adt_can_manage_money_records(p_team_id text,p_user_id text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.team_members m
    where m.team_id::text=p_team_id
      and m.user_id=p_user_id
      and m.status='approved'
      and (m.role='manager' or coalesce(m.can_manage_money_records,false)=true)
  );
$$;

revoke all on function public.adt_can_manage_money_records(text,text) from public;
grant execute on function public.adt_can_manage_money_records(text,text) to anon,authenticated;

-- إزالة القيد السابق لأنه كان يشمل العملاء أيضاً وقد يفشل عند وجود عميلين بنفس الاسم.
drop index if exists public.adt_money_parties_team_type_name_uidx;

-- نقل كل عمليات المورد المكرر إلى أقدم سجل مطابق للاسم داخل المتجر نفسه.
with ranked as (
  select id,
         first_value(id) over (
           partition by team_id,lower(btrim(name))
           order by created_at,id
         ) as keeper_id
  from public.adt_money_parties
  where party_type='supplier'
)
update public.adt_money_records r
set party_id=ranked.keeper_id
from ranked
where r.party_id=ranked.id
  and ranked.id<>ranked.keeper_id;

-- حذف سجلات الموردين المكررة بعد نقل جميع عملياتها إلى السجل الأساسي.
with ranked as (
  select id,
         first_value(id) over (
           partition by team_id,lower(btrim(name))
           order by created_at,id
         ) as keeper_id
  from public.adt_money_parties
  where party_type='supplier'
)
delete from public.adt_money_parties p
using ranked
where p.id=ranked.id
  and ranked.id<>ranked.keeper_id;

-- القيد الجديد خاص بالموردين فقط ولا يؤثر على أسماء العملاء المتشابهة.
create unique index if not exists adt_money_suppliers_team_name_uidx
  on public.adt_money_parties(team_id,lower(btrim(name)))
  where party_type='supplier';

-- الإضافة تحافظ على صلاحيات المدير أو العضو المسموح له بإدارة الدفعات.
create or replace function public.adt_money_party_add(
  p_team_id text,
  p_user_id text,
  p_party_type text,
  p_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.adt_money_parties%rowtype;
  clean_name text;
begin
  if not public.adt_can_manage_money_records(p_team_id,p_user_id) then
    raise exception 'NOT_ALLOWED';
  end if;

  clean_name=left(btrim(coalesce(p_name,'')),160);
  if p_party_type not in ('supplier','customer') or clean_name='' then
    raise exception 'INVALID_DATA';
  end if;

  if p_party_type='supplier' then
    insert into public.adt_money_parties(team_id,party_type,name,phone,created_by)
    values(
      p_team_id::uuid,
      'supplier',
      clean_name,
      nullif(left(btrim(coalesce(p_phone,'')),40),''),
      p_user_id
    )
    on conflict (team_id,lower(btrim(name))) where party_type='supplier'
    do nothing
    returning * into r;

    if r.id is null then
      select * into r
      from public.adt_money_parties
      where team_id::text=p_team_id
        and party_type='supplier'
        and lower(btrim(name))=lower(clean_name)
      order by created_at,id
      limit 1;
    end if;
  else
    insert into public.adt_money_parties(team_id,party_type,name,phone,created_by)
    values(
      p_team_id::uuid,
      'customer',
      clean_name,
      nullif(left(btrim(coalesce(p_phone,'')),40),''),
      p_user_id
    )
    returning * into r;
  end if;

  return to_jsonb(r);
end;
$$;

revoke all on function public.adt_money_party_add(text,text,text,text,text) from public;
grant execute on function public.adt_money_party_add(text,text,text,text,text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
select 'ADT Stock V244 supplier duplicates safely fixed' as result;
