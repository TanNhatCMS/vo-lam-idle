package vn.name.mrkiet.volam

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import org.json.JSONObject

private const val TAG = "VLWeb"
private const val APP_ASSET_DOMAIN = "appassets.androidplatform.net"
private const val GAME_URL = "https://$APP_ASSET_DOMAIN/index.html"
private const val GAME_BG = "#0e1412"

/**
 * Hook JS: game tai file bang anchor an voi href blob: + download (save.js, stash.js),
 * ma WebView khong co download handler. Patch HTMLAnchorElement.click de doc blob,
 * gui base64 ve bridge AndroidSave — bridge mo popup SAF chon noi luu.
 */
private const val SAVE_HOOK_JS = """
(function(){
  if (window.__vlSaveHook) return; window.__vlSaveHook = 1;
  var orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    var a = this;
    try {
      if (a && a.download && typeof a.href === 'string' && a.href.indexOf('blob:') === 0 && window.AndroidSave) {
        fetch(a.href).then(function(r){ return r.blob(); }).then(function(b){
          var fr = new FileReader();
          fr.onload = function(){ AndroidSave.exportFile(String(a.download || 'download'), String(fr.result).split(',').pop()); };
          fr.readAsDataURL(b);
        }).catch(function(){ orig.call(a); });
        return;
      }
    } catch (e) { /* roi ve hanh vi goc */ }
    orig.call(a);
  };
})();
"""

/**
 * Phuc vu file game: uu tien thu muc da tai OTA (filesDir/game-assets),
 * fallback ve asset bundle trong APK (phan code + ui + fonts).
 * Khong dong goi sw.js: service worker se bypass interceptor nay lam vo hieu
 * hoa viec doc asset local; game dang ky SW kieu fire-and-forget nen 404 la vo hai.
 */
private class GameAssetHandler(private val context: Context) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        var rel = path.removePrefix("/").ifEmpty { "index.html" }
        if (rel.endsWith("/")) rel += "index.html"
        if (rel.split('/').any { it == ".." || it == "." }) return notFound(rel)
        val dl = File(OtaManager.assetsDir(context), rel)
        if (dl.isFile) {
            return try {
                WebResourceResponse(guessMime(rel), null, dl.inputStream())
            } catch (e: Exception) {
                notFound(rel)
            }
        }
        return try {
            WebResourceResponse(guessMime(rel), null, context.assets.open("game/$rel"))
        } catch (e: Exception) {
            notFound(rel)
        }
    }

    private fun notFound(rel: String): WebResourceResponse =
        WebResourceResponse(
            "text/plain", "utf-8", 404, "Not Found", null,
            ByteArrayInputStream("404: $rel".toByteArray(Charsets.UTF_8))
        )

    private fun guessMime(path: String): String {
        val ext = path.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "html", "htm" -> "text/html"
            "css" -> "text/css"
            "js", "mjs" -> "text/javascript"
            "json", "webmanifest", "map" -> "application/json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "svg" -> "image/svg+xml"
            "ico" -> "image/x-icon"
            "mp3" -> "audio/mpeg"
            "ogg", "oga" -> "audio/ogg"
            "wav" -> "audio/wav"
            "m4a", "aac" -> "audio/mp4"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "otf" -> "font/otf"
            "wasm" -> "application/wasm"
            "txt" -> "text/plain"
            else -> "application/octet-stream"
        }
    }
}

/** Bridge nhan noi dung save (base64) tu hook JS roi mo popup SAF chon noi luu;
 *  dong thoi nhan snapshot save tu dong (F3) va tin hieu kiem tra phuc hoi. */
private class SaveBridge(private val host: MainActivity) {
    @JavascriptInterface
    fun exportFile(name: String, base64: String) = host.launchSaveDocument(name, base64)

    @JavascriptInterface
    fun autoBackup(json: String) = host.handleAutoBackup(json)

    @JavascriptInterface
    fun checkRestore() = host.handleCheckRestore()
}

/**
 * Dung am thanh khi app ve background: WebView.onPause/pauseTimers chi dung JS timer
 * (het SFX) nhung AudioContext (WebAudio SFX) va phan tu Audio nhac nen van chay tiep.
 * Game khai bao AUD (ctx + music) va audApply() o js/audio.js — suspend/pause khi an,
 * resume + audApply() khi quay lai (phat lai nhac dung theo cau hinh am thanh cua game).
 */
