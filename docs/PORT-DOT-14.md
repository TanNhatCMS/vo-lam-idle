# ĐỢT 14 — Port lỗ hổng so sánh nguồn (release v2.4.0)

So sánh `P:/volam.vinarpg.com/js/*.js` (nguồn chuẩn, user chốt dùng bản clone) với `web/src/game/*.ts`
thấy 10 tính năng gốc có mà port chưa có. Đợt này port hết, chia 6 agent song song theo **file sở hữu**
(không agent nào đụng file của agent khác). Phát hành data-only v2.4.0.

**Không port:** sk9/sách kỹ năng (dead code — J.skills không có skill tier 90 hay book ngay cả ở gốc);
thành thị Biện Kinh (bản clone chỉ có chữ "Biện Kinh" trong text tự mua vũ khí — hệ thống thành thị
chỉ có trong bundle 2026-10-09 mà user đã bỏ qua); chat thế giới server (game offline); supportModal
(QR tác giả gốc); game-update/browser-cache (web PWA — app dùng OTA native); set-audit (tool dev).

## Phân vùng file (KHÔNG agent nào edit file của agent khác)

| Agent | Tính năng | File sở hữu | Reference đọc |
|---|---|---|---|
| COMBAT | F1 Tuyệt chiêu boss + F2 Lá chắn nội lực | `combat.ts`, `stats.ts` | `combat.js` (bossUlt:318, absorbDamageWithMana:152, autoTarget:204), `stats.js` (calc: manaShield) |
| SURVIVAL | F3 Tiến hóa Sinh tồn | `survival.ts` | `survival.js` (svEvo*:68-78, svTimeGems:539, svChooseEvolution:614, SV_EVOLUTIONS) |
| PET | F4 Kỹ năng pet theo loài | `rewards.ts` | `rewards.js` (PET_SKILLS:420, petSkillRows:421, petSkillHit/Heal/Stun/Slow/Expose/Poison/Bleed:424-470, petCastSkill) |
| TOWER2 | F5 Bộ đồ Tháp II (rơi từ trùm) | `sets.ts`, `tower2.ts` | `sets.js` (tower2SetTier/Reward:~200, tower2DropChance, setDropEligible, TOWER2_SET_ROWS), `combat.js` (nơi gọi tower2SetReward khi hạ trùm Tháp II) |
| FORGE | F6 Mua Huyền Tinh + F8 Rèn ngẫu nhiên | `recipes.ts`, `forge.ts` | `recipes.js` (buyHT, htBuyCost, htInsureCost), `forge.js` (randomForge, randomForgeProfile, applyRandomForgeProfile, htModal data-buy) |
| MID | F7 Lưu trữ điểm tiềm năng + F9 Sưu tập bộ đồ (Dex) + F10 Bảng lọc đồ nâng cao | `save.ts`, `depth.ts`, `loot.ts`, `ui.ts` | `save.js` (safeKeys:27, cleanPotentialBundle:67, cleanPotentialArchive:72, fitPotentialAttributes:83, restoreArchivedPotential:95, load:218-226), `depth.js` (dexSet:128, dexSetGroups:131, dexSetsDone), `loot.js` (loot-panel: isLowSetForAutoLoot, lootMatchReason, goiY, hiddenHint, smart/custom mode), `ui.js` (renderLootPanel, dex view) |

## Chi tiết từng tính năng

### F1 — Tuyệt chiêu boss (COMBAT)
Boss ra đòn đặc biệt: text "Tuyệt chiêu!", gây `min(0.5, goldBoss?0.42:0.35) × P.life × rnd(0.9,1.1) × diffOf().dmg`,
áp hệ (`applyPart`), statusRes, status 2.5s (poison/cold/fire), `sorbDamage`, `tower2Bonuses(e).taken`,
`petGuard`, blockRate hóa giải. Đọc `combat.js` để biết **điều kiện触发** (boss attack có几率触发 — tìm call site
trong enemyAI) và port y logic. Cần `addText` (đã có trong render.ts — check import).

