# SPEC: Boss Thế Giới + Gacha "Quay Vỏ Sò"

- Ngày lập: 2026-10-05 · Chuyển từ bản thiết kế sang **spec triển khai** · Trạng thái: **đã triển khai + E2E đạt 12/12** (cùng ngày)
- Bài học triển khai đã vá: `RW()` phải bổ sung `r.wb`/`r.so` **tại chỗ** (không thay bằng bản sao mới như `stat`/`login`) vì `wbVictory`/`spinSo` giữ tham chiếu `w`/`so` qua nhiều lần gọi `RW()` giữa các mutation — lỗi stale-reference từng làm `up` không được xoá sau khi hạ boss (bắt được nhờ E2E).
- Phạm vi: chỉ sửa `web/src` + `web/public/style.css`. **Không sửa Kotlin/APK** — mọi thứ chạy trong WebView, phát hành bằng OTA data.
- Mọi con số dưới đây đều là **giá trị mặc định** gom thành hằng số ở đầu module; đổi số không đổi logic.

## 0. Chốt mặc định (trước đây là điểm mở)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | Chu kỳ boss | **20 phút THỜI GIAN THỰC** (mốc epoch `wb.next`, không theo thời gian chơi) — tới giờ là ra kể cả đang ở thành/tháp/luyện công hay vừa mở lại app. Nhân vật mới: con đầu sau **5 phút** (`WB_FIRST`). |
| 2 | Boss sống bao lâu | **Mỗi lần vào bí cảnh có trọn `WB_LIFE` = 20 phút để hạ boss** (đồng hồ chạy liên tục, hiện trên HUD; vào lại là đầy lại). Hết giờ boss rút lui. Spawn mới bị chặn khi boss cũ chưa được giải quyết. |
| 3 | Boss qua phiên | **Sống qua phiên**: `up` lưu trong save — mở lại app vẫn thấy boss đang chờ (mốc thực chưa trôi qua thì chưa hẹn con mới). |
| 4 | Map arena | **Map 224 "Sa mạc địa biểu"** (`WB_MAP = 224`) — đo mật độ pixel xanh toàn ảnh = 0% nên không thể kẹt lùm cây (map Thành phố bị bỏ vì cây trang trí không có trong dữ liệu va chạm, user vẫn thấy kẹt). |
| 5 | Vỏ Sò | Per nhân vật, lưu `RW().so` (không qua Kho chung). |
| 6 | Pity | 25 quay chưa trúng Tím+ → lượt thứ 25 ép rơi từ nhóm Tím+. |
| 7 | Popup | **Không khóa màn**. Đang mở modal khác → chỉ banner + log + toast + chip nhấp nháy. |
| 8 | Cấp tối thiểu | Cấp 10 mới có boss (trùng mốc mở Tháp). |

## 1. Hằng số (đầu file `worldboss.ts`)

```ts
const WB_EVERY   = 1200;  // GIÂY THỰC giữa 2 lần boss ra (20 phút)
const WB_FIRST   = 300;   // nhân vật mới: con boss đầu sau 5 phút
const WB_LIFE    = 1200;  // mỗi lần vào bí cảnh có 20 phút để hạ boss, hết là rút lui
const WB_HP_X    = 3;     // HP nhân trên khuôn 'boss' (Trùm Hoàng Kim nhân 2)
const WB_DMG_X   = 1.15;  // sát thương nhân
const WB_MIN_LV  = 10;
const WB_MAP = 224;       // bí cảnh dùng lại map 224 "Sa mạc địa biểu" — obs/bg/nhạc của WBZ (W.zones)
const WB_EXIT_T  = 2;     // s đứng thưởng tối thiểu sau khi hạ boss (chờ nhặt hết đồ MỚI rơi rồi mới rời, gia hạn tối đa WB_WAIT_MAX = 12s)
const SO_MIN = 8, SO_MAX = 15;      // vỏ sò khi hạ boss
const SO_FIRST_DAY = 5;             // thưởng con đầu tiên mỗi ngày
const SO_COST1 = 1, SO_COST10 = 9;  // giá quay ×1 / ×10 (×10 tặng 1 lượt)
const PITY_MAX = 25;
```

