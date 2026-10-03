# Võ Lâm Idle — Android

**Võ Lâm Idle** là game võ hiệp thể loại idle (tự động) chạy hoàn toàn trên thiết bị của bạn: nhân vật tự đi, tự đánh, tự nhặt đồ — cứ để game luyện công, muốn tay nghề thì cầm lái lúc nào cũng được. Tiến trình lưu tại máy, **chơi offline 100%**, không quảng cáo, không thanh toán — đúng tinh thần game tự giới thiệu: *"Phi thương mại, ưu tiên giải trí trên chính thiết bị của mình"*.

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

App này là một cái vỏ WebView gọn: **toàn bộ game bundle sẵn trong APK**, không cần server hay mạng khi chơi.

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
