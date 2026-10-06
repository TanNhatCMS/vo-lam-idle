# -*- coding: utf-8 -*-
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ---------- tower2.ts: bo sung import con thieu ----------
p = 'src/game/tower2.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("import { clamp } from './core';", "import { clamp } from './core';\nimport { S, save } from './save';\nimport { closeModal, modal, refresh } from './ui';")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tower2 imports ok')

# ---------- sets.ts: Thien Cuc rows + setMembers branch ----------
p = 'src/game/sets.ts'
s = open(p, encoding='utf-8').read()
old = 'export function setMembers(it) { return J.sets[it.set.kind].filter(r => r.grp === it.set.grp); }'
assert old in s
new = ('/* Thien Cuc: bo do rieng Thap II — dong mau "Dang Long" yeu cau cap 180, doi ten + grp 10000+ (row ao) */\n'
       'export const TOWER2_SET_ROWS = J.sets.gold.filter(r => r.n.startsWith("Đằng Long") && r.req.some(([id, v]) => id === 36 && v === 180))\n'
       '  .map(r => Object.assign({}, r, { n: r.n.replace(/^Đằng Long/, "Thiên Cực"), grp: 10000 + r.grp, tower2: true }));\n'
       'export function setMembers(it) { return it.set.grp >= 10000 ? TOWER2_SET_ROWS.filter(r => r.grp === it.set.grp) : J.sets[it.set.kind].filter(r => r.grp === it.set.grp); }')
s = s.replace(old, new)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('sets.ts ok')

# ---------- rewards.ts ----------
p = 'src/game/rewards.ts'
s = open(p, encoding='utf-8').read()

s = s.replace("const REBORN_LV = MAX_LEVEL, REBORN_MAX = 5;   // chuyen sinh o cap toi da (99)",
              "const REBORN_LV = MAX_LEVEL, REBORN_MAX = 10;  // chuyen sinh toi da 10 lan (TS1-TS5 tam phap, TS6-TS10 diem Thap II — theo ban vinarpg)")

old = ("  r.stat.reborn++;\n"
       "  r.tpPend = (r.tpPend | 0) + 1;                     // tam phap: moi lan chuyen sinh chon 1 huong (TS1-TS5)")
assert old in s, 'reborn grant'
s = s.replace(old, ("  r.stat.reborn++;\n"
                    "  if (r.stat.reborn <= 5) r.tpPend = (r.tpPend | 0) + 1;      // TS1-TS5: tam phap\n"
                    "  else r.tp2Pend = (r.tp2Pend | 0) + 1;                        // TS6-TS10: diem Thap II"))

old = ("  if (tpPending()) tamPhapModal();                   // chon tam phap ngay sau khi chuyen sinh\n"
       "}")
assert old in s, 'reborn modal'
s = s.replace(old, ("  if (tpPending()) tamPhapModal();                   // chon tam phap ngay sau khi chuyen sinh\n"
                    "  if (tp2Pending()) tower2OptionModal();\n"
                    "}"))

s = s.replace("import { tamPhapModal, tpPending } from './depth';",
              "import { tamPhapModal, tpPending, applyWeekMod } from './depth';\n"
              "import { TOWER2, t2mul, tp2Pending, tower2Bonuses, tower2Floor, tower2Level, tower2OptionModal, tower2Unlocked } from './tower2';\n"
              "import { TOWER2_SET_ROWS } from './sets';")

old = ("export function towerSpawn() {\n"
       "  const f = R.tower.floor, L = towerLevel(f), z = ZONES[Math.min(ZONES.length - 1, Math.floor(f / 3))], boss = f % 5 === 0;\n"
       "  R.enemies = []; R.stall = 0;\n"
       "  const n = boss ? 1 : 3 + (f % 3);\n"
       "  for (let i = 0; i < n; i++) { const [x, y] = inWorld(H.x + rnd(-260, 260), H.y + rnd(-220, 220)); R.enemies.push(makeEnemy(boss ? z.boss : pick(z.m), L, boss ? 'boss' : 'elite', x, y)); }\n"
       "}")
assert old in s, 'towerSpawn'
new = ("export function towerSpawn() {\n"
       "  const f = R.tower.floor, is2 = R.tower.id === 2, L = is2 ? tower2Level(f) : towerLevel(f), z = ZONES[Math.min(ZONES.length - 1, Math.floor(f / (is2 ? 12 : 3)))], boss = f % 5 === 0;\n"
       "  R.enemies = []; R.stall = 0;\n"
       "  const n = boss ? 1 : 3 + (f % 3);\n"
       "  for (let i = 0; i < n; i++) {\n"
       "    const [x, y] = inWorld(H.x + rnd(-260, 260), H.y + rnd(-220, 220)), e = makeEnemy(boss ? z.boss : pick(z.m), L, boss ? 'boss' : 'elite', x, y);\n"
       "    if (is2) { const m = t2mul(f, e.cls); e.hp = e.max = e.max * m.hp; e.dmg *= m.dmg; e.towerId = 2; e.towerFloor = f; applyWeekMod(e); }\n"
       "    R.enemies.push(e);\n"
       "  }\n"
       "}")
