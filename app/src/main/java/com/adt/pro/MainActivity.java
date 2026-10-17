package com.adt.pro;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.provider.MediaStore;
import android.database.Cursor;
import java.io.OutputStream;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import android.webkit.ValueCallback;
import android.webkit.URLUtil;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.app.Activity;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int REQ_NOTIFICATIONS = 1101;
    private static final String HOME_URL = "https://appassets.androidplatform.net/assets/index.html";
    private WebViewAssetLoader assetLoader;
    private volatile String fcmToken = "";
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE_CHOOSER = 1202;
    private static final String SB_URL = "https://ufvsxvifbmqsqcugbtlf.supabase.co";
    private static final String SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdnN4dmlmYm1xc3FjdWdidGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDU3NjksImV4cCI6MjEwMjI4MTc2OX0.1KL6y2gH3galMeJC2bUGnIl_flKA7pLZY5C6KYTQ_L0";
    private static final int REQ_SAVE_FILE = 1203;
    private byte[] pendingFileBytes;
    private String pendingFileName;
    private String pendingFileMime;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean nativeServicesInitialized = false;
    private static final int APP_HEADER_COLOR = Color.rgb(3, 9, 16);
    private volatile boolean firstWebFrameReady = false;
    private final ExecutorService automaticFileExecutor = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // V176: أبقِ Splash النظام ظاهرة حتى يعلن HTML أن شاشة البداية الصحيحة أصبحت جاهزة.
        // بهذا لا تظهر الرئيسية لحظةً قبل اختيار اللغة/التعريف ولا توجد شاشة سوداء بينهما.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !firstWebFrameReady);
        super.onCreate(savedInstanceState);
        activeMainActivity = this;

        getWindow().setStatusBarColor(APP_HEADER_COLOR);
        getWindow().setNavigationBarColor(APP_HEADER_COLOR);

        if (Build.VERSION.SDK_INT >= 30) {
            try { getWindow().setDecorFitsSystemWindows(true); } catch (Exception ignored) {}
        }
        webView = new WebView(this);
        webView.setBackgroundColor(APP_HEADER_COLOR);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(APP_HEADER_COLOR);
        int topInset = Build.VERSION.SDK_INT >= 35 ? getStatusBarHeightPx() : 0;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        lp.topMargin = topInset;
        root.addView(webView, lp);

        // V173: نعتمد على Splash النظام فقط لتجنب ظهور الشعار بحجمين مختلفين.
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Local HTML is served through WebViewAssetLoader instead of the file:// origin.
        // This lets us disable file-origin cross-access and removes the broad file URL trust boundary.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(true);
        }
        // No arbitrary popup windows from page JavaScript; external navigation is handled explicitly below.
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new NativeBridge(), "Android");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) MainActivity.this.filePathCallback.onReceiveValue(null);
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(resolveFileChooserMime(fileChooserParams));
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "تعذر فتح مدير الملفات", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader == null ? null : assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader == null ? null : assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                // لا نزيل Splash هنا: أول Frame قد يكون الرئيسية قبل أن يحسم JavaScript مسار البداية.
                // الإزالة تتم من Android.markStartupReady() بعد تجهيز Intro أو الواجهة الرئيسية الصحيحة.
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // حماية أخيرة فقط: لو حدث خطأ JavaScript غير متوقع لا نترك Splash معلقة للأبد.
                view.postDelayed(() -> { if (!firstWebFrameReady) firstWebFrameReady = true; }, 7000);
                deliverTokenToWeb();
                installNativePageHooks();
                notifyNetworkStateToWeb();
                view.post(MainActivity.this::startDeferredNativeServices);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return openExternalUri(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    firstWebFrameReady = true;
                    showOfflinePage();
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                if (url != null && url.startsWith("blob:")) {
                    String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    fetchBlobForNativeSave(url, fileName, mimetype);
                } else if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setMimeType(mimetype);
                    req.addRequestHeader("User-Agent", userAgent);
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            URLUtil.guessFileName(url, contentDisposition, mimetype));
                    ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
                }
            } catch (Exception e) {
                Toast.makeText(this, "تعذر تنزيل الملف", Toast.LENGTH_SHORT).show();
            }
        });

        // أول Render للواجهة المحلية يبدأ قبل أي تهيئة خارجية أو طلب صلاحيات.
        webView.loadUrl(HOME_URL);
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }


    private void startDeferredNativeServices() {
        if (nativeServicesInitialized || isFinishing()) return;
        nativeServicesInitialized = true;
        createPriceNotificationChannel();
        requestNotificationPermission();
        loadStoredToken();
        refreshFcmToken();
        registerConnectivityCallback();
    }

    private String resolveFileChooserMime(WebChromeClient.FileChooserParams params) {
        String[] values = params == null ? null : params.getAcceptTypes();
        if (values != null) {
            for (String value : values) {
                if (value == null) continue;
                for (String part : value.split(",")) {
                    String type = part.trim();
                    if (type.equalsIgnoreCase(".json") || type.toLowerCase().contains("json")) {
                        return "application/json";
                    }
                    if (type.indexOf('/') > 0) return type;
                }
            }
        }
        return "*/*";
    }

    private boolean openExternalUri(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null || "file".equalsIgnoreCase(scheme) ||
                "about".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme) ||
                "blob".equalsIgnoreCase(scheme)) return false;
        String normalized = scheme.toLowerCase();
        if (!("http".equals(normalized) || "https".equals(normalized) ||
                "mailto".equals(normalized) || "tel".equals(normalized) ||
                "sms".equals(normalized))) {
            Toast.makeText(this, "نوع الرابط غير مدعوم", Toast.LENGTH_SHORT).show();
            return true;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "لا يوجد تطبيق مناسب لفتح الرابط", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void installNativePageHooks() {
        if (webView == null) return;
        String js = "(function(){if(window.__adtAndroidHooksReady)return;window.__adtAndroidHooksReady=true;"
                + "document.addEventListener('click',function(e){var n=e.target;var a=n&&n.closest?n.closest('a'):null;if(!a)return;"
                + "var h=a.href||'';if((a.target==='_blank'||h.indexOf('wa.me/')>=0)&&/^(https?:|mailto:|tel:|sms:)/i.test(h)){"
                + "e.preventDefault();Android.openExternal(h);}},true);"
                + "var oldOpen=window.open;window.open=function(u,t,f){if(typeof u==='string'&&/^(https?:|mailto:|tel:|sms:)/i.test(u)){"
                + "Android.openExternal(u);return null;}return oldOpen.call(window,u,t,f);};})();";
        webView.evaluateJavascript(js, null);
    }

    private void fetchBlobForNativeSave(String blobUrl, String fileName, String mimeType) {
        if (webView == null) return;
        String js = "(function(){fetch(" + JSONObject.quote(blobUrl) + ").then(function(r){return r.blob();})"
                + ".then(function(b){var x=new FileReader();x.onloadend=function(){var s=String(x.result||'');var i=s.indexOf(',');"
                + "Android.saveBase64File(i>=0?s.slice(i+1):s," + JSONObject.quote(fileName) + ",b.type||"
                + JSONObject.quote(safeMime(mimeType)) + ");};x.readAsDataURL(b);})"
                + ".catch(function(){Android.showNativeToast('تعذر تجهيز الملف');});})();";
        webView.evaluateJavascript(js, null);
    }

    private static String safeFileName(String fileName, String fallback) {
        String result = fileName == null ? "" : fileName.trim();
        result = result.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        while (result.startsWith(".")) result = result.substring(1);
        if (result.isEmpty()) result = fallback;
        return result.length() > 120 ? result.substring(0, 120) : result;
    }

    private static String safeMime(String mimeType) {
        if (mimeType == null || mimeType.indexOf('/') <= 0) return "application/octet-stream";
        String result = mimeType.split(";", 2)[0].trim();
        return result.isEmpty() ? "application/octet-stream" : result;
    }

    private void requestNativeFileSave(String base64, String fileName, String mimeType) {
        try {
            final byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IllegalArgumentException("EMPTY_FILE");
            runOnUiThread(() -> {
                if (pendingFileBytes != null) {
                    Toast.makeText(MainActivity.this, "أكمل حفظ الملف الحالي أولاً", Toast.LENGTH_SHORT).show();
                    return;
                }
                pendingFileBytes = bytes;
                pendingFileName = safeFileName(fileName, "ADT_Stock_File.json");
                pendingFileMime = safeMime(mimeType);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingFileMime);
                intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);
                try {
                    startActivityForResult(intent, REQ_SAVE_FILE);
                } catch (ActivityNotFoundException error) {
                    clearPendingFileSave();
                    Toast.makeText(MainActivity.this, "لا يوجد مدير ملفات متاح", Toast.LENGTH_SHORT).show();
                }
            });
        } catch (Exception error) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر تجهيز الملف للحفظ", Toast.LENGTH_SHORT).show());
        }
    }

    private boolean saveAutomaticArchiveChecked(String base64, String fileName, String mimeType, String category) {
        try {
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IllegalArgumentException("EMPTY_ARCHIVE");
            String safeCategory = safeFileName(category, "عام");
            String safeName = safeFileName(fileName, "ADT_Stock_File");
            String safeType = safeMime(mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String relativePath = Environment.DIRECTORY_DOWNLOADS + "/ADT Stock/" + safeCategory + "/";
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, safeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (target == null) throw new IllegalStateException("MEDIA_INSERT_FAILED");
                boolean completed = false;
                try {
                    try (OutputStream output = getContentResolver().openOutputStream(target, "w")) {
                        if (output == null) throw new IllegalStateException("OUTPUT_UNAVAILABLE");
                        output.write(bytes);
                        output.flush();
                    }
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(target, done, null, null);
                    completed = true;
                } finally {
                    if (!completed) {
                        try { getContentResolver().delete(target, null, null); } catch (Exception ignored) {}
                    }
                }
                trimAutomaticArchives(relativePath, 30);
            } else {
                File root = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
                File dir = new File(root == null ? getFilesDir() : root, "ADT Stock/" + safeCategory);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("DIR_FAILED");
                File temp = new File(dir, safeName + ".tmp");
                File target = new File(dir, safeName);
                try (FileOutputStream output = new FileOutputStream(temp, false)) {
                    output.write(bytes);
                    output.flush();
                    try { output.getFD().sync(); } catch (Exception ignored) {}
                }
                if (target.exists() && !target.delete()) throw new IllegalStateException("ARCHIVE_REPLACE_DELETE_FAILED");
                if (!temp.renameTo(target)) throw new IllegalStateException("ARCHIVE_RENAME_FAILED");
                File[] files = dir.listFiles(File::isFile);
                if (files != null && files.length > 30) {
                    java.util.Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                    for (int i = 30; i < files.length; i++) files[i].delete();
                }
            }
            return true;
        } catch (Exception error) {
            android.util.Log.e("ADT_AUTO_ARCHIVE", "Automatic archive save failed", error);
            return false;
        }
    }

    private void saveAutomaticArchive(String base64, String fileName, String mimeType, String category) {
        new Thread(() -> saveAutomaticArchiveChecked(base64, fileName, mimeType, category)).start();
    }

    private String readAutomaticLatestText(String fileName, String category) {
        try {
            String safeCategory = safeFileName(category, "جرد البقالة - مباشر");
            String safeName = safeFileName(fileName, "GroceryAudit-Latest.json");
            InputStream input = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    String relativePath = Environment.DIRECTORY_DOWNLOADS + "/ADT Stock/" + safeCategory + "/";
                    String[] projection = { MediaStore.MediaColumns._ID };
                    String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
                    Uri target = null;
                    try (Cursor cursor = getContentResolver().query(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                            projection,
                            selection,
                            new String[]{relativePath, safeName},
                            MediaStore.MediaColumns._ID + " DESC")) {
                        if (cursor != null && cursor.moveToFirst()) {
                            long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                            target = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                        }
                    }
                    if (target == null) {
                        try (Cursor cursor = getContentResolver().query(
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                projection,
                                selection,
                                new String[]{relativePath, safeName + ".previous"},
                                MediaStore.MediaColumns._ID + " DESC")) {
                            if (cursor != null && cursor.moveToFirst()) {
                                long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                                target = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                            }
                        }
                    }
                    if (target == null) return "";
                    input = getContentResolver().openInputStream(target);
                } else {
                    File root = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
                    File dir = new File(root == null ? getFilesDir() : root, "ADT Stock/" + safeCategory);
                    File target = new File(dir, safeName);
                    if (!target.exists() || !target.isFile()) target = new File(dir, safeName + ".previous");
                    if (!target.exists() || !target.isFile()) return "";
                    input = new FileInputStream(target);
                }
                if (input == null) return "";
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                int total = 0;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > 8 * 1024 * 1024) throw new IllegalStateException("LATEST_FILE_TOO_LARGE");
                    output.write(buffer, 0, count);
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            } finally {
                if (input != null) try { input.close(); } catch (Exception ignored) {}
            }
        } catch (Exception error) {
            android.util.Log.w("ADT_AUTO_ARCHIVE", "Automatic latest read failed", error);
            return "";
        }
    }

    private boolean saveAutomaticLatestFileChecked(String base64, String fileName, String mimeType, String category) {
        try {
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IllegalArgumentException("EMPTY_LATEST_FILE");
            String safeCategory = safeFileName(category, "جرد البقالة - مباشر");
            String safeName = safeFileName(fileName, "GroceryAudit-Latest.json");
            String safeType = safeMime(mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String relativePath = Environment.DIRECTORY_DOWNLOADS + "/ADT Stock/" + safeCategory + "/";
                Uri oldTarget = null;
                String[] projection = { MediaStore.MediaColumns._ID };
                String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
                try (Cursor cursor = getContentResolver().query(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        projection,
                        selection,
                        new String[]{relativePath, safeName},
                        MediaStore.MediaColumns._ID + " DESC")) {
                    if (cursor != null && cursor.moveToFirst()) {
                        long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                        oldTarget = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                    }
                }
                String tempName = safeName + ".writing-" + System.currentTimeMillis();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, tempName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, safeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri tempTarget = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (tempTarget == null) throw new IllegalStateException("LATEST_MEDIA_INSERT_FAILED");
                boolean promoted = false;
                try {
                    try (OutputStream output = getContentResolver().openOutputStream(tempTarget, "w")) {
                        if (output == null) throw new IllegalStateException("LATEST_OUTPUT_UNAVAILABLE");
                        output.write(bytes);
                        output.flush();
                    }
                    ContentValues rename = new ContentValues();
                    rename.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    rename.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    // Keep the old readable file until the new file is fully written.
                    if (oldTarget != null) {
                        ContentValues oldRename = new ContentValues();
                        oldRename.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName + ".previous");
                        int moved = getContentResolver().update(oldTarget, oldRename, null, null);
                        if (moved <= 0) throw new IllegalStateException("LATEST_PREVIOUS_RENAME_FAILED");
                    }
                    int changed = getContentResolver().update(tempTarget, rename, null, null);
                    if (changed <= 0) throw new IllegalStateException("LATEST_PROMOTE_FAILED");
                    promoted = true;
                    if (oldTarget != null) {
                        try { getContentResolver().delete(oldTarget, null, null); } catch (Exception ignored) {}
                    }
                } finally {
                    if (!promoted) {
                        try { getContentResolver().delete(tempTarget, null, null); } catch (Exception ignored) {}
                        // If promotion failed after renaming the previous file, put it back.
                        if (oldTarget != null) {
                            try {
                                ContentValues restore = new ContentValues();
                                restore.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                                getContentResolver().update(oldTarget, restore, null, null);
                            } catch (Exception ignored) {}
                        }
                    }
                }
            } else {
                File root = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
                File dir = new File(root == null ? getFilesDir() : root, "ADT Stock/" + safeCategory);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("LATEST_DIR_FAILED");
                File target = new File(dir, safeName);
                File temp = new File(dir, safeName + ".tmp");
                try (FileOutputStream output = new FileOutputStream(temp, false)) {
                    output.write(bytes);
                    output.flush();
                    try { output.getFD().sync(); } catch (Exception ignored) {}
                }
                File previous = new File(dir, safeName + ".previous");
                if (previous.exists()) previous.delete();
                if (target.exists() && !target.renameTo(previous)) throw new IllegalStateException("LATEST_PREVIOUS_RENAME_FAILED");
                if (!temp.renameTo(target)) {
                    if (previous.exists()) previous.renameTo(target);
                    throw new IllegalStateException("LATEST_RENAME_FAILED");
                }
                if (previous.exists()) previous.delete();
            }
            return true;
        } catch (Exception error) {
            android.util.Log.e("ADT_LATEST_FILE", "Automatic latest file save failed", error);
            return false;
        }
    }

    private void saveAutomaticLatestFile(String base64, String fileName, String mimeType, String category) {
        automaticFileExecutor.execute(() -> saveAutomaticLatestFileChecked(base64, fileName, mimeType, category));
    }

    private void trimAutomaticArchives(String relativePath, int keepCount) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        String[] projection = { MediaStore.MediaColumns._ID };
        String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=?";
        String order = MediaStore.MediaColumns.DATE_ADDED + " DESC, " + MediaStore.MediaColumns._ID + " DESC";
        try (Cursor cursor = getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection, selection, new String[]{relativePath}, order)) {
            if (cursor == null) return;
            int index = 0;
            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            while (cursor.moveToNext()) {
                if (index++ < keepCount) continue;
                Uri item = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        String.valueOf(cursor.getLong(idColumn)));
                getContentResolver().delete(item, null, null);
            }
        }
    }

    private void clearPendingFileSave() {
        pendingFileBytes = null;
        pendingFileName = null;
        pendingFileMime = null;
    }

    private void finishBackNavigation() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private int getStatusBarHeightPx() {
        try {
            int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resId > 0) return getResources().getDimensionPixelSize(resId);
        } catch (Exception ignored) {}
        return 0;
    }

    private void createPriceNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            android.app.NotificationChannel ch = new android.app.NotificationChannel(
                    "adt_price_updates", "إشعارات ADT Stock", android.app.NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("إشعارات الأسعار والمبيعات والاستلامات والدفعات والتالف");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 280, 140, 280});
            ch.enableLights(true);
            ch.setLightColor(Color.CYAN);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttributes);
            nm.createNotificationChannel(ch);
        }
    }

    private boolean hasInternetConnection() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            Network network = manager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void notifyNetworkStateToWeb() {
        if (webView == null) return;
        final boolean online = hasInternetConnection();
        webView.post(() -> webView.evaluateJavascript(
                "if(window.setNetworkConnectionState){window.setNetworkConnectionState(" + online + ");}", null));
    }

    private void registerConnectivityCallback() {
        if (networkCallback != null) return;
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) { notifyNetworkStateToWeb(); }
                @Override public void onLost(Network network) { notifyNetworkStateToWeb(); }
                @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { notifyNetworkStateToWeb(); }
            };
            manager.registerDefaultNetworkCallback(networkCallback);
            notifyNetworkStateToWeb();
        } catch (Exception ignored) {
            networkCallback = null;
        }
    }

    private void loadStoredToken() {
        fcmToken = getSharedPreferences("adt_push", MODE_PRIVATE).getString("fcm_token", "");
    }

    private void saveToken(String token) {
        if (token == null || token.trim().length() < 20) return;
        fcmToken = token.trim();
        getSharedPreferences("adt_push", MODE_PRIVATE).edit().putString("fcm_token", fcmToken).apply();
        deliverTokenToWeb();
    }

    private void refreshFcmToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) saveToken(task.getResult());
        });
    }

    private void deliverTokenToWeb() {
        if (webView == null || fcmToken == null || fcmToken.length() < 20) return;
        final String js = "javascript:(function(){"
                + "var t=" + JSONObject.quote(fcmToken) + ";"
                + "if(window.ADT_registerPushToken){window.ADT_registerPushToken(t);}"
                + "else if(window.onFCMToken){window.onFCMToken(t);}"
                + "})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS &&
                (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED)) {
            Toast.makeText(this, "فعّل إشعارات ADT Stock من إعدادات الهاتف لاستقبالها خارج التطبيق", Toast.LENGTH_LONG).show();
        }
    }

    private void showOfflinePage() {
        String html = "<!doctype html><html dir='rtl'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>*{box-sizing:border-box}html,body{margin:0;background:#030910;color:#fff;height:100%;font-family:sans-serif}"
                + "body{display:flex;align-items:center;justify-content:center;text-align:center;padding:18px}.box{width:min(92vw,360px);padding:25px 20px;background:linear-gradient(180deg,#0b1725,#07111d);border:1.5px solid #00d2b4;border-radius:22px;box-shadow:0 22px 70px #000}"
                + ".icon{width:58px;height:58px;margin:0 auto 13px;border-radius:18px;display:grid;place-items:center;background:#0b292a;border:1px solid #16796f;color:#00d2b4;font-size:27px;font-weight:900}"
                + "h2{font-size:22px;margin:0 0 9px}p{color:#8E9BAE;font-size:14px;line-height:1.8;margin:0 0 16px}"
                + "button{width:100%;background:linear-gradient(135deg,#00f2c3,#00b894);color:#03110f;border:0;border-radius:13px;padding:14px;font-weight:900;font-size:15px}</style></head>"
                + "<body><div class='box'><div class='icon'>!</div><h2>أنت غير متصل بالإنترنت</h2>"
                + "<p>تحقق من بيانات الهاتف أو شبكة Wi‑Fi، ثم حاول مرة أخرى.</p>"
                + "<button onclick='location.href=\"" + HOME_URL + "\"'>إعادة المحاولة</button></div></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!nativeServicesInitialized) return;
        loadStoredToken();
        refreshFcmToken();
        deliverTokenToWeb();
        notifyNetworkStateToWeb();
        // V315: explicitly tell the WebView that Android resumed the activity.
        // The HTML Realtime layer then verifies/rejoins its Supabase channel
        // instead of waiting for a visibility/focus event.
        if (webView != null) {
            webView.postDelayed(() -> {
                if (webView == null) return;
                webView.evaluateJavascript(
                        "try{window.adtHandleNativeResume&&window.adtHandleNativeResume();}catch(e){}",
                        null
                );
            }, 120);
        }
    }

    @Override
    protected void onDestroy() {
        if (activeMainActivity == this) activeMainActivity = null;
        if (networkCallback != null) {
            try {
                ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (manager != null) manager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
            networkCallback = null;
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if (filePathCallback != null) filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            return;
        }

        if (requestCode == REQ_SAVE_FILE) {
            final byte[] bytes = pendingFileBytes;
            final Uri target = resultCode == RESULT_OK && data != null ? data.getData() : null;
            clearPendingFileSave();
            if (target == null || bytes == null) return;
            new Thread(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(target, "w")) {
                    if (output == null) throw new IllegalStateException("OUTPUT_STREAM_UNAVAILABLE");
                    output.write(bytes);
                    output.flush();
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "تم حفظ الملف بنجاح", Toast.LENGTH_LONG).show());
                } catch (Exception error) {
                    android.util.Log.e("ADT_FILE", "Native file save failed", error);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر حفظ الملف", Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }

    private static volatile MainActivity activeMainActivity;

    static void deliverTeamEventToWeb(String eventType, String teamId, String actorUserId) {
        MainActivity activity = activeMainActivity;
        if (activity == null || activity.webView == null) return;
        final String safeType = eventType == null ? "" : eventType.replace("\\", "\\\\").replace("'", "\\'");
        final String safeTeam = teamId == null ? "" : teamId.replace("\\", "\\\\").replace("'", "\\'");
        final String safeActor = actorUserId == null ? "" : actorUserId.replace("\\", "\\\\").replace("'", "\\'");
        activity.runOnUiThread(() -> {
            if (activity.webView == null) return;
            String js = "try{window.handleTeamRealtimeEvent&&window.handleTeamRealtimeEvent('" + safeType + "','" + safeTeam + "','" + safeActor + "');}catch(e){}";
            activity.webView.evaluateJavascript(js, null);
        });
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        String js = "(function(){try{"
                + "if(window.__adtRequiredRelease&&window.getInstalledAppVersionCode&&window.__adtRequiredRelease.code>window.getInstalledAppVersionCode()){"
                + "var update=document.getElementById('adtUpdateModal');if(update)update.style.display='flex';return true;}"
                + "var d=document.getElementById('sidebarDrawer');if(d&&d.classList.contains('active')){"
                + "if(window.closeSideMenu)window.closeSideMenu();else d.classList.remove('active');return true;}"
                + "var blocked={appLockModal:1,teamSuspendedModal:1,onboardingModal:1,subscriptionExpiredModal:1,offlineConnectionModal:1,adtUpdateModal:1};"
                + "var list=Array.prototype.slice.call(document.querySelectorAll('.modal')).filter(function(m){"
                + "return !blocked[m.id]&&getComputedStyle(m).display!=='none';}).sort(function(a,b){"
                + "return (parseInt(getComputedStyle(b).zIndex,10)||0)-(parseInt(getComputedStyle(a).zIndex,10)||0);});"
                + "if(list.length){if(window.closeModal)window.closeModal(list[0].id);else list[0].style.display='none';return true;}"
                + "if(typeof currentTab!=='undefined'&&currentTab!=='home'&&window.switchTab){window.switchTab('home',false);return true;}"
                + "return false;}catch(e){return false;}})();";
        webView.evaluateJavascript(js, handled -> {
            if ("true".equals(handled)) return;
            finishBackNavigation();
        });
    }

    private void dispatchPricePush(JSONObject payload) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(SB_URL + "/functions/v1/adt-send-price-push");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(15000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("apikey", SB_ANON);
                // The Edge Function must receive the app's authenticated custom session
                // separately from the public Supabase anon bearer used by the gateway.
                // This prevents a caller from choosing an arbitrary actor_user_id/team_id
                // and turning the push endpoint into an unauthenticated dispatcher.
                conn.setRequestProperty("Authorization", "Bearer " + SB_ANON);
                String sessionToken = new NativeBridge().getSessionTokenInternal();
                if (sessionToken != null && !sessionToken.trim().isEmpty()) {
                    conn.setRequestProperty("X-ADT-Session-Token", sessionToken.trim());
                }
                String body = payload == null ? "{}" : payload.toString();
                try (OutputStream os = conn.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) android.util.Log.w("ADT_PUSH", "Edge response=" + code);
            } catch (Exception e) {
                android.util.Log.e("ADT_PUSH", "Native dispatch failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    public class NativeBridge {
        private static final String SECURE_PREFS = "adt_secure_v1";
        private static final String SECURE_KEY_ALIAS = "ADT_SECURE_STORAGE_V1";

        private SecretKey getOrCreateSecureKey() throws Exception {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(SECURE_KEY_ALIAS)) {
                return ((KeyStore.SecretKeyEntry) keyStore.getEntry(SECURE_KEY_ALIAS, null)).getSecretKey();
            }
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
                    SECURE_KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build());
            return generator.generateKey();
        }

        // V325: do not expose generic secure-storage read/write to JavaScript.
        // Realtime credential access is restricted to fixed, purpose-specific keys.
        private static final String REALTIME_DEVICE_SECRET_KEY = "adt_realtime_device_secret_v322";
        private static final String REALTIME_LEGACY_DEVICE_SECRET_KEY = "adt_realtime_device_secret_v321";
        private static final String REALTIME_DEVICE_SECRET_BACKUP_KEY = "adt_realtime_device_secret_backup_v332";

        private synchronized String readSecureValueInternal(String name) {
            try {
                if (name == null || name.trim().isEmpty()) return "";
                String packed = getSharedPreferences(SECURE_PREFS, MODE_PRIVATE).getString(name.trim(), "");
                if (packed == null || packed.isEmpty()) return "";
                String[] parts = packed.split("\\.", 2);
                if (parts.length != 2) return "";
                byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
                byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecureKey(), new GCMParameterSpec(128, iv));
                return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            } catch (Exception e) {
                android.util.Log.e("ADT_SECURE", "readSecureValueInternal failed", e);
                return "";
            }
        }

        private synchronized boolean writeSecureValueInternal(String name, String value) {
            try {
                if (name == null || name.trim().isEmpty()) return false;
                SecretKey key = getOrCreateSecureKey();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key);
                byte[] encrypted = cipher.doFinal((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
                byte[] iv = cipher.getIV();
                String packed = Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
                getSharedPreferences(SECURE_PREFS, MODE_PRIVATE).edit().putString(name.trim(), packed).apply();
                return true;
            } catch (Exception e) {
                android.util.Log.e("ADT_SECURE", "writeSecureValueInternal failed", e);
                return false;
            }
        }

        private synchronized boolean clearSecureValueInternal(String name) {
            try {
                if (name == null || name.trim().isEmpty()) return false;
                return getSharedPreferences(SECURE_PREFS, MODE_PRIVATE).edit().remove(name.trim()).commit();
            } catch (Exception e) {
                return false;
            }
        }

        // V327: the Realtime device secret is native-only. JavaScript can request a short-lived
        // Realtime JWT, but can never read the long-lived device secret from the bridge.
        private synchronized String getRealtimeDeviceSecretInternal() {
            String current = readSecureValueInternal(REALTIME_DEVICE_SECRET_KEY);
            if (!current.isEmpty()) return current;
            String legacy = readSecureValueInternal(REALTIME_LEGACY_DEVICE_SECRET_KEY);
            if (!legacy.isEmpty() && writeSecureValueInternal(REALTIME_DEVICE_SECRET_KEY, legacy)) {
                clearSecureValueInternal(REALTIME_LEGACY_DEVICE_SECRET_KEY);
                return legacy;
            }
            return "";
        }

        @JavascriptInterface
        public boolean requestRealtimeAuthToken(String teamId, String userId, String deviceId) {
            final String safeTeam = teamId == null ? "" : teamId.trim();
            final String safeUser = userId == null ? "" : userId.trim();
            final String safeDevice = deviceId == null ? "" : deviceId.trim();
            final String secret = getRealtimeDeviceSecretInternal();
            if (safeTeam.isEmpty() || safeUser.isEmpty() || safeDevice.isEmpty() || secret.length() < 32) return false;
            automaticFileExecutor.execute(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(SB_URL + "/functions/v1/adt-realtime-token");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setRequestProperty("apikey", SB_ANON);
                    conn.setRequestProperty("Authorization", "Bearer " + SB_ANON);
                    JSONObject body = new JSONObject()
                            .put("team_id", safeTeam)
                            .put("user_id", safeUser)
                            .put("device_id", safeDevice)
                            .put("device_secret", secret);
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }
                    int status = conn.getResponseCode();
                    InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
                    String response = readStreamText(stream);
                    if (status < 200 || status >= 300) throw new IllegalStateException("REALTIME_TOKEN_HTTP_" + status);
                    JSONObject json = new JSONObject(response);
                    String token = json.optString("token", "");
                    long exp = json.optLong("expires_at", 0L);
                    if (token.isEmpty() || exp <= 0) throw new IllegalStateException("REALTIME_TOKEN_INVALID");
                    final String jsToken = JSONObject.quote(token);
                    runOnUiThread(() -> {
                        try {
                            if (webView != null) webView.evaluateJavascript("window.__adtNativeRealtimeToken(" + jsToken + "," + exp + ")", null);
                        } catch (Exception ignored) {}
                    });
                } catch (Exception error) {
                    runOnUiThread(() -> {
                        try {
                            if (webView != null) webView.evaluateJavascript("window.__adtNativeRealtimeToken('',0)", null);
                        } catch (Exception ignored) {}
                    });
                    android.util.Log.e("ADT_REALTIME", "Native realtime token request failed", error);
                } finally {
                    if (conn != null) conn.disconnect();
                }
            });
            return true;
        }

        // Rotation is a native transaction so an RPC failure never destroys the last
        // credential that can still obtain a Realtime JWT.
        @JavascriptInterface
        public synchronized boolean beginRealtimeDeviceSecretRotation(String secret) {
            if (secret == null || secret.trim().length() < 32) return false;
            String staleBackup = readSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
            if (!staleBackup.isEmpty()) {
                // A previous process died mid-rotation; restore the last known credential first.
                String prior = readSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
                if (!prior.isEmpty()) writeSecureValueInternal(REALTIME_DEVICE_SECRET_KEY, prior);
                clearSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
            }
            String current = readSecureValueInternal(REALTIME_DEVICE_SECRET_KEY);
            if (current.isEmpty()) current = readSecureValueInternal(REALTIME_LEGACY_DEVICE_SECRET_KEY);
            if (!current.isEmpty() && !writeSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY, current)) return false;
            if (!writeSecureValueInternal(REALTIME_DEVICE_SECRET_KEY, secret.trim())) {
                if (!current.isEmpty()) writeSecureValueInternal(REALTIME_DEVICE_SECRET_KEY, current);
                clearSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
                return false;
            }
            return true;
        }

        @JavascriptInterface
        public synchronized boolean commitRealtimeDeviceSecretRotation() {
            String current = readSecureValueInternal(REALTIME_DEVICE_SECRET_KEY);
            if (current.length() < 32) return false;
            clearSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
            clearSecureValueInternal(REALTIME_LEGACY_DEVICE_SECRET_KEY);
            return true;
        }

        @JavascriptInterface
        public synchronized boolean rollbackRealtimeDeviceSecretRotation() {
            String backup = readSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
            if (!backup.isEmpty()) {
                if (!writeSecureValueInternal(REALTIME_DEVICE_SECRET_KEY, backup)) return false;
            } else {
                clearSecureValueInternal(REALTIME_DEVICE_SECRET_KEY);
            }
            clearSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
            return true;
        }

        @JavascriptInterface
        public synchronized boolean saveRealtimeDeviceSecret(String secret) {
            return beginRealtimeDeviceSecretRotation(secret) && commitRealtimeDeviceSecretRotation();
        }

        @JavascriptInterface
        public synchronized void clearRealtimeDeviceSecret() {
            clearSecureValueInternal(REALTIME_DEVICE_SECRET_KEY);
            clearSecureValueInternal(REALTIME_LEGACY_DEVICE_SECRET_KEY);
            clearSecureValueInternal(REALTIME_DEVICE_SECRET_BACKUP_KEY);
        }


        // V322: session credentials use a separate encrypted preference namespace.
        private static final String SESSION_PREFS = "adt_session_secure_v322";
        // V328: session credentials use an independent Keystore key so Realtime
        // device-secret storage can never block account login.
        private static final String SESSION_KEY_ALIAS = "ADT_SESSION_STORAGE_V328";
        private static SecretKey getOrCreateSessionKey() throws Exception {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(SESSION_KEY_ALIAS)) {
                KeyStore.Entry entry = keyStore.getEntry(SESSION_KEY_ALIAS, null);
                if (entry instanceof KeyStore.SecretKeyEntry) {
                    return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
                }
                try { keyStore.deleteEntry(SESSION_KEY_ALIAS); } catch (Exception ignored) {}
            }
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
                    SESSION_KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build());
            return generator.generateKey();
        }
        private static final String SESSION_ENTRY = "token";

        private boolean saveSessionTokenOnce(String token) throws Exception {
            SecretKey key = getOrCreateSessionKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encrypted = cipher.doFinal(token.trim().getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            String packed = Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            boolean saved = getSharedPreferences(SESSION_PREFS, MODE_PRIVATE).edit().putString(SESSION_ENTRY, packed).commit();
            if (!saved) return false;
            // Verify both persistence and decryptability now, rather than letting the app
            // proceed with a token that cannot be recovered by native authenticated calls.
            return token.trim().equals(getSessionTokenInternal());
        }

        @JavascriptInterface
        public synchronized boolean saveSessionToken(String token) {
            if (token == null || token.trim().isEmpty()) return false;
            try {
                if (saveSessionTokenOnce(token)) return true;
                throw new IllegalStateException("SESSION_TOKEN_PERSIST_FAILED");
            } catch (Exception firstError) {
                android.util.Log.e("ADT_SESSION", "saveSessionToken first attempt failed; rebuilding session key", firstError);
                try {
                    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                    keyStore.load(null);
                    try { keyStore.deleteEntry(SESSION_KEY_ALIAS); } catch (Exception ignored) {}
                    getSharedPreferences(SESSION_PREFS, MODE_PRIVATE).edit().remove(SESSION_ENTRY).commit();
                    return saveSessionTokenOnce(token);
                } catch (Exception retryError) {
                    android.util.Log.e("ADT_SESSION", "saveSessionToken retry failed", retryError);
                    return false;
                }
            }
        }

        // Never expose the stored session token as a @JavascriptInterface.
        private synchronized String getSessionTokenInternal() {
            try {
                String packed = getSharedPreferences(SESSION_PREFS, MODE_PRIVATE).getString(SESSION_ENTRY, "");
                if (packed == null || packed.isEmpty()) return "";
                String[] parts = packed.split("\\.", 2);
                if (parts.length != 2) return "";
                byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
                byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, getOrCreateSessionKey(), new GCMParameterSpec(128, iv));
                return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            } catch (Exception e) {
                android.util.Log.e("ADT_SESSION", "getSessionToken failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public synchronized boolean clearSessionToken() {
            try { return getSharedPreferences(SESSION_PREFS, MODE_PRIVATE).edit().remove(SESSION_ENTRY).commit(); }
            catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public String getAppVersionName() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void markStartupReady() {
            runOnUiThread(() -> firstWebFrameReady = true);
        }

        @JavascriptInterface
        public String getFcmToken() {
            return fcmToken == null ? "" : fcmToken;
        }

        @JavascriptInterface
        public String getFirebaseToken() {
            return getFcmToken();
        }

        @JavascriptInterface
        public boolean isNetworkAvailable() {
            return hasInternetConnection();
        }

        @JavascriptInterface
        public void retryInternetConnection() {
            runOnUiThread(MainActivity.this::notifyNetworkStateToWeb);
        }

        @JavascriptInterface
        public String getNotificationPermissionState() {
            boolean allowed = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            return allowed ? "granted" : "denied";
        }

        @JavascriptInterface
        public void requestNotificationPermissionAgain() {
            runOnUiThread(MainActivity.this::requestNotificationPermission);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                startActivity(intent);
            });
        }

        @JavascriptInterface
        public void refreshFcmToken() {
            MainActivity.this.refreshFcmToken();
        }

        @JavascriptInterface
        public void reloadApp() {
            runOnUiThread(() -> {
                try {
                    webView.stopLoading();
                    webView.clearHistory();
                    webView.loadUrl(HOME_URL + "?t=" + System.currentTimeMillis());
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> {
                try {
                    openExternalUri(Uri.parse(url == null ? "" : url.trim()));
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "تعذر فتح الرابط", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void saveBase64File(String base64, String fileName, String mimeType) {
            requestNativeFileSave(base64, fileName, mimeType);
        }

        @JavascriptInterface
        public void showNativeToast(String message) {
            final String safeMessage = message == null ? "" : message.trim();
            if (safeMessage.isEmpty()) return;
            runOnUiThread(() -> Toast.makeText(MainActivity.this, safeMessage, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void triggerPricePush(String teamId, String actorUserId) {
            if (teamId == null || actorUserId == null || teamId.trim().isEmpty() || actorUserId.trim().isEmpty()) return;
            try {
                JSONObject payload = new JSONObject()
                        .put("team_id", teamId)
                        .put("actor_user_id", actorUserId)
                        .put("title", "ADT Stock");
                dispatchPricePush(payload);
            } catch (Exception error) {
                android.util.Log.e("ADT_PUSH", "Payload build failed", error);
            }
        }

        @JavascriptInterface
        public void triggerPricePushV172(String teamId, String actorUserId, String actorName, String productName, String oldSellPrice, String newSellPrice, String changeType) {
            if (teamId == null || actorUserId == null || teamId.trim().isEmpty() || actorUserId.trim().isEmpty()) return;
            try {
                String safeActor = actorName == null || actorName.trim().isEmpty() ? "مستخدم" : actorName.trim();
                String safeProduct = productName == null ? "" : productName.trim();
                String safeOld = oldSellPrice == null ? "" : oldSellPrice.trim();
                String safeNew = newSellPrice == null ? "" : newSellPrice.trim();
                String safeType = changeType == null ? "price_change" : changeType.trim();
                if (!"sell_price".equals(safeType)) return;

                JSONObject payload = new JSONObject()
                        .put("team_id", teamId)
                        .put("actor_user_id", actorUserId)
                        .put("actor_name", safeActor)
                        .put("product_name", safeProduct)
                        .put("old_sell_price", safeOld)
                        .put("new_sell_price", safeNew)
                        .put("change_type", safeType)
                        .put("title", "sell_price".equals(safeType) ? "تغيير سعر البيع" : "ADT Stock");

                if (!safeProduct.isEmpty() && !safeNew.isEmpty()) {
                    payload.put("body", safeActor + " غيّر سعر بيع «" + safeProduct + "» إلى " + safeNew + " د.ل");
                }
                dispatchPricePush(payload);
            } catch (Exception error) {
                android.util.Log.e("ADT_PUSH", "V172 payload build failed", error);
            }
        }

        @JavascriptInterface
        public void triggerPricePushV174(String teamId, String actorUserId, String actorName, String productName, String oldSellPrice, String newSellPrice, String changeType, String currencySymbol) {
            if (teamId == null || actorUserId == null || teamId.trim().isEmpty() || actorUserId.trim().isEmpty()) return;
            try {
                String safeActor = actorName == null || actorName.trim().isEmpty() ? "مستخدم" : actorName.trim();
                String safeProduct = productName == null ? "" : productName.trim();
                String safeOld = oldSellPrice == null ? "" : oldSellPrice.trim();
                String safeNew = newSellPrice == null ? "" : newSellPrice.trim();
                String safeType = changeType == null ? "price_change" : changeType.trim();
                String safeCurrency = currencySymbol == null || currencySymbol.trim().isEmpty() ? "د.ل" : currencySymbol.trim();
                if (!"sell_price".equals(safeType)) return;

                JSONObject payload = new JSONObject()
                        .put("team_id", teamId)
                        .put("actor_user_id", actorUserId)
                        .put("actor_name", safeActor)
                        .put("product_name", safeProduct)
                        .put("old_sell_price", safeOld)
                        .put("new_sell_price", safeNew)
                        .put("change_type", safeType)
                        .put("currency_symbol", safeCurrency)
                        .put("title", "sell_price".equals(safeType) ? "تغيير سعر البيع" : "ADT Stock");

                if (!safeProduct.isEmpty() && !safeNew.isEmpty()) {
                    payload.put("body", safeActor + " غيّر سعر بيع «" + safeProduct + "» إلى " + safeNew + " " + safeCurrency);
                }
                dispatchPricePush(payload);
            } catch (Exception error) {
                android.util.Log.e("ADT_PUSH", "V174 payload build failed", error);
            }
        }

        @JavascriptInterface
        public void triggerOperationPush(String teamId, String actorUserId, String actorName, String operationType, String subject, String amount, String details, String currencySymbol) {
            if (teamId == null || actorUserId == null || teamId.trim().isEmpty() || actorUserId.trim().isEmpty()) return;
            try {
                String safeActor = actorName == null || actorName.trim().isEmpty() ? "مستخدم" : actorName.trim();
                String safeType = operationType == null ? "operation" : operationType.trim();
                String safeSubject = subject == null ? "" : subject.trim();
                String safeAmount = amount == null ? "" : amount.trim();
                String safeDetails = details == null ? "" : details.trim();
                String safeCurrency = currencySymbol == null || currencySymbol.trim().isEmpty() ? "د.ل" : currencySymbol.trim();
                String notificationTitle;
                switch (safeType) {
                    case "customer_receipt": notificationTitle = "استلام أموال"; break;
                    case "supplier_payment": notificationTitle = "تحويل إلى موردين"; break;
                    case "daily_sale": notificationTitle = "مبيعات جديدة"; break;
                    case "damaged_goods": notificationTitle = "بضاعة تالفة"; break;
                    case "audit_changed": notificationTitle = "تحديث الجرد"; break;
                    case "audit_reset": notificationTitle = "تصفير الجرد"; break;
                    case "grocery_audit_changed": notificationTitle = "تحديث الجرد السريع"; break;
                    case "grocery_permission_changed": notificationTitle = "تحديث صلاحية الجرد السريع"; break;
                    default: return;
                }
                StringBuilder body;
                if ("customer_receipt".equals(safeType)) {
                    body = new StringBuilder("استلم ").append(safeActor);
                    if (!safeAmount.isEmpty()) body.append(" مبلغ ").append(safeAmount).append(" ").append(safeCurrency);
                    if (!safeSubject.isEmpty()) body.append(" من ").append(safeSubject);
                } else if ("supplier_payment".equals(safeType)) {
                    body = new StringBuilder("حوّل ").append(safeActor);
                    if (!safeAmount.isEmpty()) body.append(" مبلغ ").append(safeAmount).append(" ").append(safeCurrency);
                    if (!safeSubject.isEmpty()) body.append(" إلى ").append(safeSubject);
                } else if ("daily_sale".equals(safeType)) {
                    body = new StringBuilder("سجّل ").append(safeActor).append(" مبيعات");
                    if (!safeAmount.isEmpty()) body.append(" بقيمة ").append(safeAmount).append(" ").append(safeCurrency);
                } else if ("damaged_goods".equals(safeType)) {
                    body = new StringBuilder("سجّل ").append(safeActor);
                    if (!safeSubject.isEmpty()) body.append(" «").append(safeSubject).append("»");
                    body.append(" كبضاعة تالفة");
                } else if ("audit_changed".equals(safeType)) {
                    body = new StringBuilder("حدّث ").append(safeActor).append(" جرد");
                    if (!safeSubject.isEmpty()) body.append(" «").append(safeSubject).append("»");
                } else if ("audit_reset".equals(safeType)) {
                    body = new StringBuilder("قام ").append(safeActor).append(" بتصفير الجرد");
                } else if ("grocery_audit_changed".equals(safeType)) {
                    body = new StringBuilder("حدّث ").append(safeActor).append(" الجرد السريع");
                } else {
                    body = new StringBuilder("تم تحديث صلاحية الجرد السريع بواسطة ").append(safeActor);
                }
                JSONObject payload = new JSONObject()
                        .put("team_id", teamId).put("actor_user_id", actorUserId)
                        .put("actor_name", safeActor).put("change_type", safeType)
                        .put("product_name", safeSubject).put("new_sell_price", safeAmount)
                        .put("currency_symbol", safeCurrency).put("title", notificationTitle)
                        .put("body", body.toString());
                dispatchPricePush(payload);
            } catch (Exception error) {
                android.util.Log.e("ADT_PUSH", "Operation payload build failed", error);
            }
        }

        @JavascriptInterface
        public void shareText(String text, String title) {
            final String safeText = text == null ? "" : text;
            final String safeTitle = title == null || title.trim().isEmpty() ? "ADT Stock" : title.trim();
            runOnUiThread(() -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, safeText);
                    send.putExtra(Intent.EXTRA_TITLE, safeTitle);
                    startActivity(Intent.createChooser(send, "مشاركة من ADT Stock"));
                } catch (ActivityNotFoundException error) {
                    Toast.makeText(MainActivity.this, "لا يوجد تطبيق متاح للمشاركة", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void shareImageBase64(String base64, String fileName) {
            try {
                String safeName = safeFileName(fileName, "ADT_Stock_Receipt.png");
                if (!safeName.toLowerCase().endsWith(".png")) safeName += ".png";
                byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                if (bytes.length == 0) throw new IllegalArgumentException("EMPTY_IMAGE");
                File dir = new File(getCacheDir(), "shared_images");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("CACHE_DIR_FAILED");
                File out = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName()+".fileprovider", out);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newUri(getContentResolver(), safeName, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> {
                    try {
                        Intent chooser = Intent.createChooser(send, "مشاركة صورة الإشعار");
                        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(chooser);
                    } catch (ActivityNotFoundException error) {
                        Toast.makeText(MainActivity.this, "لا يوجد تطبيق متاح للمشاركة", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception e) {
                android.util.Log.e("ADT_SHARE", "Image share failed", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر مشاركة صورة الإشعار", Toast.LENGTH_LONG).show());
            }
        }

        @JavascriptInterface
        public void sharePdfBase64(String base64, String fileName) {
            try {
                String safeName = safeFileName(fileName, "ADT_Stock.pdf");
                if (!safeName.toLowerCase().endsWith(".pdf")) safeName += ".pdf";
                byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                if (bytes.length == 0) throw new IllegalArgumentException("EMPTY_PDF");
                File dir = new File(getCacheDir(), "shared_pdfs");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("CACHE_DIR_FAILED");
                File out = new File(dir, safeName); try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName()+".fileprovider", out);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/pdf");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newUri(getContentResolver(), safeName, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> {
                    try {
                        Intent chooser = Intent.createChooser(send, "مشاركة ملف PDF");
                        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(chooser);
                    } catch (ActivityNotFoundException error) {
                        Toast.makeText(MainActivity.this, "لا يوجد تطبيق متاح للمشاركة", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر مشاركة ملف PDF", Toast.LENGTH_LONG).show());
            }
        }

        @JavascriptInterface
        public void savePdfBase64(String base64, String fileName) {
            String safeName = safeFileName(fileName, "ADT_Stock.pdf");
            if (!safeName.toLowerCase().endsWith(".pdf")) safeName += ".pdf";
            requestNativeFileSave(base64, safeName, "application/pdf");
        }

        @JavascriptInterface
        public String getScreenOrientation() {
            int orientation = getResources().getConfiguration().orientation;
            return orientation == Configuration.ORIENTATION_LANDSCAPE ? "landscape" : "portrait";
        }

        @JavascriptInterface
        public void setScreenOrientation(String mode) {
            final String safeMode = mode == null ? "auto" : mode.trim().toLowerCase();
            runOnUiThread(() -> {
                if ("landscape".equals(safeMode)) {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                } else if ("portrait".equals(safeMode)) {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
            });
        }

        @JavascriptInterface
        public String readAutomaticLatestText(String fileName, String category) {
            return MainActivity.this.readAutomaticLatestText(fileName, category);
        }

        @JavascriptInterface
        public boolean saveAutomaticLatestFileChecked(String base64, String fileName, String mimeType, String category) {
            return MainActivity.this.saveAutomaticLatestFileChecked(base64, fileName, mimeType, category);
        }

        @JavascriptInterface
        public boolean saveAutomaticFileChecked(String base64, String fileName, String mimeType, String category) {
            return MainActivity.this.saveAutomaticArchiveChecked(base64, fileName, mimeType, category);
        }

        @JavascriptInterface
        public void saveAutomaticLatestFile(String base64, String fileName, String mimeType, String category) {
            MainActivity.this.saveAutomaticLatestFile(base64, fileName, mimeType, category);
        }

        @JavascriptInterface
        public void saveAutomaticFile(String base64, String fileName, String mimeType, String category) {
            saveAutomaticArchive(base64, fileName, mimeType, category);
        }

        private String readStreamText(InputStream stream) throws Exception {
            if (stream == null) return "";
            try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            }
        }
    }
}
