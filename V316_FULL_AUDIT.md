# ADT Stock V316 — Full Audit

## Scope
- Android WebView host and manifest
- Main HTML/JavaScript application
- Supabase initialization and Realtime lifecycle
- Product HTTP sync + Realtime merge ordering
- IndexedDB/local fallback cache writes
- Cloud-state/audit synchronization path
- Existing SQL migrations related to Realtime/cloud state

## Fixed in this audited build
1. Realtime channel creation is idempotent per team.
2. Reconnects are serialized; lifecycle events no longer blindly tear down a healthy channel.
3. Socket health uses `realtime.isConnected()` plus channel status.
4. Heartbeat monitoring is configured at 15 seconds and reacts to timeout/disconnected/error states.
5. Supabase JS CDN is pinned to 2.91.0.
6. Product Realtime events keep per-team/product watermarks using `updated_at` and event receipt time.
7. HTTP product reconciliation preserves a newer Realtime state instead of replacing it with an older response.
8. IndexedDB product-cache writes are serialized per team.
9. Product sync generation is checked before committing a fetched snapshot.
10. The sync badge is based on actual Realtime health, not `navigator.onLine` alone.
11. Focus/visibility/online recovery reuses the Realtime manager and only reconnects when needed.
12. Existing protected `adt_team_cloud_state` permissions are not weakened.
13. Android manifest was checked: cleartext traffic is disabled, backup is disabled, and network permissions are explicit.

## Validation performed
- 27 inline JavaScript blocks: syntax check passed with Node.js.
- Combined inline JavaScript: syntax check passed.
- AndroidManifest.xml: XML parse passed.
- Critical functions `setupRealtimeSubscription`, `performProductsSync`, `writeProductsCache`, `updateSyncBadge`: one active definition each.
- ZIP contents: checked after packaging.

## Known environment limitation
A local Android SDK/Gradle executable is not installed in this execution environment, so a full APK compilation cannot be honestly claimed here. The project remains buildable using the normal Android/Gradle environment.

## Supabase-side limitation that cannot be solved safely from the ZIP alone
`adt_team_cloud_state` is deliberately revoked from direct `anon/authenticated` table access in the existing SQL. V316 therefore does not grant broad SELECT merely to make Postgres Changes appear to work. The live Supabase project must still have an authorization design compatible with the app's custom device/session identity if protected Realtime delivery is required for cloud-state events.
