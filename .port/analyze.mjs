/* Quet cac file game JS: tim khai bao cap-top (cot 0) + tham chieu cheo giua cac file */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = 'P:/VoLamIdleAndroid/game';
const ORDER = ['data.js', 'world.js', 'sound.js', 'fx.js', 'jmo.js', 'rdata.js',
  'js/core.js', 'js/mapobs.js', 'js/stats.js', 'js/loot.js', 'js/sets.js', 'js/recipes.js',
  'js/combat.js', 'js/save.js', 'js/render.js', 'js/audio.js', 'js/ui.js', 'js/control.js',
  'js/shop.js', 'js/rewards.js', 'js/forge.js', 'js/auto.js', 'js/guide.js', 'js/stash.js',
  'js/survival.js', 'js/main.js'];

// tach danh sach declarator "a = 1, b = [..], {c, d} = x" theo dau phay depth-0
function declaratorNames(s) {
  const names = [];
  let depth = 0, cur = '';
  const flush = () => {
    const t = cur.trim();
    const m = t.match(/^(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/);
    if (m) {
      if (m[1] || m[2]) {
        (m[1] || m[2]).split(',').map(x => x.trim().split(/[:=\s]/)[0].trim())
          .forEach(n => { if (/^[A-Za-z_$][\w$]*$/.test(n)) names.push(n); });
      } else names.push(m[3]);
    }
    cur = '';
  };
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  return names;
}

const files = {};
for (const rel of ORDER) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  const decls = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m;
    if ((m = L.match(/^(?:let|const|var)\s+([\s\S]*?)(?:;|$)/)) && !L.startsWith(' ') && !L.startsWith('\t')) {
      declaratorNames(m[1]).forEach(n => decls.push({ name: n, line: i + 1, kind: L.slice(0, 3) }));
    } else if ((m = L.match(/^function\s+([A-Za-z_$][\w$]*)/))) {
      decls.push({ name: m[1], line: i + 1, kind: 'function' });
    } else if ((m = L.match(/^class\s+([A-Za-z_$][\w$]*)/))) {
      decls.push({ name: m[1], line: i + 1, kind: 'class' });
    }
  }
  const winUsages = [...new Set((src.match(/window\.[A-Za-z_$][\w$]*/g) || []))];
  const docCount = (src.match(/\bdocument\./g) || []).length;
  const dollarCount = (src.match(/\$\(/g) || []).length;
  const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, ' ');
  files[rel] = { src, srcNoComments, decls, winUsages, docCount, dollarCount };
}

const owner = {};
for (const [rel, f] of Object.entries(files))
  for (const d of f.decls) (owner[d.name] ||= []).push(rel);

const report = {};
for (const [rel, f] of Object.entries(files)) {
  const needs = {};
  for (const [name, owners] of Object.entries(owner)) {
    if (owners.includes(rel)) continue;
    const re = new RegExp('(?<![\\w$.\'"`])' + name + '(?![\\w$])');
    if (re.test(f.srcNoComments)) needs[name] = owners;
  }
  const provided = {};
  for (const d of f.decls) {
    const users = ORDER.filter(o => o !== rel && (owner[d.name] || []).includes(rel) && report[o] === undefined);
    provided[d.name] = users; // users tinh sau
  }
  report[rel] = { needs, decls: f.decls.map(d => d.name), winUsages: f.winUsages, docCount: f.docCount, dollarCount: f.dollarCount };
}
// tinh provided chinh xac: file khac co tham chieu den symbol nay
for (const [rel, f] of Object.entries(files)) {
  const prov = {};
  for (const name of f.decls.map(d => d.name)) {
    if ((owner[name] || [])[0] !== rel) continue; // chi file khai bao dau tien
    const re = new RegExp('(?<![\\w$.\'"`])' + name + '(?![\\w$])');
    const users = ORDER.filter(o => o !== rel && !(report[o].decls.includes(name)) && re.test(files[o].srcNoComments));
    if (users.length) prov[name] = users;
  }
  report[rel].provided = prov;
}

mkdirSync('P:/VoLamIdleAndroid/.port', { recursive: true });
writeFileSync('P:/VoLamIdleAndroid/.port/depmap.json', JSON.stringify(report, null, 2));

let out = '';
for (const rel of ORDER) {
  const r = report[rel];
  out += `\n### ${rel}  (decls: ${r.decls.length}, document.: ${r.docCount}, $(: ${r.dollarCount})\n`;
  if (r.winUsages.length) out += `  window: ${r.winUsages.join(' ')}\n`;
  const needs = Object.entries(r.needs);
  if (needs.length) {
    out += `  IMPORTS:\n`;
    for (const [n, owners] of needs) out += `    ${n}  <- ${owners.join(',')}\n`;
  }
  const prov = Object.entries(r.provided);
  if (prov.length) out += `  EXPORTS (dung boi file khac): ${prov.map(([n, u]) => `${n}(${u.length})`).join(' ')}\n`;
}
writeFileSync('P:/VoLamIdleAndroid/.port/depmap.txt', out);
console.log('OK');
console.log('Tong symbol global:', Object.keys(owner).length);
const dups = Object.entries(owner).filter(([n, o]) => o.length > 1);
console.log('Trung ten:', dups.map(([n, o]) => `${n}:[${o.join(',')}]`).join(' | ') || '(khong)');