## 2. SPEC A — Boss Thế Giới

### 2.1 Dữ liệu

Lưu theo nhân vật (tự bổ sung qua `RW()` — save cũ không cần migrate):

```
rw.wb = { next: <epoch ms>, up: null }   // next = mốc THỜI GIAN THỰC; nhân vật mới: now + WB_FIRST
  next : mốc epoch ms lần spawn kế (THỜI GIAN THỰC)
  up : null | { tid, L, n }   // tid quái (z.boss), cấp, tên hiển thị "Thế Giới · <tên>"
rw.stat.wboss : number      // số boss đã hạ (thêm vào Object.assign mặc định của RW())
```

Runtime (không lưu): `R.wbArena: boolean` — đang ở arena; `R.wbLife: number` — life còn lại của boss; `R.wbExitT: number` — đếm ngược tự rời sau thắng; `R.wbE: enemy|null` — thực thể boss (giữ HP giữa các lần vào arena trong cùng phiên).

### 2.2 Máy trạng thái & luật đếm thời gian

```
[Chờ] ──wb.t hết (đang chơi bình thường)──> [Boss ra] ──bấm popup/chip──> [Trong arena]
   ^                                            │                            │
   │            hạ boss ◄───────────────────────┼──────────┐                 │ hết WB_LIFE
   │                                            │          └── [Thắng] ─────┤ (boss còn sống)
   └────────────────────────────────────────────┴───────────────────────────┘ [Boss rút lui]
```

`wbTick(dt)` — hook cạnh `goldBossTick(dt)` (combat.ts:264), tự kiểm tra điều kiện:

| Điều kiện đang ở | wb.t | wb.up | Hành vi |
|---|---|---|---|
| Chưa có nhân vật (`!S.fac`) | đứng | — | không làm gì |
| Trong arena (`R.wbArena`) | — | giữ | `R.wbLife` đếm liên tục khi ở bí cảnh → hết: **boss rút lui**; `R.wbExitT` (sau khi hạ) → 0: tự `backFromBossArena()` |
| Ở thành (`R.town`) / tháp (`R.tower`) / Luyện Công (`tick` không chạy) | đứng | giữ | không làm gì (Luyện Công tự dừng vì `svTick` thay `tick`) |
| Bất kỳ đâu khi `up == null` (kể cả trong thành/tháp/luyện công) | mốc thực | — | `Date.now() >= next` → `spawnUp()` |
| `up != null` | — | giữ | chờ người chơi vào arena (không spawn chồng); `next` chỉ dời lại lúc boss được giải quyết |

`goldBossTick` thêm điều kiện `&& !R.wbArena` (rewards.ts:202) — hai boss không chạy song song.

### 2.3 Spawn & popup

`spawnUp()`:

1. `z = zoneOf(min(S.stage, STAGES))`; `tid = z.boss`; `L = min(stageLevel(S.stage), S.lvl) + 2` (khuôn rewards.ts:206).
2. `wb.up = { tid, L, n: 'Thế Giới · ' + MON[tid].n }`.
3. Banner: `⚔ Boss Thế Giới xuất hiện!` / sub: `<up.n> · Cấp <L>`. Log đậm màu boss. `uiSfx('levelup')`.
4. **Popup**: chỉ khi `#modal` đang ẩn → mở `wbSpawnModal()` (không khóa). Đang mở modal → `toast('⚔ Boss Thế Giới xuất hiện — bấm chip Boss để vào!')`.

Nội dung popup:

```
⚔ BOSS THẾ GIỚI XUẤT HIỆN!
Thế Giới · <tên trùm> · Cấp <L>
Hạ để nhận Vỏ Sò — quay thưởng ở nút 🎁.
[Đến Boss Thế Giới]   [Để sau]
```

- "Đến" → `closeModal()` + `goBossArena()`. "Để sau"/✕/Esc → đóng, boss vẫn chờ.

