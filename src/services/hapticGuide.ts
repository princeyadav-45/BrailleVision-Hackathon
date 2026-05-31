/**
 * src/services/hapticGuide.ts
 * ============================
 * The Haptic "Geiger Counter" — a core BrailleVision innovation.
 *
 * HOW IT WORKS:
 *   The scanner continuously analyses the live camera frame to determine
 *   how well the Braille paper is positioned.  This service translates
 *   that positioning score into a haptic + audio feedback loop that
 *   guides a blind user to the perfect scan position WITHOUT needing
 *   to look at the screen.
 *
 * FEEDBACK STATES:
 *   ● SEARCHING   — no paper detected        → slow single pulse (0.8s interval)
 *   ● DETECTED    — paper visible, off-centre → medium double pulse (0.4s interval)
 *   ● CENTERING   — paper centred, not locked → fast triple pulse (0.2s interval)
 *   ● LOCKED      — perfectly framed          → one solid heavy impact + stop
 *
 * BLIND USER MENTAL MODEL:
 *   "Slow heartbeat = keep moving. Faster = getting closer. Solid thud = scan now."
 *
 * Vibe-Coding Disclosure: Pattern designed with Claude (Anthropic);
 *   interval values calibrated by human developer through user testing.
 */

import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaperState = 'searching' | 'detected' | 'centering' | 'locked';

interface HapticSession {
  intervalId: ReturnType<typeof setInterval> | null;
  active:     boolean;
  lastState:  PaperState | null;
}

// ---------------------------------------------------------------------------
// Module-level session (singleton pattern — one scanner at a time)
// ---------------------------------------------------------------------------

const session: HapticSession = {
  intervalId: null,
  active:     false,
  lastState:  null,
};

// ---------------------------------------------------------------------------
// Interval configuration per state
// ---------------------------------------------------------------------------

const STATE_CONFIG: Record<PaperState, {
  intervalMs: number;
  pattern:    () => Promise<void>;
}> = {
  searching: {
    intervalMs: 900,
    pattern: async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  },
  detected: {
    intervalMs: 450,
    pattern: async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await _delay(100);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  },
  centering: {
    intervalMs: 220,
    pattern: async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await _delay(60);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await _delay(60);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  },
  locked: {
    intervalMs: 0,   // fires once then stops
    pattern: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await _delay(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the haptic loop.  Safe to call even if already running — will
 * update the state without stopping/restarting unnecessarily.
 */
export async function startHapticGuide(state: PaperState): Promise<void> {
  // If state hasn't changed, don't restart the interval
  if (session.active && session.lastState === state) return;

  stopHapticGuide();

  session.active    = true;
  session.lastState = state;

  const config = STATE_CONFIG[state];

  // Fire immediately, then on interval
  await config.pattern();

  if (state === 'locked') {
    // Locked fires once then fully stops
    session.active    = false;
    session.lastState = null;
    return;
  }

  session.intervalId = setInterval(async () => {
    if (!session.active) return;
    await config.pattern();
  }, config.intervalMs);
}

/**
 * Stop all haptic feedback.  Call on component unmount or when scanner
 * is paused/dismissed.
 */
export function stopHapticGuide(): void {
  if (session.intervalId !== null) {
    clearInterval(session.intervalId);
    session.intervalId = null;
  }
  session.active    = false;
  session.lastState = null;
}

/**
 * Fire a single confirmation haptic (used after successful API response).
 */
export async function hapticSuccess(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * Fire a single error haptic (used on API failure).
 */
export async function hapticError(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/**
 * Classify paper position into a PaperState based on frame analysis metrics.
 *
 * Args:
 *   paperDetected  — true if CV heuristic found a light-coloured rectangle
 *   centreOffset   — normalised [0–1] distance from frame centre (0 = perfect)
 *   areaRatio      — paper area / total frame area (0–1)
 *
 * Returns: PaperState
 */
export function classifyPaperState(
  paperDetected: boolean,
  centreOffset:  number,
  areaRatio:     number,
): PaperState {
  if (!paperDetected)           return 'searching';
  if (centreOffset > 0.25)      return 'detected';
  if (areaRatio < 0.40)         return 'centering';  // Paper too small / far away
  if (centreOffset > 0.08)      return 'centering';
  return 'locked';
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}