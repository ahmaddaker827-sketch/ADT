# ADT Stock V323 — Push Authorization Structural Fix

## Changes
- Version: 3.23.0 / versionCode 323.
- Native push dispatch now forwards the ADT custom session token through `X-ADT-Session-Token` while keeping the public Supabase anon bearer only for the Edge gateway.
- `adt-send-price-push` validates the ADT session against `adt_validate_session` before sending anything.
- The Edge Function verifies that `actor_user_id` is an approved member of the target team.
- Operation notifications enforce server-side permissions for money records, daily sales, audit, grocery audit, audit reset, and permission changes.
- The actor display name is taken from the server-side membership record instead of trusting WebView input.
- Unauthorized push attempts return 401/403 and do not reach FCM delivery.
- Removed the duplicate legacy `saveCriticalCloudState` / `syncCriticalCloudState` definitions from the HTML; one canonical implementation remains.

## Verification
- `saveCriticalCloudState` definitions: 1.
- `syncCriticalCloudState` definitions: 1.
- Version code/name: 323 / 3.23.0.
- No APK build was performed in this environment because Android Gradle/SDK tooling is unavailable.
- Supabase Edge Function deployment is still required for the server-side authorization change to become active.
