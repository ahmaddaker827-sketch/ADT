-- ADT Stock V314: Realtime server foundation for products + team audit state.
-- Run once in Supabase SQL Editor.
BEGIN;

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.adt_team_cloud_state REPLICA IDENTITY FULL;
ALTER TABLE public.team_members REPLICA IDENTITY FULL;
ALTER TABLE public.teams REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='adt_team_cloud_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.adt_team_cloud_state;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'V314 Realtime enabled: products + audit cloud state + team permissions/features' AS result;
