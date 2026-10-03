# Thiết kế cập nhật App Android — Võ Lâm Idle

- Ngày lập: 2026-10-03
- Trạng thái: **bản thiết kế chờ duyệt, chưa triển khai**
- Phạm vi: (A) hoàn thiện & phát hành WIP v1.2.0 — OTA manifest v3; (B) tính năng mới v1.3.0 — audio focus, hỏi trước khi tải qua dữ liệu di động, tự động sao lưu save, hoàn thiện màn hình tải.

---

## 1. Hiện trạng

### 1.1 WIP v1.2.0 đang nằm trong working tree (chưa commit)

Working tree của repo có 6 file sửa **chưa commit** — là một phiên WIP v1.2.0 dở dang từ phiên làm việc trước:

| File | Nội dung WIP |
|---|---|
| `OtaManager.kt` | Viết lại theo **manifest v3**: `media` (ZIP đính kèm Release, version = zipSha256) + `code` (54 file index.html/js/fonts/ui tải **per-file** qua raw.githubusercontent, delta theo hash, retry 3 lần, staging rồi move). Có sẵn `fetchLatestRelease()` check APK mới. |
| `MainActivity.kt` | Dòng phiên bản "App vX · Game <hash8> · Tài nguyên <hash8>" trên màn hình tải; nút **"Cập nhật app vX.Y.Z"** (không chặn vào game, bấm mở link Release); luồng `runUpdate` thống nhất qua `OtaManager.updateAll()`. |
| `activity_download.xml` | Thêm `otaVersions` (dòng phiên bản) + `otaApk` (nút cập nhật app). |
| `assets-manifest.json` | Đã regenerate theo v3 — nhưng **zipUrl trỏ server test local** `http://10.0.2.2:8000/ota-assets-1.2.0.zip`. |
| `build.gradle.kts` | versionCode 5 / versionName **1.2.0**. |
| `tools/make_ota_manifest.py` | Sinh manifest v3; ZIP media **deterministic** (timestamp cố định) → media không đổi thì zipSha256 không đổi → app đang cài bỏ qua tải lại media. |

**Điểm quan trọng của WIP:** code JS giờ cập nhật được **qua OTA per-file** (sha256 ghim trong manifest, commit lên repo) — giải quyết luôn điểm yếu cũ "đổi 1 dòng JS phải cài lại APK". Chỉ khi đổi code Kotlin mới cần phát hành APK.

### 1.2 Việc còn sót của WIP (phải làm trước khi phát hành)

1. `OtaManager.kt:29` — `MANIFEST_URL` đang là `http://10.0.2.2:8000/...` kèm chú thích "TEST LOCAL — revert trước khi build release".
2. `assets-manifest.json` — zipUrl trỏ server test local (tool luôn sinh URL production, file hiện tại là bản sửa tay để test).
3. Chưa E2E lại trên emulator với luồng production, chưa commit, chưa release.
4. README còn ghi chính sách cũ "Code JS không bao giờ qua OTA" — giờ **sai**, phải viết lại (mục 3.4).
5. `CODE_CONCURRENCY = 4` được khai báo nhưng **không được dùng** — vòng tải code chạy tuần tự (mục 3.3).

### 1.3 Cơ chế save của game (điều tra cho F3)

Từ `game/js/save.js` + `main.js`:

- 3 slot nhân vật: key `jxidle` (slot 0, tương thích bản cũ), `jxidle_2`, `jxidle_3`; mỗi slot có bản `_bak` (bản hợp lệ ngay trước đó).
- Con trỏ `jxidle_slot` = `'0'/'1'/'2'` (đang chơi) hoặc `'menu'` (màn chọn nhân vật); **null = chưa có dữ liệu nào**.
- Tùy chọn UI: `jxidle_ui` (`UI_KEY`, main.js:5).
- Game tự `save()` mỗi ~10s và khi ẩn app / `pagehide`.
- **Mọi key của game đều có tiền tố `jxidle`** → snapshot toàn bộ key có tiền tố này là đủ để phục hồi hoàn toàn (cả 3 slot + UI).
- Game hỗ trợ offline progress (tính từ `S.last`, tối đa 8h) nên khôi phục xong không mất tiến trình ngoài `S.last`.

