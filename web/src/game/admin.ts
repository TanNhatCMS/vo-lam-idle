// @ts-nocheck — chuyen tu js/admin.js cua ban goc (xem README muc TypeScript)
/* ======================= BANG THU NGHIEM (admin panel) =======================
   Muc dich: trai nghiem nhanh mot tinh nang ma khong phai cay cuoc.
   GIOI HAN THEO YEU CAU cua ban goc: moi ngay chi MO DUOC 1 LAN va CHON DUY NHAT 1 option.
   Moc ngay luu o S.adminDay (di qua migrate nen van giu). Day KHONG phai cong cu chong gian lan:
   game chay hoan toan tren may nguoi choi nen ai quyet tam van sua duoc — no chi de trai nghiem co kiem soat. */
'use strict';
import {
  ENH_MAX, FAC, INV_MAX, J, MAX_LEVEL, PTS_PER_LEVEL, SKILL_PTS_PER_LEVEL, STAGES,
  attrName,
  clamp,
  esc,
  pick,
  SERIES,
  MON,
} from './core';
import { HT_MAX, SHARDS, matAdd } from './recipes';
import { H, R, makeEnemy, recalc } from './combat';
import { S, save } from './save';
import { makeItem, makeRoom, slotFor } from './loot';
import { makeSetItem } from './sets';
import { RW } from './rewards';
import { sexReqOk } from './stats';
import { closeModal, itemHTML, log, modal, refresh, setInvDirty, toast } from './ui';

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
  { k: 'dummy', n: 'Gọi dummy',
    d: 'Gọi một quái thử hiệu ứng gần nhân vật: cấp 1, không tấn công, 1.000.000.000.000 HP. Không rơi thưởng khi bị hạ.',
    fn: () => {
      try { const e = makeEnemy(pick(Object.keys(MON).filter(id => MON[id].anim).map(Number)), 1, 'normal', H.x + 80, H.y);
        e.hp = e.max = 1e12; e.dmg = 0; e.dummy = true; e.n = 'Dummy'; R.enemies.push(e); return 'đã gọi dummy'; } catch (err) { return 'lỗi: ' + err.message; } } },
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
  { k: 'item', n: 'Tạo vật phẩm theo ý',
    d: 'Chọn mẫu trang bị, dòng ma thuật muốn có (mặc định giá trị cao nhất trong bậc, chỉnh được từng dòng), xem trước rồi tạo vào hành trang. Món mới bị khóa để tránh tự bán',
    fn: () => { adminItemCreator(); return 'mở công cụ tạo đồ'; } },
  { k: 'bk90', n: 'Tạo Võ Lâm Mật Tịch',
    d: 'Thêm sách vào hành trang để lĩnh ngộ hoặc luyện chiêu cấp 90 (sách xếp chồng, không chiếm ô)',
    fn: () => { adminBookModal(); return 'mở công cụ tạo sách'; } },
];

