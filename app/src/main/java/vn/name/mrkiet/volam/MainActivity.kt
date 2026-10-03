package vn.name.mrkiet.volam

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

private const val TAG = "VLWeb"
private const val APP_ASSET_DOMAIN = "appassets.androidplatform.net"
private const val GAME_URL = "https://$APP_ASSET_DOMAIN/index.html"
private const val GAME_BG = "#0e1412"

/**
 * Phuc vu toan bo file game thu muc assets/game/ qua origin https gia lap de
 * fetch/localStorage/IndexedDB hoat dong nhu tren web that.
 * Khong dong goi sw.js: service worker se bypass interceptor nay lam vo hieu
 * hoa viec doc asset local; game dang ky SW kieu fire-and-forget nen 404 la vo hai.
 */
private class GameAssetHandler(private val context: Context) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        var rel = path.removePrefix("/").ifEmpty { "index.html" }
        if (rel.endsWith("/")) rel += "index.html"
        if (rel.split('/').any { it == ".." || it == "." }) return notFound(rel)
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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.parseColor(GAME_BG)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.parseColor(GAME_BG)

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

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        webView.loadUrl(GAME_URL)
    }

    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
