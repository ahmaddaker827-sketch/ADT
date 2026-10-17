# ADT Stock Pro 3.34.0 — Audit write transaction fix

## Root cause addressed
The application already contained session/permission-refresh guards that check `window.__adtAuditWriteInProgress`, but the actual audit write entry points never incremented that counter. As a result, a permission/session refresh could navigate away from the audit screen while the write was being processed, making the new audit item appear only after returning to the screen.

## Change
- Wrapped the core audit mutation entry points with a shared write transaction counter.
- Prevented the existing refresh/navigation guards from treating an in-progress audit write as an idle screen.
- Refreshed the currently visible audit list, home statistics, and audited-items viewer when the last write completes.
- No database schema, RLS policy, Supabase function, or product data format changes.

## Validation
- JavaScript syntax checks and ZIP integrity checks are run on the source project.
- This is source code only; APK build and two-device Supabase verification are not performed in this environment.
