-- ADT Stock V216: شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- يغني عن V214_RELEASE_VERSION_INPUT.sql وV215_MANDATORY_UPDATES.sql لميزة التحديثات.
-- يتيح تصحيح رابط التحميل لنفس رقم البناء إذا أُرسل رابط خطأ، مع إبقاء التحديث إجبارياً.
create table if not exists public.adt_app_releases (
 id integer primary key check(id=1),
 version_code integer not null check(version_code>0),
 version_name text not null,
 download_url text,
 notes text not null default '',
 required boolean not null default true,
 published_at timestamptz not null default now()
);
alter table public.adt_app_releases add column if not exists required boolean not null default true;
insert into public.adt_app_releases(id,version_code,version_name,notes,required)
values(1,1,'0.1.0','',true) on conflict(id) do nothing;
update public.adt_app_releases set required=true
where id=1 and download_url ~* '^https://[^[:space:]]+$';
alter table public.adt_app_releases enable row level security;
drop policy if exists adt_app_releases_read on public.adt_app_releases;
create policy adt_app_releases_read on public.adt_app_releases
for select to anon,authenticated using(true);
revoke all on public.adt_app_releases from public,anon,authenticated;
grant select on public.adt_app_releases to anon,authenticated;

create or replace function public.adt_admin_publish_app_release(
 p_dev_pin text,p_device_id text,p_version_code integer,p_download_url text,p_notes text default ''
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_current integer; v_label text;
begin
 if public.adt_verify_dev_pin(p_dev_pin,p_device_id) is distinct from true then return false; end if;
 if p_version_code is null or p_version_code<1 or p_version_code>9999 or
    p_download_url is null or p_download_url !~* '^https://[^[:space:]]+$' then return false; end if;
 select version_code into v_current from public.adt_app_releases where id=1 for update;
 if p_version_code<coalesce(v_current,0) then return false; end if;
 v_label=(p_version_code/100)::text || '.' || (p_version_code%100)::text || '.0';
 update public.adt_app_releases set version_code=p_version_code,version_name=v_label,
   download_url=p_download_url,notes=left(coalesce(p_notes,''),500),required=true,published_at=now()
 where id=1;
 return found;
end $$;
revoke all on function public.adt_admin_publish_app_release(text,text,integer,text,text) from public;
grant execute on function public.adt_admin_publish_app_release(text,text,integer,text,text) to anon,authenticated;
notify pgrst,'reload schema';
