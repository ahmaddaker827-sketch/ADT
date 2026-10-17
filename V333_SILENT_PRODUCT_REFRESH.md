ADT Stock Pro 3.33.0 — Silent product reconciliation

- Product reconciliation interval is 5 seconds while the app is visible, online, and signed into a team.
- Reconciliation is silent: no loading indicator or error dialog for background poll failures.
- Product list and home stats are re-rendered only when user-visible product fields change.
- Realtime remains the primary immediate update path; polling is a reconciliation fallback.
- Polling pauses when the WebView document is hidden to reduce battery/data use. WebView timers may also be suspended by Android when the app is backgrounded; an exact 5-second guarantee while the app is backgrounded requires a native background service and is not claimed here.
- No database schema, RLS policy, or Supabase function changes.
