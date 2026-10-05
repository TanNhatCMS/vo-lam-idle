# SPEC → PLAN → TASK: Trang bị cho Đồng hành (Pet) + hệ Ngũ hành

> Đợt 2 (đội hình 3 pet, tiến hoá, bí cảnh, đúc Thú Bội, bách khoa…): xem **docs/PET-MO-RONG.md**.

- Ngày lập: 2026-10-05 · Trạng thái: **đã triển khai + E2E đạt** (cùng ngày)
- Phạm vi: chỉ sửa `web/src/**` + `web/public/style.css`. **Không sửa Kotlin/APK** — mọi thứ chạy trong WebView, phát hành bằng **OTA data** (assets không đổi).
- Mọi con số dưới đây là **giá trị mặc định**, gom thành hằng số ở đầu module; đổi số không đổi logic.
- Yêu cầu gốc: (1) thêm **menu/nút ở cuối trang** cho trang bị pet; (2) **xây thuộc tính cho pet** (trước chỉ có cấp + sát thương); (3) **trang bị gắn vào pet → buff thuộc tính vào nhân vật** từ chính món đồ đó; (4) **phân chia pet theo hệ Ngũ hành**; (5) viết tài liệu spec → plan → task.

---

# PHẦN A — SPEC (thiết kế)

## 0. Chốt mặc định (điểm mở trước đây)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | "Menu cuối trang" là gì | Thêm **tab thứ 6 "🐾 Đồng hành"** vào thanh tab đáy (`#tabs`), đặt giữa "Hành trang" và "Khác". Đây là màn quản lý pet: chọn loài + gắn trang bị. |
| 2 | Pet gắn được món gì | **Đúng bộ ô của nhân vật, chỉ thiếu Ngựa** — 10 ô: Vũ khí, Áo, Mũ, Đai lưng, Giày, Hộ uyển, Dây chuyền, Nhẫn 1, Nhẫn 2, Ngọc bội (`PET_SLOTS` = `SLOTS` lọc bỏ `horse`). Món vào ô theo `DETAIL_SLOT[it.d]`; nhẫn chia `ring1`/`ring2` như nhân vật (ưu tiên ô trống, rồi ô yếu hơn). Ngựa (`d` 10) **không** gắn được. Save cũ kiểu 3 ô (`petW`/`petA`/`petJ`) tự migrate sang key mới khi nạp. |
| 3 | Trang bị pet buff nhân vật bao nhiêu | **50%** (`PET_EQ_BUFF`) của **dòng gốc + mọi dòng ma thuật (kể cả dòng ẩn)**. Cộng thẳng vào bảng thuộc tính `calc()` như trang bị thứ hai → sinh lực/nội lực/kháng/crit… tự suy ra theo công thức sẵn có. |
| 4 | Pet có tự mạnh lên theo đồ không | Có: sát thương riêng của pet = nền theo cấp + 35% (`PET_GEAR_POWER`) × tổng `itemPower` 3 món + dòng sát thương; chí mạng và tốc độ lấy từ dòng đồ. |
| 5 | Phân chia hệ Ngũ hành | Mỗi **loài** gán 1 hệ cố định (Kim/Mộc/Thủy/Hỏa/Thổ) suy từ vùng xuất hiện; màn chọn loài nhóm theo 5 hệ. Pet **tương khắc** hệ quái: +25% sát thương (⚡), bị khắc −15%. |
| 6 | Pet có chết / máu không | Không. Pet vẫn bất tử như trước; "thuộc tính" là **sát thương, chu kỳ đánh, chí mạng, hệ, sức mạnh trang bị**, không gồm HP/giáp riêng (giáp pet quy thành buff nhân vật). Giữ đúng hành vi gốc, tránh AI/hồi sinh mới. |
| 7 | Đổi loài pet | Giữ **cấp, kinh nghiệm, và toàn bộ trang bị**; chỉ đổi loài + hệ. |
| 8 | Đồ rơi phù hợp pet có bị auto-sell không | Không: `petWants()` chặn auto-bán món hợp ô pet (khi pet đã mở, túi chưa gần đầy) → nếu không, "bộ tự bán đồ thừa" sẽ ăn hết đồ trước khi người chơi kịp gắn. |

## 1. Hằng số (đầu `core.ts`)

