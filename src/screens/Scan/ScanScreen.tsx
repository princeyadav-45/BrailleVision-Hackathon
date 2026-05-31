/**
 * src/screens/Scan/ScanScreen.tsx
 * ================================
 * The Core Scanner — Tab 2 of BrailleVision 2026.
 *
 * FEATURES IMPLEMENTED HERE:
 *   ✅ Live camera view (expo-camera)
 *   ✅ Haptic "Geiger Counter" loop (paper positioning feedback)
 *   ✅ Guiding Voice Assistant (state-based spoken instructions)
 *   ✅ "Explore by Touch" (touch anywhere → spatial audio description)
 *   ✅ Language selector (16 languages)
 *   ✅ Scan trigger → POST /api/v1/scan
 *   ✅ GPT-4o-mini corrected result display
 *   ✅ Multi-language native TTS playback of result
 *   ✅ Save to history (Zustand + AsyncStorage)
 *   ✅ Full accessibility labels (VoiceOver / TalkBack)
 *
 * Vibe-Coding Disclosure: Screen architecture co-designed with Claude (Anthropic).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, ActivityIndicator,
  GestureResponderEvent, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/tokens';
import { useAppStore, LANGUAGE_LABELS, type SupportedLanguage } from '../../store/appStore';
import {
  startHapticGuide, stopHapticGuide, hapticSuccess, hapticError, type PaperState,
} from '../../services/hapticGuide';
import {
  configureTTS, announceGuidance, announceTouch,
  readScanResult, stopSpeech, LANG_TO_BCP47,
} from '../../services/voiceAssistant';
import { analyseFrame, resetFrameAnalyser } from '../../services/frameAnalyser';
import { apiClient } from '../../services/apiClient';
import type { ScanResult } from '../../store/appStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CAMERA_H = SCREEN_H * 0.52;

const STATE_UI: Record<PaperState, { label: string; color: string; icon: string }> = {
  searching: { label: 'Searching for paper…', color: Colors.text.disabled,  icon: 'search' },
  detected:  { label: 'Paper detected',        color: Colors.warning,         icon: 'eye' },
  centering: { label: 'Centering…',            color: Colors.info,            icon: 'move' },
  locked:    { label: 'Ready to scan',          color: Colors.success,         icon: 'checkmark-circle' },
};

export default function ScanScreen() {
  const store = useAppStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [paperState,     setPaperState]     = useState<PaperState>('searching');
  const [isProcessing,   setIsProcessing]   = useState(false);
  const [result,         setResult]         = useState<ScanResult | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showResult,     setShowResult]     = useState(false);
  const [cameraReady,    setCameraReady]    = useState(false);
  const frameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    configureTTS({
      language: LANG_TO_BCP47[store.targetLanguage] ?? 'en-US',
      speed:    store.ttsSpeed,
      pitch:    store.ttsPitch,
      enabled:  store.voiceGuidance,
    });
  }, [store.targetLanguage, store.ttsSpeed, store.ttsPitch, store.voiceGuidance]);

  useEffect(() => {
    apiClient.setBaseUrl(store.backendUrl);
  }, [store.backendUrl]);

  const onFrameTick = useCallback(async () => {
    if (isProcessing) return;
    const metrics = analyseFrame();
    setPaperState(metrics.state);
    if (store.hapticEnabled) await startHapticGuide(metrics.state);
    if (store.voiceGuidance) await announceGuidance(metrics.state);
  }, [isProcessing, store.hapticEnabled, store.voiceGuidance]);

  useEffect(() => {
    resetFrameAnalyser();
    frameLoopRef.current = setInterval(onFrameTick, 200);
    return () => {
      if (frameLoopRef.current) clearInterval(frameLoopRef.current);
      stopHapticGuide();
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (frameLoopRef.current) {
      clearInterval(frameLoopRef.current);
      frameLoopRef.current = setInterval(onFrameTick, 200);
    }
  }, [onFrameTick]);

  async function handleScan() {
    if (!cameraRef.current || isProcessing || !cameraReady) return;
    try {
      setIsProcessing(true);
      stopHapticGuide();
      await stopSpeech();

      const photo = await cameraRef.current.takePictureAsync({
        base64: true, quality: 0.85, skipProcessing: false,
      });
      if (!photo?.base64) throw new Error('Camera capture returned no data');

      const scanResult = await apiClient.scanBraille(
        photo.base64, store.targetLanguage, store.scanMode,
      );

      store.setCurrentResult(scanResult);
      store.addToHistory(scanResult);
      setResult(scanResult);
      setShowResult(true);
      await hapticSuccess();
      if (store.autoReadOnScan) {
        await readScanResult(scanResult.corrected_text, scanResult.translated_text);
      }
    } catch (err: any) {
      await hapticError();
      store.setProcessingError(err.message ?? 'Unknown error');
      Alert.alert('Scan Failed', err.message ?? 'Could not process image. Check backend connection.');
    } finally {
      setIsProcessing(false);
      resetFrameAnalyser();
    }
  }

  function handleCameraTouch(evt: GestureResponderEvent) {
    if (isProcessing) return;
    const { locationX, locationY } = evt.nativeEvent;
    announceTouch(locationX, locationY, SCREEN_W, CAMERA_H);
  }

  if (!permission) return <LoadingView />;
  if (!permission.granted) {
    return <PermissionView onRequest={requestPermission} canAskAgain={permission.canAskAgain} />;
  }

  const stateUI = STATE_UI[paperState];

  return (
    <View style={styles.root}>
      {/* Camera */}
      <TouchableOpacity activeOpacity={1} style={styles.cameraWrapper} onPress={handleCameraTouch}
        accessibilityLabel="Camera viewfinder. Tap anywhere to hear your position."
        accessibilityRole="image">
        <CameraView ref={cameraRef} style={styles.camera} facing="back"
          onCameraReady={() => setCameraReady(true)}>
          <FramingGuide paperState={paperState} />
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
              <Text style={styles.processingText}>Scanning…{'\n'}GPT-4o-mini correcting</Text>
            </View>
          )}
        </CameraView>
      </TouchableOpacity>

    {/* Status bar */}
      <View style={[styles.statusBar, { borderColor: stateUI.color + '44' }]}
        accessible accessibilityLabel={`Paper status: ${stateUI.label}`}>
        <Ionicons name={stateUI.icon as any} size={16} color={stateUI.color} />
        <Text style={[styles.statusLabel, { color: stateUI.color }]}>{stateUI.label}</Text>
        <HapticBadge active={store.hapticEnabled} />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.langBtn}
          onPress={() => setShowLangPicker(!showLangPicker)}
          accessibilityLabel={`Language: ${LANGUAGE_LABELS[store.targetLanguage]}. Tap to change.`}
          accessibilityRole="button">
          <Ionicons name="language" size={18} color={Colors.accent.primary} />
          <Text style={styles.langBtnText}>{LANGUAGE_LABELS[store.targetLanguage]}</Text>
          <Ionicons name={showLangPicker ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.accent.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.scanBtn,
            (isProcessing || !cameraReady) && styles.scanBtnDisabled,
            paperState === 'locked' && styles.scanBtnReady]}
          onPress={handleScan} disabled={isProcessing || !cameraReady}
          accessibilityLabel={paperState === 'locked' ? 'Scan now. Paper perfectly framed.' : `Scan Braille. ${stateUI.label}`}
          accessibilityRole="button">
          {isProcessing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="scan" size={28} color="#fff" />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.voiceBtn}
          onPress={() => store.setVoiceGuidance(!store.voiceGuidance)}
          accessibilityLabel={`Voice guidance ${store.voiceGuidance ? 'on' : 'off'}`}
          accessibilityRole="switch" accessibilityState={{ checked: store.voiceGuidance }}>
          <Ionicons name={store.voiceGuidance ? 'volume-high' : 'volume-mute'} size={22}
            color={store.voiceGuidance ? Colors.accent.primary : Colors.text.disabled} />
        </TouchableOpacity>
      </View>

      {/* Language picker */}
      {showLangPicker && (
        <LanguagePicker current={store.targetLanguage}
          onSelect={(lang) => {
            store.setTargetLanguage(lang);
            configureTTS({ language: LANG_TO_BCP47[lang] ?? 'en-US' });
            setShowLangPicker(false);
          }}
          onClose={() => setShowLangPicker(false)} />
      )}

      {/* Result panel */}
      {showResult && result && (
        <ResultPanel result={result}
          onClose={() => { setShowResult(false); resetFrameAnalyser(); }}
          onReadAloud={() => readScanResult(result.corrected_text, result.translated_text)} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FramingGuide({ paperState }: { paperState: PaperState }) {
  const locked = paperState === 'locked';
  const color  = locked ? Colors.success : Colors.accent.primary;
  const size   = 28; const thick = 3;
  const corner: any = { position: 'absolute', width: size, height: size, borderColor: color };
  return (
    <View style={styles.framingGuide} pointerEvents="none">
      <View style={[corner, { top:0, left:0, borderTopWidth:thick, borderLeftWidth:thick }]} />
      <View style={[corner, { top:0, right:0, borderTopWidth:thick, borderRightWidth:thick }]} />
      <View style={[corner, { bottom:0, left:0, borderBottomWidth:thick, borderLeftWidth:thick }]} />
      <View style={[corner, { bottom:0, right:0, borderBottomWidth:thick, borderRightWidth:thick }]} />
      {locked && (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedText}>READY</Text>
        </View>
      )}
    </View>
  );
}

function HapticBadge({ active }: { active: boolean }) {
  return (
    <View style={[styles.hapticBadge, active && styles.hapticBadgeActive]}>
      <Ionicons name="pulse" size={12} color={active ? Colors.accent.primary : Colors.text.disabled} />
    </View>
  );
}

function LanguagePicker({ current, onSelect, onClose }: {
  current: SupportedLanguage; onSelect: (l: SupportedLanguage) => void; onClose: () => void;
}) {
  return (
    <View style={styles.langPickerWrapper}>
      <View style={styles.langPickerHeader}>
        <Text style={styles.langPickerTitle}>Output Language</Text>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Close language picker">
          <Ionicons name="close" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.langPickerScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.langGrid}>
          {(Object.entries(LANGUAGE_LABELS) as [SupportedLanguage, string][]).map(([code, label]) => (
            <TouchableOpacity key={code}
              style={[styles.langChip, current === code && styles.langChipActive]}
              onPress={() => onSelect(code)}
              accessibilityLabel={label} accessibilityRole="radio"
              accessibilityState={{ selected: current === code }}>
              <Text style={[styles.langChipText, current === code && styles.langChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ResultPanel({ result, onClose, onReadAloud }: {
  result: ScanResult; onClose: () => void; onReadAloud: () => void;
}) {
  return (
    <View style={styles.resultPanel} accessible
      accessibilityLabel={`Scan result: ${result.translated_text ?? result.corrected_text}`}>
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultTitle}>Scan Result</Text>
          <Text style={styles.resultMeta}>
            {result.cell_count} cells · {result.processing_time_ms.toFixed(0)}ms · {(result.confidence_avg * 100).toFixed(0)}% confidence
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Close result" accessibilityRole="button">
          <Ionicons name="close-circle" size={26} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {result.raw_braille_text !== result.corrected_text && (
        <View style={styles.rawRow}>
          <Text style={styles.rawLabel}>Raw OCR</Text>
          <Text style={styles.rawText} numberOfLines={1}>{result.raw_braille_text}</Text>
        </View>
      )}

      <ScrollView style={styles.resultScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.resultText}>{result.corrected_text}</Text>
        {result.translated_text && (
          <>
            <View style={styles.translationDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>Translation</Text>
              <View style={styles.dividerLine} />
            </View>
            <Text style={styles.translatedText}>{result.translated_text}</Text>
          </>
        )}
        {result.warnings.map((w, i) => (
          <View key={i} style={styles.warningRow}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.warningText}>{w}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.resultActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onReadAloud}
          accessibilityLabel="Read result aloud" accessibilityRole="button">
          <Ionicons name="volume-high" size={18} color={Colors.accent.primary} />
          <Text style={styles.actionBtnText}>Read Aloud</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={onClose}
          accessibilityLabel="Scan another page" accessibilityRole="button">
          <Ionicons name="scan" size={18} color="#fff" />
          <Text style={[styles.actionBtnText, { color: '#fff' }]}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PermissionView({ onRequest, canAskAgain }: { onRequest: () => void; canAskAgain: boolean }) {
  return (
    <SafeAreaView style={styles.centreView}>
      <Ionicons name="camera-outline" size={56} color={Colors.accent.primary} />
      <Text style={styles.permTitle}>Camera Access Needed</Text>
      <Text style={styles.permSub}>BrailleVision needs the camera to scan physical Braille documents.</Text>
      {canAskAgain
        ? <TouchableOpacity style={styles.permBtn} onPress={onRequest} accessibilityRole="button">
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        : <Text style={styles.permSub}>Enable Camera access in device Settings.</Text>}
    </SafeAreaView>
  );
}

function LoadingView() {
  return (
    <View style={styles.centreView}>
      <ActivityIndicator size="large" color={Colors.accent.primary} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.primary },
  cameraWrapper: { width: SCREEN_W, height: CAMERA_H, overflow: 'hidden' },
  camera: { flex: 1 },
  framingGuide: { position: 'absolute', top: 32, left: 32, right: 32, bottom: 32 },
  lockedBadge: {
    position: 'absolute', top: '45%', alignSelf: 'center',
    backgroundColor: Colors.success + 'CC', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  lockedText: { ...Typography.label, color: '#fff', letterSpacing: 2 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,15,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
  },
  processingText: { ...Typography.body, color: Colors.text.primary, textAlign: 'center' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, backgroundColor: Colors.bg.secondary,
  },
  statusLabel: { ...Typography.label, flex: 1 },
  hapticBadge: {
    width: 22, height: 22, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg.tertiary,
  },
  hapticBadgeActive: { backgroundColor: Colors.accent.glow },
  controls: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    backgroundColor: Colors.bg.secondary, gap: Spacing.sm,
  },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    flex: 1, borderWidth: 1, borderColor: Colors.border.subtle,
  },
  langBtnText: { ...Typography.caption, color: Colors.text.primary, flex: 1 },
  scanBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadows.accent,
  },
  scanBtnDisabled: { backgroundColor: Colors.text.disabled },
  scanBtnReady: { backgroundColor: Colors.success, shadowColor: Colors.success },
  voiceBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bg.tertiary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  langPickerWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderColor: Colors.border.default,
    maxHeight: SCREEN_H * 0.5, padding: Spacing.md, ...Shadows.card,
  },
  langPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.md,
  },
  langPickerTitle: { ...Typography.h3, color: Colors.text.primary },
  langPickerScroll: { maxHeight: SCREEN_H * 0.35 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingBottom: Spacing.lg },
  langChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  langChipActive: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  langChipText: { ...Typography.caption, color: Colors.text.secondary },
  langChipTextActive: { color: '#fff', fontWeight: '600' },
  resultPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderColor: Colors.border.accent,
    padding: Spacing.md, maxHeight: SCREEN_H * 0.6, ...Shadows.card,
  },
  resultHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: Spacing.sm,
  },
  resultTitle: { ...Typography.h3, color: Colors.text.primary },
  resultMeta: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  rawRow: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  rawLabel: { ...Typography.caption, color: Colors.text.disabled },
  rawText: { ...Typography.mono, color: Colors.text.secondary, flex: 1 },
  resultScroll: { maxHeight: SCREEN_H * 0.25 },
  resultText: { ...Typography.body, color: Colors.text.primary, lineHeight: 24 },
  translationDivider: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border.subtle },
  dividerLabel: { ...Typography.caption, color: Colors.text.disabled },
  translatedText: { ...Typography.body, color: Colors.accent.secondary, lineHeight: 24 },
  warningRow: { flexDirection: 'row', gap: Spacing.xs, alignItems: 'center', marginTop: Spacing.sm },
  warningText: { ...Typography.caption, color: Colors.warning, flex: 1 },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.bg.tertiary, borderWidth: 1, borderColor: Colors.border.default,
  },
  actionBtnPrimary: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  actionBtnText: { ...Typography.label, color: Colors.accent.primary },
  centreView: {
    flex: 1, backgroundColor: Colors.bg.primary,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md,
  },
  permTitle: { ...Typography.h2, color: Colors.text.primary, textAlign: 'center' },
  permSub: { ...Typography.body, color: Colors.text.secondary, textAlign: 'center' },
  permBtn: {
    backgroundColor: Colors.accent.primary, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.md,
  },
  permBtnText: { ...Typography.label, color: '#fff' },
});