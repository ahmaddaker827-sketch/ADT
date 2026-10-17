# ADT Stock Pro 3.35.0 — Silent Product Sync Interval

- Reduced the silent product reconciliation interval from 5 seconds to 2 seconds.
- Kept the existing silent update behavior and change-only UI rendering.
- Polling still runs only while the app is visible, online, and a team is selected; Android/WebView may suspend timers in the background.
- This is a source project, not a built APK. Live multi-device synchronization has not been tested.