```ts
export const PET_EQ_BUFF   = 0.5;   // % thuộc tính trang bị pet cộng vào NHÂN VẬT
export const PET_GEAR_POWER= 0.35;  // mỗi điểm itemPower của đồ pet -> +sát thương riêng của pet
export const PET_LV        = 20;    // cấp mở khóa Đồng hành (trước ở rewards.ts, nay về core để dùng chung)
export const SERIES_ELEM   = ['phys','poison','cold','fire','light'];  // hệ Ngũ hành -> nguyên tố sát thương (giống enemyHit)
```

Ô trang bị (`core.ts` + `rewards.ts`):

```ts
export const PET_SLOTS = SLOTS.filter(([k]) => k !== 'horse');   // 10 o giong nhan vat
export function petSlotFor(it)  // DETAIL_SLOT[it.d]; 'ring' -> ring1/ring2 (o trong truoc, roi o yeu hon)
function petFits(slot, it)      // mon co vua o cu the khong (dung cho bo chon do theo o)
```

## 2. Dữ liệu lưu (theo nhân vật, `S.rw.pet`)

Save cũ **không cần migrate tay**: `RW()` tự bổ sung tại chỗ (giữ tham chiếu, đúng bài học stale-ref của `wb`/`so`).

```
rw.pet = { tid, lvl, xp, eq: { petW?, petA?, petJ? } }
  tid : id loài (khóa trong JW.mon)
  lvl : cấp pet (lên cấp theo số quái hạ)
  xp  : kinh nghiệm tích lũy (need = 20 + lvl*12)
  eq  : 10 ô giống nhân vật trừ Ngựa (weapon/armor/helm/belt/boot/cuff/amulet/ring1/ring2/pendant; save cũ petW/petA/petJ tự migrate) (Item giống hệt Item trong túi — cùng uid, không nhân bản)
```

- `RW()`: `r.pet = r.pet || null; if (r.pet) r.pet.eq = r.pet.eq || {}`.
- `migrate()` (`save.ts`): lọc `rw.pet.eq` chỉ giữ item hợp lệ (`base`/`mag` là mảng, `0 ≤ d ≤ 9` → loại Ngựa & item hỏng); gộp uid pet vào `maxUid` + khử trùng uid với túi.
- Item đang gắn cho pet **không nằm trong `S.inv`** → không bị `sweepJunk`/`makeRoom`/`sellUnmatched` đụng tới.

## 3. Hệ Ngũ hành cho pet (`petElemOf(tid)`)

```
với mỗi vùng z chứa tid (theo thứ tự ZONES):
   nếu sw(z) lệch (max > min): hệ = vị trí max  -> dừng
nếu mọi vùng đều cân bằng (sw toàn 20): hệ = tid mod 5   (gán tất định, đủ 5 hệ)
```

- Đúng dữ liệu game: `z.sw` là trọng số sinh quái theo hệ; vùng thiên về một hệ (vd Thanh Thành sơn Thổ 80) cho pet hệ đó.
- Vùng cân bằng (Hoa Sơn, Tần Lăng…) gán theo `tid % 5` để vẫn đủ 5 nhóm, tất định giữa các phiên.
- Cache theo tid trong `PET_ELEM`.

Sát thương pet theo hệ: dùng `SERIES_ELEM[elem]` (Kim→vật lý, Mộc→độc, Thủy→băng, Hỏa→hỏa, Thổ→lôi), trừ **kháng nguyên tố** của mục tiêu và cộng/trừ theo `counters()`.

## 4. Thuộc tính pet (`petStats(p)`)

```
lvl  = p.lvl
elem = petElemOf(p.tid)
atk  = (6 + lvl*5) * (1 + lvl*0.04) * (1 + rebornBonus().dmg)      // nền theo cấp (giữ công thức gốc)
       + Σ base vũ khí ô petW (id 28/29, nhân cường hóa)
       + Σ addphysicsdamage_v (toàn bộ đồ)
atk  = atk * (1 + Σ dmgPct/100) + PET_GEAR_POWER * Σ itemPower(đồ pet) + Σ add*damage_v (nguyên tố)
crit = clamp(Σ (deadlystrike_p|deadlystrikeenhance_p|deadlystrike_v), 0, 60)
cd   = clamp(1.2 / (1 + Σ (attackspeed_v|castspeed_v)/100), 0.5, 3)   // chu kỳ đánh (giây)
```

`petTick(dt)`: pet dí quái gần nhất như cũ; khi vào tầm thì `t.hp -= dmg` với `dmg = atk * rnd(0.9,1.1)`, chí mạng ×2, **+25%/+−15%** theo tương khắc, rồi nhân `(100 − kháng nguyên tố của mục tiêu)/100`.

