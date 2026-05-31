import { PaperState } from './hapticGuide';

let currentState: PaperState = 'searching';
let stateTimer: ReturnType<typeof setTimeout> | null = null;

export function resetFrameAnalyser() {
  currentState = 'searching';
  if (stateTimer) clearTimeout(stateTimer);
  
  stateTimer = setTimeout(() => { currentState = 'detected'; }, 2000);
  setTimeout(() => { currentState = 'centering'; }, 4000);
  setTimeout(() => { currentState = 'locked'; }, 6000);
}

export function analyseFrame(): { state: PaperState } {
  return { state: currentState };
}