### 1.4 Đối chiếu với 5 đề xuất ban đầu

| Đề xuất | Trạng thái | Mục |
|---|---|---|
| 1. Audio focus (cuộc gọi) | Chưa có | F1 — mục 4 |
| 2. Hỏi trước khi tải OTA qua data di động | Chưa có | F2 — mục 5 |
| 3. Tự động sao lưu save | Chưa có | F3 — mục 6 |
| 4. Thông báo APK mới | **WIP đã làm** (nút "Cập nhật app") | Hoàn thiện kèm Giai đoạn A |
| 5. Màn hình tải: hủy + thông tin | WIP làm một phần (dòng phiên bản) | F4 — mục 7 (còn thiếu: Hủy, Xóa dữ liệu) |
| — (phát sinh) OTA code per-file | WIP đã làm | Giai đoạn A |

---

## 2. Phạm vi & giai đoạn triển khai

```
Giai đoạn A — v1.2.0 "OTA v3": phát hành đúng WIP, không nhồi thêm tính năng
  A1 Revert URL test          (mục 3.1)
  A2 Tái sinh manifest production                    (mục 3.2)
  A3 Song song hóa tải code (CODE_CONCURRENCY)       (mục 3.3)
  A4 README + quy trình phát hành mới                (mục 3.4)
  A5 E2E + commit + release v1.2.0                   (mục 3.5)

Giai đoạn B — v1.3.0 "tính năng mới":
  F1 Audio focus              (mục 4)
  F2 Hỏi trước khi tải qua data di động              (mục 5)
  F3 Tự động sao lưu save + khôi phục                (mục 6)
  F4 Hủy tải + Xóa dữ liệu đã tải                    (mục 7)
```

**Lý do tách 2 giai đoạn:** WIP v1.2.0 là rework lớn của luồng OTA, chưa từng chạy production — phát hành riêng để giới hạn rủi ro; F1–F4 đụng vào đúng luồng đó (dialog, hủy, audio) nên làm sau khi v1.2.0 đã ổn. Nếu muốn gộp 1 release cũng được, nhưng không khuyến khích.

---

## 3. Giai đoạn A — hoàn thiện & phát hành v1.2.0

### A1. Revert URL test

`OtaManager.kt:28-29` → trả về:

```kotlin
private const val MANIFEST_URL =
    "https://raw.githubusercontent.com/TanNhatCMS/volam-idle-android/main/assets-manifest.json"
```

Giữ nguyên `FILES_URL` (đã đúng production) và `RELEASES_API`.

### A2. Tái sinh manifest production

```bash
python tools/make_ota_manifest.py --version 1.2.0
```

Tool sinh `zipUrl` từ `ZIP_URL_BASE` (production) — file manifest hiện tại trong working tree được đè bằng bản URL đúng. Kiểm tra sau khi chạy: `zipUrl` có đuôi `.../releases/download/v1.2.0/ota-assets-1.2.0.zip`, `code.version` khớp sha256 danh sách file. ZIP sinh deterministic nên nếu media không đổi, `media.zipSha256` giữ nguyên — người dùng đã cài không phải tải lại 115MB.

### A3. Song song hóa tải code (dùng lại CODE_CONCURRENCY)

Vòng tải code hiện **tuần tự** (54 file × RTT). Đổi thành `ExecutorService` fixed-pool 4 + `CountDownLatch`, giữ nguyên từng file: tải → verify hash → rename trong staging; entry pending và callback `onPhase` đếm atomic. Bất đồng bộ nhẹ, rút từ ~1 phút xuống ~15s. Giữ sequential làm fallback nếu gặp vấn đề (cờ `CODE_CONCURRENCY = 1`).

### A4. README + quy trình phát hành mới

Sửa mục "Cơ chế OTA assets" + "Quy trình phát hành":

