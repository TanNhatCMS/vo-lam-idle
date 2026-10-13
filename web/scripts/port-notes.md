# PORT NOTES — đợt port "Hoạt động giang hồ" + KNB + Lĩnh ngộ 90 (song song)

Nguồn: bundle v107 live volam.vinarpg.com — `web/scripts/v107-game.js` (5MB, minified,
đã git-exclude). Kỹ thuật trích: `python` regex theo từ khóa tiếng Việt quanh đoạn code
(ấy là "tài liệu thiết kế" — **tự viết TS theo style project, KHÔNG chép code minify**).
CSS nguồn: `web/scripts/v107-game.css` (tham khảo class `event-*`, `knb*`, `bk90*`).

## Quy ước bắt buộc của project (web/src/game/*.ts)

- **Mọi file game bắt đầu `// @ts-nocheck`** — TS thường (types.ts là type-only).
- Modal: `modal(html, bind?, locked?, focus=true)` + `closeModal(force?)` từ `./ui`;
  một #modal duy nhất; `$('#mBody').innerHTML = html`. Nút X có sẵn (.mx).
- Save: `S` = save (tự persist), `RW()` = rw (rewards/save mở rộng) từ `./save`;
  **KHÔNG sửa save.ts** — tự lazy-init field: `const r = RW(); r.knb = r.knb || 0;`
  (save() sẽ serialize mọi field; init lười là pattern chuẩn của project).
- Runtime: `R` từ `./core` (R.P stats, R.tower máy trạng thái tháp, R.dirty).
- Toast: `toast('...')`; fmt số: `fmt(n)`; escape: `esc(s)`; clamp; `$` = document.querySelector.
- **CẤM**: đọc S/RW()/J ở top-level module (crash "at module evaluation" — chỉ đọc trong hàm);
  onclick inline trong HTML string (chết nút — dùng bind trong modal() callback);
  thiếu import identifier (chạy `python scripts/audit_imports.py` + `python scripts/tsc_names_scan.py`
  từ web/ ở CUỐI để tự kiểm tra — phải OK).
- Jdata: `J` từ `./jdata` (J.skills, J.factions, J.potions...), MON/ZONES từ `./mapobs`.
- Quái/enemy: `makeEnemy(id, lvl, kind, x, y)` từ `./combat`; hè nhân vật `H`.
- Currency/lượng: `S.gold`; vật liệu: `matAdd('ht', lvl, n) / matHave('misc', key)` (`./forge` hoặc định nghĩa ở recipes/save — xem recipes.ts).
- Item vào túi: xem `recipes.ts` (`addItem`?) và `loot.ts`.
- Vết tích guard Tỷ Võ: `R.tyvo` (khóa giao dịch/hoạt động khi đang Tỷ Võ).

## Hợp đồng file (AI ĐƯỢC SỬA FILE NÀO — nghiêm ngặt, tránh xung đột)

Mỗi agent CHỈ được: (a) tạo file module mới của mình, (b) tạo test riêng
`web/tests/fNN-<ten>.spec.ts`, (c) ghi CSS vào `web/scripts/port-css/<ten>.css`
(file mới — sẽ được merge vào style.css ở bước tích hợp, KHÔNG tự sửa style.css),
(d) tự chạy 2 script audit ở cuối.

**CẤM SỬA**: save.ts, journal.ts, ui.ts, rewards.ts, style.css, combat.ts, stats.ts,
core.ts, types.ts, chat.ts — tích hợp entry/HUD do người điều phối làm sau.

Export bắt buộc (để điều phối ghép vào hub):

- `dungeon.ts`   → `dungeonBody(r): string`, `dungeonBind(reload: ()=>void): void`, `export const dungeonList` (danh sách phó bản), `dungeonReady(): boolean`
- `boat.ts`      → `boatBody(r): string`, `boatBind(reload: ()=>void): void`, `boatReady(): boolean`
- `weekboss.ts`  → `weekBossBody(r): string`, `weekBossBind(reload: ()=>void): void`, `weekBossReady(): boolean`, `weekBossBadge(): string`
- `ktc.ts`       → `ktcBody(r): string`, `ktcBind(reload: ()=>void): void`, `knbHave(): number`, `knbGain(n)`, `knbSpend(n): boolean`, `ktcBadge(): string`, `ktcOnBossKill(elite: boolean)`, `ktcOnDungeonClear(rank: string)`
- `lk90.ts`      → `lk90Body(r): string`, `lk90Bind(reload: ()=>void): void`, `lk90Ready(): boolean` + data chiêu 90
- extras (F)     → sửa trực tiếp guide.ts (tab Bách khoa), rewards.ts (ACH), consolelog.ts (dummy) — KHÔNG ai khác đụng 3 file này