### F2 — Lá chắn nội lực (COMBAT)
Chỉ số `P.manaShield` (%): khi nhận sát thương, hút `min(R.mana, d × manaShield/100)` vào mana, text xanh
`-X NL`. Tìm trong `stats.js` cách manaShield được tính (từ attr đồ/ge code nào) → port vào calc của `stats.ts`.
Gọi `absorbDamageWithMana(d)` trong đường nhận sát thương của combat.ts (tìm nơi hero nhận dmg — heroHit/ enemyAttack).

### F3 — Tiến hóa Sinh tồn (SURVIVAL)
`SV_EVOLUTIONS` (bảng tiến hóa theo loại sinh tồn), `svEvoKind/svEvoOptions/svEvoInfo/svEvoOf`,
`svChooseEvolution(id)` (UI chọn 1 tiến hóa mỗi lần chơi), `svTimeGems/svSpawnTimeGem/svStars/svSkillIcon`,
`svRayCount`, `timeReady`. Lưu `SV.evo` trong save (S.sv?). Đọc survival.js toàn bộ phần này rồi port.
Giữ nguyên mọi tính năng sinh tồn đang có.

### F4 — Kỹ năng pet theo loài (PET)
`PET_SKILLS[tid]` (mỗi loài pet bộ kỹ năng riêng: gây choáng/làm chậm/hút phòng/độc/rỉ máu/hồi máu…),
`petSkillRows(tid, lvl)` (hiện hàng kỹ năng trong modal pet), `petSkillHit/Heal/Stun/Slow/Expose/Poison/Bleed`,
`petCastSkill` (đúc kỹ năng khi castPetSkill). Port vào rewards.ts — nâng `castPetSkill` hiện có lên hệ PetSkill
theo loài, giữ chiêu AoE hệ hiện tại làm fallback cho pet không có skill riêng. Modal pet (nếu đang trong
rewards.ts) thêm hàng kỹ năng; **nếu modal pet nằm ở ui.ts thì KHÔNG edit ui.ts** — ghi đoạn markup/handler
vào final report để agent chính wiring.

### F5 — Bộ đồ Tháp II (TOWER2)
`tower2SetTier(floor, source)` (tầng 200 → bộ cấp 200, tầng thấp → bộ vàng req 180), `tower2SetReward(floor, source)`
(pool + 80% ưu tiên bộ cùng phái, `makeSetItem('gold', row, lucky/10)`), `tower2DropChance`, `setDropEligible`.
Nối vào tower2.ts: khi hạ trùm/elite Tháp II có chance rơi bộ (tìm trong combat.js/rewards.js cách gốc gọi
tower2SetReward — có thể qua reward table của tower2). `TOWER2_SET_ROWS` đã có sẵn ở sets.ts:67 — dùng lại.

### F6 — Mua Huyền Tinh (FORGE)
`buyHT(lvl, n)`: giá `htBuyCost(lvl) × n`, tối đa HT_MAX, trừ vàng → `matAdd('ht', lvl, n)`.
Nối vào `htModal` trong forge.ts: nút mua (`data-buy` → `buyHT(+dataset.buy, 3 - matHave('ht', +dataset.buy))`
— mua đủ 3 cấp chưa có). Đọc forge.js htModal để lấy markup nút mua.

### F8 — Rèn ngẫu nhiên (FORGE)
`randomForgeProfile`, `applyRandomForgeProfile`, `randomForge` — profile rèn ngẫu nhiên (đọc forge.js để hiểu
ngữ cảnh: chọn ngẫu nhiên chỉ số rèn thay vì cố định). Nối vào UI rèn trong forge.ts.