### 2.4 Arena (khuôn goTown/backFromTown — control.ts:129-145)

`goBossArena()` (từ popup hoặc chip): yêu cầu `S.fac && wb.up`. `R.town = false; R.wbArena = true; R.enemies = []; R.corpses = []`; `obsLoad(WB_MAP)`; `H` về `wbEntrySpot()` — **điểm vào có ít cây nhất**: quét pixel ảnh nền map (canvas 64×64, mapping `scale = A / WORLD.w` tổng quát — ảnh 1:1 hoặc 2×2 mirror đều đúng), chọn điểm **ít màu xanh lá nhất** mà vẫn qua `obsOpen(…, 14)` (dữ liệu vật cản không biết cây trang trí — chỉ thoáng va-chạm thì vẫn "xuất hiện trong lùm cây"); không đọc được ảnh → `obsOpenNear(…, 14)`. Ảnh nền nạp ấm ở tick đầu (`wbBgWarmed` — **không đặt `img()` ở cấp module: vấp TDZ vòng import tròn, app trắng trang**). `snapCamera()`; `R.bgImg = img(WBZ.bg)`; `playMusic(WBZ.id)`; banner "Bí Cảnh Boss Thế Giới"; `uiBump()`; Nếu chưa có `R.wbE` (lần đầu vào trong phiên): tạo boss tại `obsOpenNear(gần điểm vào, bán kính 34)` (boss r=30 cần khoảng trống rộng — fix bug "kẹt với cây" do obsSnap cũ chỉ đảm bảo tâm); `makeEnemy(tid, L, 'boss', …)` rồi `hp = max = max * WB_HP_X; dmg *= WB_DMG_X; n = wb.up.n; wboss = true` — đẩy vào `R.enemies`; `R.wbLife = WB_LIFE`. Vào lại sau khi gục: dùng lại `R.wbE` (HP tiếp diễn), không tạo mới.

`backFromBossArena()`: `R.wbArena = false; R.enemies = []` (boss nằm lại `R.wbE`); `obsLoad(zoneOf(min(S.stage, STAGES)).id)`; `snapCamera()`; bg/nhạc theo zone; `R.spawnT = 0.5`; banner "Trở lại ải"; `uiBump()`. **Không tốn Thổ Địa Phù, không cooldown.**

Bên trong arena, tick chạy như thường trừ các chỗ sau (sửa trong combat.ts):

| Vị trí | Sửa |
|---|---|
| `!R.enemies.length` → gọi `spawnWave()` (combat.ts:272) | arena không gọi — nhánh `if (R.wbArena) { /* chờ hoặc boss đã xử lý */ }` |
| `waveCleared()` (combat.ts:328) | dòng đầu: `if (R.wbArena) { wbVictory(); return; }` — không cộng ải, không đợt mới |
| `stallOut()` (combat.ts:290) | `if (R.wbArena) { R.stall = 0; log('Đánh mãi không hạ — nên rèn đồ rồi quay lại.'); return; }` |
| Handler hồi sinh sau `deadT` (combat.ts:258) | `if (R.wbArena) { backFromBossArena(); log('Bạn gục ngã trước Boss Thế Giới — boss vẫn còn đó.'); return; }` thay cho `spawnWave()` |
| `heroDeath()` (combat.ts:340) | không lùi ải khi `R.wbArena` (chỉ set `R.deadT`) |
| Nút "Về thành" `#bTp` + phím T + Start tay cầm | `R.wbArena ? backFromBossArena() : R.town ? backFromTown() : goTown()` — trong arena nút này chính là "rời bí cảnh" |
| `goldBossTick` (rewards.ts:202) | thêm `&& !R.wbArena` — hai boss không chạy song song |

### 2.5 Thắng / rút lui / thưởng

`wbVictory()` (gọi từ `waveCleared` guard):

