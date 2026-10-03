package vn.name.mrkiet.volam

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.File
import java.util.Locale

private const val TAG = "VLWeb"
private const val APP_ASSET_DOMAIN = "appassets.androidplatform.net"
private const val GAME_URL = "https://$APP_ASSET_DOMAIN/index.html"
private const val GAME_BG = "#0e1412"

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

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var gameStarted = false

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
        val bar = ui.findViewById<ProgressBar>(R.id.otaBar)
        val status = ui.findViewById<TextView>(R.id.otaStatus)
        val retry = ui.findViewById<Button>(R.id.otaRetry)
        retry.setOnClickListener { startOtaFlow() }
        setContentView(ui)
        status.text = "Đang kiểm tra dữ liệu game…"

        Thread {
            val manifest = OtaManager.fetchManifest()
            val idx = OtaManager.loadIndex(this)
            runOnUiThread {
                when {
                    // Mất mạng nhưng đã từng cài OTA → chơi tiếp với dữ liệu sẵn có
                    manifest == null && idx.version != null -> startGame()
                    manifest == null ->
                        showError(ui, "Không tải được dữ liệu game.\nCần kết nối mạng cho lần chạy đầu tiên.")
                    OtaManager.installedUpToDate(this, manifest) -> startGame()
                    else -> runUpdate(ui, manifest)
                }
            }
        }.start()
    }

    private fun runUpdate(ui: View, manifest: OtaManager.Manifest) {
        val bar = ui.findViewById<ProgressBar>(R.id.otaBar)
        val status = ui.findViewById<TextView>(R.id.otaStatus)
        ui.findViewById<Button>(R.id.otaRetry).visibility = View.GONE
        bar.visibility = View.VISIBLE
        bar.max = 100
        OtaManager.cleanStaleTemp(this)
        val mbZip = manifest.zipSize / 1048576.0
        status.text = String.format(Locale.US, "Tải dữ liệu game (%.0f MB)…", mbZip)

        Thread {
            val downloaded = OtaManager.downloadZip(this, manifest) { done, total ->
                runOnUiThread {
                    val pct = if (total > 0) (done * 100 / total).toInt() else 0
                    bar.progress = pct
                    status.text = String.format(
                        Locale.US, "Đang tải dữ liệu game · %d%% (%.0f/%.0f MB)",
                        pct, done / 1048576.0, total / 1048576.0
                    )
                }
            }
            if (!downloaded) {
                runOnUiThread {
                    showError(ui, "Tải dữ liệu thất bại giữa chừng.\nBấm Thử lại — sẽ tải tiếp từ chỗ dừng.")
                }
                return@Thread
            }

            val ok = OtaManager.install(this, manifest) { phase, done, total ->
                val pct = if (total > 0) done * 100 / total else 0
                runOnUiThread {
                    if (total > 0) bar.progress = pct
                    status.text = when (phase) {
                        "verify_zip" -> "Kiểm tra file đã tải…"
                        "extract" -> String.format(Locale.US, "Giải nén %d/%d…", done, total)
                        "verify_files" -> String.format(Locale.US, "Kiểm tra dữ liệu %d/%d…", done, total)
                        "install" -> String.format(Locale.US, "Cài đặt %d/%d…", done, total)
                        "verify_install" -> String.format(Locale.US, "Kiểm tra sau cài %d/%d…", done, total)
                        else -> "Đang xử lý…"
                    }
                }
            }
            if (ok) OtaManager.writeIndex(this, manifest)
            runOnUiThread {
                if (ok) startGame()
                else showError(ui, "Dữ liệu tải về bị lỗi.\nBấm Thử lại — sẽ tải lại từ đầu.")
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
        }

        setContentView(webView)
        webView.loadUrl(GAME_URL)
    }

    override fun onPause() {
        if (gameStarted) {
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
