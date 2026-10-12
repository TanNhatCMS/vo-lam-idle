# Võ Lâm Idle — Web + Android

**Võ Lâm Idle** là game võ hiệp thể loại idle (tự động) chạy hoàn toàn trên thiết bị của bạn: nhân vật tự đi, tự đánh, tự nhặt đồ — cứ để game luyện công, muốn tay nghề thì cầm lái lúc nào cũng được. Tiến trình lưu tại máy, không quảng cáo, không thanh toán.

## Giới thiệu

- **Hành tẩu tự động** — Nhân vật tự đánh quái, tự nhặt đồ, tự uống thuốc và vượt ải. Có joystick để tự điều khiển khi muốn, nút "Tự động" để quay lại chế độ idle.
- **Đa môn phái, hệ hành** — 10 môn phái (Thiếu Lâm, Thiên Vương Bang, Đường Môn, Ngũ Độc Giáo, Nga My, Thúy Yên, Cái Bang, Thiên Nhẫn, Võ Đang, Côn Lôn) với 5 hệ hành Kim–Mộc–Thủy–Hỏa–Thổ tương sinh tương khắc.
- **Trang bị thông minh** — Đồ rơi tự nhặt theo bộ lọc, tự mặc món mạnh hơn (có thể tắt). Bấm vào món để so sánh chi tiết.
- **Cộng điểm có gợi ý** — Tiềm năng & kỹ năng linh hoạt, có bản xem trước hiệu quả.
- **Rèn đồ 3 chặng** — Tím (hợp Huyền Tinh từ nhẫn/dây chuyền/ngọc bội rồi khảm), Hoàng Kim (gom mảnh từ trùm), Bạch Kim + chế độ "Tự động rèn đồ".
- **Luyện Công (Sinh tồn)** — Chế độ 10 phút, dùng tuyệt kỹ/bom/bình HP đúng thời điểm.
- **Thế giới phong phú** — Nhiều vùng luyện công, thành phố, quái trùm, nhiệm vụ, thành tựu, điểm danh, Tỷ Võ Trường, Boss Thế Giới, Quay Vỏ Sò,...
- **Đồng hành (Pet)** — Hệ thống pet với trang bị riêng, đội hình, trận pháp ngũ hành, tiến hóa, kỹ năng,...
- **Đa nhân vật & sao lưu** — Nhiều slot save, tự động backup, xuất/nhập file lưu giữa thiết bị.
- **Chat thế giới** — Xem hồ sơ nhân vật nhanh trực tiếp trong chat.

## Cấu trúc dự án

```
VoLamIdleAndroid/
├── app/                # Android app (Kotlin) – WebView + OTA manager
├── web/                # Next.js 16 + React 19 + TypeScript (source game)
├── game/               # Artifact chạy thật: index.html + _next/ + media (do android:sync)
├── tools/              # make_ota_manifest.py, local_ota_server.py,...
├── docs/               # Tài liệu kỹ thuật chi tiết
├── assets-manifest.json # Manifest OTA (commit vào repo)
└── wrangler.jsonc      # Cloudflare Worker config phục vụ game/
```

## 1) Phát triển Web (`web/`)

Toàn bộ game được viết bằng **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript**. `next build` với `output: 'export'` sinh static export dùng cho cả web production lẫn gói OTA Android.

### Cài đặt & chạy dev

```bash
cd web
npm install
npm run dev            # http://localhost:3000 (Turbopack)
```

Media lớn (`img/`, `snd/`, `music/`, `fx/`, `jdata/`) **không** commit. `npm run dev` tự tạo junction từ `../game/<thư mục>` vào `public/` thông qua `scripts/prep-public.mjs`. Thư mục `ui/`, `fonts/` nhỏ được copy thật vào `public/`.

### Lệnh hữu ích

```bash
npm run typecheck      # tsc --noEmit
npm run build          # next build -> web/out/ (static export)
npm run lint           # eslint
npm run android:sync   # build + copy web/out/ -> game/
npm run android:sync -- --out ../deploy   # đóng gói đầy đủ (out + media) để deploy static
npm run android:sync -- --clean          # sync + dọn code vanilla cũ trong game/
npm run test:regression # Playwright E2E regression (boot/tạo nhân vật/13 nút Giang hồ/tab nav)
npx playwright test --ui # chạy E2E ở chế độ UI
node scripts/serve-static.mjs ../deploy 8080  # thử bản đóng gói local
```

> **Lưu ý:** `npm run test:regression` là bộ test bắt buộc nên chạy trước mỗi release. Tất cả case chính đều pass (42/42).

