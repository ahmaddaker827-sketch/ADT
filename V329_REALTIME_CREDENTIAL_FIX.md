# ADT Stock V329 — Realtime credential provisioning fix

- Fixed a login-order bug in the packaged WebView HTML: device Realtime credential provisioning previously ran before `currentTeam` was assigned, so it returned `false` immediately.
- Provisioning now runs after the authenticated team context is set and before Realtime subscription setup.
- For standard team creation, the initial manager device credential is provisioned after the newly created team is assigned. Developer-only team creation skips this optional attempt.
- No database schema, RLS, team permissions, product data, or Supabase secrets were changed. Existing V320+ SQL and the deployed `adt-realtime-token` Edge Function are still required.
- Android versionCode: 329; versionName: 3.29.0.

After installing this build, sign in again on each device so the device credential is registered, then test realtime while both apps remain visible.
