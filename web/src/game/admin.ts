// @ts-nocheck — chuyen tu js/admin.js cua ban goc (xem README muc TypeScript)
/* ======================= BANG THU NGHIEM (admin panel) =======================
   Muc dich: trai nghiem nhanh mot tinh nang ma khong phai cay cuoc.
   GIOI HAN THEO YEU CAU cua ban goc: moi ngay chi MO DUOC 1 LAN va CHON DUY NHAT 1 option.
   Moc ngay luu o S.adminDay (di qua migrate nen van giu). Day KHONG phai cong cu chong gian lan:
   game chay hoan toan tren may nguoi choi nen ai quyet tam van sua duoc — no chi de trai nghiem co kiem soat. */
'use strict';
import {
  ENH_MAX, FAC, INV_MAX, J, MAX_LEVEL, PTS_PER_LEVEL, SKILL_PTS_PER_LEVEL, STAGES, esc,
} from './core';
import { HT_MAX, SHARDS, matAdd } from './recipes';
import { R, recalc } from './combat';
import { S, save } from './save';
import { makeRoom, slotFor } from './loot';
import { makeSetItem } from './sets';
import { RW } from './rewards';
import { sexReqOk } from './stats';
import { closeModal, log, modal, refresh, toast } from './ui';

const ADMIN_OPTS = [
  { k: 'lv', n: 'Lên thẳng cấp trần',
    d: 'Cấp = trần hiện tại, cộng đủ điểm tiềm năng (5/cấp) và điểm võ công (1/cấp). Cấp 20 cũng mở luôn Đồng hành.',
    fn: () => { const gap = Math.max(0, MAX_LEVEL - S.lvl); S.lvl = MAX_LEVEL; S.attrPts += gap * PTS_PER_LEVEL; S.skPts += gap * SKILL_PTS_PER_LEVEL; return `Cấp ${MAX_LEVEL} (+${gap * PTS_PER_LEVEL} điểm tiềm năng, +${gap} điểm võ công)`; } },
  { k: 'gold', n: 'Ngân lượng',
    d: 'Cộng 10.000.000 lượng',
    fn: () => { S.gold += 1e7; return '+10.000.000 lượng'; } },
  { k: 'mats', n: 'Nguyên liệu đầy đủ',
    d: `99 Huyền Tinh mỗi cấp 1–${HT_MAX}, đủ mảnh ghép mọi bộ Hoàng Kim, 50 Thủy Tinh Trắng / Thần Bí Khoáng Thạch`,
    fn: () => {
      for (let l = 1; l <= HT_MAX; l++) matAdd('ht', l, 99);
      let sh = 0; for (const r of J.sets.gold) if (SHARDS[r.n]) { matAdd('shard', r.n, SHARDS[r.n]); sh++; }
      matAdd('misc', 'wc', 50); matAdd('misc', 'mys', 50);
      return `đã thêm Huyền Tinh, ${sh} loại mảnh, Thủy Tinh Trắng, Thần Bí Khoáng Thạch`;
    } },
  { k: 'zones', n: 'Mở toàn bộ vùng',
    d: 'Mở hết ải để xem mọi bản đồ và mọi loại quái',
    fn: () => { S.maxStage = Math.max(S.maxStage, STAGES); S.stage = S.maxStage; return `mở tới ải ${STAGES}`; } },
  { k: 'enh', n: `Cường hoá +${ENH_MAX} toàn bộ đồ đang mặc`,
    d: `Mọi món đang mặc lên +${ENH_MAX} (thuộc tính gốc cộng thêm theo cấp cường hoá)`,
    fn: () => { let n = 0; for (const k in S.eq) { const it = S.eq[k]; if (it) { it.enh = ENH_MAX; n++; } } return `đã cường hoá ${n} món lên +${ENH_MAX}`; } },
  { k: 'gear', n: 'Một bộ Hoàng Kim đủ ô',
    d: 'Phát đủ bộ Hoàng Kim của phái đang chơi, mặc được ở cấp hiện tại (mức may mắn tối đa). Đồ đang mặc được cất vào hành trang',
    fn: () => {
      const f = FAC[S.fac]; if (!f) return 'chưa chọn phái';
      const lvOf = r => (r.req.find(q => q[0] === 36) || [0, 0])[1];
      const facOf = r => (r.req.find(q => q[0] === 39) || [0, -1])[1];
      const mine = J.sets.gold.filter(r => facOf(r) === f.id && sexReqOk(r.req));
      if (!mine.length) return 'không có bộ nào phù hợp';
      // bo mac duoc ngay (du cap) — neu chua co bo nao thi lay bo thap cap nhat
      const ok = mine.filter(r => lvOf(r) <= S.lvl), pool = ok.length ? ok : mine.filter(r => lvOf(r) === Math.min(...mine.map(lvOf)));
      const grp = {}; for (const r of pool) (grp[r.grp] = grp[r.grp] || []).push(r);
      const best = Object.values(grp).sort((a, b) => b.length - a.length || lvOf(b[0]) - lvOf(a[0]))[0].slice(0, 11);
      let n = 0;
      for (const r of best) {
        const k = slotFor(r); if (!k) continue;
        try {
          const it = makeSetItem('gold', r, 10), old = S.eq[k];
          if (old) { if (S.inv.length >= INV_MAX) makeRoom(old, true); S.inv.unshift(old); }   // khong lam mat do dang mac
          S.eq[k] = it; n++;
        } catch (e) { /* bo qua mon loi */ }
      }
      return `đã mặc ${n} món bộ Hoàng Kim` + (ok.length ? '' : ' (chưa đủ cấp: cần lên cấp để dùng)');
    } },
  { k: 'unlock', n: 'Mở khoá & gọi boss ngay',
    d: 'Gọi ngay Trùm Hoàng Kim và Boss Thế Giới, tặng 5.000 Vỏ Sò để quay (Đồng hành mở ở cấp 20 — dùng mục đầu nếu cần)',
    fn: () => {
      const r = RW();
      r.gbT = 0;
      r.wb = r.wb || {}; r.wb.next = 0;
      if (!r.so || typeof r.so !== 'object') r.so = {};
      r.so.n = (r.so.n || 0) + 5000;
      return 'Trùm Hoàng Kim & Boss Thế Giới sẵn sàng, +5.000 Vỏ Sò';
    } },
];

