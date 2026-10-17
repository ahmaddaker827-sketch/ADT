# ADT Stock V319 — Final static audit

## Realtime architecture
- Client obtains a short-lived JWT from `adt-realtime-token`.
- JWT role is `authenticated` and contains `adt_team_id` / `adt_user_id`.
- JWT is signed with the Supabase project JWT signing secret via `SUPABASE_JWT_SECRET`; no separate untrusted signing secret is accepted.
- Client calls `realtime.setAuth(token)` before joining the private `adt:team:<teamId>` channel.
- Database triggers call `realtime.send(..., true)` after changes.
- `realtime.messages` SELECT policy checks both team claim and approved team_members membership.
- Broadcast payload for cloud state contains only the changed key and timestamps, not the state value.

## Product ordering
Older/untimestamped Realtime product events cannot overwrite a locally newer server-versioned product.

## Security
- No service_role token is embedded in Android assets/source.
- No plaintext manager/team password is stored in localStorage by the pending-account flow.
- WebView local assets use WebViewAssetLoader; broad file-URL access is disabled.

## Static validation
- ZIP extraction/integrity: pass.
- JavaScript syntax checks: required for all inline/external JS before release.
- Android XML parsing: pass.
- versionCode/versionName consistency: 319 / 3.19.0.

## Deployment requirement
The Supabase project must have its current JWT signing configuration compatible with HS256 custom JWTs. If the project has migrated fully to asymmetric signing keys, this custom JWT issuer must instead use an imported signing key/private key and matching Realtime verification configuration; do not invent a second secret.
