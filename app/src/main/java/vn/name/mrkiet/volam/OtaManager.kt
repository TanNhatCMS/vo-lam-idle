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
 * OTA media game (img, snd, music, fx) theo co che ZIP:
 *  1. Tai assets-manifest.json o goc repo (zipUrl + zipSha256 + zipSize + hash tung file).
 *  2. Tai ZIP ve bo tam cacheDir/ota/ota.zip.part — resume HTTP Range neu dut giua chung
 *     (giu .part qua cac lan retry; server khong ho tro Range thi tai lai tu dau).
 *  3. Verify sha256 ZIP sau khi tai → giai nen ra ota/extracted → verify tung file theo manifest.
 *  4. Move vao filesDir/game-assets → verify lai toan bo sau khi cai.
 *  5. Don bo tam. Khi loi: rac tam tu don (extracted, zip loi); chi giu .part de tai tiep.
 * Code JS luon bundle trong APK — OTA khong bao gio tai file JS.
 * Manifest sinh boi tools/make_ota_manifest.py, ZIP dinh kem GitHub Release.
 */
object OtaManager {
    private const val TAG = "VLOta"
    private const val MANIFEST_URL =
        "https://raw.githubusercontent.com/TanNhatCMS/volam-idle-android/main/assets-manifest.json"

    class Entry(val path: String, val sha256: String, val size: Long)

    class Manifest(
        val zipUrl: String,
        val zipSha256: String,
        val zipSize: Long,
        val files: List<Entry>,
    )

    class InstalledIndex(val version: String?, val files: Map<String, String>)

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private fun otaTmp(ctx: Context): File = File(ctx.cacheDir, "ota")
    private fun zipPart(ctx: Context): File = File(otaTmp(ctx), "ota.zip.part")
    private fun zipDone(ctx: Context): File = File(otaTmp(ctx), "ota.zip")
    private fun extractDir(ctx: Context): File = File(otaTmp(ctx), "extracted")
    fun assetsDir(ctx: Context): File = File(ctx.filesDir, "game-assets")
    private fun indexFile(ctx: Context): File = File(ctx.filesDir, "ota-index.json")

    /** Tai manifest moi nhat; null neu mat mang/loi. */
    fun fetchManifest(): Manifest? = try {
        val body = http.newCall(Request.Builder().url(MANIFEST_URL).build()).execute().use { resp ->
            if (!resp.isSuccessful) return null
            resp.body!!.string()
        }
        val obj = JSONObject(body)
        val arr = obj.getJSONArray("files")
        val files = ArrayList<Entry>(arr.length())
        for (i in 0 until arr.length()) {
            val e = arr.getJSONObject(i)
            files.add(Entry(e.getString("p"), e.getString("h"), e.getLong("s")))
        }
        Manifest(obj.getString("zipUrl"), obj.getString("zipSha256"), obj.getLong("zipSize"), files)
    } catch (e: Exception) {
        Log.w(TAG, "fetchManifest: ${e.message}")
        null
    }

    /** Index ban da cai: version = zipSha256, files = {path: sha256}. */
    fun loadIndex(ctx: Context): InstalledIndex = try {
        val obj = JSONObject(indexFile(ctx).readText())
        val fObj = obj.getJSONObject("files")
        val m = HashMap<String, String>(fObj.length())
        for (k in fObj.keys()) m[k] = fObj.getString(k)
        InstalledIndex(obj.optString("version", ""), m)
    } catch (e: Exception) {
        InstalledIndex(null, emptyMap())
    }

    /** Kiem tra nhanh ban da cai (so version + size tung file, khong hash). */
    fun installedUpToDate(ctx: Context, manifest: Manifest): Boolean {
        val idx = loadIndex(ctx)
        if (idx.version != manifest.zipSha256) return false
        val dir = assetsDir(ctx)
        for (e in manifest.files) if (File(dir, e.path).length() != e.size) return false
        return true
    }

    /** Bo tam con sot tu lan chay truoc — don truoc khi bat dau vong moi. */
    fun cleanStaleTemp(ctx: Context) {
        extractDir(ctx).deleteRecursively()
    }