## 5. Buff trang bị pet vào nhân vật (`calc()`, `stats.ts`)

Sau vòng lặp trang bị nhân vật, thêm vòng lặp `S.rw.pet.eq`:

- Mỗi dòng gốc (`it.base`) và **mọi** dòng ma thuật (`it.mag`, cả hiện lẫn ẩn) được `addAttr(A, name, p, PET_EQ_BUFF)`.
- `allskill_v` (dòng +cấp kỹ năng) cũng nhân hệ số.
- **Không** xét yêu cầu cấp/hệ/giới tính (đồ của thú, không của người) và **không** tính dòng bộ (`it.set` ext) để tránh phụ thuộc `S.eq`.
- Nhờ vậy mọi chỉ số suy ra (sinh lực, nội lực, chính xác, né, kháng, crit, tốc đánh, sát thương vũ khí…) **tự động** ăn theo — không cần code riêng cho từng chỉ số.

Vì trang bị pet đi qua `calc()`, `equipCompare`/`power`/`autoEquipAll` của nhân vật cũng phản ánh đúng (không xung đột vì khác nguồn item).

## 6. Giao diện

- **Tab đáy thứ 6 "🐾 Đồng hành"** (`TabsNav.tsx`, `Panel.tsx` `#t-pet`, CSS `#tabs` 6 cột + icon 🐾).
- `renderPet()` (trong `rewards.ts`, đăng ký vào `refresh()` của `ui.ts`):
  - Thẻ thông tin: tên loài, **hệ** (màu theo `SERIES_COL`), cấp, XP, sát thương/đòn, chu kỳ đánh, chí mạng, sức mạnh trang bị.
  - Chi tiết món có khối so sánh chéo: xem đồ trong túi/nhân vật hiện thêm **"Đồng hành đang mặc:"** (món pet ở ô tương ứng); xem đồ pet hiện **"Nhân vật đang mặc:"**.
  - 10 ô trang bị giống nhân vật (lưới `.eqgrid` 4 cột như thẻ Nhân vật); chạm ô trống → `petPickModal(slot)` (danh sách món trong túi hợp ô, sắp theo sức mạnh); chạm món đang gắn → `petItemModal` (xem + Tháo).
  - Nhóm chọn loài theo 5 hệ (`petGrouped()`), đổi loài giữ cấp + trang bị.
- Tab "Đồng hành" cũ trong hộp 🎁 vẫn còn, chỉ trỏ sang tab mới để tránh nhầm.
- **Thẻ Hành trang:** chi tiết món đồ (món đang trong túi, hợp một ô pet, pet đã mở + đã chọn loài) có thêm nút **"Gắn cho Đồng hành"** — bấm là gắn thẳng vào ô tương ứng (Vuốt/Nanh · Giáp · Bội), không cần mở tab Đồng hành. Món không hợp (vd Ngựa `d 10`) hoặc chưa có pet thì nút không hiện.

## 7. Chống nuốt đồ

- `isJunk(it)` (`ui.ts`): trả `false` nếu `petWants(it)` → món hợp ô pet không bị auto-bán.
- `petWants(it)`: hợp ô + pet đã mở + túi chưa gần đầy (`< INV_MAX−6`) + (ô trống hoặc món tốt hơn 90% món đang gắn).

## 8b. Pet đi nhặt đồ auto thay nhân vật (bổ sung 2026-10-05)

Khi **pet ra trận**, pet tự đi nhặt đồ **auto** thay nhân vật; nhân vật ở lại đánh quái (không còn phải rời vị trí để nhặt).

- Luồng: `updateGround()` (`loot.ts`) vẫn chọn mục tiêu auto theo đúng **bộ lọc nhặt đồ** (auto / "chờ hết quái" / "luôn đi nhặt"). Nếu mục tiêu là **auto** (không phải chạm tay) và `petActive()` → đặt `R.petLoot = mục tiêu` và **giao cho pet**, KHÔNG điều khiển nhân vật. Khi pet tới trong tầm `PICK_R` (26) thì `pickUp()`.
- `petTick()` (`rewards.ts`): nếu đang có `R.petLoot` thì **ưu tiên đi nhặt** (bỏ qua đánh quái trong lúc đó); nhặt xong tự quay lại đánh. Bỏ "dây xích 500px" khi đang đi nhặt để pet với tới đồ ở xa.
- Nhân vật chỉ nhặt khi: **chạm tay** (`R.pickTarget`) hoặc **không có pet ra trận**. Điều kiện nhân vật ngừng đánh trong `combat.ts` đổi thành `looting && !R.petLoot && (pickTarget || autoPick)` → pet nhặt thì nhân vật vẫn đánh.
- Không đổi luật nhặt (bộ lọc, "chờ hết quái", "luôn đi nhặt", ngưỡng 40 món, tự bán đồ thừa) — chỉ đổi **ai đi bộ**.
- UI: nhãn bộ lọc ở thẻ Hành trang ghi thêm "(Đồng hành nhặt thay khi ra trận)"; thẻ Đồng hành ghi chú pet tự nhặt auto.