s = s.replace(old, new)

old = ("export function towerCleared() {\n"
       "  const r = RW(), f = R.tower.floor;\n"
       "  if (f > r.stat.towerBest) { r.stat.towerBest = f; grant(f % 5 === 0 ? { set: 1, fd: 10 } : { gold: 200 * f, fd: 2 }, `Tháp tầng ${f}`); }\n"
       "  questTick('tower'); achCheck();\n"
       "  heal(R.P.life * 0.3, true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);\n"
       "  R.tower.floor++; R.spawnT = 1.5; R.banner = { t: 1.5, text: `Tầng ${R.tower.floor}`, sub: `Quái cấp ${towerLevel(R.tower.floor)}` };\n"
       "}")
assert old in s, 'towerCleared'
new = ("export function towerCleared() {\n"
       "  const r = RW(), f = R.tower.floor, is2 = R.tower.id === 2;\n"
       "  if (is2) {\n"
       "    if (f > (r.stat.tower2Best || 0)) {\n"
       "      r.stat.tower2Best = f;\n"
       "      if (f % 10 === 0) {\n"
       "        const row = pick(TOWER2_SET_ROWS), it = row && makeSetItem('gold', row, 8);\n"
       "        grant({ fd: 50, gold: 2000 * f }, `Tháp II tầng ${f}`);\n"
       "        if (it) { addItem(it, true, true, true); log(`Tháp II tầng ${f}: nhận <b style=\"color:#eaf6ff\">${esc(it.n)}</b>`); }\n"
       "      } else grant({ fd: f % 5 === 0 ? 50 : 5, gold: 2000 * f }, `Tháp II tầng ${f}`);\n"
       "    }\n"
       "    questTick('tower'); achCheck();\n"
       "    const b = tower2Bonuses();\n"
       "    heal(R.P.life * (0.3 + b.heal), true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);\n"
       "    R.tower.floor++; R.spawnT = 1.5;\n"
       "    return;\n"
       "  }\n"
       "  if (f > r.stat.towerBest) { r.stat.towerBest = f; grant(f % 5 === 0 ? { set: 1, fd: 10 } : { gold: 200 * f, fd: 2 }, `Tháp tầng ${f}`); }\n"
       "  questTick('tower'); achCheck();\n"
       "  heal(R.P.life * 0.3, true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);\n"
       "  R.tower.floor++; R.spawnT = 1.5; R.banner = { t: 1.5, text: `Tầng ${R.tower.floor}`, sub: `Quái cấp ${towerLevel(R.tower.floor)}` };\n"
       "}")
s = s.replace(old, new)

old = ("export function towerExit(dead) {\n"
       "  if (!R.tower) return;\n"
       "  log(`${dead ? 'Gục ở' : 'Rời'} tháp thử thách tầng ${R.tower.floor}. Kỷ lục: ${RW().stat.towerBest}`);\n"
       "  R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null;\n"
       "}")
assert old in s, 'towerExit'
new = ("export function towerExit(dead) {\n"
       "  if (!R.tower) return;\n"
       "  if (R.tower.id === 2) {\n"
       "    const f = R.tower.floor, r = RW();\n"
       "    if (dead) r.tower2Floor = tower2Floor(Math.max(1, f - TOWER2.lossFloors));   // guc: lui 10 tang\n"
       "    else r.tower2Floor = tower2Floor(Math.max(1, f - 1));                          // roi chieu: lam lai tang nay\n"
       "    r.stat.tower2Best = Math.max(r.stat.tower2Best || 0, f - 1);\n"
       "    log(`${dead ? 'Gục ở' : 'Rời'} Tháp II tầng ${f}. Sẽ vào lại từ tầng ${r.tower2Floor}. Kỷ lục: tầng ${r.stat.tower2Best}`);\n"
       "    R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null; save(); refresh();\n"
       "    return;\n"
       "  }\n"
       "  log(`${dead ? 'Gục ở' : 'Rời'} tháp thử thách tầng ${R.tower.floor}. Kỷ lục: ${RW().stat.towerBest}`);\n"
       "  R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null;\n"
       "}\n"
       "/* Vao Thap II: can chuyen sinh 5, vao tu con tro tower2Floor (mac dinh ky luc + 1) */\n"
       "export function tower2Start() {\n"
       "  if (R.town) backFromTown();\n"
       "  petRealmAbort(true);\n"
       "  if (!tower2Unlocked()) { toast(`Tháp II mở ở chuyển sinh ${TOWER2.reborn}`); return; }\n"
       "  const r = RW(), f = tower2Floor(r.tower2Floor == null ? (r.stat.tower2Best || 0) + 1 : r.tower2Floor);\n"
       "  r.tower2Floor = f;\n"
       "  R.tower = { id: 2, floor: f }; R.enemies = []; R.corpses = []; R.spawnT = 0.5;\n"
       "  closeModal(true); refresh();\n"
       "}")