/* ---------- tao vat pham theo y + tao sach (nguon UE/qE cua v119) ---------- */
const affixMax = a => a.p.map(([mn, mx]) => mn === -1 && mx === -1 ? -1 : Math.max(mn, mx));
function affixOptions() {
  const best = {};
  for (const a of J.affix) if (!best[a.a] || a.lvl > best[a.a].lvl) best[a.a] = a;
  return Object.values(best).sort((x, y) => String(x.n || attrName(x.a)).localeCompare(String(y.n || attrName(y.a))));
}
function adminItemCreator() {
  const tierDef = clamp(Math.round(S.lvl / 12), 1, 10);
  const pool = affixOptions();
  const opt = (v, l, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  const details = J.items.map((g, d) => opt(d, g.n, d === 2)).join('');
  const parts = d => (J.items[d] ? J.items[d].list : []).map(r => opt(r.k, `${r.n} · cấp ${r.lvl}`, false)).join('');
  const aff = pool.map(a => opt(a.a, `${a.n || attrName(a.a)} · ${attrName(a.a)}`, false)).join('');
  const series = SERIES.map((n, i) => opt(i, n, i === 0)).join('');
  const lines = Array.from({ length: 6 }, (_, i) => `<label class="admin-item-field"><span>Dòng ${i + 1}</span><select data-ai-aff aria-label="Thuộc tính dòng ${i + 1}"><option value="">Không chọn</option>${aff}</select><input data-ai-val type="number" min="0" step="1" hidden aria-label="Giá trị dòng ${i + 1}"></label>`).join('');
  modal(`<section class="admin-item-form"><header><h3>Tạo vật phẩm theo ý</h3></header>
    <p class="desc">Chọn mẫu trang bị và các dòng ma thuật muốn có. Mỗi dòng mặc định giá trị cao nhất trong bậc; có thể chỉnh từng giá trị. Món mới được khóa để tránh tự bán.</p>
    <div class="admin-item-fields"><label class="admin-item-field">Loại trang bị<select id="aiDetail">${details}</select></label><label class="admin-item-field">Mẫu<select id="aiPart"></select></label></div>
    <div class="admin-item-meta"><label class="admin-item-field">Bậc đồ<input id="aiTier" type="number" min="1" max="10" step="1" value="${tierDef}"></label>
    <label class="admin-item-field">Hệ<select id="aiSeries">${series}</select></label>
    <label class="admin-item-field">Hiếm<select id="aiRar">${[0, 1, 2, 3, 4, 5].map(v => opt(v, ['Thường', 'Lam', 'Vàng', 'Tím', 'Hoàng Kim', 'Bạch Kim'][v] || v, v === 2)).join('')}</select></label>
    <label class="admin-item-field">Cường hóa<input id="aiEnh" type="number" min="0" max="${ENH_MAX}" step="1" value="0"></label></div>
    <label class="admin-item-field">Tên tùy chỉnh <input id="aiName" type="text" maxlength="60" placeholder="Để trống để dùng tên mẫu"></label>
    <b class="admin-item-section-title">Thuộc tính ma thuật</b><div class="admin-item-affixes">${lines}</div>
    <div class="admin-item-preview" id="aiPreview"></div>
    <div class="btnrow"><button class="btn" id="aiCreate">Tạo vào hành trang</button><button class="btn" id="aiBack">Quay lại bảng thử nghiệm</button></div></section>`, () => {
    const $id = id => document.getElementById(id);
    const refreshParts = () => { $id('aiPart').innerHTML = parts(+$id('aiDetail').value); preview(); };
    const preview = () => {
      const it = buildDraft();
      $id('aiPreview').innerHTML = it ? itemHTML(it) : '';
    };
    const readLines = () => {
      const rows = [];
      document.querySelectorAll('#mBody [data-ai-aff]').forEach((sel, i) => {
        const a = +sel.value || 0; if (!a) return;
        const valEl = document.querySelectorAll('#mBody [data-ai-val]')[i];
        const row = J.affix.filter(x => x.a === a).sort((x, y) => y.lvl - x.lvl)[0];
        if (!row) return;
        const p = affixMax(row); const v = Math.max(0, Math.floor(+valEl.value || 0));
        p[0] = v;
        rows.push({ a, p, n: row.n, pre: rows.length % 2 === 0 ? 1 : 0 });
      });
      return rows;
    };
    const buildDraft = () => {
      const d = +$id('aiDetail').value, k = +$id('aiPart').value;
      const it = makeItem(d, k, clamp(Math.round(+$id('aiTier').value || tierDef), 1, 10), 0);
      if (!it) return null;
      it.s = +$id('aiSeries').value;
      const rq = it.req.find(q => q[0] === 37); if (rq) rq[1] = it.s;
      it.r = clamp(Math.round(+$id('aiRar').value || 0), 0, 5);
      it.enh = clamp(Math.round(+$id('aiEnh').value || 0), 0, ENH_MAX);
      const nm = String($id('aiName').value || '').trim(); if (nm) it.n = nm;
      it.mag = readLines();
      it.locked = true;
      return it;
    };
    $id('aiDetail').onchange = refreshParts;
    $id('aiPart').onchange = preview;
    $id('aiTier').onchange = preview;
    $id('aiSeries').onchange = preview;
    $id('aiRar').onchange = preview;
    $id('aiEnh').oninput = preview;
    $id('aiName').oninput = preview;
    document.querySelectorAll('#mBody [data-ai-aff]').forEach(sel => sel.onchange = () => {
      const i = [...document.querySelectorAll('#mBody [data-ai-aff]')].indexOf(sel);
      const valEl = document.querySelectorAll('#mBody [data-ai-val]')[i];
      if (sel.value) { const row = J.affix.filter(x => x.a === +sel.value).sort((x, y) => y.lvl - x.lvl)[0]; valEl.value = row ? affixMax(row)[0] : 0; valEl.hidden = false; } else valEl.hidden = true;
      preview();
    });
    document.querySelectorAll('#mBody [data-ai-val]').forEach(el => el.oninput = preview);
    refreshParts();
    $id('aiCreate').onclick = () => {
      const it = buildDraft(); if (!it) { toast('Không tạo được mẫu'); return; }
      if (S.inv.length >= INV_MAX) makeRoom({ uid: 0 }, true);
      S.inv.unshift(it);
      setInvDirty(true); R.dirty = true;
      try { recalc(); } catch (e) { /* bo qua */ }
      save(); refresh();
      toast(`Đã tạo ${it.n} · khóa để tránh tự bán`);
      log('<span style="color:#8fe34a">[Thử nghiệm]</span> Đã tạo ' + esc(it.n));
      closeModal();
    };
    $id('aiBack').onclick = () => adminModal();
  });
}
function adminBookModal() {
  modal(`<h3>Tạo Võ Lâm Mật Tịch</h3><p class="desc">Thêm sách vào hành trang để lĩnh ngộ hoặc luyện chiêu cấp 90. Sách xếp chồng, không chiếm thêm ô nếu đã có sẵn.</p>
    <div class="row"><input type="number" id="aiBk90Count" min="1" max="999" step="1" value="10" aria-label="Số quyển muốn tạo"></div>
    <div class="btnrow"><button class="btn" id="aiBk90Ok">Tạo vào hành trang</button><button class="btn" id="aiBk90Back">Quay lại bảng thử nghiệm</button></div>`, () => {
    document.getElementById('aiBk90Ok').onclick = () => {
      const n = clamp(Math.floor(+document.getElementById('aiBk90Count').value || 1), 1, 999);
      matAdd('misc', 'bk90', n);
      save(); refresh();
      toast(`Đã tạo ${n} Võ Lâm Mật Tịch`);
      log('<span style="color:#8fe34a">[Thử nghiệm]</span> Đã tạo ' + n + ' Võ Lâm Mật Tịch');
      adminModal();
    };
    document.getElementById('aiBk90Back').onclick = () => adminModal();
  });
}

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
