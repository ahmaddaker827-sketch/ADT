# V320 Realtime deployment

1. Apply `V320_REALTIME_IDENTITY.sql` after the existing V318 realtime migration.
2. Deploy `supabase/functions/adt-realtime-token/index.ts` as `adt-realtime-token`.
3. Set the Edge Function secret/environment value `SUPABASE_JWT_SECRET` to the JWT signing secret trusted by this Supabase project. Do not put it in the Android app.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function environment.
5. For production, disable public Realtime channel access so private authorization is enforced. Supabase documents that private channels require RLS policies on `realtime.messages`.
6. Existing installations must successfully log in once with V320 after the SQL is deployed so the device credential is provisioned into the secure Android store.
