# ADT Stock Pro 3.30.0 — Foreground Product Fallback

- Keeps the V329 realtime credential-order fix.
- Adds a 5-second foreground-only product refresh fallback when the private Realtime channel is not healthy.
- Does not poll while the app is hidden/offline, and prevents overlapping fallback requests.
- Realtime remains the preferred immediate path; fallback is intended to avoid requiring app background/resume while Realtime is unavailable.

Validation performed: ZIP integrity and JavaScript syntax checks. Not validated against live Supabase or on two physical devices; this is a source project, not a built APK.