- **Chính sách mới:** APK chỉ chứa bản code dự phòng (fallback). Code thật sự chạy = code đã OTA (ưu tiên `files/game-assets`). Mọi file (code + media) đều ghim sha256 trong manifest, manifest commit lên repo — **không có kịch bản tải code không kiểm tra hash**.
- **Quy trình 3 kịch bản:**
  1. *Chỉ sửa game (JS/data/assets)*: `make_ota_manifest.py --version X` → commit + push manifest → **người dùng tự nhận update lần mở app sau, không cần APK mới**.
  2. *Thêm/sửa media*: như trên + đính kèm ZIP OTA mới vào Release `vX`.
  3. *Sửa code Kotlin/native*: bump versionCode/Name → `assembleRelease` → release `vX` kèm APK (app tự báo qua nút "Cập nhật app").
- Ghi chú raw.githubusercontent có cache CDN ~5 phút — bản update game có thể trễ vài phút sau khi push (chấp nhận được).

### A5. E2E + release v1.2.0

Trên emulator Bdb_API_35 (build qua Bash background, không dùng MCP 30s):

1. **Lần chạy đầu (có mạng):** cài APK sạch → tải code (54 file) + media (ZIP) → verify → vào game → dòng phiên bản hiện "Game/Tài nguyên <hash8>".
2. **Mở lại (online):** lên thẳng game < 3s (fast path size-check).
3. **Mở lại (offline):** bật airplane mode → vẫn vào game (đã có bộ cũ).
4. **Update game:** sửa 1 dòng JS trong `game/js/` → regenerate manifest → commit + push → mở app → "Cập nhật game n/54 file…" → vào game thấy thay đổi (không cài APK).
5. **Nút "Cập nhật app":** hiện khi versionName < tag Release mới nhất; bấm mở trang Release.
6. Build `assembleRelease`, ký keystore `volam-idle`, `gh release create v1.2.0 app-release.apk ota-assets-1.2.0.zip`.

---

## 4. F1 — Audio focus (cuộc gọi, app nhạc khác)

### Mục tiêu

Khi có cuộc gọi đến, báo thức, hoặc người dùng mở app nhạc khác rồi quay lại — game không tự động im/tối ưu theo chuẩn Android; hiện chỉ im khi activity thật sự pause (v1.1.2). F1 xử lý đúng cơ chế **audio focus**.

### Hành vi

| Sự kiện | Phản ứng của game |
|---|---|
| Mở app / quay lại foreground | `requestAudioFocus(AUDIOFOCUS_GAIN)` — nhạc app khác tự dừng, game phát theo cài đặt âm thanh của game |
| Cuộc gọi đến / nhạc app khác phát (`LOSS`, `LOSS_TRANSIENT`) | Suspend `AUD.ctx` + pause `AUD.music` (như v1.1.2) |
| Thông báo ping ngắn (`LOSS_TRANSIENT_CAN_DUCK`) | **Duck**: hạ `AUD.music.volume` về 0.15, giữ SFX |
| Nhận lại focus (`AUDIOFOCUS_GAIN`) | Resume + `audApply()` — audApply trả volume đúng theo cài đặt trong game (game tắt nhạc thì vẫn im) |

Không thêm permission (audio focus không cần). Không đụng `AUDIO_PAUSE_JS`/`AUDIO_RESUME_JS` hiện có — tái dùng đúng 2 snippet đó.

### Kỹ thuật — `MainActivity.kt`

```kotlin
private val focusListener = AudioManager.OnAudioFocusChangeListener { f ->
    val js = when (f) {
        AudioManager.AUDIOFOCUS_GAIN -> AUDIO_RESUME_JS
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> AUDIO_DUCK_JS
        else -> AUDIO_PAUSE_JS   // LOSS, LOSS_TRANSIENT
    }
    runOnUiThread { if (gameStarted) webView.evaluateJavascript(js, null) }
}

override fun onResume() {   // gameStarted
    requestFocus()          // API 26+: AudioFocusRequest(USAGE_GAME, AUDIOFOCUS_GAIN); API 24-25: API deprecated
    ...
}
override fun onPause() {    // gameStarted
    audioManager.abandonAudioFocus(focusListener)   // sau AUDIO_PAUSE_JS
    ...
}
```

