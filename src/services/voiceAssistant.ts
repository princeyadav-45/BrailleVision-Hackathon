/**
 * src/services/voiceAssistant.ts
 * ================================
 * Guiding Voice Assistant + "Explore by Touch" for the BrailleVision scanner.
 *
 * TWO MODES:
 *
 * 1. GUIDING VOICE (proactive)
 *    Context-aware spoken instructions that fire automatically based on
 *    the current PaperState.  Tells the blind user exactly what to do:
 *    "Paper detected. Move it toward the centre."
 *
 * 2. EXPLORE BY TOUCH (reactive)
 *    When the user touches anywhere on the camera screen, a spatial
 *    description of that screen region is spoken aloud:
 *    "Top-left corner. Move paper right and down."
 *
 *    This mirrors the iOS VoiceOver "Explore by Touch" gesture but is
 *    entirely custom — it works independently of the system accessibility
 *    setting so it's always available in BrailleVision.
 *
 * Vibe-Coding Disclosure: Design pattern co-created with Claude (Anthropic).
 */

import * as Speech from 'expo-speech';
import type { PaperState } from './hapticGuide';

// ---------------------------------------------------------------------------
// TTS helpers
// ---------------------------------------------------------------------------

let _currentLang  = 'en-US';
let _currentSpeed = 1.0;
let _currentPitch = 1.0;
let _enabled      = true;

/** Update TTS engine parameters from store settings. */
export function configureTTS(opts: {
  language?: string;
  speed?:    number;
  pitch?:    number;
  enabled?:  boolean;
}): void {
  if (opts.language !== undefined) _currentLang  = opts.language;
  if (opts.speed    !== undefined) _currentSpeed = opts.speed;
  if (opts.pitch    !== undefined) _currentPitch = opts.pitch;
  if (opts.enabled  !== undefined) _enabled      = opts.enabled;
}

/**
 * Speak a string using the configured TTS engine.
 * Interrupts any currently-playing speech (scanner guidance must be immediate).
 */
export async function speak(
  text:      string,
  interrupt: boolean = true,
): Promise<void> {
  if (!_enabled || !text.trim()) return;

  if (interrupt) {
    await Speech.stop();
  }

  Speech.speak(text, {
    language: _currentLang,
    rate:     _currentSpeed,
    pitch:    _currentPitch,
  });
}

/** Stop all speech immediately. */
export async function stopSpeech(): Promise<void> {
  await Speech.stop();
}

/** Read full scan result aloud. */
export async function readScanResult(
  correctedText:  string,
  translatedText: string | null,
): Promise<void> {
  const toRead = translatedText ?? correctedText;
  if (!toRead.trim()) {
    await speak('No text detected. Please try scanning again.');
    return;
  }
  await speak(toRead);
}

// ---------------------------------------------------------------------------
// ISO 639-1 → BCP-47 TTS language code mapping
// ---------------------------------------------------------------------------

export const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', fr: 'fr-FR', de: 'de-DE',
  es: 'es-ES', pt: 'pt-BR', ar: 'ar-SA', zh: 'zh-CN',
  ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', it: 'it-IT',
  nl: 'nl-NL', tr: 'tr-TR', pl: 'pl-PL', sv: 'sv-SE',
};

// ---------------------------------------------------------------------------
// Guiding Voice — proactive state-based instructions
// ---------------------------------------------------------------------------

/**
 * Script lines for each paper state.
 * Each entry is an array so we can rotate through variants to avoid
 * the "broken record" effect during prolonged searching.
 */
const GUIDANCE_SCRIPTS: Record<PaperState, string[]> = {
  searching: [
    'Hold the camera above the Braille page.',
    'No paper detected. Move the camera closer to the page.',
    'Point the camera straight down at the Braille document.',
  ],
  detected: [
    'Paper detected. Move it toward the centre of the screen.',
    'Good. Keep adjusting until the vibration speeds up.',
    'Almost there. Centre the paper in the frame.',
  ],
  centering: [
    'Getting close. Hold steady.',
    'Nearly centred. Small adjustments only.',
    'Almost locked. Keep the paper flat and centred.',
  ],
  locked: [
    'Perfect. Hold still. Scanning now.',
  ],
};