private const val AUDIO_PAUSE_JS =
    "try{if(typeof AUD!=='undefined'){AUD.ctx&&AUD.ctx.state==='running'&&AUD.ctx.suspend();" +
    "AUD.music&&!AUD.music.paused&&AUD.music.pause();}}catch(e){}"
private const val AUDIO_RESUME_JS =
    "try{if(typeof AUD!=='undefined'){AUD.ctx&&AUD.ctx.state==='suspended'&&AUD.ctx.resume();" +
    "typeof audApply==='function'&&audApply();}}catch(e){}"

/** Duck khi mat audio focus thoang qua (thong bao ping): ha nhac nen xuong, giu SFX. */
private const val AUDIO_DUCK_JS =
    "try{if(typeof AUD!=='undefined'){AUD.music&&!AUD.music.paused&&(AUD.music.volume=0.15);}}catch(e){}"

/**
 * Tu dong sao luu save (F3): snapshot toan bo key localStorage tien to 'jxidle'
 * (3 slot + _bak + con tro slot 'jxidle_slot' + ui 'jxidle_ui') thanh JSON
 * {v, when, keys} -> filesDir/backup/auto_<stamp>.json, giu BACKUP_KEEP ban gan nhat.
 * Game tu save localStorage moi ~10s (save.js) nen snapshot chi lech toi da 1 chu ky.
 * Kich hoat: chu ky BACKUP_INTERVAL_MS khi choi + ngay khi onResume (game da save
 * localStorage trong pagehide khi roi di) + best-effort trong onPause. KHONG dua vao
 * onPause lam kenh chinh: pauseTimers co the nuot task JS evaluateJavascript chua chay.
 * Phuc hoi: chi hoi khi 'jxidle_slot' === null (may trong / mat du lieu) — khong bao
 * gio dong vao may dang co save; tu choi thi nho theo ten file, khong hoi lai voi ban do.
 */
private const val BACKUP_DIR = "backup"
private const val BACKUP_KEEP = 5
private const val BACKUP_PREFS = "vl_backup"
private const val BACKUP_INTERVAL_MS = 60_000L

private const val BACKUP_SNAPSHOT_JS = """
(function(){
  try {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('jxidle') === 0) out[k] = localStorage.getItem(k);
    }
    if (window.AndroidSave && Object.keys(out).length) {
      AndroidSave.autoBackup(JSON.stringify({v:1, when:Date.now(), keys:out}));
    }
  } catch(e){}
})();
"""

