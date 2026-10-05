# SPEC → PLAN → TASK: Mở rộng hệ Đồng hành (pet) — Đợt 2

- Ngày lập: 2026-10-05 · Trạng thái: **đã triển khai + E2E đạt** (cùng ngày, phát hành 1.7.0)
- Phạm vi: `web/src/**` + `web/public/style.css`. Không sửa Kotlin/APK. GitHub Actions đang bị khoá → phát hành **thủ công** (OTA data + `npx wrangler deploy`).
- 7 tính năng + 4 QoL theo yêu cầu: (1) đội hình 3 pet + trận pháp ngũ hành, (2) tiến hoá/phẩm chất/kỹ năng pet, (3) auto-gắn đồ pet + bộ lọc, (4) Ngũ Hành Bí Cảnh, (5) đúc Thú Bội ở Rèn đồ, (6) Bách khoa Đồng hành, (7) đột phá pet bằng Vỏ Sò/Phúc Duyên; QoL: pet đi vòng vật cản, nút lấy hết đồ, cảnh báo túi đầy, HUD số pet + hồi chiêu kỹ năng.

---

# PHẦN A — SPEC

## 0. Chốt mặc định

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | Nhiều pet lưu kiểu gì | `rw.pets` = object theo `tid` (mỗi loài 1 con, có `lvl/xp/eq/star`). `rw.pet` **vẫn là con ra trận** nhưng là **cùng tham chiếu** tới entry trong `rw.pets` (nạp lại từ save thì gắn lại tham chiếu) → mọi mutation qua `rw.pet` tự cập nhật roster, không diverge. |
| 2 | Đội hình | `rw.team = [tid|null, tid|null, tid|null]` = [ra trận, hộ mệnh 1, hộ mệnh 2]. Một `tid` không đứng 2 chỗ. Đổi `team[0]` = đổi pet ra trận. |
| 3 | Hộ mệnh cộng gì | **Chỉ trang bị** của 2 hộ mệnh cộng vào nhân vật theo `PET_BENCH_BUFF = 0.25` (ra trận là `PET_EQ_BUFF = 0.5`). Hộ mệnh không đánh. |
| 4 | Trận pháp ngũ hành | **Tam Tương Sinh**: elem(pet0) sinh elem(pet1) **và** elem(pet1) sinh elem(pet2) (chuỗi Kim→Thủy→Mộc→Hỏa→Thổ) → nhân vật **+5% sát thương** (`TEAM_CHAIN_PCT`). **Tam Đồng Khí**: 3 con cùng hệ → pet ra trận **+15% sát thương riêng** (`TEAM_SAME_ATK`). |
| 5 | Phẩm chất (sao) | `star` 0..4: **Thường → Lương → Thượng → Trân → Hoàn Mỹ**. Mỗi sao: pet **+12% sát thương riêng** (`STAR_ATK_PCT`) và mở/nâng kỹ năng pet. |
| 6 | Tiến hoá (lên sao) | Điều kiện `lvl ≥ [20,40,60,80][star]` + **Huyền Tinh** cấp `[2,3,4,5][star]` × `[20,40,80,160][star]` + lượng `[5k,15k,40k,100k][star]`. Tối đa 4★. |
| 7 | Kỹ năng pet | **Chủ động**, mở khi `star ≥ 1`. Mỗi hệ một chiêu (Kim/Mộc/Thủy/Hỏa/Thổ), pet tự dùng khi có quái trong bán kính 140: nổ sát thương nguyên tố theo hệ lên tối đa 3 mục tiêu, mỗi mục tiêu `atk × (2 + 0.5×star)`, tương khắc/kháng tính như đòn thường. Hồi chiêu **30s** (`PET_SKILL_CD`), đếm ngược trên HUD. |
| 8 | Ngũ Hành Bí Cảnh | 5 cửa theo hệ. Vào từ thẻ Đồng hành; trong bí cảnh **mọi quái ép hệ** đã chọn, hạ **30 con** (`REALM_KILLS`) là xong: thưởng lượng + Huyền Tinh + Vỏ Sò, mỗi quái trong bí cảnh 25% rớt Huyền Tinh. Xong 1 cửa: cooldown **5 phút thực** cho cửa đó (`rw.realmCd[elem] = epoch`). Rời bí cảnh khi: xong, chết, đổi ải, về thành, vào tháp/boss. |
| 9 | Đúc Thú Bội | Card mới trong **Rèn đồ**: tốn Huyền Tinh cấp `clamp(round(S.lvl/12)+1,1,10)` ×30 + 3000 lượng → 1 món **`petOnly`** ngẫu nhiên (Vũ khí 30% · Giáp 20% · còn lại chia đều), hệ = hệ pet ra trận, cấp theo nhân vật, 4 dòng. `petOnly` món: **nhân vật không mặc được** (`reqOk` = false), không bị auto-bán/tự bán, pet mặc bình thường. |
| 10 | Bách khoa Đồng hành | Tab mới **"Đồng hành"** trong Bách khoa (`codexModal`): mọi loài có anim chia theo 5 hệ, đánh dấu ✔ loài **đã từng dẫn** (`rw.petSeen`); tiến độ mỗi hệ; đủ 100% một hệ → nhận **+10 Phúc Duyên** một lần (`rw.codexPet`). |
| 11 | Đột phá bằng tiền tệ | "Nạp linh lực" **+1 cấp** cho pet: tốn `5 + floor(lvl/10)` **Vỏ Sò** hoặc **8 Phúc Duyên** (2 nút, chọn 1 trong 2). |
| 12 | Auto-gắn đồ pet | `S.autoPet` (mặc định **bật**): mỗi 30s quét hành trang, mỗi ô gắn món **tốt hơn 5%** món đang gắn (`petAutoEquip`, im lặng — không toast/đóng modal). |
| 13 | Bộ lọc giữ đồ pet | `rw.petF.elemOnly`: bật thì chỉ **giữ** món cùng hệ với pet ra trận (đồ hệ khác bán như thường). |
| 14 | QoL | Pet di chuyển bằng `obsSteer` (đi vòng vật cản như nhân vật). Nút **"Lấy hết đồ trên đất (N)"** ở thẻ Hành trang. Pet nhặt mà túi đầy → toast nhắc (throttle 30s). HUD: chip **🐾 N** (số pet sở hữu, bấm mở thẻ Đồng hành) kèm **⏳ Xs** hồi chiêu kỹ năng. |

