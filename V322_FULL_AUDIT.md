ADT Stock V322 — Full Static Audit

Version
- app/build.gradle: versionCode 322, versionName 3.22.0
- index.html fallback version: 322

JavaScript
- 27 inline script blocks extracted from index.html
- node --check: PASS for all extracted inline JS
- node --check: PASS for all packaged .js files
- node --check: PASS for combined-inline.js

Android/XML
- AndroidManifest.xml XML parse: PASS
- Java source inspected; javac environment lacks Android SDK classes, so a real Android compilation was not possible in this environment. javac reported only missing Android dependency packages under the configured max-error limit, not a Java syntax diagnostic.

Realtime
- Active postgres_changes occurrences in app runtime source: 0
- Private Broadcast architecture retained
- V322 cloud-state metadata-only Broadcast fix from V321 retained
- V321 Realtime device secret has explicit secure migration to V322
- Logout clears both V322 and V321 device-secret keys

Credential storage
- Session-token localStorage writes: 0
- FCM-token localStorage writes: 0
- Session token uses dedicated encrypted Android Keystore-backed preference namespace
- Generic secure-value JS API cannot address the session preference entry
- Password localStorage writes: none found by credential-pattern scan

WebView hardening
- allowFileAccess=false
- allowFileAccessFromFileURLs=false
- allowUniversalAccessFromFileURLs=false
- usesCleartextTraffic=false
- no SSL-error bypass handler found
- no active setWebContentsDebuggingEnabled(true) found

Legacy cleanup
- checkAppLock/verifyAppPassword/lockAppAgain references: 0
- atd_sales_bypass_pin references: 0
- atd_sales_master_locked references: 0

Integrity
- ZIP integrity: PASS
- Package contains 256+ files (excluding audit-only transient check directory)

Known limitation
- Supabase JS remains CDN-loaded at @supabase/supabase-js@2.91.0. This was intentionally not replaced without the exact SDK artifact; the environment could not download it. Replacing it requires adding the exact verified SDK file to the project, then rerunning this audit.