private const val RESTORE_CHECK_JS =
    "try{if(localStorage.getItem('jxidle_slot')===null&&window.AndroidSave)AndroidSave.checkRestore();}catch(e){}"

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var gameStarted = false
    private var restoreAsked = false

    // F1: audio focus — cuộc gọi / app nhạc khác làm game tự im, nhận lại focus thì phát tiếp
    private val audioManager by lazy { getSystemService(AudioManager::class.java) }
    private var focusRequest: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        val js = when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> AUDIO_RESUME_JS
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> AUDIO_DUCK_JS
            else -> AUDIO_PAUSE_JS
        }
        runOnUiThread {
            if (gameStarted && ::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    // F3: chu kỳ snapshot save (xem giải thích ở BACKUP_SNAPSHOT_JS)
    private val backupHandler = Handler(Looper.getMainLooper())
    private val backupTick = object : Runnable {
        override fun run() {
            if (!gameStarted || isFinishing || isDestroyed) return
            if (::webView.isInitialized) webView.evaluateJavascript(BACKUP_SNAPSHOT_JS, null)
            backupHandler.postDelayed(this, BACKUP_INTERVAL_MS)
        }
    }

    // Luu file (SAF create document): nhan base64 tu bridge -> chon noi luu -> ghi
    private var pendingSave: Pair<String, ByteArray>? = null
    private val saveFileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri = result.data?.data
        val pending = pendingSave
        pendingSave = null
        if (uri != null && pending != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(pending.second) }
                Toast.makeText(this, "Đã lưu ${pending.first}", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Lỗi lưu file: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Nạp từ file (input type=file của game): SAF/picker -> trả về WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val chooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = fileChooserCallback
        fileChooserCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
    }

    fun launchSaveDocument(name: String, base64: String) {
        runOnUiThread {
            pendingSave = name to Base64.decode(base64, Base64.DEFAULT)
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/octet-stream"
                putExtra(Intent.EXTRA_TITLE, name)
            }
            saveFileLauncher.launch(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.parseColor(GAME_BG)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.parseColor(GAME_BG)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (gameStarted && webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })
        startOtaFlow()
    }

    // ---------- OTA ----------

    private fun startOtaFlow() {
        gameStarted = false
        val ui = layoutInflater.inflate(R.layout.activity_download, null)
        val retry = ui.findViewById<Button>(R.id.otaRetry)
        retry.setOnClickListener { startOtaFlow() }
        ui.findViewById<Button>(R.id.otaCancel).setOnClickListener { OtaManager.cancelUpdate() }
        ui.findViewById<Button>(R.id.otaReset).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Xóa dữ liệu đã tải")
                .setMessage("Xóa toàn bộ dữ liệu game đã tải (code + tài nguyên)?\nLần chạy sau sẽ tải lại từ đầu.")
                .setNegativeButton("Hủy", null)
                .setPositiveButton("Xóa") { _, _ ->
                    OtaManager.resetInstalled(this)
                    startOtaFlow()
                }
                .show()
        }
        setContentView(ui)
        ui.findViewById<TextView>(R.id.otaStatus).text = "Đang kiểm tra cập nhật game…"
        showVersions(ui, OtaManager.loadIndex(this))
        checkApkUpdate(ui)

        Thread {
            val manifest = OtaManager.fetchManifest()
            val idx = OtaManager.loadIndex(this)
            runOnUiThread {
                when {
                    // Mất mạng nhưng đã từng cài đủ bộ (code + media) → chơi tiếp
                    manifest == null && idx.codeVersion != null && idx.mediaVersion != null -> startGame()
                    manifest == null ->
                        showError(ui, "Không tải được dữ liệu game.\nCần kết nối mạng cho lần chạy đầu tiên.")
                    OtaManager.installedUpToDate(this, manifest) -> startGame()
                    else -> if (isMetered()) confirmMeteredDownload(ui, manifest, idx) else runUpdate(ui, manifest)
                }
            }
        }.start()
    }

    private fun isMetered(): Boolean = try {
        getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: false
    } catch (e: Exception) {
        false
    }

    /** Hỏi trước khi tải bộ cập nhật qua mạng đo lượng (data di động). Wi-Fi: không hỏi. */
    private fun confirmMeteredDownload(
        ui: View,
        manifest: OtaManager.Manifest,
        idx: OtaManager.InstalledIndex,
    ) {
        val fresh = idx.codeVersion == null && idx.mediaVersion == null
        val mb = (manifest.zipSize + manifest.codeBytes) / 1048576.0
        val builder = AlertDialog.Builder(this)
        if (fresh) {
            builder
                .setTitle("Tải dữ liệu game lần đầu")
                .setMessage(
                    String.format(
                        Locale.US,
                        "Lần đầu chạy cần tải ~%.0f MB dữ liệu game.\nQua mạng di động có thể mất phí dữ liệu.",
                        mb
                    )
                )
                .setNegativeButton("Thoát") { _, _ -> moveTaskToBack(true) }
        } else {
            builder
                .setTitle("Có bản cập nhật game mới")
                .setMessage(
                    String.format(
                        Locale.US,
                        "Bộ cập nhật ~%.0f MB.\nTải qua mạng di động?",
                        mb
                    )
                )
                .setNegativeButton("Để sau") { _, _ -> startGame() }
        }
        builder.setPositiveButton("Tải ngay") { _, _ -> runUpdate(ui, manifest) }
            .setCancelable(false)
            .show()
    }

    /** Dòng phiên bản hiện tại trên màn hình update: App / Game (code) / Tài nguyên (media). */
    private fun showVersions(ui: View, idx: OtaManager.InstalledIndex) {
        val app = try {
            packageManager.getPackageInfo(packageName, 0).versionName
        } catch (e: Exception) {
            "?"
        }
        ui.findViewById<TextView>(R.id.otaVersions).text =
            "App v$app · Game ${idx.codeVersion?.take(8) ?: "—"} · Tài nguyên ${idx.mediaVersion?.take(8) ?: "—"}"
    }

    private fun runUpdate(ui: View, manifest: OtaManager.Manifest) {
        val bar = ui.findViewById<ProgressBar>(R.id.otaBar)
        val status = ui.findViewById<TextView>(R.id.otaStatus)
        ui.findViewById<Button>(R.id.otaRetry).visibility = View.GONE
        bar.visibility = View.VISIBLE
        bar.max = 100
        OtaManager.cleanStaleTemp(this)

        Thread {
            val ok = OtaManager.updateAll(
                this, manifest,
                onPhase = { phase, done, total ->
                    val pct = if (total > 0) done * 100 / total else 0
                    runOnUiThread {
                        if (total > 0) bar.progress = pct
                        status.text = when (phase) {
                            "code" -> String.format(Locale.US, "Cập nhật game %d/%d file…", done, total)
                            "verify_zip" -> "Kiểm tra file đã tải…"
                            "extract" -> String.format(Locale.US, "Giải nén %d/%d…", done, total)
                            "verify_files" -> String.format(Locale.US, "Kiểm tra tài nguyên %d/%d…", done, total)
                            "install_media" -> String.format(Locale.US, "Cài đặt tài nguyên %d/%d…", done, total)
                            "verify_install" -> String.format(Locale.US, "Kiểm tra sau cài %d/%d…", done, total)
                            else -> "Đang xử lý…"
                        }
                    }
                },
                onZipProgress = { done, total ->
                    runOnUiThread {
                        val pct = if (total > 0) (done * 100 / total).toInt() else 0
                        bar.progress = pct
                        status.text = String.format(
                            Locale.US, "Tải tài nguyên · %d%% (%.0f/%.0f MB)",
                            pct, done / 1048576.0, total / 1048576.0
                        )
                    }
                },
            )
            runOnUiThread {
                if (ok) startGame()
                else showError(ui, "Cập nhật game thất bại.\nBấm Thử lại — tải tiếp từ chỗ dừng.")
            }
        }.start()
    }

    /** So tag Release (vd v1.2.0) với versionName đã cài. */
    private fun isNewerVersion(tag: String, current: String): Boolean {
        fun parts(s: String) = s.removePrefix("v").split('.').map { it.trim().toIntOrNull() ?: 0 }
        val a = parts(tag)
        val b = parts(current)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /** Check APK mới trên GitHub Releases — không chặn vào game, chỉ hiện nút. */
    private fun checkApkUpdate(ui: View) {
        Thread {
            val rel = OtaManager.fetchLatestRelease() ?: return@Thread
            val current = try {
                packageManager.getPackageInfo(packageName, 0).versionName
            } catch (e: Exception) {
                null
            } ?: return@Thread
            if (!isNewerVersion(rel.tag, current)) return@Thread
            runOnUiThread {
                val btn = ui.findViewById<Button>(R.id.otaApk)
                btn.text = "Cập nhật app ${rel.tag}"
                btn.visibility = View.VISIBLE
                btn.setOnClickListener {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(rel.url)))
                    } catch (e: Exception) {
                    }
                }
            }
        }.start()
    }

    private fun showError(ui: View, msg: String) {
        ui.findViewById<TextView>(R.id.otaStatus).text = msg
        ui.findViewById<Button>(R.id.otaRetry).visibility = View.VISIBLE
        ui.findViewById<ProgressBar>(R.id.otaBar).visibility = View.INVISIBLE
    }

    // ---------- Game ----------

    @SuppressLint("SetJavaScriptEnabled")
    private fun startGame() {
        gameStarted = true
        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor(GAME_BG))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = false
            allowContentAccess = false
        }
        webView.isVerticalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", GameAssetHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript(SAVE_HOOK_JS, null)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.scheme == "https" && url.host == APP_ASSET_DOMAIN) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) {
                    true
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(TAG, "[console] ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }

            // <input type="file"> của game (Nạp từ file) -> popup chọn file SAF
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                // Dùng */* thay vì createIntent(): accept của game (.jxsave,.json,.txt...)
                // khiến picker disable file .jxsave vì không map được MIME
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    chooserLauncher.launch(Intent.createChooser(intent, "Chọn file lưu game"))
                    true
                } catch (e: Exception) {
                    fileChooserCallback = null
                    false
                }
            }
        }
        webView.addJavascriptInterface(SaveBridge(this), "AndroidSave")

        setContentView(webView)
        webView.loadUrl(GAME_URL)
    }

    override fun onPause() {
        if (gameStarted) {
            webView.evaluateJavascript(AUDIO_PAUSE_JS, null)
            webView.onPause()
            webView.pauseTimers()
        }
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (gameStarted) {
            webView.resumeTimers()
            webView.onResume()
            webView.evaluateJavascript(AUDIO_RESUME_JS, null)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (gameStarted) webView.saveState(outState)
    }

    override fun onDestroy() {
        if (gameStarted) webView.destroy()
        super.onDestroy()
    }
}
