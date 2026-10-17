# ADT Stock Pro 3.31.0 — Login, session and sign-out fix

## Findings
- `adt_account_login_v198` returns an empty `session_token` for member accounts by design, but the UI previously treated an empty token as a native secure-storage failure and aborted login after writing cached team identifiers.
- When the same member logs in on another phone, the server binds `team_members.user_id` to the new device. The old phone can then see a missing member context; this is a sign-out/device switch, not proof that the team was deleted.
- Native session-token saving now retries once after rebuilding a stale Android Keystore alias if an actual non-empty token cannot be stored.

## Changes
- Accept empty session tokens for non-manager member login; manager login still requires a server-issued token to be stored securely.
- Store selected team identifiers only after token handling, avoiding stale cached login after a failed login.
- Treat missing member context as a session end, showing sign-out rather than the misleading team-deleted notice.
- Increase Android version to 3.31.0 / versionCode 331.

## Validation limits
JavaScript syntax checks and source review are performed. Live Supabase multi-device tests and a full APK build must still be run in the user's build environment before production use.
