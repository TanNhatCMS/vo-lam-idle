import React from 'react';
import { useGameTick } from './useGameTick';
import { SK, W, J, clamp } from '../game/core';
import { POT_TIER_LV, R } from '../game/combat';
import { S, save } from '../game/save';
import {
  INPUT, manual, setCtrl, pressSlot, drinkNow, goTown, backFromTown,
  mouseMode, isDesktopLandscape, refreshInputBtn, POT_CD, TP_CD,
} from '../game/control';
import { SV, svPause, svCastUlt, svUseBomb, svUseHp } from '../game/survival';
import { shopModal } from '../game/shop';
import { stashModal } from '../game/stash';
import { backFromBossArena, goBossArena, wbHudState, wbUiState } from '../game/worldboss';
import { openAutoSettings, sellUnmatched, refresh, toast } from '../game/ui';
import { toggleRide } from '../game/horse';
import { uiSfx } from '../game/audio';

/* binh thuoc: anh theo cap cao nhat dang co; het thuoc thi van hien anh binh se mua khi dung (giong ban nguon).
   Luu y: island render truoc khi binding S cua save.ts khoi tao (vong import) -> khong doc S truc tiep. */
const potStockOf = (kind: string): Record<string, number> => { const s: any = S; if (!s || !s.potStock) return {}; return s.potStock[kind] || {}; };
const potOfKind = (kind: string): any[] => (J.potions || []).filter((p: any) => p.kind === kind);
const potLvl = (): number => (S as any)?.lvl || 1;
const potHeld = (kind: string): any => {
  const st = potStockOf(kind); let best = -1;
  for (const t of Object.keys(st)) if ((st[t] || 0) > 0 && +t > best) best = +t;
  return best >= 0 ? potOfKind(kind).find((p: any) => p.tier === best) || null : null;
};
const potIcon = (kind: string): string => {
  const held = potHeld(kind);
  const buyable = potOfKind(kind).filter((p: any) => potLvl() >= (POT_TIER_LV[p.tier] || 999)).sort((a: any, b: any) => b.tier - a.tier)[0];
  const item = held || buyable || potOfKind(kind).slice().sort((a: any, b: any) => a.tier - b.tier)[0];
  return item && item.ic ? item.ic : '';
};
const potTitle = (kind: string): string => {
  const held = potHeld(kind);
  const buyable = potOfKind(kind).filter((p: any) => potLvl() >= (POT_TIER_LV[p.tier] || 999)).sort((a: any, b: any) => b.tier - a.tier)[0];
  const item = held || buyable;
  const n = held ? potStockOf(kind)[held.tier] || 0 : 0;
  return `${item ? item.n : kind === 'life' ? 'HP' : 'MP'}${n > 0 ? ` · còn ${n}` : ' · mua khi dùng'}`;
};
const cdStyle = (v: number, max: number): React.CSSProperties => ({ '--p': `${clamp(v / max, 0, 1) * 100}%` } as React.CSSProperties);
const sellTown = () => { const r = sellUnmatched(); toast(`Bán ${r.n} món`); refresh(); };
const switchInput = () => {
  S.inputMode = mouseMode() ? 'joy' : 'mouse'; INPUT.target = null; refreshInputBtn(); save();
  toast(mouseMode() ? 'Điều khiển bằng chuột: bấm hoặc giữ chuột để đi' : 'Điều khiển bằng joystick: kéo ở góc trái dưới');
};