## 2) Kiến trúc

- **App Router**: `src/app/layout.tsx` + `src/app/page.tsx` với `dynamic(..., { ssr: false })` vì game hoàn toàn client-side (Canvas, rAF, localStorage).
- **Engine (`web/src/game/`)**: Port gần 1:1 từ vanilla JS sang ES modules. Giữ nguyên hành vi gốc: vòng lặp `loop.ts`, `boot()`, combat/loot/save,...
- **UI React (`web/src/ui/`)**: Render HUD/tabs/modal theo game state. Cấu trúc **island**: engine vẫn ghi DOM trực tiếp vào container do React tạo (`#mBody`, `#t-log`,...), hai bên không xung đột.
- **Data (`game/jdata/*.json`)**: Toàn bộ dữ liệu game đã tách sang JSON: `jx.json`, `jw.json`, `jfx.json`, `jmo.json`, `jsnd.json`. `web/src/game/jdata.ts` load async trước khi boot. Chi tiết: [docs/DU-LIEU-MEDIA.md](docs/DU-LIEU-MEDIA.md).
- **TypeScript**: UI được type chặt. Nhiều file engine còn `// @ts-nocheck` (port từ JS). Khi sửa file đó, có thể bỏ `@ts-nocheck` và sửa type dần. Các script hỗ trợ: `web/scripts/audit_imports.py`, `web/scripts/tsc_names_scan.py` giúp bắt lỗi import thiếu sau khi bật typecheck.

## 3) Build Android

Yêu cầu: **JDK 17**, Android SDK (API 35). Dùng Gradle Wrapper kèm theo.

```bash
# Debug
./gradlew.bat assembleDebug        # Windows
./gradlew assembleDebug            # Linux/macOS

# Release
./gradlew.bat assembleRelease
```

- APK debug: `app/build/outputs/apk/debug/volam-idle-v<version>-debug.apk`
- APK release: `app/build/outputs/apk/release/volam-idle-v<version>-release.apk`

Bản release ký bằng keystore tại `keystore/` + `keystore.properties` (**gitignored**). Nếu thiếu, Gradle sẽ fallback sang debug signing. **Bắt buộc sao lưu an toàn** keystore + mật khẩu.

## 4) Cơ chế OTA tài nguyên

APK chỉ chứa code dự phòng. Toàn bộ tài nguyên game cập nhật qua **ZIP OTA** khi mở app lần đầu hoặc khi có phiên bản mới.

### Cấu trúc 2 gói

| Gói | Tên file | Kích thước | Mô tả |
|---|---|---|---|
| **data** | `ota-data-<v>.zip` | ~1MB | `index.html`, `_next/` (JS/CSS), `fonts/`, `ui/` — thường thay đổi khi sửa web |
| **assets** | `ota-assets-<v>.zip` | ~118–230MB | `img/`, `snd/`, `music/`, `fx/`, `jdata/` — hiếm thay đổi (media + dữ liệu JSON game) |

Ngoài ra còn có **patch** cho từng gói: `ota-<gói>-patch-<v>.zip` chỉ chứa file thêm/thay + `remove[]`, áp dụng khi `from == zipSha256` của gói đang cài.

### Luồng OTA

1. App đọc `assets-manifest.json` từ `raw.githubusercontent.com` (tag `main`)
2. **Lần đầu**: tải đủ 2 gói. Hỗ trợ **HTTP Range** + **resume** (`.part`)
3. Verify **sha256** toàn bộ ZIP → giải nén → verify **sha256 từng file** theo manifest → di chuyển vào `files/game-assets/` → verify toàn bộ → ghi index
4. **Lần sau**: chỉ tải gói có thay đổi. Nếu match `patch.<gói>.from` → tải patch. Nếu patch fail verify sau vá → tự **tải lại full** gói đó
5. Chơi offline hoàn toàn sau khi đã tải đủ ít nhất 1 lần
6. Có nút "Hủy tải", "Thử lại", "Xóa dữ liệu đã tải". Tự dọn rác tạm khi lỗi

**Màn hình cập nhật** hiển thị: `App vX · Tài nguyên vX.Y` + nút "Cập nhật app" nếu có APK mới trên GitHub Releases.

### Test OTA local

```bash
# Chạy local server phục vụ repo (hỗ trợ Range)
python tools/local_ota_server.py  # mặc định http://localhost:8000

# Build debug trỏ về 10.0.2.2:8000 (Android emulator)
./gradlew.bat assembleDebug -PotaLocal
```

