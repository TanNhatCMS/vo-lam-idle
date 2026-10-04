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
 * OTA tai nguyen theo manifest v6 (assets-manifest.json o goc repo) — 2 goi
 * rieng theo tan suat thay doi, moi goi mot ZIP dinh kem GitHub Release + ban
 * va (patch) rieng:
 *  - data   : ZIP ota-data-<v>.zip   (index.html, js, data.js, fonts, ui — ~4MB, hay doi)
 *  - assets : ZIP ota-assets-<v>.zip (img, snd, music, fx — ~115MB, it doi)
 *  - patch  : {data:{from,zip,files,remove}|null, assets:{...}|null} — chi ap
 *            goi nao khi <goi>Version dang cai == patch.<goi>.from; lech nhanh
 *            thi tai lai full goi do.
 * Ca hai di cung luong: tai ZIP (resume HTTP Range qua .part) -> verify sha256
 * -> giai nen -> verify tung file -> move vao filesDir/game-assets; cuoi cung
 * verify toan bo theo manifest.data.files -> ghi index -> don bo tam.
 * ZIP deterministic (timestamp cung). Mat mang ma da co bo cu thi vao game binh thuong.
 * fetchLatestRelease() check ban APK moi tren GitHub Releases (chi bao + mo link).
 */
object OtaManager {
    private const val TAG = "VLOta"
    private const val MANIFEST_URL =
        "https://raw.githubusercontent.com/TanNhatCMS/volam-idle-android/main/assets-manifest.json"
    private const val RELEASES_API =
        "https://api.github.com/repos/TanNhatCMS/volam-idle-android/releases/latest"

    /**
     * Cau hinh OTA theo variant: build thuong (debug/release) deu dung GitHub
     * production; build voi co -PotaLocal (chi debug) tro toan bo OTA ve server
     * local — MANIFEST_URL thay bang OTA_LOCAL_BASE + "assets-manifest.json",
     * URL ZIP trong manifest thay bang OTA_LOCAL_BASE + zipName. Khong phai sua
     * URL tay trong code/manifest khi test nua.
     */
    private fun manifestUrl(): String =
        if (BuildConfig.OTA_LOCAL) BuildConfig.OTA_LOCAL_BASE + "assets-manifest.json" else MANIFEST_URL

    private fun zipUrlFrom(o: JSONObject): String =
        if (BuildConfig.OTA_LOCAL) BuildConfig.OTA_LOCAL_BASE + o.getString("zipName") else o.getString("zipUrl")

    class Entry(val path: String, val sha256: String, val size: Long)

    /** Mot goi ZIP tai nguyen (data full | patch). */
    class ZipPart(val url: String, val sha256: String, val size: Long, val files: List<Entry>)

    /** Ban va: ap duoc khi dataVersion dang cai == from; remove = file can xoa. */
    class PatchPart(
        val from: String,
        val url: String,
        val sha256: String,
        val size: Long,
        val files: List<Entry>,
        val remove: List<String>,
    )

    class Manifest(val version: String, val data: ZipPart, val assets: ZipPart, val patch: Patches)

    /** Bản vá từng gói: data hay đổi (~4MB), assets ít đổi (~115MB). */
    class Patches(val data: PatchPart?, val assets: PatchPart?)

    class InstalledIndex(
        val resVersion: String?,
        val dataVersion: String?,
        val assetsVersion: String?,
        val files: Map<String, String>,
    )

    class ReleaseInfo(val tag: String, val url: String, val apkUrl: String?, val apkSize: Long)

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    // ---------- Huy cap nhat (F4) ----------
    // canceled bat boi cancelUpdate(); updateAll() dat lai false khi chay vong moi.
    // activeCall: call OkHttp dang chay de cancel truc tiep — execute/read nem
    // IOException ngay thay cho cho het stream. .part luon duoc giu de tai tiep.
    @Volatile private var canceled = false
    @Volatile private var activeCall: okhttp3.Call? = null

