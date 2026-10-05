import React from 'react';
import { useGameTick } from './useGameTick';
import { SK, W, fmt, clamp } from '../game/core';
import { R } from '../game/combat';
import { S, save } from '../game/save';
import {
  INPUT, manual, setCtrl, pressSlot, drinkNow, goTown, backFromTown, toggleRot,
  mouseMode, isDesktopLandscape, refreshInputBtn, POT_CD, TP_CD,
} from '../game/control';
import { SV, svIntro, svPause, svCastUlt, svUseBomb, svUseHp } from '../game/survival';
import { shopModal } from '../game/shop';
import { stashModal } from '../game/stash';
import { backFromBossArena, goBossArena, wbHudState, wbUiState } from '../game/worldboss';
import { sellUnmatched, refresh, toast } from '../game/ui';
import { uiSfx } from '../game/audio';

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
      <div id="hud">
        <div className="bar hp">
          <i id="hpBar" style={{ width: (P ? clamp(R.life / P.life, 0, 1) * 100 : 0) + '%' }} />
          <span id="hpTxt">{P ? `${fmt(R.life)} / ${fmt(P.life)}` : ''}</span>
        </div>
        <div className="bar mp">
          <i id="mpBar" style={{ width: (P ? clamp(R.mana / P.mana, 0, 1) * 100 : 0) + '%' }} />
          <span id="mpTxt">{P ? `${fmt(R.mana)} / ${fmt(P.mana)}` : ''}</span>
        </div>
        <div id="mainSk">{P ? P.main.n : ''}</div>
      </div>
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
      <button id="ctrlBtn" className={'chip' + (fac && manual() ? ' on' : '')}
        onClick={() => setCtrl(manual() ? 'auto' : 'manual')}>
        {fac && manual() ? '🕹 Tự điều khiển' : '⚙ Tự động'}
      </button>
      <button id="inBtn" className="chip" onClick={switchInput}>
        {mouseMode() ? '🖱 Chuột' : '🕹 Joystick'}
      </button>
      <button id="rotBtn" className={'chip' + (fac && S.rot !== false ? ' on' : '')} onClick={() => toggleRot()}>
        ⟳ Xoay chiêu: {fac && S.rot !== false ? 'Bật' : 'Tắt'}
      </button>
      <button id="svBtn" className="chip" onClick={() => { uiSfx('click'); svIntro(); }}>⚔ Luyện Công</button>
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
          <button id="svBomb" className="pbtn bomb" onClick={() => svUseBomb()}>
            <span className="lbl">💣 <b id="svBombCnt">0</b></span>
          </button>
          <button id="svHpBtn" className="pbtn pot hp" onClick={() => svUseHp()}>
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
        <button className="pbtn pot hp" id="bHp" title="Uống thuốc HP (Q)"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); drinkNow('life'); }}>
          <div className="cd" style={cdStyle(potCd.life || 0, POT_CD)} /><span>HP</span>
        </button>
        <button className="pbtn pot mp" id="bMp" title="Uống thuốc MP (E)"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); drinkNow('mana'); }}>
          <div className="cd" style={cdStyle(potCd.mana || 0, POT_CD)} /><span>MP</span>
        </button>
        <button className="pbtn pot tp" id="bTp" title="Về thành (T)"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); if (R.wbArena) backFromBossArena(); else R.town ? backFromTown() : goTown(); }}>
          <div className="cd" style={cdStyle(R.tpCd || 0, TP_CD)} /><span>Về<br />thành</span>
        </button>
      </div>
    </section>
  );
}
