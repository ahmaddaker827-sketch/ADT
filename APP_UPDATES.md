# ADT Stock updates

## V336 — Realtime token request authorization
- Added the Authorization Bearer header to the native `adt-realtime-token` request to address `UNAUTHORIZED_NO_AUTH_HEADER`.
- This is a targeted fix for the confirmed gateway rejection; it does not claim the full Realtime connection has been verified.


1. Run `V190_APP_RELEASES.sql` once in the Supabase SQL Editor.
2. Build every APK intended as an update with the same `applicationId` (`com.adt.pro`) and the same release keystore. The GitHub workflow requires four repository secrets: `ADT_KEYSTORE_BASE64`, `ADT_STORE_PASSWORD`, `ADT_KEY_ALIAS`, and `ADT_KEY_PASSWORD`. Keep the original keystore backed up outside the repository. Never commit the keystore or passwords.
3. Increase `versionCode` and `versionName` in `app/build.gradle` for every new APK. Build `assembleRelease`, test installation over the previous signed release APK, then upload that APK to a permanent HTTPS URL.
4. Open developer mode, enter the new version code and APK URL in “نشر تحديث التطبيق”, and publish. Connected devices compare their installed APK code with the published code and show a download prompt. An HTML reload cannot replace an APK.

APK updates also require that the old installed APK was signed by this exact same key. APKs built by different GitHub Actions runners with `assembleDebug`, a Google Play key, or another developer's signing key cannot update one another. Installing the first stable release may require uninstalling that older build after backing up app data; later releases signed with the stable key can install in place.

Developer offline mode uses the last signed-in session and data cached on this device. Product edits, deletion and backup imports, wholesale and retail audits, shortages, debt accounts and ledger transactions, suppliers, invoices, and daily sales are available locally. Cloud-backed edits are queued in operation order and retried after reconnecting. Pending debt and sales IDs are remapped to their server IDs during replay. A server may reject a pending edit if the account was revoked or another device changed its data meanwhile; the local edit remains visible and the queue stays pending for review. Team administration, first-time login, developer PIN verification, update publishing and other remote-only actions still need a connection.

## V273 - Grocery audit phone file backup
- The current grocery audit is mirrored automatically after every add/edit/delete to one overwrite-in-place JSON file in Downloads/ADT Stock/جرد البقالة - مباشر.
- Periodic/destructive-operation snapshots are stored separately in Downloads/ADT Stock/جرد البقالة - نسخ, keeping the existing 30-file rotation.
- The live file is serialized through a single native writer to prevent older writes finishing after newer ones.

## V273 Audit Continuity Guard
- Removed the temporary 105-item PDF recovery button and all one-off PDF recovery code.
- Added native read-back for the live grocery/wholesale audit JSON files stored under Downloads/ADT Stock.
- Grocery and wholesale audits now verify continuity against local recovery snapshots and the live phone file before accepting a suspicious empty/shrunken state.
- Cloud sync rejects unexplained shrinking audit payloads; explicit delete/reset/restore mutations remain allowed.
- Unexpected empty saves are blocked unless they came from an explicit delete/reset/restore action.
- Wholesale loading no longer re-saves/re-timestamps unchanged state on every read.

## V273 — مراجعة حماية الجرد النهائية
- إضافة حفظ خارجي مؤكد (checked) بدل اعتبار طلب الحفظ ناجحًا قبل انتهاء الكتابة على الهاتف.
- منع الحذف/التصفير في جرد البقالة والجملة إذا فشل إنشاء نسخة الأمان على الهاتف.
- كتابة ملف الجرد المباشر بطريقة أكثر أمانًا مع ملف مؤقت/سابق لتقليل خطر تلف Latest أثناء الانقطاع.
- منع طلب مزامنة قديم فاشل من استبدال طلب أحدث في طابور المزامنة.
- إضافة توافق آمن عند عدم تثبيت SQL الخاص ببيانات المراجعة بدل إعادة كتابة حالة قديمة بلا نهاية.
- إضافة V273_DATA_SAFETY_META.sql لحفظ الحالة + بيانات المراجعة ذريًا في Supabase عبر adt_cloud_state_set_pair.
- تقليل تكرار نسخ جرد البقالة داخل localStorage لتجنب امتلاء مساحة WebView؛ النسخ الخارجية تبقى حتى 30 نسخة.


## V273 Tablet + Live Audit Viewer
- Responsive full-width layout on tablets and landscape screens.
- Android orientation is no longer portrait-only; added in-app Auto/Portrait/Landscape selector.
- Audited-items viewer now refreshes team audit state while open so a second device can follow the audit live.

## V273 - Granular audit permissions
- Audit access is now viewer-first: `can_audit` / `can_grocery_audit` only expose the audit screen.
- Primary manager can grant each audit action separately: add/count, edit quantity, edit audit price, delete item, export PDF, save/reset, restore saved audit, delete saved audit history.
- Members with only view access see live audit data but mutation controls are hidden/locked.
- Sub-managers no longer receive audit view or mutation rights automatically; every audit permission is granted explicitly by the primary manager.
- Cloud audit writes require at least one matching mutation permission; view-only members cannot overwrite audit cloud state.
- Requires running `V273_GRANULAR_AUDIT_PERMISSIONS.sql` once in Supabase.

V297 — Instant team sync: audit and grocery permission changes now use the existing FCM team data channel used by product-price updates; foreground devices refresh the affected state immediately without logout.

## V316.0 — Realtime hardening
- إصلاح سباقات HTTP/Realtime/IndexedDB للمنتجات.
- إدارة اتصال Realtime مستقرة مع heartbeat وsocket-state.
- تثبيت إصدار Supabase JS.
- الحفاظ على حماية cloud state وعدم فتح SELECT عام.


## V323 — Push Authorization + Cloud State Cleanup
- versionCode 323 / versionName 3.23.0
- server-side push authorization and session validation
- canonical Cloud State save/sync implementation


## V324 — Team Context + Realtime Lifecycle Hardening
- versionCode 324 / versionName 3.24.0
- Added one canonical team/session teardown path that invalidates pending Realtime reconnects, clears the old channel, token and product watermarks before context changes.
- Realtime setup now uses a generation guard so an old asynchronous connection cannot attach itself after a team switch.
- Offline cached team data is treated as display continuity only; cached role/permissions are no longer reused as authorization when the server cannot be reached.
- Hardened Android WebView navigation: removed arbitrary `intent:` / `market:` external URI handling and disabled automatic JavaScript popup windows.
- Enabled WebView Safe Browsing on supported Android versions.
- Updated the HTML fallback version to 324.
- 27 inline JavaScript blocks pass Node syntax checks.
- No APK build performed because Android SDK/Gradle tooling is not available in this environment.