Thêm `AUDIO_DUCK_JS`:

```js
try{if(typeof AUD!=='undefined'){AUD.music&&!AUD.music.paused&&(AUD.music.volume=0.15);}}catch(e){}
```

Chi tiết:
- `AudioAttributes.Builder().setUsage(USAGE_GAME).setContentType(USAGE.../CONTENT_TYPE_MUSIC)` cho `AudioFocusRequest` (minSdk 24 → `USAGE_GAME` có từ API 21, OK).
- Request focus **trước** `AUDIO_RESUME_JS` trong `onResume`; khi `requestAudioFocus` trả `AUDIOFOCUS_REQUEST_GRANTED` thì resume (tránh phát đè khi chưa có focus). Đơn giản hóa được: resume luôn — `audApply` tự tôn trọng cấu hình game.
- Không xử lý `AUDIOFOCUS_LOSS` "vĩnh viễn" đặc biệt: mất focus rồi app quay lại là `onResume` request lại → hành vi chuẩn.

### Trường hợp biên

- Người dùng tắt nhạc trong game, mở Spotify để nghe trong lúc chơi → game vẫn request focus (Spotify dừng). Chấp nhận: đây là hành vi chuẩn foreground app; muốn nghe nhạc riêng thì game phải có tùy chọn "nhường audio" — **không làm trong đợt này** (ghi ở mục 9).
- Cuộc gọi đến khi app ở background: activity đã pause từ trước, audio đã im — focus listener không cần chạy.
- `runOnUiThread` khi activity đang destroy: guard `gameStarted` + `isFinishing` nếu cần; evaluateJavascript trên webView đã destroy sẽ crash → bọc try hoặc check `::webView.isInitialized`.

### Kiểm chứng

1. `adb shell dumpsys audio` → mục "audio focus" của uid app khi foreground.
2. Mở YouTube/Music phát nhạc → mở game → nhạc ngoài dừng, game phát.
3. Trong game phát nhạc → có cuộc gọi simulator (`adb emu gsm call <số>`) → nhạc game im; kết thúc cuộc gọi (`adb emu gsm cancel`) → nhạc game phát lại.
4. Thông báo test (duck) → nhạc game nhỏ xuống, không dừng hẳn.

---

## 5. F2 — Hỏi trước khi tải qua dữ liệu di động

### Mục tiêu

Hiện `runUpdate` tải ngay khi thấy manifest mới — kể cả 115MB lần đầu trên 4G. F2 thêm cổng xác nhận khi mạng **đang đo lượng** (metered), không đổi gì khi Wi-Fi.

### Hành vi

- **Wi-Fi / không đo lượng:** hành vi hiện tại — tải tự động, không hỏi.
- **Data di động + đã có bộ cũ (update):** dialog —

  > **Có bản cập nhật game mới (~X MB)**
  > Tải qua mạng di động?
  > [Để sau] — vào game với bộ đã cài
  > [Tải ngay]

- **Data di động + lần chạy đầu (chưa có gì):** dialog bắt buộc —

  > **Lần đầu chạy cần tải ~X MB dữ liệu game**
  > Qua mạng di động có thể mất phí dữ liệu.
  > [Tải ngay]  [Thoát] — thoát = `moveTaskToBack(true)`

- X là `media.zipSize + code.totalBytes` (trần, ~MB, làm tròn lên).

### Kỹ thuật

- `AndroidManifest.xml`: thêm `<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`.
- `startOtaFlow()` — nhánh `else -> runUpdate(...)` đổi thành:

```kotlin
else -> if (isMetered()) confirmMeteredDownload(ui, manifest, idx) else runUpdate(ui, manifest)

private fun isMetered(): Boolean =
    (getSystemService(ConnectivityManager::class.java))?.isActiveNetworkMetered ?: false
```