1. Thưởng boss thường: xp + `moneyDrop` đã chạy qua `onKill` trước đó (boss là enemy bình thường) — kèm 2–3 món đồ rơi theo `rollDrops`.
1b. **Trang bị xịn (`wbDropPremium`)**: chắc chắn **1 món 4 hoặc 5 dòng** (roll `irnd(4,5)`, đúng số dòng — retry tối đa 20 lần vì `makeItem(..., n)` chỉ là mục tiêu; đồ Vàng `r=2`); thêm **45%** rơi 1 món **đồ bộ** — 10% **Bạch Kim** (`makeSetItem('platina', …, luck 8)`) và 35% **Hoàng Kim** (`makeSetItem('gold', …, luck 8)`). `wbSetDrop` chọn pool: **ưu tiên 80% đúng `grp` bộ nhân vật đang mặc** (dễ kích hoạt bộ) → else ưu tiên bộ của môn phái 70% → giới hạn cấp ≤ max(S.lvl, e.L)+10. Rơi xuống đất cạnh boss, auto-nhặt trong cửa sổ 60s; log ghi rõ `(N dòng · <độ hiếm/bộ>)`. Đo thực tế: roll luôn ra đúng số dòng yêu cầu; hạ 4 boss có 4/5-dòng + 2 lượt rớt đồ Hoàng Kim bộ; soi `it.mag` thấy đủ dòng thuộc tính.
2. Vỏ sò: `n = irnd(SO_MIN, SO_MAX)`; nếu `rw.so.day !== today()` → `n += SO_FIRST_DAY; so.day = today()`. Cộng `so.n`, `rw.stat.wboss++`; `questTick('bosses')` đã có sẵn trong `rwOnKill`.
3. `addText(boss.x, boss.y - 60, '+' + n + ' Vỏ Sò', '#ffd24a', 13)`; log đậm: `Hạ <Thế Giới · tên>! +<n> Vỏ Sò (<tổng> vỏ)`; banner "Boss Thế Giới bị hạ!"; `uiSfx('levelup')`.
4. `wb.up = null; R.wbE = null; R.wbLife = 0; R.wbWaited = 0; R.wbLootAt = R.ground.length; R.wbExitT = WB_EXIT_T (60s)` — người chơi được ở lại **60 giây** nhặt đồ; hết 60s còn đồ mới (trên mốc `wbLootAt`, đồ cũ không giữ người) thì gia hạn 2s/lượt tối đa +12s rồi tự về ải.

Boss rút lui (hết `WB_LIFE` = 20 phút kể từ lúc vào bí cảnh, đếm liên tục): log/toast "Boss Thế Giới rút lui — sẽ quay lại sau."; `wb.up = null; R.wbE = null`; `backFromBossArena()`. `wb.next` = now + 20 phút kể từ lúc này → boss kế sau 20 phút thực.

Vắng mặt/đóng app khi `up != null`: boss giữ nguyên trong save (mốc thực) — mở lại vẫn thấy đang chờ; `RW()` migrate save cũ `t` (giây) → `next` một lần.

## 3. SPEC B — Vỏ Sò & Quay Sò

### 3.1 Dữ liệu

```
rw.so = { n: 0, pity: 0, spins: 0, day: '', }
  n     : số vỏ đang có
  pity  : số quay liên tiếp chưa trúng Tím+ (0..25)
  spins : tổng số lượt đã quay (thống kê)
  day   : ngày gần nhất hạ boss (key 'y-m-d', cho thưởng đầu-ngày)
```

### 3.2 Nguồn Vỏ Sò

| Nguồn | Lượng | Trạng thái |
|---|---|---|
| Hạ Boss Thế Giới | 8–15 (`irnd`) | làm trong đợt này |
| Boss đầu tiên mỗi ngày | +5 | làm trong đợt này |
| Gắn vào nhiệm vụ/thành tựu/sự kiện mùa (qua `grant({so: n})`) | — | mở rộng sau, không code đợt này |

### 3.3 Giao diện quay — bàn quay kiểu Bách Bảo Rương trong tab "Quay Sò" (giftModal)

