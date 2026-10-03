# Võ Lâm Idle — Android

App Android (WebView) đóng gói game Võ Lâm Idle chơi **offline hoàn toàn**: toàn bộ file game nằm trong APK, không cần server hay mạng.

## Build

Yêu cầu: JDK 17, Android SDK (API 35). Gradle wrapper (8.10.2) đã kèm theo — không cần cài Gradle.

```bash
./gradlew.bat assembleDebug   # Windows
./gradlew assembleDebug       # Linux/macOS
```

APK ra tại `app/build/outputs/apk/debug/app-debug.apk` (~124MB), cài trực tiếp lên máy (cho phép "cài từ nguồn không xác định").

Bản release chưa cấu hình ký số — khi cần: tạo keystore, thêm `signingConfig` rồi `assembleRelease`.

## Cập nhật game

Copy file game mới vào thư mục `game/` (giữ nguyên cấu trúc: `js/`, `img/`, `snd/`, `music/`, `fonts/`, `fx/`, `ui/`...) rồi build lại. Task gradle `syncGameAssets` tự đồng bộ `game/` vào assets của APK ở mỗi lần build — không phải thao tác thủ công.

Lưu ý: không đặt `sw.js` vào `game/`. Service worker sẽ chặn việc đọc asset local của app (request phát ra từ SW không đi qua `shouldInterceptRequest` của WebView), còn game đăng ký SW kiểu fire-and-forget nên file 404 là vô hại.

## Cấu trúc

- `app/` — code Android: Kotlin, một `MainActivity` chứa WebView; game được phục vụ qua `WebViewAssetLoader` với origin giả lập `https://appassets.androidplatform.net` để fetch/localStorage/IndexedDB hoạt động như trên web thật.
- `game/` — file game, được sync vào APK lúc build (đã gitignore thư mục copy trong `app/src/main/assets/game/`).
- `gradle/wrapper/` — Gradle 8.10.2 (pin bản 8.x vì AGP 8.7.3 không tương thích Gradle 9).
