-- ADT Stock V320
-- Bind the Realtime JWT to a device credential that is provisioned only after a real ADT login.
-- The credential is stored hashed in Postgres and the client keeps the secret in Android Keystore.

begin;

create extension if not exists pgcrypto;

create table if not exists public.adt_realtime_device_credentials (
  team_id uuid not null,
  user_id text not null,
  device_id text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (team_id, user_id, device_id)
);

alter table public.adt_realtime_device_credentials enable row level security;
revoke all on table public.adt_realtime_device_credentials from public, anon, authenticated;

create or replace function public.adt_realtime_register_device_v320(
  p_team_id text,
  p_user_id text,
  p_device_id text,
  p_phone text,
  p_password text,
  p_device_secret text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_result jsonb;
  v_team_id text;
  v_user_id text;
  v_secret text := trim(coalesce(p_device_secret,''));
  v_team text := trim(coalesce(p_team_id,''));
  v_user text := trim(coalesce(p_user_id,''));
  v_device text := trim(coalesce(p_device_id,''));
begin
  if v_team='' or v_user='' or v_device='' or coalesce(trim(p_phone),'')='' or coalesce(p_password,'')='' or length(v_secret)<32 then
    raise exception 'INVALID_REALTIME_DEVICE_PROOF';
  end if;

  -- Re-run the existing ADT credential check. The caller cannot choose an arbitrary
  -- team/member pair without also proving the account password through the real login RPC.
  v_result := public.adt_account_login_v198(p_phone,p_password,p_device_id);
  v_team_id := coalesce(v_result->'team'->>'id','');
  v_user_id := coalesce(v_result->'member'->>'user_id','');

  if v_team_id<>v_team or v_user_id<>v_user then
    raise exception 'REALTIME_IDENTITY_MISMATCH';
  end if;

  insert into public.adt_realtime_device_credentials(team_id,user_id,device_id,secret_hash,created_at,updated_at,revoked_at)
  values(v_team::uuid,v_user,v_device,crypt(v_secret,gen_salt('bf')),now(),now(),null)
  on conflict(team_id,user_id,device_id) do update
    set secret_hash=excluded.secret_hash,
        updated_at=now(),
        revoked_at=null;

  return true;
end;
$$;

create or replace function public.adt_realtime_verify_device_v320(
  p_team_id text,
  p_user_id text,
  p_device_id text,
  p_device_secret text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_hash text;
  v_team text := trim(coalesce(p_team_id,''));
  v_user text := trim(coalesce(p_user_id,''));
  v_device text := trim(coalesce(p_device_id,''));
  v_secret text := coalesce(p_device_secret,'');
  v_approved boolean := false;
begin
  if v_team='' or v_user='' or v_device='' or length(v_secret)<32 then return false; end if;

  select c.secret_hash into v_hash
  from public.adt_realtime_device_credentials c
  where c.team_id=v_team::uuid
    and c.user_id=v_user
    and c.device_id=v_device
    and c.revoked_at is null;
  if not found or coalesce(v_hash,'')='' or v_hash<>crypt(v_secret,v_hash) then return false; end if;

  select exists(
    select 1 from public.team_members m
    where m.team_id=v_team::uuid
      and m.user_id=v_user
      and m.status='approved'
  ) into v_approved;

  if not v_approved then return false; end if;

  update public.adt_realtime_device_credentials
  set updated_at=now()
  where team_id=v_team::uuid and user_id=v_user and device_id=v_device;

  return true;
end;
$$;

revoke all on function public.adt_realtime_register_device_v320(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.adt_realtime_register_device_v320(text,text,text,text,text,text) to anon,authenticated;
revoke all on function public.adt_realtime_verify_device_v320(text,text,text,text) from public,anon,authenticated;
-- Verification is called only by the Edge Function with the service role.
grant execute on function public.adt_realtime_verify_device_v320(text,text,text,text) to service_role;

commit;

notify pgrst,'reload schema';
select 'ADT Stock V320 realtime device identity installed' as result;