- `confirmMeteredDownload` dùng `android.app.AlertDialog` (framework, không cần thêm dependency appcompat — activity là `ComponentActivity`, dialog theo theme hiện có). Hai nhãn dialog khác nhau theo `idx.codeVersion == null && idx.mediaVersion == null` (lần đầu) hay không.
- "Để sau" → `startGame()` với bộ đã cài (bộ cũ vẫn complete vì `updateAll` chỉ ghi index sau khi cài xong toàn bộ; trước đó game-assets là tập hợp hoàn chỉnh của lần cài trước).
- **Không thêm tùy chọn "nhớ lựa chọn"** trong đợt này (mục 9 — quyết định mở). Mỗi lần update trên data sẽ hỏi 1 lần — thỏa hiệp an toàn/gây_phiền chấp nhận được với update hiếm.

### Trường hợp biên

- Dialog đang mở thì mạng chuyển Wi-Fi: vẫn hiển thị theo lúc kiểm tra — bấm "Tải ngay" là tải (đúng ý).
- Mất mạng trong lúc dialog mở: bấm "Tải ngay" → `runUpdate` fail → màn lỗi "Thử lại" như cũ.
- `configChanges` đã khai báo đủ nên xoay máy không dựng lại dialog; process bị kill khi background → onCreate chạy lại flow từ đầu (chấp nhận).

### Kiểm chứng

1. Nhánh isMetered: emulator Wi-Fi ảo khó ép metered thật → test bằng cách tạm hardcode `isMetered() = true` ở bản debug build riêng (hoặc build variant debug + `BuildConfig` flag), xác nhận dialog + 2 nhánh nút; **trước khi release bỏ hardcode**.
2. Wi-Fi (emulator mặc định): không hiện dialog, tải thẳng.
3. "Để sau" trên máy đã có bộ cũ: vào game bình thường, lần mở sau vẫn hỏi lại (đúng thiết kế).

---

## 6. F3 — Tự động sao lưu save + khôi phục

### Mục tiêu

Save nằm 100% trong localStorage của WebView — gỡ app / "xóa dữ liệu" / WebView hỏng là mất trắng. `_bak` của game vẫn nằm trong localStorage nên không cứu được. F3 chụp **snapshot toàn bộ localStorage của game** ra file riêng trong `filesDir/` mỗi lần ẩn app, và **tự đề nghị khôi phục** khi phát hiện dữ liệu trống.

### Thiết kế dữ liệu

- **Snapshot:** toàn bộ key localStorage có tiền tố `jxidle` (slot 1-3 + `_bak` + `jxidle_slot` + `jxidle_ui`) — phủ đầy đủ vì mọi key của game đều có tiền tố này (mục 1.3).
- **File:** `filesDir/backup/auto_<yyyyMMdd_HHmmss>.json`, nội dung:

```json
{ "v": 1, "when": 1759459200000, "keys": { "jxidle_slot": "0", "jxidle": "{...pack()...}", "..._bak": "...", "jxidle_ui": "..." } }
```

- Giữ **5 bản gần nhất**, xóa bản cũ sau khi ghi mới. Kích thước mỗi bản ~vài trăm KB (tệ nhất ~1-2MB khi kho đồ đầy) → tối đa ~10MB, chấp nhận.
- **Bỏ qua ghi nếu nội dung trùng bản trước** (so sha256 chuỗi snapshot) — tránh ghi file khi user chỉ bật/tắt màn hình liên tục.

### Hành vi — backup

- **Kích hoạt:** trong `onPause()` khi `gameStarted`, **trước** `webView.onPause()/pauseTimers()` (JS phải chạy trước khi renderer ngừng).
- JS inject `BACKUP_SNAPSHOT_JS` (chạy 1 lần qua `evaluateJavascript`, không gắn listener):

```js
(function(){
  try {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('jxidle') === 0) out[k] = localStorage.getItem(k);
    }
    if (window.AndroidSave) AndroidSave.autoBackup(JSON.stringify({v:1, when:Date.now(), keys:out}));
  } catch(e){}
})();
```

- Bridge `SaveBridge.autoBackup(json: String)` → ghi file trên **thread nền** (thread pool có sẵn hoặc `Thread`): parse JSON, so hash với bản trước, ghi + prune. Ghi file nội bộ, không cần permission.

### Hành vi — khôi phục

- **Phát hiện:** `onPageFinished` (sau `SAVE_HOOK_JS`) inject `RESTORE_CHECK_JS`:

