ADT Stock V325 - Full Static Audit

Result: PASS for the performed static checks.

Checked:
1. ZIP extracted successfully.
2. VersionCode=325 and VersionName=3.25.0.
3. All JavaScript files pass Node syntax checking.
4. No JavaScript reference to Android.getSessionToken/getSecureValue/saveSecureValue/clearSecureValue remains.
5. MainActivity no longer exposes getSessionToken as @JavascriptInterface.
6. Generic secure-storage methods are not exposed to JavaScript; Realtime storage uses fixed-purpose bridge methods.
7. Native push dispatch reads the session token through getSessionTokenInternal() only.
8. Realtime secret bridge uses getRealtimeDeviceSecret/saveRealtimeDeviceSecret/clearRealtimeDeviceSecret.
9. ZIP integrity checked after packaging.

Not claimed:
- No APK build was performed because the project has no Gradle wrapper in the supplied tree and this environment does not have the Android SDK/Gradle build chain configured.
- Database-side RPC authorization was not mass-rewritten in this release because changing RPC signatures/authorization contracts without the live Supabase schema would risk breaking production calls. V323 push authorization remains server-side.