Mô phỏng Bách Bảo Rương của Kiếm Thế: **bàn 20 ô quanh viền** lưới 8×4 (trên 8 · phải 2 · dưới 8 · trái 2 — theo chiều kim đồng hồ), mỗi loại thưởng chiếm đúng 2 ô trải đều bằng `ringIndex*3 % 10`; ô hiển thị icon + số sao, viền màu theo hạng (Tím/Hoàng Kim/Huyền Thoại). **Giữa bàn là "◆ Bảng Vận Mệnh ◆"** — log 5 kết quả gần nhất. Bên dưới là nút Quay ×1 (1 vỏ) / ×10 (9 vỏ) và chips tỉ lệ.

**Đèn quay (soRingSpin)**: bấm quay → đèn sáng chạy **vòng tròn theo chiều kim đồng hồ quanh 20 ô** (hàng trên trái→phải → cột phải xuống → hàng dưới phải→trái → cột trái lên; khởi động từ vị trí dừng trước đó, luôn trọn ≥1 vòng), tiến đều +1 ô rồi **chậm dần 6 bước cuối**, dừng trùng khít ô trúng, ô trúng nhấp nháy rồi mới phát thưởng + ghi log. ×1 ~4 giây/kịch; ×10 ~1,5 giây/kịch (đủ xem, không lê thê). Đang quay: 2 nút bị khoá; đóng modal giữa chừng thì bỏ animation, thưởng vẫn nhận. **Lưu ý**: phải xếp ô theo `data-ring` trước khi chạy đèn — `querySelectorAll` trả thứ tự DOM theo hàng, dùng trực tiếp sẽ thành đi zigzag trái↔phải (bug thật từng gặp). Kiểm chứng E2E bằng lấy mẫu toạ độ pixel 60ms: 30 bước ngang/dọc đều chiều kim đồng hồ, 0 bước ngược, 0 bước nhảy; ô flash trùng ô dừng, loại ô trúng khớp log thưởng.

Nút ×1 tắt khi `so.n < SO_COST1`, ×10 tắt khi `so.n < SO_COST10`; thiếu vỏ → `toast('Không đủ Vỏ Sò (cần X, đang có Y)')`.

### 3.4 Bảng quà & thuật toán quay

Một bảng `SO_TABLE = [[weight, tier, params]]`, quay bằng `wpick` (core.ts:19). Tạo đồ dùng `makeItem(detail 0–9, sexPart, tier = clamp(round(S.lvl/12)+1, 1, 10), nMagic)`; hàng Tím ép `it.r = 3` sau khi tạo (r Rarity chỉ tới Vàng nếu để tự roll — loot.ts:76). Đồ Hoàng Kim / Huyền Thoại dùng `forceSetItem()` (rewards.ts:83).

| Trọng số | Hạng | Quà |
|---|---|---|
| 25 | thường | Ngân lượng `500 + S.lvl*10` |
| 15 | thường | Thuốc (Kim Sáng Dược / Ngưng Thần đan, tier 2–3, ×5–10) |
| 12 | thường | Phúc Duyên `irnd(5, 15)` |
| 12 | thường | **Vỏ Sò +2–4** — rớt vào khay "Nhận Vỏ Sò" dưới bàn quay |
| 10 | thường | Đồ 4 dòng (`item: 4`) |
| 9 | thường | Đồ 5 dòng (`item: 5`) |
| 6 | **Tím+** | Đồ 6 dòng, `r = 3` |
| 4 | **Tím+** | Nguyên liệu rèn (Huyền Tinh cấp theo lvl ×2–5) |
| 3 | thường | 5 điểm tiềm năng |
| 2 | thường | **Vỏ Sò Vàng +20–35** (viền vàng riêng; KHÔNG tính Tím+ cho pity) |
| 1.8 | **Tím+** | Đồ Hoàng Kim (`set: 1`) |
| 0.2 | **Tím+** | Huyền Thoại: đồ Hoàng Kim + 50 Phúc Duyên |

