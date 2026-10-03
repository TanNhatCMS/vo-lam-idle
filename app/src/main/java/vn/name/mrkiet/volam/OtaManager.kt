package vn.name.mrkiet.volam

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

/**
 * OTA game theo manifest v3 (assets-manifest.json o goc repo):
 *  - media (img, snd, music, fx): ZIP dinh kem GitHub Release, version = zipSha256.
 *    Tai ve bo tam cache/ota/ota.zip.part (resume HTTP Range neu dut), verify sha256,
 *    giai nen, verify tung file, move vao filesDir/game-assets.
 *  - code (index.html, js, data.js, fonts, ui...): tung file tai rieng tu
 *    raw.githubusercontent (delta per-file), staging cache/ota/code roi move.
 *  - Sau cung: verify toan bo file (code+media) da cai -> ghi index -> don bo tam.
 * Cap nhat chay moi lan mo app; mat mang ma da co bo cu thi vao game binh thuong.
 * fetchLatestRelease() check ban APK moi tren GitHub Releases (chi bao + mo link).
 */
object OtaManager {
    private const val TAG = "VLOta"
    private const val MANIFEST_URL =
        "https://raw.githubusercontent.com/TanNhatCMS/volam-idle-android/main/assets-manifest.json"
    private const val FILES_URL =
        "https://raw.githubusercontent.com/TanNhatCMS/volam-idle-android/main/game/"
    private const val RELEASES_API =
        "https://api.github.com/repos/TanNhatCMS/volam-idle-android/releases/latest"
    private const val CODE_CONCURRENCY = 4
    private const val RETRIES = 3

    class Entry(val path: String, val sha256: String, val size: Long)

    class Manifest(
        val zipUrl: String,
        val zipSha256: String,
        val zipSize: Long,
        val mediaFiles: List<Entry>,
        val codeVersion: String,
        val codeBytes: Long,
        val codeFiles: List<Entry>,
    )

    class InstalledIndex(val mediaVersion: String?, val codeVersion: String?, val files: Map<String, String>)

    class ReleaseInfo(val tag: String, val url: String)

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    // ---------- Huy cap nhat (F4) ----------
    // canceled bat boi cancelUpdate(); updateAll() dat lai false khi chay vong moi.
    // activeCall: call OkHttp dang chay (ZIP hoac file code) de cancel truc tiep —
    // execute/read nem IOException ngay thay cho cho het stream. .part luon duoc giu.
    @Volatile private var canceled = false
    @Volatile private var activeCall: okhttp3.Call? = null

    fun cancelUpdate() {
        canceled = true
        activeCall?.cancel()
    }

    /** true neu vong updateAll gan nhat ket thuc do nguoi dung huy. */
    fun wasCanceled(): Boolean = canceled

    private fun otaTmp(ctx: Context): File = File(ctx.cacheDir, "ota")
    private fun zipPart(ctx: Context): File = File(otaTmp(ctx), "ota.zip.part")
    private fun zipDone(ctx: Context): File = File(otaTmp(ctx), "ota.zip")
    private fun extractDir(ctx: Context): File = File(otaTmp(ctx), "extracted")
    private fun codeDir(ctx: Context): File = File(otaTmp(ctx), "code")
    fun assetsDir(ctx: Context): File = File(ctx.filesDir, "game-assets")
    private fun indexFile(ctx: Context): File = File(ctx.filesDir, "ota-index.json")

    fun cleanStaleTemp(ctx: Context) {
        extractDir(ctx).deleteRecursively()
        codeDir(ctx).deleteRecursively()
    }

    fun fetchManifest(): Manifest? = try {
        val body = http.newCall(Request.Builder().url(MANIFEST_URL).build()).execute().use { resp ->
            if (!resp.isSuccessful) return null
            resp.body!!.string()
        }
        val obj = JSONObject(body)
        val media = obj.getJSONObject("media")
        val code = obj.getJSONObject("code")
        val mFiles = media.getJSONArray("files")
        val cFiles = code.getJSONArray("files")
        fun parse(arr: org.json.JSONArray): List<Entry> {
            val out = ArrayList<Entry>(arr.length())
            for (i in 0 until arr.length()) {
                val e = arr.getJSONObject(i)
                out.add(Entry(e.getString("p"), e.getString("h"), e.getLong("s")))
            }
            return out
        }
        Manifest(
            media.getString("zipUrl"), media.getString("zipSha256"), media.getLong("zipSize"),
            parse(mFiles), code.getString("version"), code.getLong("totalBytes"), parse(cFiles)
        )
    } catch (e: Exception) {
        Log.w(TAG, "fetchManifest: ${e.message}")
        null
    }

    fun loadIndex(ctx: Context): InstalledIndex = try {
        val obj = JSONObject(indexFile(ctx).readText())
        val fObj = obj.getJSONObject("files")
        val m = HashMap<String, String>(fObj.length())
        for (k in fObj.keys()) m[k] = fObj.getString(k)
        InstalledIndex(obj.optString("mediaVersion", ""), obj.optString("codeVersion", ""), m)
    } catch (e: Exception) {
        InstalledIndex(null, null, emptyMap())
    }

