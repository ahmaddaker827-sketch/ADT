# ADT Stock V319 — Realtime deployment

## 1. Edge Function secret
Create/deploy the function:

`adt-realtime-token`

Set the function secret:

`SUPABASE_JWT_SECRET = <the project's JWT signing secret>`

Never place this secret in the Android app or `index.html`.

## 2. Deploy the function
Deploy `supabase/functions/adt-realtime-token/index.ts` with the Supabase CLI or Dashboard.

The function checks that `(team_id, user_id)` is an approved `team_members` row before issuing a short-lived JWT.

## 3. Run SQL
Run this file once in Supabase SQL Editor:

`V319_REALTIME_BROADCAST_AUTH.sql`

It creates private Broadcast triggers for:
- `products`
- `adt_team_cloud_state`
- `team_members`
- `teams`

It also creates the private-channel RLS policy on `realtime.messages`.

Do not add `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`; Supabase already manages that table's RLS.

## 4. What happens after deployment
The app obtains a short-lived ADT JWT, calls `realtime.setAuth()`, then joins:

`adt:team:<team_id>`

A successful database write emits the corresponding Broadcast event. The member receives the event immediately and refreshes only the affected interface/state.

For cloud-state/grocery audit, the broadcast contains only the key/metadata; the protected value is still fetched through the existing RPC authorization path.
