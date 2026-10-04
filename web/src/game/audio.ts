import { R } from './combat';
import { $, MON, rnd } from './core';
import { JS } from './jsnd';
import { S } from './save';

/* ======================= AM THANH (JS tu tools/extract_sound.py) ======================= */
'use strict';
const SND: any = JS || { music: {}, npc: {}, skill: {}, ui: {} };
export const AUD: { [k: string]: any; ctx: AudioContext | null; gain: GainNode | null; music: HTMLAudioElement | null; musicSrc: string; } = { ctx: null, gain: null, buf: {}, loading: {}, last: {}, voices: 0, music: null, musicSrc: '' };
const SFX_GAP = 0.07, MAX_VOICES = 10;
export function sndCfg() { return S.snd || (S.snd = { on: true, vol: 0.7, music: true, mvol: 0.4 }); }
export function audInit() { // trinh duyet chi cho phat sau lan cham dau tien
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); return; }
  const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
  AUD.ctx = new AC(); AUD.gain = AUD.ctx.createGain(); AUD.gain.connect(AUD.ctx.destination); audApply();
}
export function audApply() {
  const c = sndCfg();
  if (AUD.gain) AUD.gain.gain.value = c.on ? c.vol : 0;
  if (AUD.music) { AUD.music.volume = c.music ? c.mvol : 0; if (!c.music) AUD.music.pause(); else if (AUD.music.paused) AUD.music.play().catch(() => {}); }
}
function audLoad(src) {
  if (AUD.buf[src] || AUD.loading[src] || !AUD.ctx) return;
  AUD.loading[src] = true;
  fetch(src).then(r => r.arrayBuffer()).then(b => AUD.ctx.decodeAudioData(b)).then(buf => { AUD.buf[src] = buf; })
    .catch(() => { AUD.buf[src] = null; });
}
function sfx(src, vol = 1, rate = 1) {
  if (!src || R.quiet || !AUD.ctx || !sndCfg().on) return;
  const now = AUD.ctx.currentTime;
  if (AUD.last[src] && now - AUD.last[src] < SFX_GAP) return;
  const buf = AUD.buf[src]; if (!buf) { audLoad(src); return; }
  if (AUD.voices >= MAX_VOICES) return;
  AUD.last[src] = now; AUD.voices++;
  const s = AUD.ctx.createBufferSource(), g = AUD.ctx.createGain();
  s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g); g.connect(AUD.gain); s.onended = () => AUD.voices--; s.start();
}
export const npcSfx = (key, act, vol = 0.6) => { const e = SND.npc[key]; if (e) sfx(e[act], vol, rnd(0.93, 1.07)); };
export const skillSfx = id => sfx(SND.skill[id], 0.5);
export const uiSfx = k => sfx(SND.ui[k], 0.6);
/* Nhac nen theo ban do (musicset.txt), lap lai; ban do khong co nhac rieng -> nhac vung gan nhat */
export function playMusic(mapId: any) {
  const list = Object.values(SND.music); if (!list.length) return;
  const src = SND.music[mapId] || list[Math.abs(mapId) % list.length];
  if (AUD.musicSrc === src) return;
  if (AUD.music) AUD.music.pause();
  AUD.musicSrc = src; AUD.music = new Audio(src); AUD.music.loop = true;
  const c = sndCfg(); AUD.music.volume = c.music ? c.mvol : 0;
  if (c.music) AUD.music.play().catch(() => {});   // bi chan truoc lan cham dau: phat lai khi mo khoa
}
export function preloadZoneSounds(z) {
  if (!AUD.ctx) return;
  for (const t of z.m.concat([z.boss])) { const e = SND.npc[MON[t] && MON[t].anim]; if (e) Object.values(e).forEach(s => s && audLoad(s)); }
  Object.values(SND.ui).forEach(s => s && audLoad(s));
}

/* Dung / hat lai am thanh khi app (hoac tab) bi an di.
   - Android: vo app (MainActivity) tu goi AUD + audApply() qua evaluateJavascript khi
     onPause/onResume va khi mat/duoc audio focus — nen hai ten do phai la bien toan cuc
     y nhu ban vanilla (xem expose o cuoi file).
   - Web: loop.ts goi hai ham nay theo su kien visibilitychange. */
export function audioSuspendForBackground() {
  try {
    if (AUD.ctx && AUD.ctx.state === 'running') AUD.ctx.suspend();
    if (AUD.music && !AUD.music.paused) AUD.music.pause();
  } catch (e) { /* bo qua */ }
}
export function audioResumeFromBackground() {
  try {
    if (AUD.ctx && AUD.ctx.state === 'suspended') AUD.ctx.resume();
    audApply();                                    // bat lai nhac neu cau hinh dang bat (audApply tu play)
  } catch (e) { /* bo qua */ }
}

/* ---- Tuong thich vo Android da phat hanh ----
   MainActivity goi thang `AUD` (ctx + music) va `audApply()` khi app vao/roi background
   (AUDIO_PAUSE_JS / AUDIO_RESUME_JS / AUDIO_DUCK_JS) — ban vanilla khai bao chung o
   top-level script nen la bien toan cuc; sau khi port sang ES modules phai expose lai,
   neu khong `typeof AUD === 'undefined'` lam ca khoi lenh bi bo qua (nhac khong tat khi
   ve home). Giu nguyen API cu de khong phai phat hanh APK moi. */
if (typeof window !== 'undefined') {
  (window as any).AUD = AUD;
  (window as any).audApply = audApply;
}