    fun cancelUpdate() {
        canceled = true
        activeCall?.cancel()
    }

    /** true neu vong updateAll gan nhat ket thuc do nguoi dung huy. */
    fun wasCanceled(): Boolean = canceled

    private fun otaTmp(ctx: Context): File = File(ctx.cacheDir, "ota")
    private fun partFile(ctx: Context, section: String) = File(otaTmp(ctx), "$section.zip.part")
    private fun zipFile(ctx: Context, section: String) = File(otaTmp(ctx), "$section.zip")
    private fun extractDir(ctx: Context, section: String) = File(otaTmp(ctx), "$section-extract")
    fun assetsDir(ctx: Context): File = File(ctx.filesDir, "game-assets")
    private fun indexFile(ctx: Context): File = File(ctx.filesDir, "ota-index.json")

    fun cleanStaleTemp(ctx: Context) {
        extractDir(ctx, "data").deleteRecursively()
        extractDir(ctx, "assets").deleteRecursively()
        extractDir(ctx, "data-patch").deleteRecursively()
        extractDir(ctx, "assets-patch").deleteRecursively()
    }

    fun fetchManifest(): Manifest? = try {
        val body = http.newCall(Request.Builder().url(manifestUrl()).build()).execute().use { resp ->
            if (!resp.isSuccessful) return null
            resp.body!!.string()
        }
        val obj = JSONObject(body)
        fun zipPart(section: String): ZipPart {
            val o = obj.getJSONObject(section)
            val arr = o.getJSONArray("files")
            val files = ArrayList<Entry>(arr.length())
            for (i in 0 until arr.length()) {
                val e = arr.getJSONObject(i)
                files.add(Entry(e.getString("p"), e.getString("h"), e.getLong("s")))
            }
            return ZipPart(zipUrlFrom(o), o.getString("zipSha256"), o.getLong("zipSize"), files)
        }
        val patchJson = obj.optJSONObject("patch")
        fun parsePatch(p: JSONObject): PatchPart {
            val arr = p.getJSONArray("files")
            val files = ArrayList<Entry>(arr.length())
            for (i in 0 until arr.length()) {
                val e = arr.getJSONObject(i)
                files.add(Entry(e.getString("p"), e.getString("h"), e.getLong("s")))
            }
            val remove = ArrayList<String>()
            p.optJSONArray("remove")?.let { r ->
                for (i in 0 until r.length()) remove.add(r.getString(i))
            }
            return PatchPart(
                p.getString("from"), zipUrlFrom(p), p.getString("zipSha256"),
                p.getLong("zipSize"), files, remove,
            )
        }
        val patches = Patches(
            patchJson?.optJSONObject("data")?.let { parsePatch(it) },
            patchJson?.optJSONObject("assets")?.let { parsePatch(it) },
        )
        Manifest(obj.getString("version"), zipPart("data"), zipPart("assets"), patches)
    } catch (e: Exception) {
        Log.w(TAG, "fetchManifest: ${e.message}")
        null
    }

    fun loadIndex(ctx: Context): InstalledIndex = try {
        val obj = JSONObject(indexFile(ctx).readText())
        val fObj = obj.getJSONObject("files")
        val m = HashMap<String, String>(fObj.length())
        for (k in fObj.keys()) m[k] = fObj.getString(k)
        InstalledIndex(
            obj.optString("resVersion", ""),
            obj.optString("dataVersion", ""),
            obj.optString("assetsVersion", ""),
            m,
        )
    } catch (e: Exception) {
        InstalledIndex(null, null, null, emptyMap())
    }

    /** Fast path: dung version trong index + size tung file, khong hash. */
    fun installedUpToDate(ctx: Context, manifest: Manifest): Boolean {
        val idx = loadIndex(ctx)
        if (idx.dataVersion != manifest.data.sha256 || idx.assetsVersion != manifest.assets.sha256) return false
        val dir = assetsDir(ctx)
        for (e in manifest.data.files + manifest.assets.files) {
            if (File(dir, e.path).length() != e.size) return false
        }
        return true
    }

