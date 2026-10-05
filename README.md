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

App là một cái vỏ WebView gọn (~7.5MB): phần **code game bundle trong APK**, phần **media + dữ liệu game (~119MB) tải qua OTA** từ GitHub Release lần chạy đầu, sau đó **chơi offline 100%**.

## Bản web Next.js (`web/`)

Toàn bộ game chạy bằng **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript** ở thư mục `web/` — một codebase cho cả web lẫn Android: `next build` với `output: 'export'` ra static files, ném thẳng vào cơ chế OTA của app (thay phần code `index.html` + `js/*` cũ), hoặc deploy lên hosting bất kỳ (lưu ý: asset path tuyệt đối `/_next/...` — deploy ở **domain root**, không phải sub-path).

```bash
cd web
npm install
npm run dev            # next dev http://localhost:3000 (Turbopack)
npm run typecheck      # tsc --noEmit
npm run build          # static export -> web/out/
npm run android:sync   # build + chép out/ vào game/ để sinh gói OTA Android
npm run android:sync -- --out ../deploy   # đóng gói bản web ĐẦY ĐỦ (out + media) deploy static
npm run android:sync -- --clean          # sync + xóa code vanilla cũ trong game/ (js/, data.js...)
node scripts/serve-static.mjs ../deploy 8080   # thử bản đóng gói trên máy
```

**Deploy web**: Worker Cloudflare static assets cấu hình ở `wrangler.jsonc`, phục vụ chính thư mục `game/` (cùng artifact với OTA Android) tại **https://vo-lam-idle.tannhatcms.io.vn**:

```bash
cd web && npm run android:sync && cd ..   # sinh lại game/ nếu vừa sửa web
npx wrangler deploy                        # cần: npx wrangler login
```

