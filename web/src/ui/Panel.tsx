import React from 'react';
import { useGameTick } from './useGameTick';
import { uiGetTab } from '../game/store';

/* Bang thong tin 5 the. Moi the la island rong — renderTab (ui.js) ghi noi dung vao,
   React chi quan ly visibility qua store (showTab). */
const TABS = ['log', 'char', 'skill', 'inv', 'more'];

export default function Panel() {
  useGameTick();
  const tab = uiGetTab();
  return (
    <main id="panel">
      {TABS.map(t => (
        <div key={t} id={'t-' + t} className={tab === t ? 'tab' : 'tab hidden'} />
      ))}
    </main>
  );
}