```js
try{ if (localStorage.getItem('jxidle_slot') === null && window.AndroidSave) AndroidSave.checkRestore(); }catch(e){}
```

  `jxidle_slot === null` ⇔ máy trống (cài mới / mất dữ liệu). Máy đang có save **không bao giờ bị đụng tới** tự động.
- Bridge `checkRestore()` → tìm bản backup mới nhất → nếu không có: no-op. Nếu có và **chưa từng bị từ chối** (xem dưới) → dialog:

  > **Phát hiện máy chưa có dữ liệu game**
  > Khôi phục từ bản sao lưu tự động lúc 14:30 ngày 03/10?
  > [Bỏ qua]  [Khôi phục]

- **Khôi phục:** đọc file → `evaluateJavascript` ghi lần lượt từng key (`localStorage.setItem(k, <JSON-quoted value>)` qua `JSONObject.quote`) rồi `location.reload()` → game load đúng slot con trỏ, tính offline progress từ `S.last`.
- **Bỏ qua:** lưu `SharedPreferences("vl_backup")` key `declined_<tên file>` — không hỏi lại với **cùng bản backup đó** (tránh vòng lặp mỗi lần mở app). Bản backup mới hơn (người chơi lại từ đầu vài ngày rồi lại mất dữ liệu) sẽ được hỏi lại.
- Giới hạn hỏi 1 lần/mở app; chỉ hỏi khi game vừa load xong.

### Tương tác với tính năng có sẵn

- Export/nạp file `.jxsave` qua SAF **giữ nguyên** — F3 là lưới an toàn thụ động, không thay kênh chủ động của người chơi. File backup JSON **không** nạp được qua "Nạp từ file" của game (định dạng khác có chủ đích: khôi phục đa slot).
- `android:allowBackup="true"` (manifest): file backup nằm trong filesDir → có thể đi kèm Android auto-backup lên Google — chỉ là bonus, không dựa vào.

### Trường hợp biên

- Backup giữa chừng process bị kill: file .json ghi tạm `*.tmp` rồi rename — không có file dở.
- localStorage bị cấm (cheat chế độ riêng tư — try/catch trong JS đã bọc): không backup, không crash.
- Snapshot khi chưa vào game (màn hình tải): không chạy — chỉ backup khi `gameStarted`.
- Bản backup hỏng (JSON sai): parse fail → thử bản cũ hơn; không có bản nào hợp lệ → không hiện dialog.
- Người chơi cố tình chơi lại từ đầu: tạo slot mới → lần background sau backup mới ghi đè dần; nếu sau đó mất dữ liệu, dialog khôi phục bản **mới nhất** (đúng ý).
- WebStorage của WebView lưu ở `app_webview/` — `pm clear` xóa cả backup? **Không**: `pm clear` xóa toàn bộ filesDir (kể cả backup). F3 cứu được "xóa dữ liệu của WebView / hỏng localStorage", **không** cứu được `pm clear` hay gỡ app. Đây là giới hạn chấp nhận (đã có kênh export `.jxsave` chủ động cho di trú thiết bị).

### Kiểm chứng (E2E — bài test quan trọng nhất)

1. Chơi đến khi có save (1 slot có nhân vật, thẻ Khác hiện tiến trình) → nhấn Home → `adb shell run-as vn.name.mrkiet.volam ls files/backup/` thấy `auto_*.json`, nội dung chứa `jxidle_slot`.
2. Background 5 lần liên tiếp → không sinh thêm file trùng nội dung (hash-skip).
3. **Mất dữ liệu thật:** `adb shell pm clear vn.name.mrkiet.volam`... *(lưu ý: pm clear xóa cả backup — bài test phải dùng cách mất dữ liệu khác)* → đúng kịch bản test là: cài lại bản mới giữ data (adb install -r) + xóa riêng webview storage qua app: `adb shell run-as ... rm -rf app_webview` (cần process đã kill) → mở app → dialog khôi phục → "Khôi phục" → game vào đúng slot cũ.
4. "Bỏ qua" → tắt mở lại → **không** hỏi lại; xóa backup cũ, tạo backup mới → hỏi lại.
5. Máy có save bình thường → mở app không bao giờ hiện dialog khôi phục.

