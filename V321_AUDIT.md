# V321 FULL AUDIT

## Fixed
- Fixed metadata-only `adt_team_cloud_state` Broadcast handling: clients now re-read protected cloud state through `adt_cloud_state_get` / `syncCriticalCloudState` instead of interpreting metadata as `state_value`.
- Added a serialized cloud-state realtime refresh queue to prevent overlapping RPC refreshes from racing.
- Kept existing product event ordering protection, private Broadcast authorization, device-bound realtime credential, Android Keystore storage, and WebView hardening.

## Static verification
- VersionCode 321 / VersionName 3.21.0
- No active `postgres_changes` subscription in the Android web client.
- No service_role key embedded in Android assets/source.
- No password fields written to localStorage.
- Private Realtime channel remains `adt:team:<team_id>`.
- Cloud-state Broadcast contains metadata only; state remains fetched through protected RPC.
- JavaScript syntax, Android XML, and ZIP integrity checked after modification.

## Limitation
- APK compilation is not claimed because Android SDK/Gradle build tooling is unavailable in the current execution environment.