Bàn 20 ô: 8 loại phổ biến chiếm 2 ô, 4 loại hiếm (tiềm năng, Vỏ Sò Vàng, Hoàng Kim, Huyền Thoại) chiếm 1 ô — bố trí cố định trong `SO_RING_TYPES`. Dưới bàn có 2 khay khuôn Kiếm Thế: "🎁 Nhận thưởng" (loại vừa trúng) và "🐚 Nhận Vỏ Sò" (cộng dồn vỏ rớt trong lần quay, nhún nhẹ khi có vỏ rớt vào).

```
spin():
  if (so.n < cost) return;
  so.n -= cost; so.spins += nLượt;
  for mỗi lượt:
    so.pity++;
    pool = so.pity >= PITY_MAX ? SO_TABLE.filter(hạng Tím+) : SO_TABLE;   // lượt 25 ép Tím+
    r = wpick(pool);
    if (r.hạng Tím+) so.pity = 0;
    grant(đổi r thành g, 'Quay Sò');        // grant tự log + sfx + save
  render lưới kết quả (thẻ lật, trễ 80ms/thẻ)
```

Quay ×10: lặp 10 lượt (pity tích lũy giữa các lượt), tổng chi phí `SO_COST10`.

### 3.5 Mở rộng `grant()` (rewards.ts:72-82)

Thêm 2 nhánh, không đụng chỗ khác:

```ts
if (g.so)  { const so = RW().so; so.n += g.so; out.push(`${g.so} Vỏ Sò`); }
if (g.mat) { matAdd(g.mat.g, g.mat.k, g.mat.n); out.push(`${g.mat.n} ${matName(g.mat.g, g.mat.k)}`); }
```

`matName` hiện là hàm private của stash.ts — hoặc duplicate nhỏ trong rewards.ts hoặc export từ stash.ts (chọn export, stash đã import ngược vài thứ từ ui/save nên không sinh chu kỳ mới có hại).

### 3.6 Vòng lặp import

`worldboss.ts` ↔ `combat.ts` có import chéo (cần `R/H/makeEnemy` và hook `wbTick/wbVictory`) — giống chu kỳ `combat.ts ↔ rewards.ts` đang hoạt động, không phải tránh.

## 4. UI tóm tắt (thành phần phải thấy được)

| Thành phần | Vị trí | Hành vi |
|---|---|---|
| Popup spawn | `wbSpawnModal()` — modal không khóa | [Đến Boss Thế Giới] / [Để sau]; chỉ tự mở khi không có modal nào |
| Chip sân đấu `#wbBtn` | Battle.tsx, cạnh `svBtn` (khuôn Battle.tsx:45-55) | `up != null && !arena`: "⚔ Boss Thế Giới" (class `on pulse`, bấm → `goBossArena()`); `arena`: "Rời bí cảnh" (bấm → `backFromBossArena()`); `!up` và còn ≤60s tới mốc `next`: "⚔ Boss m:ss" mờ, bấm → toast thời gian còn lại; còn lại: ẩn |
| Banner | `R.banner` (render.ts:284) | spawn / thắng / rút lui / vào-ra arena |
| Tab Quay Sò | giftModal (nút 🎁) | mục 3.3 |
| Animation bàn quay | `web/public/style.css` — `.soBoard` lưới 8×4 nền cam viền vàng (khuôn Bách Bảo Rương), `.soCell.cur` đèn chạy (glow vàng + scale), `.soCell.land` ô trúng nhấp nháy, `.soCenter` Bảng Vận Mệnh đè giữa bàn | thay thế cho thẻ lật card |

## 5. Trạng thái biên

