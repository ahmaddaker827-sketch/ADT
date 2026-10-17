-- ADT Stock V316
-- Realtime hardening: publication + replica identity only.
-- IMPORTANT: do NOT GRANT broad SELECT on adt_team_cloud_state. Its existing RPC/RLS security model is preserved.
BEGIN;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.team_members REPLICA IDENTITY FULL;
ALTER TABLE public.teams REPLICA IDENTITY FULL;
ALTER TABLE public.adt_team_cloud_state REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='team_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='teams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='adt_team_cloud_state') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.adt_team_cloud_state;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- V316 deliberately does not add SELECT grants/policies for cloud state.
-- The application uses adt_cloud_state_get/set RPCs for that protected table.
-- If the live project uses custom (non-Supabase-Auth) identity, configure Realtime authorization
-- explicitly before converting cloud-state delivery to private Broadcast.
