import React from 'react';
import { useGameTick } from './useGameTick';
import { SK, FAC } from '../game/core';
import { canLearn } from '../game/stats';
import { S } from '../game/save';
import { showTab } from '../game/ui';
import { uiGetTab } from '../game/store';

const TABS = [['log', 'Giang hồ'], ['char', 'Nhân vật'], ['skill', 'Võ công'], ['inv', 'Hành trang'], ['pet', 'Đồng hành'], ['more', 'Khác']];

/* Thanh tab duoi: nut chuyen the + cham bao diem chua cong (thay updateDots ban goc). */
export default function TabsNav() {
  useGameTick();
  const tab = uiGetTab();
  const fac = (S && S.fac) ? FAC[S.fac] : null;
  const dotChar = !!(fac && S.attrPts > 0);
  const dotSkill = !!(fac && S.skPts > 0 && fac.skills.some(id => canLearn(SK[id])));
  return (
    <nav id="tabs">
      {TABS.map(([t, label]) => (
        <button key={t} data-t={t} className={tab === t ? 'on' : ''} onClick={() => showTab(t)}>
          {label}
          {t === 'char' ? <em className={dotChar ? 'dot on' : 'dot'} id="dotChar" />
            : t === 'skill' ? <em className={dotSkill ? 'dot on' : 'dot'} id="dotSkill" /> : null}
        </button>
      ))}
    </nav>
  );
}
