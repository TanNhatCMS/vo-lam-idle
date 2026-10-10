package vn.io.tannhatcms.volamidle

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
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
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.text.method.ScrollingMovementMethod
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
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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

    // Hiệu ứng màn hình loading: logo thở, title mờ dần, chấm nhấp nháy ở status
    private var loadingAnimators: List<Animator> = emptyList()
    private var loadingStatusRef: TextView? = null
    private var loadingBaseStatus: String = ""
    private var dotsCount = 0
    private val dotsHandler = Handler(Looper.getMainLooper())
    private val dotsRunnable = object : Runnable {
        override fun run() {
            dotsCount = (dotsCount + 1) % 4
            loadingStatusRef?.text = loadingBaseStatus + ".".repeat(dotsCount)
            dotsHandler.postDelayed(this, 450)
        }
    }

    // Màn hình hiện tại (loading hoặc update) — callback bất đồng bộ gắn nút đúng chỗ
    private var screenRoot: View? = null

    // Bản APK mới trên GitHub Releases (nếu có) — hiện nút trên màn đang mở
    @Volatile private var apkRelease: OtaManager.ReleaseInfo? = null
    private var apkDownloading = false

    // Trễ ngắn "Đã sẵn sàng" rồi mới vào game cho mượt
    private val pendingStart = Runnable { startGame() }

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

    // F3: ghi snapshot backup (thread rieng) — bỏ qua nếu trùng bản mới nhất, giữ BACKUP_KEEP bản
    private val backupWriter = Executors.newSingleThreadExecutor()

    fun handleAutoBackup(json: String) {
        backupWriter.execute {
            try {
                val dir = File(filesDir, BACKUP_DIR)
                dir.mkdirs()
                val latest = dir.listFiles { f -> f.name.endsWith(".json") }?.maxByOrNull { it.name }
                if (latest != null && latest.length() == json.length.toLong() && latest.readText() == json) return@execute
                val name = "auto_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".json"
                val tmp = File(dir, "$name.tmp")
                tmp.writeText(json)
                val dest = File(dir, name)
                if (!tmp.renameTo(dest)) tmp.copyTo(dest, overwrite = true)
                dir.listFiles { f -> f.name.endsWith(".json") }
                    ?.sortedByDescending { it.name }?.drop(BACKUP_KEEP)?.forEach { it.delete() }
            } catch (e: Exception) {
                Log.w(TAG, "autoBackup: ${e.message}")
            }
        }
    }

    /** Gọi từ game khi 'jxidle_slot' === null (máy trống/mất dữ liệu): hỏi khôi phục từ
     *  backup mới nhất. Từ chối thì nhớ theo tên file — không hỏi lại với cùng bản đó. */
    fun handleCheckRestore() {
        if (restoreAsked) return
        val dir = File(filesDir, BACKUP_DIR)
        val latest = dir.listFiles { f -> f.name.endsWith(".json") }?.maxByOrNull { it.name } ?: return
        val prefs = getSharedPreferences(BACKUP_PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean("declined_${latest.name}", false)) return
        restoreAsked = true
        runOnUiThread {
            try {
                val obj = JSONObject(latest.readText())
                val whenStr = SimpleDateFormat("HH:mm dd/MM", Locale.US).format(Date(obj.optLong("when", 0L)))
                AlertDialog.Builder(this)
                    .setTitle("Phát hiện máy chưa có dữ liệu game")
                    .setMessage("Khôi phục từ bản sao lưu tự động lúc $whenStr?")
                    .setNegativeButton("Bỏ qua") { _, _ ->
                        prefs.edit().putBoolean("declined_${latest.name}", true).apply()
                    }
                    .setPositiveButton("Khôi phục") { _, _ ->
                        val keys = obj.getJSONObject("keys")
                        val sb = StringBuilder()
                        for (k in keys.keys()) {
                            sb.append("try{localStorage.setItem(")
                                .append(JSONObject.quote(k)).append(",")
                                .append(JSONObject.quote(keys.getString(k)))
                                .append(")}catch(e){}")
                        }
                        sb.append("location.reload();")
                        if (::webView.isInitialized) webView.evaluateJavascript(sb.toString(), null)
                    }
                    .show()
            } catch (e: Exception) {
                Log.w(TAG, "checkRestore: ${e.message}")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.parseColor(GAME_BG)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.parseColor(GAME_BG)
        applyImmersiveMode()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (gameStarted && webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })
        startOtaFlow()
    }

    /**
     * Full màn hình: ẩn status bar + thanh điều hướng vuốt, vẽ cả vào vùng đục lỗ.
     * Vuốt mép màn hình chỉ LỘ TẠM system bars (mờ, tự ẩn lại) — không chiếm lại diện tích.
     * Gọi lại mỗi lần nhận focus: thoại hệ thống/quyền có thể bật lại system bars.
     */
    private fun applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveMode()
    }

    // ---------- OTA ----------

    private fun startOtaFlow() {
        gameStarted = false
        dotsHandler.removeCallbacks(dotsRunnable)
        dotsHandler.removeCallbacks(pendingStart)

        // ----- Màn hình loading: logo thở + spinner + kiểm tra cập nhật -----
        val ui = layoutInflater.inflate(R.layout.activity_loading, null)
        screenRoot = ui
        setContentView(ui)
        val status = ui.findViewById<TextView>(R.id.loadingStatus)
        loadingStatusRef = status
        loadingBaseStatus = "Đang kiểm tra cập nhật"
        status.text = loadingBaseStatus
        ui.findViewById<TextView>(R.id.versionCorner).text = versionCornerText()
        startLoadingFx(ui)
        ui.findViewById<Button>(R.id.loadingRetry).setOnClickListener { startOtaFlow() }
        Thread {
            val manifest = OtaManager.fetchManifest()
            val rel = OtaManager.fetchNewestApkRelease()   // chỉ release CÓ file APK — bản chỉ-vá-data không rao update APK
            val idx = OtaManager.loadIndex(this)
            runOnUiThread {
                if (rel != null) {
                    val current = try {
                        packageManager.getPackageInfo(packageName, 0).versionName
                    } catch (e: Exception) {
                        null
                    }
                    if (current != null && isNewerVersion(rel.tag, current)) {
                        apkRelease = rel
                        showApkUpdateButton(ui)
                    }
                }
                when {
                    // Mất mạng nhưng đã từng cài đủ (data + assets) → chơi tiếp
                    manifest == null && idx.dataVersion != null && idx.assetsVersion != null -> startGame()
                    manifest == null ->
                        showLoadingError(ui, "Không tải được dữ liệu game.\nCần kết nối mạng cho lần chạy đầu tiên.")
                    OtaManager.installedUpToDate(this, manifest) -> {
                        loadingBaseStatus = "Đã sẵn sàng"
                        status.text = loadingBaseStatus
                        if (apkRelease != null) {
                            // Có bản APK mới — dừng lại để user thấy nút cập nhật; "Vào game" để bỏ qua
                            ui.findViewById<Button>(R.id.loadingRetry).apply {
                                text = "Vào game"
                                visibility = View.VISIBLE
                                setOnClickListener { startGame() }
                            }
                        } else dotsHandler.postDelayed(pendingStart, 500)
                    }
                    else -> showUpdateScreen(manifest, idx)
                }
            }
        }.start()
    }

    // ----- Hiệu ứng loading: logo thở, title mờ dần, chấm nhấp nháy -----

    private fun startLoadingFx(ui: View) {
        val logo = ui.findViewById<View>(R.id.loadingLogo)
        val title = ui.findViewById<View>(R.id.loadingTitle)
        val breathe = ObjectAnimator.ofPropertyValuesHolder(
            logo,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.07f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.07f),
        ).apply {
            duration = 1200
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
        }
        val fade = ObjectAnimator.ofFloat(title, View.ALPHA, 1f, 0.55f).apply {
            duration = 1200
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
        }
        breathe.start()
        fade.start()
        loadingAnimators = listOf(breathe, fade)
        dotsCount = 0
        dotsHandler.removeCallbacks(dotsRunnable)
        dotsHandler.postDelayed(dotsRunnable, 450)
    }

    private fun stopLoadingFx() {
        loadingAnimators.forEach { it.cancel() }
        loadingAnimators = emptyList()
        dotsHandler.removeCallbacks(dotsRunnable)
        dotsHandler.removeCallbacks(pendingStart)
        loadingStatusRef = null
    }

    /** Lỗi khi còn ở màn hình loading (chưa vào được màn cập nhật). */
    private fun showLoadingError(ui: View, msg: String) {
        loadingBaseStatus = msg
        dotsCount = 0
        dotsHandler.removeCallbacks(dotsRunnable) // giữ nguyên text lỗi, bỏ chấm nhấp nháy
        ui.findViewById<TextView>(R.id.loadingStatus).text = msg
        ui.findViewById<View>(R.id.loadingSpinner).visibility = View.INVISIBLE
        ui.findViewById<Button>(R.id.loadingRetry).visibility = View.VISIBLE
    }

    /** "App v1.4.0 · Tài nguyên v1.4.0" — phiên bản app + bộ tài nguyên đã cài. */
    private fun versionCornerText(): String {
        val app = try {
            packageManager.getPackageInfo(packageName, 0).versionName
        } catch (e: Exception) {
            "?"
        }
        val idx = OtaManager.loadIndex(this)
        val res = idx.resVersion?.let { "v$it" } ?: idx.dataVersion?.take(8) ?: "—"
        return "App v$app · Tài nguyên $res"
    }

    /**
     * Có bản mới (hoặc lần chạy đầu) → chuyển từ loading sang màn cập nhật:
     * thẻ phiên bản (đã cài → máy chủ + dung lượng bản vá/full), tự chạy cập
     * nhật qua Wi-Fi; mạng đo lượng thì hỏi trước.
     */
    private fun showUpdateScreen(manifest: OtaManager.Manifest, idx: OtaManager.InstalledIndex) {
        stopLoadingFx()
        val ui = layoutInflater.inflate(R.layout.activity_download, null)
        screenRoot = ui
        setContentView(ui)

        val fresh = idx.dataVersion == null && idx.assetsVersion == null
        fun partLine(name: String, full: OtaManager.ZipPart, patch: OtaManager.PatchPart?, cur: String?): String? =
            when {
                cur == full.sha256 -> null
                patch != null && cur == patch.from ->
                    String.format(Locale.US, "%s ~%.1f MB (bản vá)", name, patch.size / 1048576.0)
                else ->
                    String.format(Locale.US, "%s ~%.1f MB (đầy đủ)", name, full.size / 1048576.0)
            }
        val lines = listOfNotNull(
            partLine("Dữ liệu", manifest.data, manifest.patch.data, idx.dataVersion),
            partLine("Assets", manifest.assets, manifest.patch.assets, idx.assetsVersion),
        ).ifEmpty {
            listOf(
                String.format(
                    Locale.US, "Toàn bộ ~%.1f MB",
                    (manifest.data.size + manifest.assets.size) / 1048576.0,
                )
            )
        }

        ui.findViewById<TextView>(R.id.otaTitle).text = if (fresh) "Tải dữ liệu game" else "Cập nhật game"
        ui.findViewById<TextView>(R.id.otaVerCurrent).text = if (fresh) {
            "Máy chưa có dữ liệu game (lần đầu cài đặt)"
        } else {
            "Đã cài: Tài nguyên v${idx.resVersion ?: idx.dataVersion?.take(8)}"
        }
        ui.findViewById<TextView>(R.id.otaVerNew).text = "Trên máy chủ: Tài nguyên v${manifest.version}"
        ui.findViewById<TextView>(R.id.otaVerSize).text = "Cần tải:\n" + lines.joinToString("\n")
        val notes = cleanNotes(manifest.notes, 1500)
        val notesView = ui.findViewById<TextView>(R.id.otaNotes)
        if (notes.isNotEmpty()) {
            notesView.text = notes
            notesView.movementMethod = ScrollingMovementMethod.getInstance()
            notesView.visibility = View.VISIBLE
        }
        ui.findViewById<TextView>(R.id.versionCorner).text = versionCornerText()

        ui.findViewById<Button>(R.id.otaRetry).setOnClickListener { startOtaFlow() }
        ui.findViewById<Button>(R.id.otaCancel).setOnClickListener { OtaManager.cancelUpdate() }
        val resetBtn = ui.findViewById<Button>(R.id.otaReset)
        resetBtn.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Xóa dữ liệu đã tải")
                .setMessage("Xóa toàn bộ dữ liệu game đã tải?\nLần chạy sau sẽ tải lại từ đầu.")
                .setNegativeButton("Hủy", null)
                .setPositiveButton("Xóa") { _, _ ->
                    OtaManager.resetInstalled(this)
                    startOtaFlow()
                }
                .show()
        }
        resetBtn.visibility = View.VISIBLE
        showApkUpdateButton(ui)

        if (isMetered()) confirmMeteredDownload(ui, manifest, idx) else runUpdate(ui, manifest)
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
        val fresh = idx.dataVersion == null && idx.assetsVersion == null
        // Dung lượng cần tải = tổng các gói chưa có (khớp from → bản vá, không → full)
        fun partBytes(full: OtaManager.ZipPart, patch: OtaManager.PatchPart?, cur: String?): Long = when {
            cur == full.sha256 -> 0L
            patch != null && cur == patch.from -> patch.size
            else -> full.size
        }
        val mb = (
            partBytes(manifest.data, manifest.patch.data, idx.dataVersion) +
                partBytes(manifest.assets, manifest.patch.assets, idx.assetsVersion)
            ) / 1048576.0
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
            val notes = cleanNotes(manifest.notes, 400)
            builder
                .setTitle("Có bản cập nhật game mới")
                .setMessage(
                    buildString {
                        append(String.format(Locale.US, "Bộ cập nhật ~%.0f MB.", mb))
                        if (notes.isNotEmpty()) append("\n\n").append(notes)
                        append("\n\nTải qua mạng di động?")
                    }
                )
                .setNegativeButton("Để sau") { _, _ -> startGame() }
        }
        builder.setPositiveButton("Tải ngay") { _, _ -> runUpdate(ui, manifest) }
            .setCancelable(false)
            .show()
    }

    private fun runUpdate(ui: View, manifest: OtaManager.Manifest) {
        val bar = ui.findViewById<ProgressBar>(R.id.otaBar)
        val status = ui.findViewById<TextView>(R.id.otaStatus)
        ui.findViewById<Button>(R.id.otaRetry).visibility = View.GONE
        ui.findViewById<Button>(R.id.otaApk).visibility = View.GONE
        ui.findViewById<Button>(R.id.otaReset).visibility = View.GONE
        val cancelBtn = ui.findViewById<Button>(R.id.otaCancel)
        cancelBtn.visibility = View.VISIBLE
        cancelBtn.setOnClickListener { OtaManager.cancelUpdate() }
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
                        status.text = when {
                            phase == "verify" && total > 0 ->
                                String.format(Locale.US, "Kiểm tra sau cài %d/%d…", done, total)
                            phase.endsWith(".verify_zip") -> "Kiểm tra file đã tải…"
                            phase.endsWith(".extract") ->
                                String.format(Locale.US, "Giải nén %d/%d…", done, total)
                            phase.endsWith(".files") ->
                                String.format(Locale.US, "Kiểm tra tài nguyên %d/%d…", done, total)
                            phase.endsWith(".install") ->
                                String.format(Locale.US, "Cài đặt tài nguyên %d/%d…", done, total)
                            else -> "Đang xử lý…"
                        }
                    }
                },
                onZipProgress = { section, done, total ->
                    runOnUiThread {
                        val pct = if (total > 0) (done * 100 / total).toInt() else 0
                        bar.progress = pct
                        val label = when (section) {
                            "assets" -> "assets"
                            "data-patch" -> "bản vá dữ liệu"
                            "assets-patch" -> "bản vá assets"
                            else -> "dữ liệu"
                        }
                        status.text = String.format(
                            Locale.US, "Tải %s · %d%% (%.0f/%.0f MB)",
                            label, pct, done / 1048576.0, total / 1048576.0
                        )
                    }
                },
            )
            runOnUiThread {
                cancelBtn.visibility = View.GONE
                ui.findViewById<Button>(R.id.otaReset).visibility = View.VISIBLE
                if (ok) startGame()
                else if (OtaManager.wasCanceled()) showError(ui, "Đã dừng tải.\nBấm Thử lại để tải tiếp từ chỗ dừng.")
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

    private fun showApkUpdateButton(root: View) {
        val rel = apkRelease ?: return
        val btn = root.findViewById<Button>(R.id.otaApk) ?: return
        btn.text = if (rel.apkSize > 0)
            String.format(Locale.US, "Cập nhật app %s (~%.1f MB)", rel.tag, rel.apkSize / 1048576.0)
        else "Cập nhật app ${rel.tag}"
        btn.visibility = View.VISIBLE
        btn.setOnClickListener { confirmApkInstall(rel) }
        // Mô tả bản cập nhật (release notes) — hiện dưới nút trên màn loading
        val notes = cleanNotes(rel.notes, 600)
        val notesView = root.findViewById<TextView>(R.id.otaApkNotes)
        if (notesView != null && notes.isNotEmpty()) {
            notesView.text = notes
            notesView.movementMethod = ScrollingMovementMethod.getInstance()
            notesView.visibility = View.VISIBLE
        }
    }

    /** Release notes (markdown) → text thuần, cắt ngắn còn [max] ký tự. */
    private fun cleanNotes(raw: String, max: Int): String {
        var t = raw
            .replace("`", "")                                  // bỏ dấu code
            .replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1")      // **đậm** → đậm
            .replace(Regex("(?m)^#{1,6}\\s*"), "")             // bỏ tiêu đề #
            .replace(Regex("(?m)^\\s*[-*]\\s+"), "• ")         // gạch đầu dòng → •
            .replace(Regex("(?m)^\\s+"), "")                   // bỏ thụt đầu dòng
            .replace(Regex("[ \\t]+"), " ")
            .trim()
        if (t.length > max) t = t.take(max - 1).trimEnd() + "…"
        return t
    }

    /** Hỏi xác nhận rồi tải APK bản mới về và mở trình cài đặt luôn. */
    private fun confirmApkInstall(rel: OtaManager.ReleaseInfo) {
        val msg = buildString {
            append("Tải về và cài đặt bản ${rel.tag}?")
            if (rel.apkSize > 0) append(String.format(Locale.US, "%nDung lượng ~%.1f MB.", rel.apkSize / 1048576.0))
            val notes = cleanNotes(rel.notes, 400)
            if (notes.isNotEmpty()) append("\n\n").append(notes)
            append("\nTiến trình chơi trong game được giữ nguyên.")
        }
        AlertDialog.Builder(this)
            .setTitle("Cập nhật app ${rel.tag}")
            .setMessage(msg)
            .setNegativeButton("Hủy", null)
            .setPositiveButton("Tải về & cài") { _, _ -> installUpdateApk(rel) }
            .show()
    }

    private fun installUpdateApk(rel: OtaManager.ReleaseInfo) {
        if (rel.apkUrl == null) {   // release không kèm file APK — mở trang tải như cũ
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(rel.url))) } catch (e: Exception) {}
            return
        }
        if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                Toast.makeText(this, "Cấp quyền \"Cài ứng dụng không rõ nguồn gốc\" rồi bấm lại nút này", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {}
            return
        }
        if (apkDownloading) return
        apkDownloading = true
        val btn = screenRoot?.findViewById<Button>(R.id.otaApk)
        val label = "Cập nhật app ${rel.tag}"
        btn?.isEnabled = false
        Thread {
            val file = OtaManager.downloadApk(this, rel.apkUrl, rel.apkSize) { done, total ->
                runOnUiThread {
                    if (total > 0) btn?.text = String.format(Locale.US, "Đang tải %d%%…", done * 100 / total)
                }
            }
            runOnUiThread {
                apkDownloading = false
                btn?.isEnabled = true
                btn?.text = label
                if (file == null) {
                    Toast.makeText(applicationContext, "Tải APK thất bại — kiểm tra mạng rồi thử lại", Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                // So chữ ký APK tải về với app đang cài: khác chữ ký (vd máy đang cài bản debug)
                // thì trình cài hệ thống sẽ báo "xung đột gói" — cảnh báo trước kèm hướng dẫn
                val sameSig = signaturesMatch(file)
                if (sameSig == false) {
                    AlertDialog.Builder(this)
                        .setTitle("APK khác chữ ký với bản đang cài")
                        .setMessage("Máy đang cài một bản app khác chữ ký (thường là bản debug).\n" +
                            "Để lên bản này: 1) Xuất file lưu (thẻ Khác → Tải file lưu), " +
                            "2) GỠ app cũ, 3) Cài lại APK, 4) Vào game → Nạp từ file.")
                        .setNegativeButton("Để sau", null)
                        .show()
                    return@runOnUiThread
                }
                openApkInstaller(file)
            }
        }.start()
    }

    /** So chữ ký của APK tải về với app đang cài: true = khớp, false = khác, null = không kiểm tra được. */
    @Suppress("DEPRECATION")
    private fun signaturesMatch(apkFile: File): Boolean? = try {
        val cur = packageManager.getPackageInfo(packageName, android.content.pm.PackageManager.GET_SIGNATURES).signatures
        val apk = packageManager.getPackageArchiveInfo(apkFile.absolutePath, android.content.pm.PackageManager.GET_SIGNATURES)?.signatures
        if (cur == null || apk == null || apk.isEmpty()) null
        else cur.size == apk.size && cur.zip(apk).all { (x, y) -> x.toCharsString() == y.toCharsString() }
    } catch (e: Exception) {
        null
    }

    /** Mở trình cài đặt hệ thống với APK đã tải; lỗi thì fallback mở trang release. */
    private fun openApkInstaller(file: File) {
        try {
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            apkRelease?.let { rel -> try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(rel.url))) } catch (e2: Exception) {} }
        }
    }

    private fun showError(ui: View, msg: String) {
        ui.findViewById<TextView>(R.id.otaStatus).text = msg
        ui.findViewById<Button>(R.id.otaRetry).visibility = View.VISIBLE
        ui.findViewById<ProgressBar>(R.id.otaBar).visibility = View.INVISIBLE
    }

    // ---------- Game ----------

    @SuppressLint("SetJavaScriptEnabled")
    private fun startGame() {
        stopLoadingFx()
        screenRoot = null
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
                view.evaluateJavascript(RESTORE_CHECK_JS, null)
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
        // onResume chay TRUOC startGame (gameStarted con false) nen F1/F3 phai bat o day;
        // removeCallbacks truoc post de resume-tiep khong tao chuoi tick kep
        requestGameFocus()
        backupHandler.removeCallbacks(backupTick)
        backupHandler.post(backupTick)
    }

    override fun onPause() {
        if (gameStarted) {
            backupHandler.removeCallbacks(backupTick)
            webView.evaluateJavascript(BACKUP_SNAPSHOT_JS, null)
            webView.evaluateJavascript(AUDIO_PAUSE_JS, null)
            if (Build.VERSION.SDK_INT >= 26) {
                focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(focusListener)
            }
            webView.onPause()
            webView.pauseTimers()
        }
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (gameStarted) {
            requestGameFocus()
            webView.resumeTimers()
            webView.onResume()
            webView.evaluateJavascript(AUDIO_RESUME_JS, null)
            backupHandler.removeCallbacks(backupTick)
            backupHandler.post(backupTick)
        }
    }

    /** F1: giữ audio focus khi game foreground — cuộc gọi/app nhạc khác làm game tự im. */
    private fun requestGameFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            // Tái dùng request cũ qua các lần resume. Listener BẮT BUỘC — thiếu nó thì
            // sự kiện mất focus (cuộc gọi đến) không bao giờ kích hoạt AUDIO_PAUSE_JS.
            val existing = focusRequest
            if (existing != null) {
                audioManager.requestAudioFocus(existing)
                return
            }
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .build()
                )
                .setOnAudioFocusChangeListener(focusListener)
                .build()
            focusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (gameStarted) webView.saveState(outState)
    }

    override fun onDestroy() {
        stopLoadingFx()
        if (gameStarted) webView.destroy()
        super.onDestroy()
    }
}