## 1. Hằng số (`core.ts`)

```ts
export const SINH = { 0: 2, 2: 1, 1: 3, 3: 4, 4: 0 };      // a sinh b (Kim sinh Thủy…)
export const PET_BENCH_BUFF = 0.25, TEAM_CHAIN_PCT = 5, TEAM_SAME_ATK = 15;
export const STAR_MAX = 4, STAR_ATK_PCT = 12;
export const STAR_NAMES = ['Thường', 'Lương', 'Thượng', 'Trân', 'Hoàn Mỹ'];
export const STAR_REQ_LV = [20, 40, 60, 80];
export const STAR_COST = [{ ht: '2', n: 20, gold: 5000 }, { ht: '3', n: 40, gold: 15000 }, { ht: '4', n: 80, gold: 40000 }, { ht: '5', n: 160, gold: 100000 }];
export const PET_SKILL_CD = 30, PET_SKILL_RAD = 140, PET_SKILL_MAX = 3;
export const REALM_KILLS = 30, REALM_CD = 300, REALM_HT_CHANCE = 0.25;
export const FD_LEVEL_COST = 8;                              // Vỏ Sò tính theo cấp: soLevelCost(lvl) = 5 + floor(lvl/10)
export const petElemOf = tid => {…};                          // chuyển từ rewards.ts sang core (guide.ts dùng lại)
```

## 2. Dữ liệu lưu (theo nhân vật)

```
rw.pets     : { [tid]: { lvl, xp, eq, star } }
rw.pet      : tham chiếu tới rw.pets[team[0]] (con ra trận; save cũ 1 pet tự chuyển vào roster)
rw.team     : [tid|null, tid|null, tid|null]
rw.petSeen  : { [tid]: 1 }                    // codex: loài đã từng dẫn
rw.realmCd  : { [elem]: epochMs }             // cooldown bí cảnh theo hệ
rw.petF     : { elemOnly: 0|1 }               // bộ lọc giữ đồ pet
rw.codexPet : { [elem]: 1 }                   // thưởng codex đã nhận theo hệ
S.autoPet   : 0|1                             // auto-gắn đồ pet (mặc định bật)
```