const _guidanceCounters: Record<PaperState, number> = {
  searching: 0,
  detected:  0,
  centering: 0,
  locked:    0,
};

/** Minimum milliseconds between guidance announcements (avoid spam). */
const GUIDANCE_COOLDOWN_MS: Record<PaperState, number> = {
  searching: 4000,
  detected:  3000,
  centering: 2500,
  locked:    0,
};

let _lastGuidanceTime = 0;
let _lastGuidanceState: PaperState | null = null;

/**
 * Announce contextual guidance for the current paper state.
 * Respects cooldown timers and rotates through script variants.
 */
export async function announceGuidance(state: PaperState): Promise<void> {
  if (!_enabled) return;

  const now      = Date.now();
  const cooldown = GUIDANCE_COOLDOWN_MS[state];
  const stateChanged = state !== _lastGuidanceState;

  // Always announce state changes; otherwise respect cooldown
  if (!stateChanged && now - _lastGuidanceTime < cooldown) return;

  const scripts = GUIDANCE_SCRIPTS[state];
  const idx     = _guidanceCounters[state] % scripts.length;
  const line    = scripts[idx];

  _guidanceCounters[state]++;
  _lastGuidanceTime  = now;
  _lastGuidanceState = state;

  await speak(line, true);
}

// ---------------------------------------------------------------------------
// Explore by Touch — spatial region descriptions
// ---------------------------------------------------------------------------

/**
 * Map a touch coordinate to a spoken spatial description.
 *
 * The screen is divided into a 3×3 grid:
 *
 *   ┌──────────┬──────────┬──────────┐
 *   │ Top-left │  Top     │ Top-right│
 *   ├──────────┼──────────┼──────────┤
 *   │   Left   │ Centre   │  Right   │
 *   ├──────────┼──────────┼──────────┤
 *   │Bot-left  │  Bottom  │Bot-right │
 *   └──────────┴──────────┴──────────┘
 *
 * Each region has a spoken label + directional guidance to help the user
 * understand how to move the paper to reach the centre.
 */

interface TouchRegion {
  label:    string;
  guidance: string;
}

function _getRegion(
  touchX: number,
  touchY: number,
  frameW: number,
  frameH: number,
): TouchRegion {
  const col = touchX / frameW;  // 0..1 left→right
  const row = touchY / frameH;  // 0..1 top→bottom

  const colZone = col < 0.33 ? 'left' : col > 0.66 ? 'right' : 'centre';
  const rowZone = row < 0.33 ? 'top'  : row > 0.66 ? 'bottom' : 'middle';

  const REGIONS: Record<string, TouchRegion> = {
    'top-left':      { label: 'Top-left corner',   guidance: 'Move paper right and down.' },
    'top-centre':    { label: 'Top edge',           guidance: 'Move paper down.' },
    'top-right':     { label: 'Top-right corner',   guidance: 'Move paper left and down.' },
    'middle-left':   { label: 'Left edge',          guidance: 'Move paper right.' },
    'middle-centre': { label: 'Centre',             guidance: 'Paper is well centred. Hold still.' },
    'middle-right':  { label: 'Right edge',         guidance: 'Move paper left.' },
    'bottom-left':   { label: 'Bottom-left corner', guidance: 'Move paper right and up.' },
    'bottom-centre': { label: 'Bottom edge',        guidance: 'Move paper up.' },
    'bottom-right':  { label: 'Bottom-right corner',guidance: 'Move paper left and up.' },
  };

  const key = `${rowZone}-${colZone}`;
  return REGIONS[key] ?? { label: 'Screen', guidance: 'Centre the Braille page in the frame.' };
}

/**
 * Called whenever the user touches the scanner camera view.
 * Speaks the region label + directional guidance.
 */
export async function announceTouch(
  touchX:  number,
  touchY:  number,
  frameW:  number,
  frameH:  number,
): Promise<void> {
  if (!_enabled) return;

  const region  = _getRegion(touchX, touchY, frameW, frameH);
  const message = `${region.label}. ${region.guidance}`;
  await speak(message, true);
}