### F7 — Lưu trữ điểm tiềm năng (MID)
`safeKeys` (bảo vệ prototype), `cleanPotentialBundle`, `cleanPotentialArchive`, `fitPotentialAttributes(attr, limit)`,
`restoreArchivedPotential(state, limit)`. Hook trong save load: `s.attrPotentialArchive = cleanPotentialArchive(...)`,
`restoreArchivedPotential(s, potentialBudget)` khi tải save (save.js:218-226). Port vào save.ts — **chú ý vòng
module: save.ts import từ core.ts; không import ngược**. Tìm `potentialBudget` (core.js) — nếu port chưa có
`potentialPointBudget/Limit/Used` thì port thêm vào core.ts... **NHƯNG core.ts không nằm trong phân vùng** → nếu cần,
ghi vào final report để agent chính thêm (hoặc tự viết trong save.ts nếu tự chứa được).

### F9 — Sưu tập bộ đồ Dex (MID)
`dexSet(n)` (đánh dấu `S.setSeen[name]` — gọi khi có đồ bộ mới vào tay: trong addItem/craft), `dexSetGroups()`,
`dexSetsDone()` (độ hoàn thiện từng bộ). UI: đọc ui.js tìm nơi hiện dex (Bách khoa hoặc view riêng) → port vào ui.ts.
`S.setSeen` thêm vào save (migrate đọc `o.setSeen`).

### F10 — Bảng lọc đồ nâng cao (MID)
Port `.loot-panel` đầy đủ từ loot.js + `renderLootPanel` (ui.js): chế độ smart/custom, minReqLvl, toggle đồ bộ/
vật liệu/thường, skipLowSets, danh sách đồ trên đất kèm pick/preview, `isLowSetForAutoLoot`, `lootMatchReason`,
`goiY`, `hiddenHint`. **Thay thế** `lootPanelHTML()`/`bindLootPanel(scope)` hiện có trong ui.ts:1009-1044 — giữ nguyên
cách dùng (`renderAutoPanel` gọi `lootPanelHTML()` + `bindLootPanel(el)`, id `#autoLootPanel` phải còn hoạt động,
vì Cài đặt Auto đang dùng). Nếu gốc tách loot panel ra module riêng thì đặt logic vào `loot.ts` (export), markup/
bind trong ui.ts.

## Quy tắc chung cho mọi agent
1. File port đầu dòng có `// @ts-nocheck` — giữ nguyên.
2. Comment tiếng Việt không dấu, style giống code xung quanh.
3. Đọc reference (`P:/volam.vinarpg.com/js/*.js`) để hiểu hành vi, **tự viết TS** (đúng logic + markup giống gốc),
   không copy nguyên file.
4. **KHÔNG đọc S/R/RW() ở top-level module** (crash "at module evaluation" làm chết bundle).
5. **Import ĐỦ mọi identifier** — thiếu import dưới @ts-nocheck = chết nút lặng lẽ. Sau khi xong chạy
   `node web/scripts/audit_imports.py` (từ gốc repo) để tự kiểm, sửa đến khi hết lỗi.
6. **KHÔNG** chạy `npm run build`, `npm run android:sync`, `git commit/push`, `npx playwright test`
   (agent chính làm sau khi ghép). Chỉ edit file + viết test.
7. Giữ nguyên mọi tính năng đang có — đừng phá cũ. Khi unsure, giữ nhánh cũ + thêm nhánh mới.
8. E2E test: viết `web/tests/<feature>.spec.ts` theo pattern `web/tests/regression.spec.ts` (đọc file đó trước:
   boot → tạo nhân vật scripted → thao tác → assert). Test phải độc lập, tự tạo save mới.
   **Không chạy test** (chưa build).
9. Final report (ngắn gọn <40 dòng): file đã đổi, export mới, hook cần agent khác/agent chính wiring,
   test đã viết, rủi ro/ro known issue.

## Checklist ship (agent chính)
`node web/scripts/audit_imports.py` → `npm run build` → `npm run android:sync` → so data sha khác 2.3.9 →
`npx playwright test` (4 cũ + test mới) → `python tools/make_ota_manifest.py --version 2.4.0` →
commit+push → `gh release create v2.4.0 ota-data-2.4.0.zip ota-assets-2.4.0.zip ota-data-patch-2.4.0.zip`
(assets giữ ed4764453cf5 nếu media không đổi) → `npx wrangler deploy` → verify raw manifest + chunk live.
