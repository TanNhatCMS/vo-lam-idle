# SPEC: Mã quà tặng + Quà Tân Thủ

- Ngày: 2026-10-05 · Trạng thái: đã triển khai + E2E đạt · Phát hành: v1.5.3 (data-only, không cần APK)
- Game chạy offline hoàn toàn (save trong localStorage, web tĩnh + app WebView) nên **validate mã ở client**: danh sách mã nằm trong bundle. Người đọc được bundle có thể thấy mã — chấp nhận (mã vốn công khai cho cộng đồng), đổi lại không cần server.

## 1. Mã quà tặng

- UI: tab **"Mã quà"** trong hộp 🎁 — ô nhập + nút "Nhận quà" (Enter cũng nhận), kèm danh sách mã đã dùng của nhân vật.
- Chuẩn hoá: `trim` → `UPPERCASE` → bỏ khoảng trắng (nhập `volamidle`, `VOLAMIDLE`, ` volam idle ` đều khớp).
- Mỗi mã **dùng 1 lần cho mỗi nhân vật**, lưu `RW().codes[mã] = 1` (theo save, hợp lệ với cả 3 slot).
- Phát thưởng qua `grant()` có sẵn → tự log "🎁 Mã quà <MÃ>: …" + sfx + save; toast kết quả.
- Trạng thái lỗi: rỗng → "Nhập mã quà tặng"; không có trong bảng → "Mã không hợp lệ"; đã dùng → "Mã này đã dùng rồi".
- **Bảng mã (tunable, `CODES` trong rewards.ts):**

| Mã | Quà |
|---|---|
| `TANTHU2026` | 3.000 lượng + 5 Phúc Duyên |
| `VOLAMIDLE` | 10 Vỏ Sò |
| `BOSSTHEGIOI` | 5 Vỏ Sò + 2 Huyền Tinh cấp 2 |
| `QUAYSO` | 3 Vỏ Sò |
| `PHUCDUYEN` | 20 Phúc Duyên |

Thêm mã mới = thêm 1 dòng vào `CODES` (không cần đụng UI, không cần bump gì thêm — OTA data tự cập nhật).

## 2. Quà Tân Thủ

- UI: tab **"Tân thủ"** (đứng đầu hộp 🎁) hiện bảng quà + nút "Nhận quà tân thủ"; nhận xong nút thành "Đã nhận quà tân thủ" và khoá.
- **Nhận 1 lần cho mỗi nhân vật**, lưu `RW().welcomeGot = 1`. Không giới hạn cấp (nhân vật cũ cũng nhận được 1 lần — tránh bỏ sót người chơi đang chơi dở).
- Nội dung (`WELCOME`, tunable): 5.000 lượng (× hệ số cấp như mọi phần thưởng), 10 Kim Sáng Dược, 10 Ngưng Thần đan, 5 Phúc Duyên, **10 Vỏ Sò** (đủ quay ×10 một lần), **1 món 4 dòng** (`grant({item: 4})`).
- Chấm đỏ trên nút 🎁 sáng ngay từ đầu cho nhân vật mới (`giftPending` tính cả `!welcomeGot`) → người chơi mới biết vào nhận.

## 3. Kiểm chứng (E2E trình duyệt, 2026-10-05)

- Tab mới hiện đúng thứ tự đầu: Tân thủ · Mã quà · Điểm danh · … (12 tab).
- Nhận quà tân thủ: log "🎁 Quà tân thủ: 27.5k lượng, 10 Kim Sáng Dược, 5 Phúc Duyên, Trãm Mã Kiếm, +10 Vỏ Sò" + "…· nội lực: 10 Ngưng Thần đan"; vỏ sò 428 → 438; nút khoá; bấm lại không nhận thêm.
- Mã `volamidle` (chữ thường): nhận +10 Vỏ Sò, 438 → 448, xuất hiện trong "Đã dùng"; nhập lại → "Mã này đã dùng rồi", số dư không đổi; mã sai → "Mã không hợp lệ".

## 4. Ghi chú kỹ thuật

- `RW()` bổ sung `codes` (object) + `welcomeGot` theo khuôn "thêm trường tại chỗ" — save cũ không cần migrate.
- Không đụng engine/combat; chỉ `rewards.ts` (RW + section 11 + 2 tab giftModal) + bản build.
- Hạn chế đã biết (chấp nhận): mã nằm trong bundle nên người đọc code thấy được; không giới hạn số máy dùng mã (offline).