- `-PotaLocal` bật `BuildConfig.OTA_LOCAL` khiến app dùng `http://10.0.2.2:8000/assets-manifest.json` thay vì GitHub.
- Chỉ bản debug cho phép **cleartext** (`app/src/debug/AndroidManifest.xml`). Bản release luôn **HTTPS-only**.

## 5) Deploy Web lên Cloudflare

Web production phục vụ từ `game/` tại **https://vo-lam-idle.tannhatcms.io.vn**

### Thủ công

```bash
cd web && npm run android:sync && cd ..
npx wrangler login
npx wrangler deploy
```

### Tự động (CI)

Push thay đổi trong `game/**` lên `main` → workflow [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) tự động chạy `wrangler deploy`. Cần secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## 6) Quy trình phát hành

### A) Tự động bằng GitHub Actions (khuyến nghị)

1. Vào **Actions → OTA release → Run workflow**
2. Nhập `version` (vd `2.6.4`)
3. Chọn có đính kèm APK cùng release hay không
4. Workflow sẽ:
   - Build web (`next build`)
   - `android:sync` vào `game/`
   - Sinh 2 ZIP + patch (nếu có) bằng `tools/make_ota_manifest.py`
   - Commit `assets-manifest.json`
   - Tạo **GitHub Release** `v<version>` đính kèm các file OTA (và APK nếu chọn)

### B) Thủ công

```bash
# 1) Build web + sync vào game/
cd web && npm run android:sync -- --clean && cd ..

# 2) Sinh manifest + ZIP + patch (so với manifest HEAD hiện tại)
python tools/make_ota_manifest.py --version 2.6.4

# 3) Commit manifest
git add assets-manifest.json
git commit -m "OTA manifest v2.6.4"
git push

# 4) Bump versionCode/versionName trong app/build.gradle.kts
# 5) Build APK release
./gradlew.bat assembleRelease

# 6) Tạo release + đính kèm file cần thiết
gh release create v2.6.4 \
  app/build/outputs/apk/release/volam-idle-v2.6.4-release.apk \
  ota-data-2.6.4.zip \
  ota-assets-2.6.4.zip
  # thêm ota-*-patch-*.zip nếu sinh ra
```

> **Quan trọng:** Tên file ZIP phải khớp đúng với URL trong `assets-manifest.json`. Patch chỉ áp dụng cho người đang ở **phiên bản phát hành liền trước** — nếu bỏ qua ≥1 phiên, app sẽ tải **full** gói tương ứng.

## 7) Kiểm thử

- **Regression E2E (Playwright)**: `npm run test:regression` — cover boot, tạo nhân vật, 13 nút Giang hồ, điều hướng tab. Chạy trước mỗi release.
- **Typecheck**: `npm run typecheck` — bắt lỗi TypeScript.
- **Lint**: `npm run lint` — kiểm tra style.
- **Test OTA local**: dùng `-PotaLocal` như mục 4.

## 8) Tài liệu tham khảo

- [docs/DU-LIEU-MEDIA.md](docs/DU-LIEU-MEDIA.md) — Vị trí dữ liệu/media, `jdata/`, junction, sync
- [docs/ANDROID-BUILD-GOTCHAS.md](docs/ANDROID-BUILD-GOTCHAS.md) — Cạm bẫy build Android, module cycle, S init,...
- [docs/RELEASE-IDENTITY-DEPLOY.md](docs/RELEASE-IDENTITY-DEPLOY.md) — Quy trình release chi tiết, tag/keystore
- [docs/OTA-PACKAGE-SPLIT-DATA-ASSETS.md](docs/OTA-PACKAGE-SPLIT-DATA-ASSETS.md) — Lý do tách 2 gói
- [docs/UPSTREAM-*.md](docs/) — Theo dõi upstream `volam.vinarpg.com`

## Lưu ý phát triển

- `game/` là **artifact** sinh ra bởi `android:sync`. Không chỉnh sửa thủ công file trong `game/` trừ khi thật cần thiết — sửa ở `web/` rồi sync lại.
- `next build` không xóa `out/` cũ hoàn toàn trong một số trường hợp — `android:sync` xử lý sạch sẽ.
- Khi dev song song `next dev` (3000) và server khác, tránh chiếm port. Next 16 chỉ 1 dev server/dir.
- Với file engine còn `@ts-nocheck`, ưu tiên **không** bật đại trà — chỉ bật lại khi sửa file cụ thể.
- Trước release web quan trọng, **chạy regression E2E** để đảm bảo UI Giang hồ đầy đủ và không có nút lỗi.