    /**
     * Tai ZIP co resume: neu .part ton tai thi gui Range bytes=N- va ghi tiep;
     * server tra 200 (khong ho tro Range) thi tai lai tu dau.
     * Tra true khi .part du zipSize. Loi giua chung giu .part de tai tiep.
     */
    fun downloadZip(ctx: Context, manifest: Manifest, onProgress: (Long, Long) -> Unit): Boolean {
        val tmp = otaTmp(ctx)
        tmp.mkdirs()
        // Zip hoan chỉnh còn sót từ lần trước (crash sau khi tải xong) — dùng luôn
        if (zipDone(ctx).isFile) return true
        val part = zipPart(ctx)
        var start = if (part.isFile) part.length() else 0L
        if (start > manifest.zipSize) {
            part.delete()
            start = 0L
        }
        val req = Request.Builder().url(manifest.zipUrl)
        if (start > 0) req.header("Range", "bytes=$start-")
        try {
            http.newCall(req.build()).execute().use { resp ->
                when {
                    resp.code == 206 -> { /* resume duoc chap nhan */ }
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
        }
        return part.length() == manifest.zipSize
    }

    /**
     * Verify + cai dat ZIP da hoan chinh:
     * sha256 zip → giai nen → verify tung file → move vao game-assets →
     * verify sau cai → don bo tam.
     * onPhase(phase, done, total) goi tu thread goi install().
     */
    fun install(ctx: Context, manifest: Manifest, onPhase: (String, Int, Int) -> Unit): Boolean {
        val tmp = otaTmp(ctx)
        val part = zipPart(ctx)
        val zip = zipDone(ctx)
        val ex = extractDir(ctx)
        val dest = assetsDir(ctx)
        try {
            // 1. Verify ZIP sau khi tai
            onPhase("verify_zip", 0, 0)
            val src = if (part.isFile) part else zip
            if (!src.isFile || src.length() != manifest.zipSize || hash(src) != manifest.zipSha256) {
                src.delete()
                return false
            }
            if (src == part && !part.renameTo(zip)) throw IOException("rename zip")

            // 2. Giai nen
            ex.deleteRecursively()
            ex.mkdirs()
            ZipFile(zip).use { zf ->
                val entries = zf.entries().toList()
                var i = 0
                for (ze in entries) {
                    i++
                    if (ze.isDirectory) continue
                    val out = File(ex, ze.name)
                    if (!out.canonicalPath.startsWith(ex.canonicalPath)) return false // zip slip
                    out.parentFile?.mkdirs()
                    zf.getInputStream(ze).use { ins ->
                        out.outputStream().use { outs -> ins.copyTo(outs) }
                    }
                    if (i % 200 == 0) onPhase("extract", i, entries.size)
                }
            }

            // 3. Verify tung file theo manifest sau khi giai nen
            onPhase("verify_files", 0, manifest.files.size)
            var vi = 0
            for (e in manifest.files) {
                val f = File(ex, e.path)
                if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                    throw IOException("verify extract fail ${e.path}")
                }
                vi++
                if (vi % 200 == 0) onPhase("verify_files", vi, manifest.files.size)
            }

            // 4. Move vao game-assets (rename cung volume; fallback copy+delete)
            onPhase("install", 0, manifest.files.size)
            dest.mkdirs()
            var mi = 0
            for (e in manifest.files) {
                val from = File(ex, e.path)
                val to = File(dest, e.path)
                to.parentFile?.mkdirs()
                if (to.isFile) to.delete()
                if (!from.renameTo(to)) {
                    from.copyTo(to, overwrite = true)
                    from.delete()
                }
                mi++
                if (mi % 200 == 0) onPhase("install", mi, manifest.files.size)
            }

            // 5. Verify toan bo sau khi cai
            onPhase("verify_install", 0, manifest.files.size)
            var ci = 0
            for (e in manifest.files) {
                val f = File(dest, e.path)
                if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                    throw IOException("verify install fail ${e.path}")
                }
                ci++
                if (ci % 200 == 0) onPhase("verify_install", ci, manifest.files.size)
            }

            // 6. Xong — don bo tam
            tmp.deleteRecursively()
            return true
        } catch (e: Exception) {
            Log.w(TAG, "install: ${e.message}")
            // Du lieu loi (zip/extracted) — tu don, lan sau tai lai tu dau.
            ex.deleteRecursively()
            zip.delete()
            part.delete()
            return false
        }
    }

    /** Ghi index sau khi cai thanh cong. */
    fun writeIndex(ctx: Context, manifest: Manifest) {
        val files = JSONObject()
        for (e in manifest.files) files.put(e.path, e.sha256)
        val obj = JSONObject()
        obj.put("version", manifest.zipSha256)
        obj.put("files", files)
        indexFile(ctx).writeText(obj.toString())
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
