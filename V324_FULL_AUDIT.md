# ADT Stock V324 — Full Structural Audit

## Release
- versionCode: 324
- versionName: 3.24.0

## Structural changes
1. Team/session transitions now have one teardown path.
2. Realtime reconnects are generation-guarded against stale team contexts.
3. Offline cache cannot restore cached role/permission authorization.
4. Android WebView external navigation is allowlisted to http/https/mailto/tel/sms.
5. Automatic JS popup windows are disabled and Safe Browsing is enabled where supported.
6. V323 push server authorization remains in place.

## Static verification
- 27 inline script blocks: syntax-valid with Node.js.
- `saveCriticalCloudState` definitions: 1.
- `syncCriticalCloudState` definitions: 1.
- Runtime `postgres_changes` references: 0.
- Version fallback: 324.
- Manifest and applicationId preserved.
- ZIP integrity checked after packaging.

## Important deployment note
The V323 Edge Function authorization change remains dependent on deploying `supabase/functions/adt-send-price-push` to Supabase. V324 does not remove that requirement.

## Build limitation
No APK was built in this environment because the project does not include a Gradle wrapper and Android SDK/Gradle tooling is unavailable here.