/* Moc ngay: gioi han "1 lan/ngay" cua ban goc. adminDaDung() tra ve false = VO HAN luot (ban clone dang dung
   ban nay). Muon bat lai gioi han: doi thanh `S.adminDay === adminHomNay()`. */
const adminHomNay = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const adminDaDung = () => false; // MOD: khong gioi han luot dung

/* Toc do game: nhan vao thoi gian mo phong (xem gameSpeed() trong loop.ts, cung danh sach). */
const SPEEDS = [1, 1.5, 2.5];
const speedNow = () => (SPEEDS.includes(+S.speed) ? +S.speed : 1);

export function adminApply(k) {
  const o = ADMIN_OPTS.find(x => x.k === k); if (!o) return;
  let kq = 'xong';
  try { kq = o.fn() || 'xong'; } catch (e) { toast('Lỗi: ' + (e && e.message)); return; }
  S.adminDay = adminHomNay();
  R.dirty = true;
  try { recalc(); } catch (e) { /* bo qua */ }
  save();
  toast('Thử nghiệm: ' + o.n + ' — ' + kq);
  try { log('<span style="color:#8fe34a">[Thử nghiệm]</span> ' + esc(o.n) + ' — ' + esc(kq)); } catch (e) { /* bo qua */ }
  refresh();
}

export function adminModal() {
  const used = adminDaDung();
  modal('<h3>Bảng thử nghiệm' + (used ? '' : ' <small style="color:#8fe34a">★ MOD: Vô hạn lượt dùng</small>') + '</h3>'
    + '<p class="desc">' + (used
      ? 'Hôm nay bạn đã dùng rồi. Bảng thử nghiệm mỗi ngày chỉ mở một lần và chọn một mục.'
      : 'Chọn mục để kích hoạt ngay. Thay đổi tính vào nhân vật và lưu lại.') + '</p>'
    + '<h3 style="margin:6px 0 4px">Tốc độ game</h3><div class="card"><div class="row">Tốc độ <select id="adSpeed">'
    + SPEEDS.map(v => '<option value="' + v + '"' + (speedNow() === v ? ' selected' : '') + '>x' + v + '</option>').join('')
    + '</select> <small class="dim">nhân vào thời gian mô phỏng, vật lý vẫn bước 1/60s</small></div></div>'
    + ADMIN_OPTS.map(o => '<div class="card"><b>' + esc(o.n) + '</b><br><small class="dim">' + esc(o.d) + '</small>'
      + '<div class="btnrow"><button class="btn" data-ad="' + o.k + '"' + (used ? ' disabled' : '') + '>Kích hoạt</button></div></div>').join('')
    + '<div class="btnrow"><button class="btn" id="adClose">Đóng</button></div>', () => {
      const adClose = document.getElementById('adClose'); if (adClose) adClose.onclick = () => closeModal();   // khong dung onclick inline: closeModal khong phai bien toan cuc sau khi bundle
      document.querySelectorAll('#mBody [data-ad]').forEach(b => b.onclick = () => { if (!adminDaDung()) adminApply(b.dataset.ad); });
      const sel = document.getElementById('adSpeed');
      if (sel) sel.onchange = () => { S.speed = parseFloat(sel.value); save(); refresh(); toast('Tốc độ game x' + S.speed); };
    });
}