## 9. Phạm vi KHÔNG làm (ghi rõ để tránh hiểu nhầm)

- Không cho pet chết/nhận sát thương, không thêm AI hồi sinh.
- Không thêm ảnh/asset mới (icon tab dùng ký tự 🐾) → **gói OTA `assets` không đổi**, chỉ `data`.
- Không đổi cân bằng nhân vật (buff 50% nằm ngoài trang bị chính, có thể chỉnh 1 hằng số).

---

# PHẦN B — PLAN (kế hoạch triển khai)

Thứ tự thực hiện (đã làm đúng thứ tự này):

| Bước | File | Việc |
|---|---|---|
| 1 | `core.ts` | Thêm `PET_EQ_BUFF`, `PET_GEAR_POWER`, `PET_LV`, `SERIES_ELEM`. |
| 2 | `stats.ts` | `addItemAttr(m, mult)` + vòng lặp `S.rw.pet.eq` trong `calc()` (×`PET_EQ_BUFF`). |
| 3 | `rewards.ts` | Viết lại khối "8. đồng hành": `petSlotFor`, `petElemOf`, `petStats`, `petCur`, `petUnlocked`, adopt/equip/unequip, `petWants`, `renderPet` + 2 modal, `petTick` mới, `drawPet` màu theo hệ, `RW()` thêm `pet.eq`, bỏ `PET_LV` cục bộ (dùng từ core). |
| 4 | `ui.ts` | Import `renderPet`,`petWants`; thêm `pet` vào dispatch `refresh()`; chặn junk qua `petWants`; `findItem` tìm cả `S.rw.pet.eq`. |
| 5 | `TabsNav.tsx`, `Panel.tsx` | Thêm tab `pet` (nhãn "Đồng hành") giữa `inv` và `more`; thêm island `#t-pet`. |
| 6 | `public/style.css` | `#tabs` 6 cột; icon `[data-t=pet]::before` = 🐾; `.peGroup`, `.slotrow.petrow`. |
| 7 | `save.ts` | `migrate()` chuẩn hoá `rw.pet.eq` + uid. |
| 8 | Kiểm thử | `npm run typecheck`, `npm run build`, E2E trình duyệt (mục C.3). |
| 8b | `loot.ts`, `combat.ts`, `rewards.ts` | Pet đi nhặt đồ auto thay nhân vật: `R.petLoot` + ưu tiên trong `petTick` + điều kiện ngừng đánh của nhân vật + `petActive()`. |
| 9 | Tài liệu | File này. |

Nguyên tắc: **không tạo module mới** (đặt logic pet trong `rewards.ts` nơi đã có pet) để tránh vòng import mới; `ui.ts ↔ rewards.ts` đã có vòng import sẵn và chạy tốt.

---

# PHẦN C — TASK (việc + nghiệm thu)

## C.1 Checklist việc

| # | Việc | Trạng thái |
|---|---|---|
| T1 | Hằng số pet ở `core.ts` | ✅ |
| T2 | `calc()` cộng thuộc tính đồ pet vào nhân vật (×0.5) | ✅ |
| T3 | Mô hình `rw.pet.eq` + `RW()` bổ sung tại chỗ | ✅ |
| T4 | `petElemOf` + nhóm 5 hệ + tương khắc trong `petTick` | ✅ |
| T5 | `petStats` (atk/crit/cd/power) từ cấp + hệ + đồ | ✅ |
| T6 | Gắn/tháo trang bị pet (10 ô giống nhân vật trừ Ngựa) + modal chọn/xem | ✅ |
| T7 | Tab đáy thứ 6 "Đồng hành" + icon + CSS 6 cột | ✅ |
| T8 | `petWants` chặn auto-bán đồ hợp pet | ✅ |
| T9 | `migrate()` chuẩn hoá save cũ + uid | ✅ |
| T10 | `typecheck` + `build` + E2E | ✅ |
| T11 | Tài liệu spec/plan/task | ✅ |
| T12 | Pet đi nhặt đồ auto thay nhân vật (`updateGround`/`petTick`/`combat`) | ✅ |
| T13 | Nút "Gắn cho Đồng hành" trong chi tiết đồ ở thẻ Hành trang (khi khả dụng) | ✅ |