/* San dau: canvas + HUD + nut. Canvas va #svHud/#svBar la island — engine tu ghi. Thanh pho do React ve theo R.town. */
export default function Battle() {
  useGameTick();
  const fac = (S && S.fac) ? true : false;
  const P = R.P;
  const slots = fac ? (S.slots || [0, 0, 0, 0]) : [0, 0, 0, 0];
  const potCd = (fac && R.potCd) || {};
  return (
    <section id="battle">
      <div id="bg" />
      <canvas id="arena" />
      <div id="mainSk">{P ? P.main.n : ''}</div>
      <div id="skBuffs" />
      {/* Ban do nho bung to (engine ve vao #miniCanvas) */}
      <div id="miniFloat" aria-label="Bản đồ phóng to"><canvas id="miniCanvas" /></div>
      {(() => { const h = wbHudState(); if (!h.on) return null;
        const mmss = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
        return (
          <div id="wbHud">
            {h.name ? (<>
              <b>⚔ {h.name}</b>
              <div className="wbHp"><i style={{ width: h.hpPct + '%' }} /></div>
              <small>Hạ trước khi hết giờ — boss rút lui sau {mmss(h.life)}</small>
            </>) : (<>
              <b>Hạ Boss Thế Giới!</b>
              <small>Rời bí cảnh sau {h.exit}s — nhặt đồ rồi về</small>
            </>)}
          </div>
        );
      })()}
      <div id="autoControls" role="group" aria-label="Điều khiển tự động">
        <button id="autoSettingsBtn" title="Cài đặt Auto" aria-label="Cài đặt Auto"
          onClick={() => { uiSfx('click'); openAutoSettings(); }}><img src="ui/wrench.svg" alt="" aria-hidden="true" /></button>
        <button id="ctrlBtn" className="chip autotoggle" role="switch" aria-label="Auto"
          aria-checked={fac ? !manual() : false}
          title="Bật: tự đánh và đi nhặt đồ khớp bộ lọc. Tắt: bấm ô kỹ năng để đánh thủ công. Phím F bật/tắt Auto."
          onClick={() => setCtrl(manual() ? 'auto' : 'manual')}>
          <span>Auto</span><span className="ios-switch" aria-hidden="true"><i /></span>
        </button>
      </div>
      <button id="inBtn" className="chip" onClick={switchInput} aria-label={`Đổi chế độ điều khiển · hiện tại: ${mouseMode() ? 'Chuột' : 'Joystick'}`}>
        <img className="input-mode-icon" src={mouseMode() ? 'ui/input-mouse.svg' : 'ui/input-joystick.svg'} alt="" />
        <span>{mouseMode() ? 'Chuột' : 'Joystick'}</span>
      </button>
      {(() => { const wb = wbUiState(); if (wb.mode === 'hidden') return null;
        return (
          <button id="wbBtn" className={'chip' + (wb.mode === 'ready' ? ' on pulse' : '')}
            onClick={() => { uiSfx('click');
              if (wb.mode === 'count') { const m = Math.floor(wb.t / 60), s = wb.t % 60; toast(`Boss Thế Giới sẽ xuất hiện sau ${m}:${String(s).padStart(2, '0')}`); }
              else if (wb.mode === 'inside') backFromBossArena();
              else goBossArena();
            }}>
            {wb.label}
          </button>
        );
      })()}

      {/* Island: survival.js tu cap nhat so tien, bom, hoi chieu */}
      <div id="svHud" className="hidden">
        <div id="svTopBar">
          <span id="svGoldWrap">💰 <b id="svGold">0</b></span>
          <button id="svPauseBtn" className="chip" onClick={() => svPause()}>⏸</button>
        </div>
        <div id="svPad">
          <button id="svUlt" className="pbtn ult" onClick={() => svCastUlt()}>
            <div className="cd" /><span className="lbl">Tuyệt kỹ</span><small className="lock" />
          </button>
          <button id="svBomb" className="pbtn bomb" aria-label="Bom" onClick={() => svUseBomb()}>
            <img className="bomb-icon" src="img/i/bomb-training.png" alt="" draggable={false} />
            <span className="bomb-count" id="svBombCnt">0</span>
          </button>
          <button id="svHpBtn" className="pbtn pot hp" onClick={() => svUseHp()}>
            <img className="potion-icon" src="img/i/pot0.png" alt="" draggable={false} />
            <div className="cd" /><span>HP</span>
          </button>
        </div>
      </div>
      <div id="svBar" className="hidden" />

      <div id="townBar" className={R.town ? '' : 'hidden'}>
        <b id="townName">{R.town && W.town ? W.town.n : ''}</b>
        <button className="btn sm" id="bShop" onClick={() => shopModal()}>Cửa hàng</button>
        <button className="btn sm" id="bStashT" onClick={() => stashModal()}>Kho chung</button>
        <button className="btn sm" id="bSellTown" onClick={sellTown}>Bán đồ không khớp lọc</button>
        <button className="btn sm on" id="bBack" onClick={() => backFromTown()}>Trở lại ải</button>
      </div>

      <div id="pad">
        {[0, 1, 2, 3].map(i => {
          const id = slots[i], s = fac ? SK[id] : null;
          return (
            <button key={i} className={'pbtn sk' + (!s ? ' empty' : '') + (s && P && P.main.id === id ? ' cur' : '')}
              data-i={i} title={s ? s.n : 'Ô trống'}
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); pressSlot(i); }}>
              <i style={s && s.ic ? { backgroundImage: `url('${s.ic}')` } : undefined} /><b>{i + 1}</b>
            </button>
          );
        })}
        <button className="pbtn pot hp" id="bHp"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); drinkNow('life'); }}
          title={potTitle('life')}>
          <img className="potion-icon" src={potIcon('life')} alt="" draggable={false} title={potTitle('life')} />
          <div className="cd" style={cdStyle(potCd.life || 0, POT_CD)} />
          <b className="potion-count" hidden={!potHeld('life')}>{potHeld('life') ? potStockOf('life')[potHeld('life').tier] : ''}</b><span>HP</span>
        </button>
        <button className="pbtn pot mp" id="bMp"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); drinkNow('mana'); }}
          title={potTitle('mana')}>
          <img className="potion-icon" src={potIcon('mana')} alt="" draggable={false} title={potTitle('mana')} />
          <div className="cd" style={cdStyle(potCd.mana || 0, POT_CD)} />
          <b className="potion-count" hidden={!potHeld('mana')}>{potHeld('mana') ? potStockOf('mana')[potHeld('mana').tier] : ''}</b><span>MP</span>
        </button>
        <button className="pbtn ride" id="bRide" type="button" aria-label="Lên hoặc xuống ngựa" title="Lên hoặc xuống ngựa"
          onClick={() => { uiSfx('click'); toggleRide(); }}>
          <img src="ui/horse-saddle.png" alt="" draggable={false} />
        </button>
        <button className="pbtn pot tp" id="bTp" title="Về thành (T)"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); if (R.wbArena) backFromBossArena(); else R.town ? backFromTown() : goTown(); }}>
          <div className="cd" style={cdStyle(R.tpCd || 0, TP_CD)} /><span>Về<br />thành</span>
        </button>
      </div>
    </section>
  );
}