    /** Fast path: dung version trong index + size tung file, khong hash. */
    fun installedUpToDate(ctx: Context, manifest: Manifest): Boolean {
        val idx = loadIndex(ctx)
        if (idx.mediaVersion != manifest.zipSha256 || idx.codeVersion != manifest.codeVersion) return false
        val dir = assetsDir(ctx)
        for (e in manifest.mediaFiles + manifest.codeFiles) {
            if (File(dir, e.path).length() != e.size) return false
        }
        return true
    }

    /** Ban APK moi tren GitHub Releases; null neu loi/khong check duoc. */
    fun fetchLatestRelease(): ReleaseInfo? = try {
        val req = Request.Builder().url(RELEASES_API)
            .header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val obj = JSONObject(resp.body!!.string())
            if (obj.optBoolean("draft", false) || obj.optBoolean("prerelease", false)) return null
            ReleaseInfo(obj.getString("tag_name"), obj.getString("html_url"))
        }
    } catch (e: Exception) {
        Log.w(TAG, "fetchLatestRelease: ${e.message}")
        null
    }

    /**
     * Dong bo toan bo game theo manifest. onPhase(phase, done, total) cho cac buoc
     * dem duoc; onZipProgress(bytes, total) cho viec tai ZIP. Chay o thread nen,
     * callback cung tu thread do — UI tu boc ra main thread.
     */
    fun updateAll(
        ctx: Context,
        manifest: Manifest,
        onPhase: (String, Int, Int) -> Unit,
        onZipProgress: (Long, Long) -> Unit,
    ): Boolean {
        canceled = false
        val dir = assetsDir(ctx)
        dir.mkdirs()

        // ---------- 1. CODE: tai file doi (delta) vao staging roi move ----------
        val codePending = manifest.codeFiles.filter { hashOnDisk(dir, it) != it.sha256 }
        if (codePending.isNotEmpty()) {
            val staging = codeDir(ctx)
            staging.deleteRecursively()
            staging.mkdirs()
            onPhase("code", 0, codePending.size)
            var done = 0
            for (e in codePending) {
                if (canceled) return false
                var ok = false
                var attempt = 0
                while (!ok && attempt < RETRIES) {
                    if (canceled) return false
                    attempt++
                    try {
                        val url = FILES_URL + e.path.split('/').joinToString("/") { segment ->
                            java.net.URLEncoder.encode(segment, "UTF-8").replace("+", "%20")
                        }
                        val tmp = File(staging, e.path + ".part")
                        tmp.parentFile?.mkdirs()
                        val call = http.newCall(Request.Builder().url(url).build())
                        activeCall = call
                        try {
                            call.execute().use { resp ->
                                if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} ${e.path}")
                                resp.body!!.byteStream().use { ins ->
                                    tmp.outputStream().use { outs -> ins.copyTo(outs) }
                                }
                            }
                        } finally {
                            activeCall = null
                        }
                        if (hash(tmp) != e.sha256) {
                            tmp.delete()
                            throw IOException("hash mismatch ${e.path}")
                        }
                        if (!tmp.renameTo(File(staging, e.path))) throw IOException("rename ${e.path}")
                        ok = true
                    } catch (ex: Exception) {
                        Log.w(TAG, "code lan $attempt loi ${e.path}: ${ex.message}")
                        if (attempt >= RETRIES) codeDir(ctx).deleteRecursively()
                        else Thread.sleep(1200L * attempt)
                    }
                }
                if (!ok) return false
                done++
                onPhase("code", done, codePending.size)
            }
            for (e in codePending) {
                val from = File(staging, e.path)
                val to = File(dir, e.path)
                to.parentFile?.mkdirs()
                if (to.isFile) to.delete()
                if (!from.renameTo(to)) {
                    from.copyTo(to, overwrite = true)
                    from.delete()
                }
            }
            staging.deleteRecursively()
        }

        // ---------- 2. MEDIA: zip -> extract -> verify -> move ----------
        val mediaInstalled = manifest.mediaFiles.all { hashOnDisk(dir, it) == it.sha256 }
        if (!mediaInstalled) {
            val tmp = otaTmp(ctx)
            val part = zipPart(ctx)
            val zip = zipDone(ctx)
            val ex = extractDir(ctx)
            try {
                if (!downloadZip(ctx, manifest, onZipProgress)) return false

                if (canceled) return false
                onPhase("verify_zip", 0, 0)
                val src = if (part.isFile) part else zip
                if (!src.isFile || src.length() != manifest.zipSize || hash(src) != manifest.zipSha256) {
                    src.delete()
                    return false
                }
                if (src == part && !part.renameTo(zip)) throw IOException("rename zip")

                ex.deleteRecursively()
                ex.mkdirs()
                ZipFile(zip).use { zf ->
                    val entries = zf.entries().toList()
                    var i = 0
                    for (ze in entries) {
                        i++
                        if (ze.isDirectory) continue
                        val out = File(ex, ze.name)
                        if (!out.canonicalPath.startsWith(ex.canonicalPath)) return false
                        out.parentFile?.mkdirs()
                        zf.getInputStream(ze).use { ins ->
                            out.outputStream().use { outs -> ins.copyTo(outs) }
                        }
                        if (i % 200 == 0) {
                            if (canceled) return false
                            onPhase("extract", i, entries.size)
                        }
                    }
                }

                onPhase("verify_files", 0, manifest.mediaFiles.size)
                var vi = 0
                for (e in manifest.mediaFiles) {
                    val f = File(ex, e.path)
                    if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                        throw IOException("verify extract fail ${e.path}")
                    }
                    vi++
                    if (vi % 200 == 0) {
                        if (canceled) return false
                        onPhase("verify_files", vi, manifest.mediaFiles.size)
                    }
                }

                onPhase("install_media", 0, manifest.mediaFiles.size)
                var mi = 0
                for (e in manifest.mediaFiles) {
                    val from = File(ex, e.path)
                    val to = File(dir, e.path)
                    to.parentFile?.mkdirs()
                    if (to.isFile) to.delete()
                    if (!from.renameTo(to)) {
                        from.copyTo(to, overwrite = true)
                        from.delete()
                    }
                    mi++
                    if (mi % 200 == 0) {
                        if (canceled) return false
                        onPhase("install_media", mi, manifest.mediaFiles.size)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "media: ${e.message}")
                ex.deleteRecursively()
                zip.delete()
                part.delete()
                return false
            }
        }

        // ---------- 3. Verify toan bo sau khi cai ----------
        val all = manifest.mediaFiles + manifest.codeFiles
        onPhase("verify_install", 0, all.size)
        var ci = 0
        for (e in all) {
            val f = File(dir, e.path)
            if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                Log.w(TAG, "verify install fail ${e.path}")
                return false
            }
            ci++
            if (ci % 200 == 0) {
                if (canceled) return false
                onPhase("verify_install", ci, all.size)
            }
        }

        // ---------- 4. Ghi index + don bo tam ----------
        writeIndex(ctx, manifest)
        otaTmp(ctx).deleteRecursively()
        return true
    }

    /**
     * Tai ZIP media co resume: .part ton tai thi gui Range bytes=N- ghi tiep;
     * server tra 200 thi tai lai tu dau. Giu .part qua cac lan that bai.
     */
    private fun downloadZip(ctx: Context, manifest: Manifest, onProgress: (Long, Long) -> Unit): Boolean {
        val tmp = otaTmp(ctx)
        tmp.mkdirs()
        if (zipDone(ctx).isFile) return true
        val part = zipPart(ctx)
        var start = if (part.isFile) part.length() else 0L
        if (start > manifest.zipSize) {
            part.delete()
            start = 0L
        }
        val req = Request.Builder().url(manifest.zipUrl)
        if (start > 0) req.header("Range", "bytes=$start-")
        val call = http.newCall(req.build())
        activeCall = call
        try {
            call.execute().use { resp ->
                when {
                    resp.code == 206 -> { /* resume ok */ }
                    resp.code == 200 -> { start = 0L; part.delete() }
                    else -> throw IOException("HTTP ${resp.code}")
                }
                val body = resp.body ?: throw IOException("body null")
                RandomAccessFile(part, "rw").use { raf ->
                    raf.seek(start)
                    body.byteStream().use { ins ->
                        val buf = ByteArray(1 shl 20)
                        var total = start
                        while (true) {
                            if (canceled) return false
                            val n = ins.read(buf)
                            if (n < 0) break
                            raf.write(buf, 0, n)
                            total += n
                            onProgress(total, manifest.zipSize)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "downloadZip: ${e.message}")
            return false
        } finally {
            activeCall = null
        }
        return part.length() == manifest.zipSize
    }

    fun writeIndex(ctx: Context, manifest: Manifest) {
        val files = JSONObject()
        for (e in manifest.mediaFiles + manifest.codeFiles) files.put(e.path, e.sha256)
        val obj = JSONObject()
        obj.put("mediaVersion", manifest.zipSha256)
        obj.put("codeVersion", manifest.codeVersion)
        obj.put("files", files)
        indexFile(ctx).writeText(obj.toString())
    }

    /**
     * Xoa toan bo du lieu da tai (code + media + index + bo tam) — lan mo sau
     * di nhanh nhu lan chay dau, tai lai tu dau. Khong dong gi den asset bundle
     * trong APK (van la fallback khi doc file).
     */
    fun resetInstalled(ctx: Context) {
        assetsDir(ctx).deleteRecursively()
        indexFile(ctx).delete()
        otaTmp(ctx).deleteRecursively()
    }

    /** hash file tren dia so voi Entry: null neu file thieu/sai size. */
    private fun hashOnDisk(dir: File, e: Entry): String? {
        val f = File(dir, e.path)
        if (!f.isFile || f.length() != e.size) return null
        return hash(f)
    }

    private fun hash(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { ins ->
            val buf = ByteArray(1 shl 20)
            while (true) {
                val n = ins.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
