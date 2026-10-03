# Võ Lâm Idle — Android

**Võ Lâm Idle** là game võ hiệp thể loại idle (tự động) chạy hoàn toàn trên thiết bị của bạn: nhân vật tự đi, tự đánh, tự nhặt đồ — cứ để game luyện công, muốn tay nghề thì cầm lái lúc nào cũng được. Tiến trình lưu tại máy, không quảng cáo, không thanh toán — đúng tinh thần game tự giới thiệu: *"Phi thương mại, ưu tiên giải trí trên chính thiết bị của mình"*.

## Giới thiệu game

- **Hành tẩu tự động** — nhân vật tự đánh quái, tự nhặt đồ, tự uống thuốc và vượt ải. Có joystick để tự điều khiển khi muốn, nút ⚙ Tự động để quay lại chế độ idle.
- **10 môn phái, 5 hành** — Thiếu Lâm, Thiên Vương Bang, Đường Môn, Ngũ Độc Giáo, Nga My, Thúy Yên, Cái Bang, Thiên Nhẫn, Võ Đang, Côn Lôn; thuộc Kim–Mộc–Thủy–Hỏa–Thổ tương sinh tương khắc.
- **Trang bị thông minh** — đồ rơi trên đất, nhân vật tự nhặt món khớp bộ lọc và tự mặc món mạnh hơn (tắt được); bấm vào món để xem so sánh sức mạnh chi tiết.
- **Cộng điểm có gợi ý** — mỗi cấp nhận điểm tiềm năng và điểm kỹ năng; cộng/rút thoải mái, có bản xem trước cách cộng hiệu quả.
- **Rèn đồ 3 chặng** — Tím (hợp Huyền Tinh từ nhẫn/dây chuyền/ngọc bội rồi khảm), Hoàng Kim (gom mảnh từ trùm) và Bạch Kim; bật "Tự động rèn đồ" nếu không muốn bấm tay.
- **Luyện Công (sinh tồn)** — chế độ sống sót 10 phút, dùng tuyệt kỹ, bom và bình HP đúng lúc.
- **Thế giới theo cấp** — bản đồ luyện công nhiều vùng (Hoa Sơn Cấp 1–10, Kiếm Các Tây Bắc 10–20, Tân Lãng 20–30, Kiếm Các Tây Nam 30–40...), thành phố với cửa hàng và kho chung, quái trùm, nhiệm vụ, thành tựu và điểm danh quà 🎁.
- **Đa nhân vật & sao lưu** — nhiều slot save với bản backup tự động, xuất/nhập file lưu để chơi tiếp trên thiết bị khác.

---

App là một cái vỏ WebView gọn (~11MB): phần **code game bundle trong APK**, phần **media (~115MB) tải qua OTA** từ GitHub Release lần chạy đầu, sau đó **chơi offline 100%**.

## Build

Yêu cầu: JDK 17, Android SDK (API 35). Gradle wrapper (8.10.2) đã kèm theo — không cần cài Gradle.

```bash
./gradlew.bat assembleDebug   # Windows
./gradlew assembleDebug       # Linux/macOS
```

APK ra tại `app/build/outputs/apk/debug/app-debug.apk`. Bản release:

```bash
./gradlew.bat assembleRelease
```

Bản `release` được ký bằng keystore tại `keystore/` với thông số trong `keystore.properties` — cả hai **gitignored, không commit**; thiếu file này thì `assembleRelease` tự fallback sang debug signing. **Sao lưu cẩn thận keystore + mật khẩu** (bản backup tại repo private `android-keystores`): mất keystore thì các bản cập nhật sau không giữ được chữ ký cũ.

## Cơ chế OTA assets

APK chỉ chứa code game (index.html, js, data.js, fonts, ui). Media (img, snd, music, fx) được tải qua OTA:

1. App đọc `assets-manifest.json` ở **gốc repo** (qua `raw.githubusercontent.com`) — file này khai báo ZIP OTA (URL kèm GitHub Release), sha256 + size của ZIP, và hash SHA-256 của từng file.
2. Lần chạy đầu: tải ZIP về **bộ tạm** `cache/ota/ota.zip.part` — **tự resume** bằng HTTP Range nếu đứt giữa chừng (giữ `.part` qua các lần retry; server không hỗ trợ Range thì tải lại từ đầu).
3. Verify sha256 ZIP sau khi tải → giải nén ra tạm → **verify từng file** theo manifest → move vào `files/game-assets` → **verify lại toàn bộ sau khi cài** → dọn bộ tạm.
4. Các lần mở sau: chỉ check nhanh (so version + size file), vào game luôn. Mất mạng vẫn chơi nếu đã cài OTA từ trước.
5. Khi lỗi: rác tạm tự dọn (extracted, ZIP hỏng); chỉ giữ `.part` để tải tiếp.

Code JS **không bao giờ** đi qua OTA — luôn bundle trong APK, không có kịch bản chạy code tải từ server.

### Quy trình phát hành bản cập nhật game

```bash
# 1. Copy file game mới vào game/ (giữ nguyên cấu trúc)
# 2. Sinh ZIP + manifest mới
python tools/make_ota_manifest.py --version 1.2.0
# 3. Commit + push manifest (file zip gitignored)
git add assets-manifest.json && git commit && git push
# 4. Bump versionCode/versionName trong app/build.gradle.kts rồi:
./gradlew.bat assembleRelease
# 5. Đính kèm cả ZIP OTA vào release
gh release create v1.2.0 app/build/outputs/apk/release/app-release.apk ota-assets-1.2.0.zip
```

ZIP đính kèm release phải khớp `zipUrl` trong `assets-manifest.json` đã push (đặt tên theo pattern `ota-assets-<version>.zip`, tag `v<version>`).

### Test OTA local

`python tools/local_ota_server.py` (port 8000, hỗ trợ Range) phục vụ repo tại chỗ; tạm trỏ `MANIFEST_URL` trong `OtaManager.kt` + `zipUrl` trong manifest về `http://10.0.2.2:8000/...`. Bản debug cho phép cleartext qua `app/src/debug/AndroidManifest.xml` (bản release vẫn HTTPS-only).

## Cấu trúc

- `app/` — code Android: Kotlin; `MainActivity` (màn hình tải OTA + WebView), `OtaManager` (tải/verify/cài ZIP), game được phục vụ qua `WebViewAssetLoader` với origin giả lập `https://appassets.androidplatform.net` — đọc ưu tiên `files/game-assets` (OTA) rồi fallback về asset bundle.
- `game/` — file game: phần code sync vào APK lúc build, phần media đi qua OTA (thư mục copy `app/src/main/assets/game/` đã gitignore).
- `assets-manifest.json` — manifest OTA (commit), `ota-assets-*.zip` — ZIP OTA đính kèm release (gitignored).
- `tools/make_ota_manifest.py` — sinh ZIP + manifest; `tools/local_ota_server.py` — server test local.
- `gradle/wrapper/` — Gradle 8.10.2 (pin bản 8.x vì AGP 8.7.3 không tương thích Gradle 9).