Hoặc tự động: push `game/**` lên main → workflow `Deploy web (Cloudflare)` chạy `wrangler deploy` (cần đặt secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` trong repo settings).

**Media trong dev**: `img/snd/music/fx` + `jdata` (~119MB) KHÔNG copy vào repo — `npm run dev` tự tạo **junction** `public/<thư mục>` → `../game/<thư mục>` (`scripts/prep-public.mjs`, gitignored); `sync-android.mjs` tự gỡ junction trước `next build` để `out/` không nhồi 119MB, rồi tạo lại. `ui/` + `fonts/` nhỏ nên copy thật trong `public/`.

### Kiến trúc

- **App Router** — `src/app/layout.tsx` (metadata, viewport, link style.css/fonts từ `public/`) + `src/app/page.tsx` (`'use client'`, `dynamic(..., { ssr: false })`) vì game là SPA thuần client: canvas, requestAnimationFrame, localStorage, DOM island — không thể SSR.
- **Engine** (`web/src/game/*.ts`) — port 1:1 từ vanilla JS cũ sang ES modules: mô phỏng 60 bước/giây, combat, loot, save… giữ nguyên hành vi. `loop.ts` là vòng lặp chính + `boot()`; `store.ts` là cầu nối báo React vẽ lại HUD theo tick 10Hz.
- **UI React** (`web/src/ui/*.tsx`) — khung app (top bar, sân đấu, pad kỹ năng, tabs, modal, toast) render theo state. Khung **island**: React tạo container rỗng (`#mBody`, `#t-log`…), các renderer của engine ghi DOM vào đó như bản gốc — hai thế giới không giẫm chân nhau.
- **Data** — dữ liệu gốc port từ vanilla JS, nay nằm trong **`game/jdata/*.json`** (gói `assets` OTA, ~3.6MB): `jx` (vật phẩm/kỹ năng/quái), `jw` (vùng/bản đồ), `jfx` (hiệu ứng), `jmo` (vật cản bản đồ), `jsnd` (âm thanh). `web/src/game/jdata.ts` fetch chúng và `app/page.tsx` chờ nạp xong rồi mới import App, nên `core.ts` vẫn dựng chỉ mục đồng bộ lúc module-init — xem [docs/DU-LIEU-MEDIA.md](docs/DU-LIEU-MEDIA.md).
- **TypeScript**: UI check kiểu đầy đủ; một số engine file còn `// @ts-nocheck` ở đầu file (port máy móc từ JS) — **bật lại check từng file** bằng cách xóa dòng đó rồi chạy `npm run typecheck`. Kiểu dùng chung ở `web/src/game/types.ts` (`SaveState`, `GameState`, `Hero`, `Item`…).

### GitHub Actions

- **Web build** (`.github/workflows/web.yml`) — `npm ci → typecheck → next build`, artifact `web-out` + `web-full` (kèm media, deploy được ngay).
- **Deploy web** (`.github/workflows/deploy-web.yml`) — push `game/**` → `wrangler deploy` Worker lên `vo-lam-idle.tannhatcms.io.vn` (cần secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- **APK build** (`.github/workflows/apk.yml`) — `assembleRelease`, artifact APK (không có keystore trong CI thì tự fallback debug signing).
- **OTA release** (`.github/workflows/ota.yml`) — chạy tay với input `version` (vd `1.4.4`): build web → sync vào `game/` → sinh ZIP + bản vá → commit `assets-manifest.json` → tạo GitHub Release đính kèm ZIP (tùy chọn kèm APK).

## Build (Android)

Yêu cầu: JDK 17, Android SDK (API 35). Gradle wrapper (8.10.2) đã kèm theo — không cần cài Gradle.

```bash
./gradlew.bat assembleDebug   # Windows
./gradlew assembleDebug       # Linux/macOS
```

APK ra tại `app/build/outputs/apk/debug/volam-idle-v<phiên-bản>-debug.apk` (vd `volam-idle-v1.3.0-debug.apk`). Bản release:

```bash
./gradlew.bat assembleRelease
```

Bản `release` được ký bằng keystore tại `keystore/` với thông số trong `keystore.properties` — cả hai **gitignored, không commit**; thiếu file này thì `assembleRelease` tự fallback sang debug signing. **Sao lưu cẩn thận keystore + mật khẩu** (bản backup tại repo private `android-keystores`): mất keystore thì các bản cập nhật sau không giữ được chữ ký cũ.

## Cơ chế OTA tài nguyên

APK chỉ chứa bản code dự phòng; **toàn bộ tài nguyên của game (gọi chung là `data`: code + media) cập nhật qua OTA dạng ZIP** khi mở app:

1. App đọc `assets-manifest.json` ở **gốc repo** (qua `raw.githubusercontent.com`) — **2 gói** theo tần suất thay đổi, mỗi gói một **ZIP đính kèm GitHub Release**:
   - `data` (`ota-data-<v>.zip` ~1MB): index.html, js, fonts, ui — **thường thay đổi** (đã nhẹ đi ~4 lần vì dữ liệu game đã sang gói assets)
   - `assets` (`ota-assets-<v>.zip` ~118MB): img, snd, music, fx, **jdata** — **hiếm khi đổi**; `jdata/` là toàn bộ dữ liệu game JSON (`jx`, `jw`, `jfx`, `jmo`, `jsnd`) để sửa cân bằng/hiệu ứng/âm thanh/bản đồ không phải phát hành lại code — xem [docs/DU-LIEU-MEDIA.md](docs/DU-LIEU-MEDIA.md)
   - `patch`: bản vá **từng gói** (`patch.data` / `patch.assets`) — chỉ chứa file đổi/thêm + `remove[]`; `from` là zipSha256 của gói ở bản liền trước.
2. **Lần chạy đầu**: tải đủ cả 2 gói về bộ tạm `cache/ota/<data|assets>.zip.part` — **tự resume** bằng HTTP Range nếu đứt giữa chừng.
3. Verify sha256 ZIP → giải nén → **verify từng file** theo manifest → move vào `files/game-assets` → **verify toàn bộ** → ghi index → dọn bộ tạm.
4. **Các lần mở sau**: gói nào đổi mới xử lý — `dataVersion`/`assetsVersion` khớp `patch.<gói>.from` thì **chỉ tải bản vá gói đó** (vài KB–MB), lệch nhánh thì tải lại full gói đó; **vá xong verify fail (file local hỏng ngoài phạm vi vá) thì tự chữa bằng full của gói đó**. Vào game ngay cả khi offline nếu đã cài đủ từ trước.
5. Khi lỗi: rác tạm tự dọn; ZIP giữ `.part` để tải tiếp, file hỏng thì tải lại.

Màn hình cập nhật hiển thị **phiên bản hiện tại**: `App vX · Tài nguyên vX.Y`, kèm nút **"Cập nhật app"** khi GitHub Releases có bản APK mới hơn (mở trang release).

### Quy trình phát hành bản cập nhật game

Cách 1 — **tự động bằng CI** (khuyến nghị): tab **Actions → OTA release → Run workflow**, nhập `version` (vd `1.4.4`), chọn có đính kèm APK hay không. Workflow tự build web, sync vào `game/`, sinh ZIP + bản vá, commit manifest và tạo GitHub Release.

Cách 2 — **thủ công**:

```bash
# 1. Build web React + sync vào game/ (bỏ --clean nếu còn cần giữ code vanilla cũ)
cd web && npm run android:sync -- --clean && cd ..
# 2. Sinh 2 ZIP (data + assets) + bản vá từng gói (tool diff với manifest bản trước ở git HEAD; deterministic)
python tools/make_ota_manifest.py --version 1.4.0
# 3. Commit + push manifest (file zip gitignored)
git add assets-manifest.json && git commit && git push
# 4. Bump versionCode/versionName trong app/build.gradle.kts rồi:
./gradlew.bat assembleRelease
# 5. Đính kèm APK + ZIP gói có thay đổi vào release (data hay đổi → ota-data; media đổi → ota-assets)
gh release create v1.4.0 app/build/outputs/apk/release/volam-idle-v1.4.0-release.apk ota-data-1.4.0.zip ota-assets-1.4.0.zip
```

ZIP đính kèm release phải khớp `data.zipUrl` / `assets.zipUrl` (và `patch.*.zipUrl` nếu có bản vá) trong `assets-manifest.json` đã push (pattern `ota-data-<version>.zip` / `ota-assets-<version>.zip` / `ota-<gói>-patch-<version>.zip`, tag `v<version>`). Bản vá của gói chỉ áp dụng cho người đang cài **bản phát hành liền trước** — bỏ qua một phiên thì app tự rơi về tải full gói đó.

### Tính năng của vỏ app (v1.3.0)

- **Nhường âm thanh** — cuộc gọi đến, app nhạc khác phát, hoặc thông báo ping: game tự im/nhạc nhỏ xuống đúng chuẩn Android, quay lại thì phát tiếp theo cài đặt trong game.
- **Hỏi trước khi tải qua data di động** — Wi-Fi tải tự động; mạng đo lượng thì hiện dialog kèm dung lượng (bản cập nhật có nút "Để sau" để chơi tiếp bộ cũ).
- **Tự động sao lưu save** — mỗi ~60 giây và mỗi lần ẩn app, toàn bộ dữ liệu game (cả 3 slot nhân vật) được chụp ra bộ nhớ riêng của app. Nếu lần mở sau mất dữ liệu, app tự hỏi khôi phục lại; máy đang chơi bình thường không bao giờ bị đụng tới. Kênh chủ động "Tải file lưu"/"Nạp từ file" vẫn như cũ.
- **Kiểm soát dữ liệu** — nút **Hủy tải** khi đang tải (tải tiếp từ chỗ dừng bằng Thử lại), nút **Xóa dữ liệu đã tải** để tải lại sạch từ đầu.

### Test OTA local

`python tools/local_ota_server.py` (port 8000, hỗ trợ Range) phục vụ repo tại chỗ, rồi build bản debug cờ local: `./gradlew.bat assembleDebug -PotaLocal` — bản này tự trỏ manifest + ZIP về `http://10.0.2.2:8000/` qua `BuildConfig.OTA_LOCAL` (không phải sửa URL tay trong code hay manifest). Build thường (`assembleDebug` không cờ / `assembleRelease`) luôn dùng GitHub production. Cleartext chỉ được phép ở bản debug (`app/src/debug/AndroidManifest.xml`, bản release vẫn HTTPS-only).

## Cấu trúc

- `app/` — code Android: Kotlin; `MainActivity` (màn hình tải OTA + WebView), `OtaManager` (tải/verify/cài ZIP), game được phục vụ qua `WebViewAssetLoader` với origin giả lập `https://appassets.androidplatform.net` — đọc ưu tiên `files/game-assets` (OTA) rồi fallback về asset bundle.
- `web/` — **nguồn game Next.js 16 + React 19 + TypeScript** (App Router, engine ES modules, data); static export ra `out/` cho web và gói OTA Android (xem mục "Bản web Next.js").
- `game/` — thư mục game chạy thật: `index.html` + `_next/` do `npm run android:sync` chép từ `web/out`, media (`img/snd/music/fx/ui`, `fonts`) dùng chung cho Android OTA; phần code sync vào APK lúc build (thư mục copy `app/src/main/assets/game/` đã gitignore).
- `assets-manifest.json` — manifest OTA (commit), `ota-assets-*.zip` — ZIP OTA đính kèm release (gitignored).
- `tools/make_ota_manifest.py` — sinh ZIP + manifest; `tools/local_ota_server.py` — server test local.
- `wrangler.jsonc` — Worker Cloudflare phục vụ `game/` tại `vo-lam-idle.tannhatcms.io.vn` (deploy: `npx wrangler deploy`).
- `.github/workflows/` — CI: `web.yml` (build web), `apk.yml` (build APK), `ota.yml` (đóng gói + phát hành OTA).
- `gradle/wrapper/` — Gradle 8.10.2 (pin bản 8.x vì AGP 8.7.3 không tương thích Gradle 9).