    /** Ban APK moi tren GitHub Releases (kem URL + dung luong file APK trong release); null neu loi. */
    fun fetchLatestRelease(): ReleaseInfo? = try {
        val req = Request.Builder().url(RELEASES_API)
            .header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val obj = JSONObject(resp.body!!.string())
            if (obj.optBoolean("draft", false) || obj.optBoolean("prerelease", false)) return null
            var apkUrl: String? = null
            var apkSize = 0L
            obj.optJSONArray("assets")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val a = arr.getJSONObject(i)
                    if (a.optString("name", "").endsWith(".apk")) {
                        apkUrl = a.getString("browser_download_url")
                        apkSize = a.optLong("size", 0L)
                        break
                    }
                }
            }
            ReleaseInfo(obj.getString("tag_name"), obj.getString("html_url"), apkUrl, apkSize)
        }
    } catch (e: Exception) {
        Log.w(TAG, "fetchLatestRelease: ${e.message}")
        null
    }

    /**
     * Dong bo tai nguyen theo manifest, MOI GOI DI RIENG (data hay doi, assets it doi):
     *  - file tren dia da dung het goi -> bo qua (delta);
     *  - <gói>Version dang cai khop patch.<gói>.from -> chi tai BAN VA cua goi do;
     *  - con lai (lan dau / bo phien) -> tai full goi do.
     * Verify tung goi ngay sau khi cai — hong thi tu chua bang full cua goi do,
     * roi cuoi cung verify toan bo. onPhase(phase, done, total) voi phase co tien
     * to "data." / "assets." / "data-patch." / "assets-patch.";
     * onZipProgress(section, bytes, total) cho viec tai ZIP. UI tu boc ra main thread.
     */
    fun updateAll(
        ctx: Context,
        manifest: Manifest,
        onPhase: (String, Int, Int) -> Unit,
        onZipProgress: (String, Long, Long) -> Unit,
    ): Boolean {
        canceled = false
        val dir = assetsDir(ctx)
        dir.mkdirs()

        val idx = loadIndex(ctx)
        val parts = listOf(
            Triple("data", manifest.data, manifest.patch.data),
            Triple("assets", manifest.assets, manifest.patch.assets),
        )
        for ((part, full, patch) in parts) {
            if (full.files.all { hashOnDisk(dir, it) == it.sha256 }) continue
            val cur = if (part == "data") idx.dataVersion else idx.assetsVersion
            val ok = if (patch != null && cur == patch.from) {
                installPatch(ctx, patch, "$part-patch", dir, onPhase, onZipProgress)
            } else {
                installZip(ctx, full, part, dir, onPhase, onZipProgress)
            }
            if (!ok) return false
            if (!verifyFiles(ctx, full.files, onPhase)) {
                // Vá xong mà verify fail = file local hỏng ở ngoài phạm vi vá → tự chữa full
                Log.w(TAG, "verify fail goi $part — tu chua bang full")
                if (!installZip(ctx, full, part, dir, onPhase, onZipProgress)) return false
                if (!verifyFiles(ctx, full.files, onPhase)) return false
            }
        }

        // ---------- Verify toan bo (data + assets) ----------
        if (!verifyFiles(ctx, manifest.data.files + manifest.assets.files, onPhase)) return false
        writeIndex(ctx, manifest)
        otaTmp(ctx).deleteRecursively()
        return true
    }

    /** Verify danh sach file da cai theo manifest. */
    private fun verifyFiles(
        ctx: Context,
        files: List<Entry>,
        onPhase: (String, Int, Int) -> Unit,
    ): Boolean {
        val dir = assetsDir(ctx)
        onPhase("verify", 0, files.size)
        var ci = 0
        for (e in files) {
            val f = File(dir, e.path)
            if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                Log.w(TAG, "verify install fail ${e.path}")
                return false
            }
            ci++
            if (ci % 200 == 0) {
                if (canceled) return false
                onPhase("verify", ci, files.size)
            }
        }
        return true
    }

    /**
     * Cai mot goi ZIP tai nguyen: bo qua neu cac file da dung tren dia (delta),
     * khong thi tai ZIP (resume) -> verify sha256 -> giai nen -> verify tung file
     * -> move vao dir. Loi giua chung: ZIP xong nhung hu thi xoa, .part giu lai.
     */
    private fun installZip(
        ctx: Context,
        sec: ZipPart,
        section: String,
        dir: File,
        onPhase: (String, Int, Int) -> Unit,
        onZipProgress: (String, Long, Long) -> Unit,
    ): Boolean {
        if (sec.files.all { hashOnDisk(dir, it) == it.sha256 }) return true
        val part = partFile(ctx, section)
        val zip = zipFile(ctx, section)
        val ex = extractDir(ctx, section)
        try {
            if (!downloadZip(part, zip, sec.url, sec.size) { d, t -> onZipProgress(section, d, t) }) return false
            if (canceled) return false

            onPhase("$section.verify_zip", 0, 0)
            val src = if (part.isFile) part else zip
            if (!src.isFile || src.length() != sec.size || hash(src) != sec.sha256) {
                src.delete()
                return false
            }
            if (src == part && !part.renameTo(zip)) throw IOException("rename $section zip")

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
                    if (i % 200 == 0) {
                        if (canceled) return false
                        onPhase("$section.extract", i, entries.size)
                    }
                }
            }

            onPhase("$section.files", 0, sec.files.size)
            var vi = 0
            for (e in sec.files) {
                val f = File(ex, e.path)
                if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                    throw IOException("verify extract fail ${e.path}")
                }
                vi++
                if (vi % 200 == 0) {
                    if (canceled) return false
                    onPhase("$section.files", vi, sec.files.size)
                }
            }

            onPhase("$section.install", 0, sec.files.size)
            var mi = 0
            for (e in sec.files) {
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
                    onPhase("$section.install", mi, sec.files.size)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "$section: ${e.message}")
            ex.deleteRecursively()
            zip.delete()
            part.delete()
            return false
        }
        return true
    }

    /**
     * Ap ban va: tai patch ZIP (nho) -> verify -> giai nen -> verify tung file
     * -> move de len file cu -> xoa cac file trong remove[]. Verify toan bo sau
     * do updateAll lo; index chi ghi khi verify pass — that bai thi lan sau van
     * khop patch.from de ap lai.
     */
    private fun installPatch(
        ctx: Context,
        patch: PatchPart,
        section: String,
        dir: File,
        onPhase: (String, Int, Int) -> Unit,
        onZipProgress: (String, Long, Long) -> Unit,
    ): Boolean {
        val part = partFile(ctx, section)
        val zip = zipFile(ctx, section)
        val ex = extractDir(ctx, section)
        try {
            if (!downloadZip(part, zip, patch.url, patch.size) { d, t -> onZipProgress(section, d, t) }) return false
            if (canceled) return false

            onPhase("$section.verify_zip", 0, 0)
            val src = if (part.isFile) part else zip
            if (!src.isFile || src.length() != patch.size || hash(src) != patch.sha256) {
                src.delete()
                return false
            }
            if (src == part && !part.renameTo(zip)) throw IOException("rename $section zip")

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
                    if (i % 50 == 0) {
                        if (canceled) return false
                        onPhase("$section.extract", i, entries.size)
                    }
                }
            }

            onPhase("$section.files", 0, patch.files.size)
            var vi = 0
            for (e in patch.files) {
                val f = File(ex, e.path)
                if (!f.isFile || f.length() != e.size || hash(f) != e.sha256) {
                    throw IOException("verify patch fail ${e.path}")
                }
                vi++
                if (vi % 50 == 0) {
                    if (canceled) return false
                    onPhase("$section.files", vi, patch.files.size)
                }
            }

            onPhase("$section.install", 0, patch.files.size)
            var mi = 0
            for (e in patch.files) {
                val from = File(ex, e.path)
                val to = File(dir, e.path)
                to.parentFile?.mkdirs()
                if (to.isFile) to.delete()
                if (!from.renameTo(to)) {
                    from.copyTo(to, overwrite = true)
                    from.delete()
                }
                mi++
                if (mi % 50 == 0) {
                    if (canceled) return false
                    onPhase("$section.install", mi, patch.files.size)
                }
            }

            // Xoa file bi loai bo o ban moi (chi trong game-assets, chan path traversal)
            for (rel in patch.remove) {
                if (rel.split('/').any { it == ".." || it == "." }) return false
                File(dir, rel).delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "$section: ${e.message}")
            ex.deleteRecursively()
            zip.delete()
            part.delete()
            return false
        }
        return true
    }

    /**
     * Tai ZIP co resume: .part ton tai thi gui Range bytes=N- ghi tiep; server tra
     * 200 thi tai lai tu dau. Giu .part qua cac lan that bai de "Thử lại" tai tiep.
     */
    private fun downloadZip(
        part: File,
        done: File,
        url: String,
        size: Long,
        onProgress: (Long, Long) -> Unit,
    ): Boolean {
        part.parentFile?.mkdirs()
        if (done.isFile) return true
        var start = if (part.isFile) part.length() else 0L
        if (start > size) {
            part.delete()
            start = 0L
        }
        val req = Request.Builder().url(url)
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
                            onProgress(total, size)
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
        return part.length() == size
    }

    fun writeIndex(ctx: Context, manifest: Manifest) {
        val files = JSONObject()
        for (e in manifest.data.files + manifest.assets.files) files.put(e.path, e.sha256)
        val obj = JSONObject()
        obj.put("resVersion", manifest.version)
        obj.put("dataVersion", manifest.data.sha256)
        obj.put("assetsVersion", manifest.assets.sha256)
        obj.put("files", files)
        indexFile(ctx).writeText(obj.toString())
    }

    /**
     * Xoa toan bo du lieu da tai (data + index + bo tam) — lan mo sau di nhanh
     * nhu lan chay dau, tai lai tu dau. Khong dong gi den asset bundle trong APK
     * (van la fallback khi doc file).
     */
    fun resetInstalled(ctx: Context) {
        assetsDir(ctx).deleteRecursively()
        indexFile(ctx).delete()
        otaTmp(ctx).deleteRecursively()
    }

    /**
     * Tai APK ban cap nhat ve cache/apk-update (dung lai downloadZip — resume duoc,
     * bao tien do qua onProgress; dut giua chung giu .part, lan sau tai tiep).
     * File da tai dung dung luong tu lan truoc thi tra ngay de cai lai khong phai tai.
     * Tra null neu loi.
     */
    fun downloadApk(ctx: Context, url: String, size: Long, onProgress: (Long, Long) -> Unit): File? {
        canceled = false
        val dir = File(ctx.cacheDir, "apk-update").apply { mkdirs() }
        val name = url.substringAfterLast('/')
        val part = File(dir, "$name.part")
        val done = File(dir, name)
        if (done.isFile && done.length() == size) return done
        // part đã đủ dung lượng (lần tải trước đứt ngay trước khi rename, hoặc HTTP 416
        // khi resume từ cuối file) → bỏ qua bước tải, chỉ đổi tên
        if (!part.isFile || part.length() != size) {
            val ok = downloadZip(part, done, url, size) { d, t -> onProgress(d, t) }
            if (!ok && (part.length() != size)) return null
        }
        if (!part.renameTo(done)) { part.copyTo(done, overwrite = true); part.delete() }
        return if (done.isFile && done.length() == size) done else null
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