## C.2 Lệnh kiểm tra tĩnh

```bash
cd web
npm run typecheck      # tsc --noEmit -> PASS
npm run build          # next build static export -> PASS (Compiled successfully)
```

## C.3 Nghiệm thu E2E (đã chạy, trình duyệt thật)

Kịch bản: seed save cấp 25 phái Thiếu Lâm, túi có 3 món (vũ khí `addphysicsdamage_v 50`, giáp `lifemax_v 500`, bội `deadlystrike_p 10`), `autoEquip/autoJunk = false` (để món nằm lại trong túi), pet "Heo rừng" hệ Mộc, ô trang bị trống. Gắn lần lượt qua **UI thật** (chạm ô → chọn món).

| Kịch bản | Kỳ vọng | Kết quả đo |
|---|---|---|
| Thanh tab đáy | có 6 nút, gồm "Đồng hành" | 6 nút: Giang hồ/Nhân vật/Võ công/Hành trang/**Đồng hành**/Khác ✅ |
| Gắn giáp (`lifemax_v 500`) | Sinh lực nhân vật +250 (50%) | 492 → **742** ✅ |
| Gắn vũ khí | Sát thương vũ khí tăng, pet atk tăng | 8–9 → **42–45**; pet atk 45 → **350** ✅ |
| Gắn bội (`deadlystrike_p 10`) | Chí mạng nhân vật +5, pet crit +10 | crit 0 → **5%**; pet crit **10%** ✅ |
| Sức mạnh trang bị pet | = Σ itemPower | **601** ✅ |
| Túi sau khi gắn 3 món | 3 → 0 | **0/60** ✅ |
| **Reload** | giữ nguyên buff + trang bị | life **742**, pet atk **350**, 3 ô có món ✅ |
| Tháo 1 món | về túi +1 | túi **0 → 1**, ô Bội trống ✅ |
| Đổi loài | giữ cấp + trang bị, đổi hệ | Heo rừng(Mộc) → Sói xám(Kim), gear power **530** giữ nguyên ✅ |
| Migrate save cũ | bỏ món sai (Ngựa `d10`, item thiếu `base`) | `pet.eq` sau migrate = **[]** ✅ |
| Lỗi JS runtime | không có | `errs = []` ✅ |
| **Pet đi nhặt auto** (3 món cách nhân vật 400–565px, pet ra trận) | pet tự tới nhặt, nhân vật đứng yên | nhân vật giữ nguyên 768,768 (cách đồ 400px); pet tới (1126,781)/(784,1141) nhặt 2 món đầu ở t≈2,4s và 5,4s; `petLoot` bật 38 khung; túi 0→3 món ✅ |
| **10 ô giống nhân vật** (đổi từ 3 ô) | đủ 10 ô, không có Ngựa; migrate save cũ | save cũ `petW`/`petA`/`petJ` → `weapon`/`armor`/`amulet`; lưới 10 ô (Vũ khí…Ngọc bội, không Ngựa); gắn Mũ `lifemax_v 200` qua picker → sinh lực nhân vật 492→**592** (+50%) ✅ |

> Ghi chú kiểm thử: trong pane xem thử của ZCode, `requestAnimationFrame` bị treo (0 khung/2,9s) nên vòng lặp không tự chạy; đã xác minh bằng cách gọi thẳng hàm mô phỏng `simulate()` qua hook tạm (đã gỡ khỏi mã). Ngoài ra dev server có thể phục vụ chunk cũ — cần thêm tham số `?cb=<time>` khi nạp lại để lấy mã mới.

## C.4 Việc còn có thể làm sau (không thuộc yêu cầu gốc)

- Icon tab riêng (`ui/ic_pet.png`) — hiện dùng 🐾 để **không đổi gói assets**.
- Pet có HP/nhận sát thương, hoặc kỹ năng pet chủ động.
- Hiệu ứng hình khi pet tương khắc (hiện chỉ có dấu ⚡ trên số sát thương).
- Cân bằng lại `PET_EQ_BUFF` sau khi đo lực chiến thực tế ở cấp cao.
