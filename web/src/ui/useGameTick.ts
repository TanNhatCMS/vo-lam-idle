import { useSyncExternalStore } from 'react';
import { uiSubscribe, uiVersion } from '../game/store';

/* Re-render thanh phan theo tick cua vong game (~10Hz tu uiPump). */
export function useGameTick() {
  useSyncExternalStore(uiSubscribe, uiVersion, uiVersion);
}