---

## 7. F4 — Màn hình tải: nút Hủy + Xóa dữ liệu đã tải

### 7.1 Nút Hủy (khi đang tải)

**Hành vi:** nút "Hủy" hiện thay thế/kề bên "Thử lại" trong lúc `runUpdate` chạy. Bấm → dừng tải, **giữ `.part`** (resume sau), trạng thái:

> Đã dừng tải. Bấm Thử lại để tải tiếp từ chỗ dừng.

Phạm vi hủy: **trong lúc tải** (ZIP media + per-file code). Các bước verify/giải nén (vài chục giây) không hủy giữa chừng — nút mờ đi kèm status "Đang xử lý…".

**Kỹ thuật — `OtaManager.kt`:**

```kotlin
@Volatile private var canceled = false
private var activeCall: Call? = null
fun cancelUpdate() { canceled = true; activeCall?.cancel() }
fun resetCancel() { canceled = false }
```

- `updateAll()` đầu hàm: `canceled = false` (mỗi lần chạy mới — hoặc MainActivity gọi `resetCancel()` trước).
- `downloadZip`: gán `activeCall = http.newCall(...)` rồi `activeCall!!.execute()`; vòng đọc buffer kiểm tra `canceled` mỗi chunk → thoát → `return false`. OkHttp `Call.cancel()` tự làm `execute()`/`read()` ném `IOException` — bắt là xong, `.part` giữ nguyên.
- Vòng code per-file: kiểm tra `canceled` đầu mỗi file và đầu mỗi lần retry → `return false`.
- Các vòng verify/install media: kiểm tra `canceled` mỗi 200 file → `return false` (giữ mọi thứ nguyên trạng; index chưa ghi).
- Trả về với cờ phân biệt: thêm `var lastRunCanceled` (hoặc hàm `wasCanceled()`), `MainActivity` dùng nó để chọn thông báo "Đã dừng" thay vì "Thất bại".

**UI — `activity_download.xml`:** thêm `otaCancel` (Button, visibility gone mặc định). `runUpdate`: hiện khi bắt đầu, ẩn khi xong/lỗi.

### 7.2 Nút "Xóa dữ liệu đã tải"

**Hành vi:** text-button nhỏ dưới dòng phiên bản (luôn hiện khi không đang update). Bấm → dialog xác nhận:

> Xóa toàn bộ dữ liệu game đã tải (code + tài nguyên)? Lần chạy sau sẽ tải lại từ đầu.
> [Hủy]  [Xóa]

Xong → về màn hình "Đang kiểm tra…" (chạy lại `startOtaFlow`) → vì không còn index → đi nhánh tải như lần đầu (có F2 thì hỏi trước nếu metered).

**Kỹ thuật:**

```kotlin
fun resetInstalled(ctx: Context) {
    assetsDir(ctx).deleteRecursively()
    File(ctx.filesDir, "ota-index.json").delete()
    otaTmp(ctx).deleteRecursively()
}
```

Không đụng asset bundle trong APK (vẫn là fallback). Disable nút trong lúc đang update. Use case: cài hỏng nghiêm trọng muốn sạch tay, hoặc đổi ý muốn thu hồi 115MB bộ nhớ.

### Kiểm chứng

1. Bấm Hủy khi đang tải ZIP → tải dừng ngay, `.part` còn → Thử lại → status bắt đầu từ % đã tải (resume chạy đúng).
2. Bấm Hủy trong pha tải code → dừng giữa danh sách file, Thử lại → tiếp tục các file còn thiếu (delta đã đúng từ trước).
3. Hủy trong verify/giải nén → nút mờ, hoàn tất pha rồi mới dừng.
4. Xóa dữ liệu → dòng phiên bản về "Game — · Tài nguyên —", lần chạy sau tải lại toàn bộ.

---

## 8. Checklist kiểm chứng tổng hợp v1.3.0

Trên emulator Bdb_API_35 + build debug (`./gradlew.bat assembleDebug`, Bash background):