s = s.replace(old, new)

old = "      <div class=\"btnrow\">${R.tower ? '<button class=\"btn red\" id=\"gTowerOut\">Rời tháp</button>' : !unlocked(TOWER_LV) ? `<button class=\"btn\" disabled>Cần cấp ${TOWER_LV}</button>` : `<button class=\"btn\" id=\"gTower\">Vào tháp (từ tầng ${Math.max(1, r.stat.towerBest - 4)})</button>`}</div>`;"
assert old in s, 'tower tab body'
new = ("      <div class=\"btnrow\">${R.tower ? '<button class=\"btn red\" id=\"gTowerOut\">Rời tháp</button>' : !unlocked(TOWER_LV) ? `<button class=\"btn\" disabled>Cần cấp ${TOWER_LV}</button>` : `<button class=\"btn\" id=\"gTower\">Vào tháp (từ tầng ${Math.max(1, r.stat.towerBest - 4)})</button>`}</div>\n"
       "      <h3>Tháp II <small>siêu khó · 2.000 tầng</small></h3>\n"
       "      <p class=\"desc\">Mở ở chuyển sinh 5. Quái mạnh gấp nhiều lần theo tầng, gục lùi 10 tầng; mỗi 10 tầng lần đầu nhận 1 món bộ <b>Thiên Cực</b>. Điểm chuyển sinh TS6–TS10 chỉ tác dụng ở đây.</p>\n"
       "      <p>Kỷ lục: <b>tầng ${r.stat.tower2Best || 0}</b>${R.tower && R.tower.id === 2 ? ` · đang ở tầng ${R.tower.floor}` : ''}</p>\n"
       "      <div class=\"btnrow\">${R.tower && R.tower.id === 2 ? '<button class=\"btn red\" id=\"gTowerOut\">Rời tháp</button>' : !tower2Unlocked() ? `<button class=\"btn\" disabled>Cần chuyển sinh ${TOWER2.reborn}</button>` : `<button class=\"btn\" id=\"gTower2\">Vào Tháp II (tầng ${tower2Floor(r.tower2Floor == null ? (r.stat.tower2Best || 0) + 1 : r.tower2Floor)})</button>`}</div>`;")
s = s.replace(old, new)

old = "    on('#gTowerOut', () => { towerExit(false); refreshGift(); }); on('#gReborn', doReborn);"
assert old in s, 'tower bind'
s = s.replace(old, "    on('#gTowerOut', () => { towerExit(false); refreshGift(); }); on('#gTower2', () => { tower2Start(); refreshGift(); }); on('#gReborn', doReborn);")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rewards.ts ok')

# ---------- combat.ts: tower2 bonuses ----------
p = 'src/game/combat.ts'
s = open(p, encoding='utf-8').read()
old = "  if (e.cls === 'boss' || e.cls === 'elite') tot *= 1 + tpStacks().tru * 0.06;   // tam phap Pha Trum"
assert old in s, 'heroHit'
s = s.replace(old, old + "\n  tot *= tower2Bonuses(e).dmg;                             // TS6 Khai Son: +dame Thap II")
old = "  let d = e.dmg * rnd(0.8, 1.2) * (cm ? 1 + cm.dmg / 100 : 1) * (1 - tpStacks().ho * 0.01);   // tam phap Ho The: hoa giai 1%/cap"
assert old in s, 'enemyHit'
s = s.replace(old, "  let d = e.dmg * rnd(0.8, 1.2) * (cm ? 1 + cm.dmg / 100 : 1) * (1 - tpStacks().ho * 0.01) * tower2Bonuses(e).taken;   // Ho The hoa giai + TS6 Ho Thap")
s = s.replace("import { guildBuff, tkCleared, tkExit, ytTick } from './activities';",
              "import { guildBuff, tkCleared, tkExit, ytTick } from './activities';\nimport { tower2Bonuses } from './tower2';")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('combat.ts ok')