- `migrate()` chuẩn hoá **eq của mọi pet trong roster** (key 10 ô, bỏ Ngựa `d10`/item hỏng) và gộp uid toàn bộ.
- `RW()` dựng lại `rw.pet = rw.pets[team[0]]` (tham chiếu), tạo roster từ `rw.pet` cũ nếu thiếu.

## 3. Tính toán

- `calc()` (`stats.ts`): sau vòng trang bị pet ra trận (×`PET_EQ_BUFF`), thêm vòng **eq của 2 hộ mệnh** ×`PET_BENCH_BUFF`; nếu **Tam Tương Sinh** thì `P.dmgMul *= 1 + TEAM_CHAIN_PCT/100`.
- `petStats(p)` (`rewards.ts`): `atk *= (1 + STAR_ATK_PCT×star/100) × (đồng khí ? 1 + TEAM_SAME_ATK/100 : 1)`.
- Kỹ năng: đòn burst đi cùng đường `applyPart` (nguyên tố theo hệ pet, tương khắc ±, kháng mục tiêu) — reuse logic `petTick`.

## 4. Giao diện

- **Thẻ Đồng hành**: thông số pet (thêm **phẩm chất sao** + kỹ năng + đội hình), lưới 10 ô như trước; thêm khối **Đội hình** (3 ô chọn: Ra trận / Hộ mệnh 1 / Hộ mệnh 2 — dropdown các pet sở hữu); nút **Tiến hoá** (hiện điều kiện + giá), 2 nút **Nạp linh lực** (Vỏ Sò / Phúc Duyên), 5 nút **Bí cảnh** (đếm ngược cooldown), **Đúc Thú Bội**, toggle **Tự gắn đồ** + **Chỉ giữ đồ cùng hệ**, nút **Bách khoa**.
- **Bách khoa** (`codexModal`): tab "Đồng hành".
- **Rèn đồ** (`forgeModal`): card "Đúc Thú Bội".
- **Hành trang**: nút "Lấy hết đồ trên đất (N)".
- **HUD** (`TopBar`): chip 🐾 (số pet + hồi chiêu kỹ năng).

---

# PHẦN B — PLAN (thứ tự triển khai)

| Bước | File | Việc |
|---|---|---|
| 1 | `core.ts` | Hằng số + `SINH` + chuyển `petElemOf` sang core. |
| 2 | `save.ts` | migrate: roster + chuẩn hoá eq mọi pet + uid. |
| 3 | `rewards.ts` | Roster/team/adopt/switch, `petStats` (star + đồng khí), `petTick` (obsSteer + kỹ năng), tiến hoá, nạp linh lực, bí cảnh (spawn/reward/cooldown), codex modal, `petAutoEquip`, `petWants` elemOnly, `petForgeItem`, `renderPet` mở rộng. |
| 4 | `stats.ts` | calc: hộ mệnh ×0.25 + Tam Tương Sinh. |
| 5 | `combat.ts` | spawnWave hook bí cảnh + sweep gọi `petAutoEquip`. |
| 6 | `loot.ts` | `pickAllGround` + cảnh báo túi đầy khi pet nhặt. |
| 7 | `forge.ts` | Card Đúc Thú Bội. |
| 8 | `guide.ts` | Tab "Đồng hành" trong codexModal. |
| 9 | `ui.ts` | Nút lấy hết đồ; `sellProtected`/`isJunk`/`makeRoom` cho `petOnly`; `reqOk` chặn `petOnly` (stats.ts); gotoStageclear realm. |
| 10 | `control.ts` | `goTown` dọn bí cảnh. |
| 11 | `TopBar.tsx` + CSS | Chip 🐾 HUD. |
| 12 | Kiểm thử | typecheck, build, E2E từng tính năng (trình duyệt + hook mô phỏng cho phần cần tick). |
| 13 | Tài liệu | Cập nhật file này (đánh dấu TASK) + memory. |
| 14 | Phát hành | `android:sync` → manifest **1.7.0** → release (data + patch; assets không đổi) → commit/push → `wrangler deploy`. |

---

# PHẦN C — TASK