| # | Bài test | Kỳ vọng |
|---|---|---|
| 1 | Cài sạch, có mạng (Wi-Fi) | Tải code+media → vào game |
| 2 | Cài sạch, mạng metered (hardcode flag debug) | Dialog ~X MB → "Tải ngay" tải / "Thoát" về home |
| 3 | Đã có bộ cũ + manifest mới + metered | Dialog update → "Để sau" vào game bộ cũ |
| 4 | Airplane mode, đã có bộ cũ | Vào game thẳng |
| 5 | Hủy tải giữa chừng + Thử lại | Resume từ .part |
| 6 | Cuộc gọi mô phỏng khi game phát nhạc | Nhạc im → gọi xong phát lại |
| 7 | Nhạc app khác → mở game | Nhạc ngoài dừng |
| 8 | Background → files/backup có snapshot | run-as ls thấy file |
| 9 | Mất webview storage → mở app | Dialog khôi phục → state đúng slot cũ |
| 10 | "Bỏ qua" khôi phục | Không hỏi lại cùng bản backup |
| 11 | Update JS qua OTA (sửa 1 dòng) | Vào game thấy thay đổi, không cài APK |
| 12 | Nút "Cập nhật app" | Hiện đúng khi có release mới, mở link |
| 13 | Export `.jxsave` + nạp lại (kĩ năng cũ) | Vẫn hoạt động — không bị F3 phá |

---

## 9. Rủi ro & quyết định mở

| # | Vấn đề | Quyết định trong thiết kế này | Ghi chú |
|---|---|---|---|
| 1 | Code JS giờ đi qua OTA (khác chính sách cũ "code không bao giờ qua OTA") | Chấp nhận — mọi file ghim sha256 trong manifest commit lên repo | F3 không liên quan; README viết lại (A4) |
| 2 | raw.githubusercontent cache ~5 phút | Chấp nhận trễ | Không cần CDN riêng |
| 3 | "Nhớ lựa chọn" cho dialog data di động | Không làm đợt này | Nếu khó chịu sẽ thêm pref "Tải tự động cả khi data di động" |
| 4 | Request audio focus mỗi lần onResume làm dừng nhạc app khác kể cả khi game tắt tiếng | Chấp nhận (chuẩn foreground) | Tùy chọn "nhường audio" nếu có yêu cầu |
| 5 | F3 không cứu `pm clear`/gỡ app (backup cũng nằm trong internal storage) | Chấp nhận — kênh chủ động `.jxsave` cho di trú | Không đưa backup ra shared storage (rác + permission) |
| 6 | `pm clear` xóa cả backup → bài test E2E #9 phải dùng cách xóa riêng `app_webview` | Đã ghi trong mục 6 | — |
| 7 | WIP v1.2.0 chưa từng chạy production | Phát hành riêng trước (Giai đoạn A) | Không nhồi F1–F4 vào v1.2.0 |
| 8 | Dialog framework `android.app.AlertDialog` trên `ComponentActivity` | OK — activity theme truyền thống | Nếu muốn style đẹp hơn thì thêm appcompat (không cần thiết) |

---

## 10. Việc cần làm khi triển khai (tóm tắt)

**Giai đoạn A — v1.2.0:**
1. Revert `MANIFEST_URL` (OtaManager.kt:28-29)
2. `python tools/make_ota_manifest.py --version 1.2.0` → kiểm tra zipUrl production
3. Song song hóa tải code (CODE_CONCURRENCY = 4)
4. README: chính sách OTA mới + quy trình 3 kịch bản
5. E2E (mục 3.5) → commit → `gh release create v1.2.0 app-release.apk ota-assets-1.2.0.zip`

**Giai đoạn B — v1.3.0:**
1. F1 audio focus (mục 4)
2. F2 metered confirm + permission ACCESS_NETWORK_STATE (mục 5)
3. F3 auto-backup + khôi phục (mục 6)
4. F4 hủy tải + xóa dữ liệu (mục 7)
5. Bump versionCode 6 / versionName 1.3.0 → E2E checklist mục 8 → release
