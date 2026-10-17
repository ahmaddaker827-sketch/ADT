# ADT Stock Pro 3.32.0 — Core auth/session/Realtime refactor

## Core changes
- Realtime device-secret rotation is transactional across the native encrypted store and server registration. If registration fails, the previous working device secret is restored instead of being erased.
- Native session-token storage verifies the just-written token can be decrypted again before reporting success.
- A manager login rejected by secure session storage now clears the attempted session state and explicitly returns to the login form instead of leaving a stale home screen underneath.
- Session loss / signing in from another device is treated as sign-out, not proof that the team was deleted.
- One-time migration removes stale team-deleted notices created by earlier releases.
- Removed the V330 product-only 5-second foreground polling workaround. Realtime is the primary event path; the existing unified sync and resume reconciliation remain available.

## Validation
- JavaScript syntax validation and ZIP integrity checks are run on this source project.
- No APK build or live Supabase two-device test is claimed. A device test is still required before production use.