| # | Việc | Trạng thái |
|---|---|---|
| T1 | Hằng số + SINH + petElemOf về core | ✅ |
| T2 | Roster `rw.pets` + team + migrate | ✅ |
| T3 | Đội hình UI (ra trận + 2 hộ mệnh) | ✅ |
| T4 | Hộ mệnh buff ×0.25 + trận pháp (tương sinh/đồng khí) | ✅ |
| T5 | Sao + tiến hoá (Điều kiện + giá + hiệu ứng) | ✅ |
| T6 | Kỹ năng pet chủ động + hồi chiêu + HUD đếm ngược | ✅ |
| T7 | Ngũ Hành Bí Cảnh (ép hệ, 30 kill, thưởng, cooldown, rời đúng lúc) | ✅ |
| T8 | Đúc Thú Bội ở Rèn đồ + `petOnly` (chặn mặc/nhặt bán) | ✅ |
| T9 | Bách khoa Đồng hành + thưởng theo hệ | ✅ |
| T10 | Nạp linh lực (Vỏ Sò / Phúc Duyên) | ✅ |
| T11 | Auto-gắn đồ pet + lọc giữ đồ theo hệ | ✅ |
| T12 | Pet đi `obsSteer` + nút lấy hết đồ + cảnh báo túi đầy | ✅ |
| T13 | HUD chip 🐾 (số pet + hồi chiêu) | ✅ |
| T14 | typecheck + build + E2E | ✅ |
| T15 | Cập nhật docs/memory | ✅ |
| T16 | Phát hành 1.7.0 thủ công | ✅ |

## Nghiệm thu E2E (trình duyệt thật + mô phỏng qua hook tạm, đã gỡ)

| Kịch bản | Kỳ vọng | Kết quả |
|---|---|---|
| Roster 3 pet (save seed) | HUD chip 🐾3, thẻ "3 loài sở hữu" | ✅ |
| Đội hình [Kim, Thủy, Mộc] | hiện "Tam Tương Sinh: +5% sát thương", DPS chiêu chính 9→10 | ✅ |
| Hộ mệnh mang giáp `lifemax_v 500` | sinh lực nhân vật +125 (25%) | 552→677 ✅ |
| Tiến hoá (cấp 20 + 20 Huyền Tinh 2 + 5k lượng) | 0★→1★ Lương, mở kỹ năng | ✅ |
| Nạp linh lực (Vỏ Sò / Phúc Duyên) | +1 cấp mỗi lần | 20→21→22 ✅ |
| Bí Cảnh Mộc (ép hệ, 30 kill) | kỹ năng tự nổ 2 lần, hoàn thành → thưởng + cooldown 5 phút | got 30/30, `realmCd` set ✅ |
| Kỹ năng HUD | chip 🐾3⚡ khi sẵn sàng, đếm ngược Xs | ✅ |
| Đúc Thú Bội (30 Huyền Tinh cấp theo nhân vật + 3000 lượng) | món Tím 4 dòng hệ pet, `petOnly` | "Thú Bội · Câu Liêm Thương" hệ Kim ✅ |
| `petOnly` | nhân vật không mặc được (nút Trang bị khoá), không bị auto-bán, auto-gắn lên pet | ✅ |
| Auto-gắn đồ pet (sweep 30s) | vũ khí tốt hơn trong túi tự vào ô Vũ khí pet | "ThuKhi" ✅ |
| Bách khoa Đồng hành | tab mới "Đã gặp 1/111 loài · Hệ Kim 1/20" | ✅ |
| Lấy hết đồ trên đất | nút bấm nhặt mọi món vào túi | got 4 ✅ |
| Pet kẹt đường | đếm frame không tiến bộ → dịch về cạnh chủ | sửa xong, pet bám trận ✅ |

Bài học kiểm thử: (1) string tiếng Việt có dấu trong build bị minifier escape (vd `Đồng hành đang mặc`) — grep chữ thường trượt, phải soi bằng công cụ chịu escape; (2) script chỉnh file nhiều chỗ phải ghi file SAU cùng (assertion văng giữa chừng làm mất cả batch thay đổi trước đó); (3) node tab bị re-render 10Hz — click tab cần retry tới khi `#t-x.className === 'tab'`.
