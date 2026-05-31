/**
 * src/store/appStore.ts
 * ======================
 * Global Zustand state store with AsyncStorage persistence.
 *
 * CRASH RECOVERY STRATEGY:
 *   Every piece of meaningful state is written to AsyncStorage on each
 *   mutation.  On app restart, the store rehydrates from disk before the
 *   first render, so in-progress scans and user preferences survive crashes,
 *   force-quits, and low-memory kills (common on Android).
 *
 * STORE SLICES:
 *   • scanSlice     — active scan state (image, results, processing flag)
 *   • historySlice  — persisted scan history array
 *   • settingsSlice — user preferences (language, TTS speed, theme)
 *   • appSlice      — ephemeral UI state (tab focus, backend health)
 *
 * Vibe-Coding Disclosure: Store architecture designed with Claude (Anthropic).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrailleCell {
  cell_id: number;
  x: number; y: number;
  width: number; height: number;
  confidence: number;
  raw_bits: string;
  braille_char: string;
}

export interface ScanResult {
  scan_id:            string;
  raw_braille_text:   string;
  corrected_text:     string;
  translated_text:    string | null;
  detected_cells:     BrailleCell[];
  cell_count:         number;
  confidence_avg:     number;
  processing_time_ms: number;
  warnings:           string[];
  scanned_at:         string;    // ISO timestamp (added client-side)
  note:               string;    // User-editable note for History tab
  thumbnail_b64?:     string;    // Compressed preview image
}

export type SupportedLanguage =
  | 'en' | 'hi' | 'fr' | 'de' | 'es' | 'pt'
  | 'ar' | 'zh' | 'ja' | 'ko' | 'ru' | 'it'
  | 'nl' | 'tr' | 'pl' | 'sv';

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English', hi: 'Hindi',    fr: 'French',   de: 'German',
  es: 'Spanish', pt: 'Portuguese', ar: 'Arabic', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean',  ru: 'Russian',  it: 'Italian',
  nl: 'Dutch',   tr: 'Turkish',  pl: 'Polish',   sv: 'Swedish',
};

export type ScanMode = 'standard' | 'depth' | 'interpoint';
export type ColorScheme = 'dark' | 'light';

// ---------------------------------------------------------------------------
// Slice: Settings (persisted)
// ---------------------------------------------------------------------------

interface SettingsSlice {
  targetLanguage:   SupportedLanguage;
  scanMode:         ScanMode;
  ttsSpeed:         number;          // 0.5 – 2.0
  ttsPitch:         number;          // 0.5 – 2.0
  colorScheme:      ColorScheme;
  hapticEnabled:    boolean;
  autoReadOnScan:   boolean;         // Speak result automatically after scan
  voiceGuidance:    boolean;         // Guiding Voice Assistant on scanner
  largeText:        boolean;         // Accessibility: larger text throughout
  backendUrl:       string;

  setTargetLanguage:  (lang: SupportedLanguage) => void;
  setScanMode:        (mode: ScanMode) => void;
  setTtsSpeed:        (speed: number) => void;
  setTtsPitch:        (pitch: number) => void;
  setColorScheme:     (scheme: ColorScheme) => void;
  setHapticEnabled:   (val: boolean) => void;
  setAutoReadOnScan:  (val: boolean) => void;
  setVoiceGuidance:   (val: boolean) => void;
  setLargeText:       (val: boolean) => void;
  setBackendUrl:      (url: string) => void;
}

// ---------------------------------------------------------------------------
// Slice: Active Scan (persisted for crash recovery)
// ---------------------------------------------------------------------------

interface ScanSlice {
  isScanning:       boolean;
  lastCapturedB64:  string | null;   // Last frame sent to backend
  currentResult:    ScanResult | null;
  processingError:  string | null;

  setIsScanning:      (val: boolean) => void;
  setLastCaptured:    (b64: string | null) => void;
  setCurrentResult:   (result: ScanResult | null) => void;
  setProcessingError: (err: string | null) => void;
  clearScan:          () => void;
}

// ---------------------------------------------------------------------------
// Slice: History (persisted)
// ---------------------------------------------------------------------------

interface HistorySlice {
  scanHistory:  ScanResult[];

  addToHistory:      (result: ScanResult) => void;
  updateNote:        (scan_id: string, note: string) => void;
  deleteFromHistory: (scan_id: string) => void;
  clearHistory:      () => void;
}

// ---------------------------------------------------------------------------
// Slice: App (ephemeral — NOT persisted)
// ---------------------------------------------------------------------------

interface AppSlice {
  backendHealthy:  boolean;
  yoloLoaded:      boolean;
  openaiReady:     boolean;
  isRehydrated:    boolean;          // True after AsyncStorage rehydration

  setBackendHealth: (healthy: boolean, yolo: boolean, openai: boolean) => void;
  setIsRehydrated:  (val: boolean) => void;
}

// ---------------------------------------------------------------------------
// Combined store type
// ---------------------------------------------------------------------------

type AppStore = SettingsSlice & ScanSlice & HistorySlice & AppSlice;

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()(
  persist(
    (set, _get) => ({

      // ---- Settings defaults ----
      targetLanguage:  'en',
      scanMode:        'standard',
      ttsSpeed:        1.0,
      ttsPitch:        1.0,
      colorScheme:     'dark',
      hapticEnabled:   true,
      autoReadOnScan:  true,
      voiceGuidance:   true,
      largeText:       false,
      backendUrl:      'http://192.168.1.100:8000',  // User sets their local IP in Settings

      setTargetLanguage:  (lang)   => set({ targetLanguage: lang }),
      setScanMode:        (mode)   => set({ scanMode: mode }),
      setTtsSpeed:        (speed)  => set({ ttsSpeed: speed }),
      setTtsPitch:        (pitch)  => set({ ttsPitch: pitch }),
      setColorScheme:     (scheme) => set({ colorScheme: scheme }),
      setHapticEnabled:   (val)    => set({ hapticEnabled: val }),
      setAutoReadOnScan:  (val)    => set({ autoReadOnScan: val }),
      setVoiceGuidance:   (val)    => set({ voiceGuidance: val }),
      setLargeText:       (val)    => set({ largeText: val }),
      setBackendUrl:      (url)    => set({ backendUrl: url }),

      // ---- Scan defaults ----
      isScanning:       false,
      lastCapturedB64:  null,
      currentResult:    null,
      processingError:  null,

      setIsScanning:      (val)    => set({ isScanning: val }),
      setLastCaptured:    (b64)    => set({ lastCapturedB64: b64 }),
      setCurrentResult:   (result) => set({ currentResult: result }),
      setProcessingError: (err)    => set({ processingError: err }),
      clearScan: () => set({
        isScanning: false,
        lastCapturedB64: null,
        currentResult: null,
        processingError: null,
      }),

      // ---- History defaults ----
      scanHistory: [],

      addToHistory: (result) =>
        set((state) => ({
          scanHistory: [result, ...state.scanHistory].slice(0, 100), // cap at 100
        })),

      updateNote: (scan_id, note) =>
        set((state) => ({
          scanHistory: state.scanHistory.map((s) =>
            s.scan_id === scan_id ? { ...s, note } : s
          ),
        })),

      deleteFromHistory: (scan_id) =>
        set((state) => ({
          scanHistory: state.scanHistory.filter((s) => s.scan_id !== scan_id),
        })),

      clearHistory: () => set({ scanHistory: [] }),

      // ---- App state (ephemeral — reset on each launch) ----
      backendHealthy:  false,
      yoloLoaded:      false,
      openaiReady:     false,
      isRehydrated:    false,

      setBackendHealth: (healthy, yolo, openai) =>
        set({ backendHealthy: healthy, yoloLoaded: yolo, openaiReady: openai }),
      setIsRehydrated: (val) => set({ isRehydrated: val }),
    }),

    {
      name: 'braillevision-store-v1',
      storage: createJSONStorage(() => AsyncStorage),

      // ---- Only persist stable state; skip ephemeral scanning flags ----
      partialize: (state) => ({
        // Settings
        targetLanguage:  state.targetLanguage,
        scanMode:        state.scanMode,
        ttsSpeed:        state.ttsSpeed,
        ttsPitch:        state.ttsPitch,
        colorScheme:     state.colorScheme,
        hapticEnabled:   state.hapticEnabled,
        autoReadOnScan:  state.autoReadOnScan,
        voiceGuidance:   state.voiceGuidance,
        largeText:       state.largeText,
        backendUrl:      state.backendUrl,
        // Crash recovery: save last scan result so user can read it after restart
        currentResult:   state.currentResult,
        // History
        scanHistory:     state.scanHistory,
      }),

      onRehydrateStorage: () => (state) => {
        // Called once AsyncStorage has finished loading into the store
        state?.setIsRehydrated(true);
        console.log('[Store] Rehydration complete');
      },
    }
  )
);