| Tình huống | Hành vi spec |
|---|---|
| Popup sắp mở nhưng modal khác đang mở | Không đè — banner + log + toast + chip nhấp nháy |
| Người chơi ở Thành khi boss ra | Popup vẫn hiện (wbTick chạy trước nhánh town check); bấm "Đến" thì `goBossArena()` tự tắt `R.town` |
| Người chơi đang Luyện Công | `tick` không chạy → không spawn, timer đứng — boss ra ngay sau khi thoát Luyện Công |
| Gục trong arena | Tự về ải, boss giữ HP, vào lại được (không reset) |
| Đánh quá 45s không hạ | Không stall-out trong arena (chỉ gợi ý rèn đồ) |
| Hạ boss rồi đứng ở arena | Ở lại **60 giây** nhặt đồ; hết 60s còn đồ mới chưa nhặt thì gia hạn tới +12s rồi tự về ải (chip rời tay vẫn hoạt động mọi lúc) |
| Đang ở arena mà tới giờ spawn boss kế | Không xảy ra — wb.t đứng khi `up != null` hoặc đang ở arena |
| Đóng app khi boss còn sống / đang ở arena | Load lại: boss vẫn đang chờ (mốc thực chưa trôi qua thì chưa hẹn con mới); offline dài nhiều mốc → vẫn chỉ 1 con, không dồn |
| Save cũ (chưa có `rw.wb`, `rw.so`, `rw.stat.wboss`) | `RW()` tự bổ sung mặc định — không migrate, không lỗi |
| Dưới cấp `WB_MIN_LV` | Không spawn; chip/tab vẫn thấy (tab Quay Sò hiện "Cần cấp 10" như tab Tháp — khuôn `unlocked()`) |
| Túi đầy khi nhận đồ từ quay | `grant` → `addItem` đã tự bán món không nhặt được (ui.ts:133) — không rớt đất, không mất vỏ |
| Giữa lượt ×10 một lượt trúng Tím+ | pity về 0 ngay, các lượt sau trong cùng lần quay vẫn tiếp tục bình thường |

## 6. Tiêu chí nghiệm thu (chạy với `WB_EVERY = 15`, `WB_LIFE = 30` bản dev — `wbe/wbl/wbf` là tham số URL, đơn vị giây)

Hook test: mở game với `?wbe=15&wbl=30` → `window.WB_DEBUG` khả dụng (`state()`, `spawnNow()`, `setBossHp(v)`, `die()` — đặt máu ÂM vì engine cộng regen trước khi kiểm `<= 0`, `addSo(n)`, `forcePity(n)`, `setLvl(v)`, `setLife(v)`); không có tham số thì không có hook gì trên window.

**Kết quả E2E (2026-10-05, trình duyệt thật, save nhân vật cấp 17 có sẵn):** 12/12 tiêu chí đạt — spawn/popup/"Để sau"/chip 3 trạng thái; không đè modal đang mở; popup + vào arena từ Thành; timer đứng trong Luyện Công (12.1s → 12.1s sau 6s); hạ boss +8–15 vỏ (+5 đầu ngày), tự về ải 2s, chu kỳ đếm lại; chết trong arena không lùi ải, boss giữ HP qua lần vào lại; boss rút lui hết life; không sinh quái thường/không cộng ải trong arena; quay ×1 trừ 1 / ×10 trừ 9 cho 10 kết quả, thẻ màu theo hạng; pity lượt 25 ép Tím+ và reset; save trước tính năng tự bổ sung trường; tab khóa dưới cấp 10.

