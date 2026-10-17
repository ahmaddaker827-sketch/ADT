# ADT Stock V329 — Realtime reconciliation fix

## Changes made from V328

- Kept the existing single private team Broadcast channel (`adt:team:<team_id>`), device-bound Realtime token flow, server-side broadcast triggers, member authorization checks, and RLS policies.
- Fixed audit synchronization: private Broadcast notifications intentionally omit `state_value`; the client now treats them as invalidation/revision notices and fetches the committed state through `syncCriticalCloudState()` instead of writing an undefined/partial payload into local state.
- Refreshes grocery audit, wholesale unit audit, retail/sale audit prices and the currently open audit views after successful cloud reconciliation.
- Runs one full reconciliation after a successful Realtime channel join to cover updates that happened while disconnected.
- Removed delayed data-fetch fallbacks tied to individual product events and delayed force-sync calls on online/visibility changes. Reconnection is handled by the channel lifecycle; data reconciliation occurs on successful join.
- Does not disable RLS, make the channel public, or change login/device credential validation.

## Validation performed

- `node --check` passed for `scripts/22.js` and `combined-inline.js`.
- Extracted inline JavaScript from `app/src/main/assets/index.html`; `node --check` passed for the combined inline script blocks.
- Archive contents and modified file presence checked.

## Deployment requirements / limits

This is a client-side rebuild based on the existing V328 server setup. For cross-device updates to work, the Supabase project must already have the included/previously installed server objects deployed: V314 publication/replica identity setup, V319 private Broadcast triggers and authorization policy, V320 device credential functions/table, and the `adt-realtime-token` Edge Function with its required signing secret. This archive cannot verify live Supabase configuration or test real multi-device events without access to the project's deployed environment and credentials.