State khuyến nghị trên RW(): `r.knb`, `r.dg` = { attempts:{ngày:lượt}, rank:{id:'S'}, clear:{id:n} },
`r.wb` = { week: 'YYYY-Www', killed: bool, chest: bool }, `r.boat` = { ngày, runs }, `r.lk90` = { learned:{id:lvl}, prog:{id:0} }.
Reset ngày: so sánh key ngày (`new Date().toISOString().slice(0,10)`); tuần: ISO week.

## Thông tin đã trích từ bundle (điểm khởi đầu)

- Hub: `zw=['dg','boat','wb']`, tabs `[['dg','Phó bản','dungeon'],['boat','Đi thuyền','boat'],['wb','Boss tuần','weekly-boss']]`,
  shell `<div class="event-shell">` + `event-tabs`, class modal `giang-ho-event-modal`.
- Phó bản: lượt/ngày = hằng `XC`; footer `${i}/${XC} lượt còn` / `Hết lượt` / `Cần cấp ${t.lv}`;
  hạng: S = hoàn thành trong 50% thời gian → thưởng ×1,5; A = trong 75% → ×1,2; lưu `dgRank`/`dgClear`.
- Boss tuần: "Mỗi tuần một trùm · một rương thưởng", nút "Khiêu chiến"/"Hết lượt tuần này"/"Cần cấp 20",
  "Reset tuần + tầng · ${Qy} Phúc Duyên", "TRẤN THỦ TUẦN NÀY", "Luật tuần này: ${TC()}".
- Kỳ Trân Các: đổi `${Ks*Js} lượng → ${Js} KNB` (ys=1e5? xs=10 — tự xác minh lại số trong bundle quanh
  `KNB`), bán lại 10 KNB → 800.000 (`bs=8e4`); "KNB nhận từ phó bản, Boss tuần và trùm";
  shop bán: tt/qht (bùa), rngua (Rương Ngựa), vlmt, ttk (Tẩy Tủy Kinh), bk90 (Mật Tịch), rht/rda (vàng);
  "Dưỡng sức hành tẩu · kỳ trân bên mình"; KNB khóa khi `j.tyvo` (đang Tỷ Võ).
- Lĩnh ngộ 90: bk90 = Võ Lâm Mật Tịch; "Chưa lĩnh ngộ · dùng Mật Tịch để học", "Có thể học lại cấp N · tiến độ đã lưu",
  "Có thể học · không tốn sách" (đã chuyển sinh → học miễn phí, cờ bkOk); "Luyện chiêu" +tiến độ;
  chiêu 90: trong bundle J có `learn==="90"`, req=80, book=bk90 — jdata ta CHƯA có → trích và nhúng vào
  file data mới (JS object trong lk90.ts hoặc file riêng), KHÔNG sửa public/jdata.
- "Tạo Võ Lâm Mật Tịch" (từ nguyên liệu? — xem ngữ cảnh trong bundle).

## Deliverables mỗi agent

1. File module mới (viết/comment tiếng Việt theo style project — xem worldboss.ts, tyvo.ts, recipes.ts làm mẫu).
2. Test spec `web/tests/fNN-*.spec.ts` theo mẫu f14/f15 (boot qua createCharacter, mock `/api/chat/*`
   bằng page.route như mọi test) — KHÔNG chạy test (chưa build), chỉ viết.
3. CSS vào `web/scripts/port-css/<ten>.css` (tham khảo tên class `event-*` của nguồn nhưng đặt
   class riêng tránh đụng).
4. Chạy `python scripts/audit_imports.py` + `python scripts/tsc_names_scan.py` (từ web/) — phải OK.
5. Báo cáo cuối: danh sách export + điểm cần tích hợp (1 dòng mỗi cái) + hằng số đã xác minh từ bundle.