1. Chơi thường 15s → banner + log + popup hiện đúng nội dung; bấm "Để sau" → chip "⚔ Boss Thế Giới" nhấp nháy; bấm chip → vào arena, boss đúng tên/cấp, HP thanh đầy.
2. Đang mở Kho chung khi tới giờ → không bị đè modal; có toast + chip.
3. Ở Thành khi tới giờ → popup hiện; "Đến" → ra arena đúng (không kẹt state town).
4. Vào Luyện Công → thoát ra → không mất/giảm timer sai (đếm đứng trong Luyện Công).
5. Hạ boss → +8–15 vỏ (lần đầu trong ngày +5), floating text, log, banner; được ở lại **60s** nhặt đồ rồi tự về ải (đồ mới chưa nhặt hết thì gia hạn +12s), chip chuyển sang đếm ngược chu kỳ.
6. Chết trong arena → về ải, vào lại boss còn HP cũ (không hồi).
7. Ở arena hết `WB_LIFE` (test `wbl=15`) → log "rút lui", tự về ải, chip đếm ngược chu kỳ mới; HUD đếm ngược liên tục kể cả đang đánh (đo: 0:14 → 0:08 khi đang giao chiến).
8. Trong arena không sinh quái thường, không trừ ải khi thắng, không lùi ải khi chết, không stall-out.
9. Quay ×1 khi 1 vỏ: trừ đúng 1, kết quả theo bảng; quay ×10 khi 9 vỏ: 10 kết quả, trừ đúng 9.
10. Pity: xoá random (set weight bằng 0 hoặc mock) — lượt 25 ép Tím+, pity reset sau Tím+.
11. Save cũ v1.4.x nạp vào → không lỗi, `t` cũ được migrate sang mốc `next`; chu kỳ tính theo thời gian thực.
12. Tab Quay Sò khi chưa có nhân vật / dưới cấp 10 → hiển thị khóa, không bấm được.

## 7. Kế hoạch code (thứ tự làm)

| Bước | File | Nội dung |
|---|---|---|
| 1 | `web/src/game/worldboss.ts` (mới, `@ts-nocheck`) | hằng số mục 1; `RW()` mở rộng `wb`/`stat.wboss` — sửa trong rewards.ts; `wbTick`, `spawnUp`, `wbSpawnModal`, `goBossArena`, `backFromBossArena`, `wbVictory`, `wbFlee` |
| 2 | `rewards.ts` | `RW()` thêm `wboss: 0` vào stat + `r.wb`, `r.so` mặc định; `grant()` nhánh `g.so`/`g.mat`; `goldBossTick` thêm `!R.wbArena`; giftModal thêm tab "Quay Sò" + `SO_TABLE` + `spinSo()` |
| 3 | `combat.ts` | hook `wbTick(dt)` cạnh `goldBossTick` (264); guard arena ở `waveCleared`/`stallOut`/handler `deadT`/`heroDeath` |
| 4 | `ui/Battle.tsx` | chip `#wbBtn` (3 trạng thái, `useGameTick`) |
| 5 | `web/public/style.css` | `.pulse`, keyframes `flipIn`, style thẻ kết quả |
| 6 | Smoke + nghiệm thu mục 6 | `npm run build` → `android:sync`; **bẫy rAF khi test pane: đặt `document.hidden` đúng** |
| 7 | Phát hành | Sau khi WIP v1.4.7 được commit; OTA data (không cần APK) theo quy trình DESIGN.md |

## 8. Phụ lục — tham chiếu khuôn mẫu

| Nội dung | Vị trí |
|---|---|
| Chu kỳ/spawn/thưởng Trùm Hoàng Kim | web/src/game/rewards.ts:59, 201-211, 318-326 |
| Hook tick & spawn trong vòng chiến đấu | web/src/game/combat.ts:253-287 (264, 272) |
| `grant()` / `forceSetItem()` | web/src/game/rewards.ts:72-91 |
| `wpick`, `RAR_VI/COL`, `ZONES` | web/src/game/core.ts:19, 71-82 |
| `makeItem` / rarity từ số dòng | web/src/game/loot.ts:87-100 |
| `goTown` / `backFromTown` | web/src/game/control.ts:129-148 |
| `obsLoad` fallback thế giới phẳng | web/src/game/mapobs.ts:12-16 |
| `modal` / `toast` / `log` | web/src/game/ui.ts:104-107 |
| `RW()` tự bổ sung trường | web/src/game/rewards.ts:62-69 |
| giftModal + tabs | web/src/game/rewards.ts:378-393 |
| Chip sân đấu (svBtn) | web/src/ui/Battle.tsx:45-55 |
| Banner canvas | web/src/game/render.ts:284-288 |
| Global `AUD/audApply` (ràng buộc vỏ Android) | web/src/game/audio.ts:82-85 |
| Data zone/town sinh tự động (không sửa tay) | web/src/game/jw.ts |
