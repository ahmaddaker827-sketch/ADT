# ADT Stock V318 Full Audit

## Result
V318 is the structural Realtime redesign of V317.

### Verified in source
- versionCode = 318
- versionName = 3.18.0
- fallback version code = 318
- 27 inline JavaScript blocks pass Node syntax check
- standalone JavaScript files pass Node syntax check
- AndroidManifest.xml parses successfully
- no `postgres_changes` listener remains in the active Realtime channel setup
- active channel is private Broadcast with `realtime.setAuth()`
- no broad `file://` universal access flags remain in MainActivity
- no plaintext manager/team password localStorage write remains in the app source
- no service_role key appears in Android client source
- V318 SQL uses private Broadcast triggers and does not grant SELECT on protected cloud state
- cloud-state Broadcast payload intentionally excludes `state_value`

## Architecture
The database is the source of truth for Realtime events. Product writes, cloud-state writes, membership changes, and team feature changes invoke a database trigger. The trigger sends a private Broadcast to `adt:team:<team_id>`.

The Android client obtains a short-lived custom JWT from `adt-realtime-token`, installs it with `dbClient.realtime.setAuth()`, and joins the private channel.

This avoids relying on direct `postgres_changes` delivery for a table that is intentionally protected from direct SELECT access. Supabase documents private Broadcast + Realtime Authorization as the secure Broadcast pattern and recommends Broadcast for database change streaming when appropriate.

## Required server step
V318 cannot provide live Realtime until the Edge Function secret and V318 SQL migration are deployed to the Supabase project. The ZIP contains both pieces and the deployment instructions.
