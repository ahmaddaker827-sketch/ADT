# ADT Stock V320 Full Audit

## Realtime identity
- Client no longer receives a Realtime JWT by presenting arbitrary team/user identifiers.
- A random device secret is generated after a successful ADT login.
- The secret is stored through Android Keystore-backed AES-GCM storage, not localStorage.
- The server stores only a bcrypt hash of that secret.
- The Edge Function verifies the secret against team/user/device and approved membership before issuing a JWT.
- JWT expires after 15 minutes.
- Client refreshes the token before expiry and calls `realtime.setAuth()` before private-channel subscription.

## Realtime transport
- Private Broadcast channel: `adt:team:<team_id>`.
- Database triggers broadcast committed changes for products, cloud state, team members and team features.
- Broadcast payload for cloud state contains metadata only; state contents are re-read through protected RPCs.
- Active client subscription does not use `postgres_changes`.

## Product ordering
- Older timestamped events are ignored.
- Untimestamped events are not allowed to overwrite a product that already has a known server timestamp; HTTP reconciliation is scheduled instead.

## WebView
- Local content is served through WebViewAssetLoader.
- File-origin universal access is disabled.

## Passwords
- Account passwords are not persisted in localStorage.

## Static checks
- Run JavaScript syntax checks on all standalone JS files and extracted inline script blocks.
- Parse AndroidManifest.xml.
- Verify ZIP integrity.
- Verify versionCode/versionName.
- Verify no active `postgres_changes` handlers remain in runtime/source mirrors.
- Verify no service_role secret is embedded in the Android asset bundle.

## Build limitation
The audit environment does not contain a complete Android SDK/Gradle toolchain, so this audit does not claim an APK compilation.
