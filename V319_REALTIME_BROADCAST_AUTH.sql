-- ADT Stock V318
-- Secure realtime identity + private Broadcast triggers.
-- Requires the Edge Function `adt-realtime-token` with SUPABASE_JWT_SECRET set to the project JWT signing secret used by Realtime.

begin;

-- No direct SELECT access is opened on protected application tables.
-- Realtime receives filtered custom events through private Broadcast instead.

create or replace function public.adt_realtime_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_team_id text;
  v_topic text;
  v_payload jsonb;
begin
  v_team_id := coalesce((to_jsonb(NEW)->>'team_id'),(to_jsonb(OLD)->>'team_id'),(to_jsonb(NEW)->>'id'),(to_jsonb(OLD)->>'id'));
  if coalesce(v_team_id,'')='' then return coalesce(NEW,OLD); end if;
  v_topic := 'adt:team:'||v_team_id;

  if TG_TABLE_NAME='products' then
    v_payload := jsonb_build_object(
      'table','products','operation',TG_OP,
      'record',case when TG_OP='DELETE' then '{}'::jsonb else to_jsonb(NEW) end,
      'old_record',case when TG_OP='INSERT' then '{}'::jsonb else to_jsonb(OLD) end
    );
  elsif TG_TABLE_NAME='adt_team_cloud_state' then
    v_payload := jsonb_build_object(
      'table','adt_team_cloud_state','operation',TG_OP,
      'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('team_id',NEW.team_id,'state_key',NEW.state_key,'updated_at',NEW.updated_at) end,
      'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('team_id',OLD.team_id,'state_key',OLD.state_key,'updated_at',OLD.updated_at) end
    );
  elsif TG_TABLE_NAME='team_members' then
    v_payload := jsonb_build_object(
      'table','team_members','operation',TG_OP,
      'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('id',NEW.id,'team_id',NEW.team_id,'user_id',NEW.user_id,'role',NEW.role,'status',NEW.status,'can_grocery_audit',NEW.can_grocery_audit,'can_audit',NEW.can_audit,'can_edit_products',NEW.can_edit_products,'can_manage_shortages',NEW.can_manage_shortages) end,
      'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('id',OLD.id,'team_id',OLD.team_id,'user_id',OLD.user_id,'role',OLD.role,'status',OLD.status) end
    );
  elsif TG_TABLE_NAME='teams' then
    v_payload := jsonb_build_object(
      'table','teams','operation',TG_OP,
      'record',case when TG_OP='DELETE' then '{}'::jsonb else jsonb_build_object('id',NEW.id,'features',NEW.features) end,
      'old_record',case when TG_OP='INSERT' then '{}'::jsonb else jsonb_build_object('id',OLD.id,'features',OLD.features) end
    );
  else
    return coalesce(NEW,OLD);
  end if;

  perform realtime.send(v_payload,TG_OP,v_topic,true);
  return coalesce(NEW,OLD);
end;
$$;

revoke all on function public.adt_realtime_broadcast_changes() from public,anon,authenticated;

drop trigger if exists adt_products_realtime_broadcast on public.products;
create trigger adt_products_realtime_broadcast
after insert or update or delete on public.products
for each row execute function public.adt_realtime_broadcast_changes();

drop trigger if exists adt_cloud_state_realtime_broadcast on public.adt_team_cloud_state;
create trigger adt_cloud_state_realtime_broadcast
after insert or update or delete on public.adt_team_cloud_state
for each row execute function public.adt_realtime_broadcast_changes();

drop trigger if exists adt_team_members_realtime_broadcast on public.team_members;
create trigger adt_team_members_realtime_broadcast
after insert or update or delete on public.team_members
for each row execute function public.adt_realtime_broadcast_changes();

drop trigger if exists adt_teams_realtime_broadcast on public.teams;
create trigger adt_teams_realtime_broadcast
after insert or update or delete on public.teams
for each row execute function public.adt_realtime_broadcast_changes();

-- Realtime Authorization: only an ADT token carrying the same team/device may read its private topic.
drop policy if exists "adt_realtime_team_broadcast_read" on realtime.messages;
create policy "adt_realtime_team_broadcast_read"
on realtime.messages
for select
to authenticated
using (
  extension='broadcast'
  and split_part(realtime.topic(),':',1)='adt'
  and split_part(realtime.topic(),':',2)='team'
  and split_part(realtime.topic(),':',3)=coalesce(auth.jwt()->>'adt_team_id','')
  and exists (
    select 1 from public.team_members m
    where m.team_id::text=coalesce(auth.jwt()->>'adt_team_id','')
      and m.user_id=coalesce(auth.jwt()->>'adt_user_id','')
      and m.status='approved'
  )
);

commit;

notify pgrst,'reload schema';
select 'ADT Stock V318 secure realtime broadcast installed' as result;
