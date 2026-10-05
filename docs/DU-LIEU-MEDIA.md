# Dữ liệu game (gói `assets` OTA)

Toàn bộ bảng dữ liệu port từ vanilla JS trước đây bị biên dịch vào chunk JS → nằm trong gói
**data** của OTA. Sửa một con số cân bằng, một tên quái hay một track nhạc phải phát hành lại
gói code, và **mọi thay đổi code đều kéo theo việc tải lại 3.4MB dữ liệu** (vì dữ liệu nằm chung
chunk với code).

Nay cả 5 bảng nằm trong `game/jdata/` — thư mục này được `tools/make_ota_manifest.py` xếp vào gói
**assets** (cùng img/snd/music/fx), nên:

- code đổi → gói `data` chỉ còn ~0.8MB (trước ~4.1MB), bản vá rất nhỏ;
- dữ liệu đổi → đi kèm bản vá gói `assets` (~3.5MB), không phải phát hành lại code;
- APK nhỏ đi ~3.5MB (`app/build.gradle.kts` loại trừ `jdata` như các thư mục media).

| Tệp | Nội dung |
|---|---|
| `game/jdata/jx.json` (3.4MB) | vật phẩm, kỹ năng, môn phái, quái, bảng cấp (`J` trong core) |
| `game/jdata/jw.json` (74KB) | vùng/bản đồ + chỉ số quái theo vùng (`W` trong core) |
| `game/jdata/jfx.json` (25KB) | hiệu ứng chưởng (đạn bay + nổ) |
| `game/jdata/jmo.json` (71KB) | lưới vật cản từng vùng (ảnh nền `img/z/*.jpg`) |
| `game/jdata/jsnd.json` (9KB) | nhạc nền theo vùng + âm thanh NPC/kỹ năng/UI |

## Cơ chế nạp

`web/src/game/jdata.ts` giữ 5 object rỗng đã export (`JX`, `JW`, `JFX`, `JMO`, `JS`) rồi `loadJData()`
fetch song song `/jdata/*.json`: mỗi file timeout 15s, lỗi thì bỏ qua. Dữ liệu được `Object.assign`
**vào chính object đã export**, nên mọi module đã import thấy dữ liệu mới mà không đổi cách dùng.

**Thời điểm nạp là mấu chốt.** `core.ts` dựng chỉ mục (`J`, `W`, `SERIES`, `SK`, `FACTIONS`, `FAC`,
`ZONES`, `MON`, `STAGES`, `MAX_LEVEL`…) **ngay lúc module được import**, và nhiều chỗ khác chụp giá trị
ấy ở cấp module (vd `rewards.ts`: `const REBORN_LV = MAX_LEVEL`). Vì vậy `app/page.tsx` await
`loadJData()` **trước khi** `import('../App')`:

```ts
const Game = dynamic(() => loadJData().then(() => import('../App')), { ssr: false });
```

App (và do đó `core.ts`) chỉ được import sau khi dữ liệu đã có → giữ nguyên toàn bộ logic dựng chỉ mục
đồng bộ, không phải lazy hoá, không lệch thời điểm render. `loop.boot()` cũng `await loadJData()` lại
(một lần nữa, promise đã xong nên trả ngay) để phòng khi ai đó đổi `page.tsx`.

`core.ts` có thêm guard `|| []` / `|| {}` cho `J.series`, `J.exp`, `J.attr`, `J.factions`, `J.skills`,
`W.zones`, `W.mon` — chỉ để bản build thiếu media vẫn khởi động được (hiện UI rỗng) thay vì ném lỗi
ngay lúc import.

Trên app Android cả hai gói OTA đều được verify trước khi vào game (`OtaManager.installedUpToDate`)
nên file JSON chắc chắn có mặt; `GameAssetHandler` phục vụ `jdata/*.json` với `Content-Type: application/json`.

## Điểm cần nhớ khi sửa pipeline

`jdata` phải được khai báo ở **4 chỗ** (đã làm sẵn, chỉ nhắc khi thêm thư mục mới tương tự):

- `tools/make_ota_manifest.py` → `MEDIA_DIRS` (xếp vào gói assets)
- `web/scripts/prep-public.mjs` → tạo junction `public/jdata` cho `next dev`
- `web/scripts/sync-android.mjs` → `MEDIA` (gỡ junction trước `next build`, copy khi `--out`)
- `app/build.gradle.kts` → `exclude(...)` của task `syncGameAssets`

## Không còn file `.ts` dữ liệu

`web/src/game/jx.ts`, `jw.ts`, `jfx.ts`, `jmo.ts`, `jsnd.ts` đã xoá — **JSON trong `game/jdata/` là nguồn chính**.
Nếu generator ngoài repo vẫn xuất `.ts`, chuyển bằng:

```bash
node tools/ts_to_json.mjs                                  # cả bộ mặc định
node tools/ts_to_json.mjs web/src/game/jx.ts:game/jdata/jx.json
```

## Quy trình khi dữ liệu đổi

1. Sửa JSON trong `game/jdata/`.
2. `npm run android:sync` (build web + đồng bộ) — không đụng gì tới JSON trong `game/`.
3. `python tools/make_ota_manifest.py --version <x.y.z>` → gói `assets` mới kèm bản vá chỉ chứa JSON đổi.

Bản web deploy (`npm run android:sync -- --out DIR`) copy nguyên `img/snd/music/fx/jdata` từ `game/`
nên JSON đi kèm tự động.
