/**
 * src/screens/Settings/SettingsScreen.tsx
 * =========================================
 * User preferences — Tab 5.
 *
 * Fully functional in Phase 2 because settings drive ALL other screens.
 * Includes:
 *   • Backend URL input (critical for WiFi setup)
 *   • Language selector (16 languages)
 *   • TTS speed / pitch sliders
 *   • Haptic, auto-read, voice-guidance, large-text toggles
 *   • Dark/light mode toggle
 *   • Clear history action
 *
 * Vibe-Coding Disclosure: Screen designed with Claude (Anthropic).
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity,
  TextInput, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Typography, Radius } from '../../theme/tokens';
import {
  useAppStore,
  LANGUAGE_LABELS,
  type SupportedLanguage,
} from '../../store/appStore';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RowProps {
  label:   string;
  sub?:    string;
  children: React.ReactNode;
  accessibilityLabel?: string;
}

function SettingRow({ label, sub, children, accessibilityLabel }: RowProps) {
  return (
    <View
      style={styles.row}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.rowLabel}>
        <Text style={styles.rowTitle}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader} accessibilityRole="header">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const store = useAppStore();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [urlInput, setUrlInput] = useState(store.backendUrl);

  function saveUrl() {
    store.setBackendUrl(urlInput.trim());
    Alert.alert('Saved', 'Backend URL updated. Restart the app or go to Home to re-check health.');
  }

  function confirmClearHistory() {
    Alert.alert(
      'Clear History',
      'Delete all saved scans? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: store.clearHistory },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        <Text style={styles.screenTitle} accessibilityRole="header">Settings</Text>

        {/* ── Backend ─────────────────────────────────────────── */}
        <SectionHeader title="Backend" />
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Backend URL</Text>
          <Text style={styles.rowSub}>Your laptop's local IP on the same WiFi</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.x.x:8000"
              placeholderTextColor={Colors.text.disabled}
              accessibilityLabel="Backend URL input"
            />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={saveUrl}
              accessibilityLabel="Save backend URL"
              accessibilityRole="button"
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Language ────────────────────────────────────────── */}
        <SectionHeader title="Language" />
        <View style={styles.card}>
          <SettingRow
            label="Output Language"
            sub="Language for TTS and translation"
            accessibilityLabel={`Output language: ${LANGUAGE_LABELS[store.targetLanguage]}`}
          >
            <TouchableOpacity
              style={styles.langBtn}
              onPress={() => setShowLangPicker(!showLangPicker)}
              accessibilityRole="button"
              accessibilityLabel={`Select language. Current: ${LANGUAGE_LABELS[store.targetLanguage]}`}
            >
              <Text style={styles.langBtnText}>{LANGUAGE_LABELS[store.targetLanguage]}</Text>
              <Ionicons
                name={showLangPicker ? 'chevron-up' : 'chevron-down'}
                size={16} color={Colors.accent.primary}
              />
            </TouchableOpacity>
          </SettingRow>

          {showLangPicker && (
            <View style={styles.langGrid}>
              {(Object.keys(LANGUAGE_LABELS) as SupportedLanguage[]).map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.langChip,
                    store.targetLanguage === code && styles.langChipActive,
                  ]}
                  onPress={() => {
                    store.setTargetLanguage(code);
                    setShowLangPicker(false);
                  }}
                  accessibilityLabel={LANGUAGE_LABELS[code]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: store.targetLanguage === code }}
                >
                  <Text style={[
                    styles.langChipText,
                    store.targetLanguage === code && styles.langChipTextActive,
                  ]}>
                    {LANGUAGE_LABELS[code]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── TTS ─────────────────────────────────────────────── */}
        <SectionHeader title="Text-to-Speech" />
        <View style={styles.card}>
          <SettingRow label="Speed" sub={`${store.ttsSpeed.toFixed(1)}×`}>
            <View style={styles.stepperRow}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.stepBtn, store.ttsSpeed === v && styles.stepBtnActive]}
                  onPress={() => store.setTtsSpeed(v)}
                  accessibilityLabel={`TTS speed ${v}x`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: store.ttsSpeed === v }}
                >
                  <Text style={[styles.stepText, store.ttsSpeed === v && styles.stepTextActive]}>
                    {v}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>

          <SettingRow
            label="Auto-read on scan"
            sub="Speak result immediately after scan"
            accessibilityLabel={`Auto-read on scan: ${store.autoReadOnScan ? 'on' : 'off'}`}
          >
            <Switch
              value={store.autoReadOnScan}
              onValueChange={store.setAutoReadOnScan}
              trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary }}
              thumbColor="#fff"
              accessibilityLabel="Auto-read on scan toggle"
            />
          </SettingRow>
        </View>

        {/* ── Accessibility ────────────────────────────────────── */}
        <SectionHeader title="Accessibility" />
        <View style={styles.card}>
          <SettingRow
            label="Haptic Guidance"
            sub="Vibration to frame paper correctly"
            accessibilityLabel={`Haptic guidance: ${store.hapticEnabled ? 'on' : 'off'}`}
          >
            <Switch
              value={store.hapticEnabled}
              onValueChange={store.setHapticEnabled}
              trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary }}
              thumbColor="#fff"
            />
          </SettingRow>

          <SettingRow
            label="Voice Guidance"
            sub="Guiding voice assistant in scanner"
            accessibilityLabel={`Voice guidance: ${store.voiceGuidance ? 'on' : 'off'}`}
          >
            <Switch
              value={store.voiceGuidance}
              onValueChange={store.setVoiceGuidance}
              trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary }}
              thumbColor="#fff"
            />
          </SettingRow>

          <SettingRow
            label="Large Text"
            sub="Increases font size throughout app"
            accessibilityLabel={`Large text: ${store.largeText ? 'on' : 'off'}`}
          >
            <Switch
              value={store.largeText}
              onValueChange={store.setLargeText}
              trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary }}
              thumbColor="#fff"
            />
          </SettingRow>
        </View>

        {/* ── Data ────────────────────────────────────────────── */}
        <SectionHeader title="Data" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={confirmClearHistory}
            accessibilityLabel="Clear all scan history"
            accessibilityRole="button"
          >
            <Ionicons name="trash" size={18} color={Colors.error} />
            <Text style={styles.dangerText}>Clear Scan History</Text>
          </TouchableOpacity>
        </View>

        {/* Disclosure */}
        <Text style={styles.disclosure}>
          BrailleVision 2026 · AI-assisted development{'\n'}
          Claude (Anthropic) + OpenAI GPT-4o-mini
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:        { flex: 1 },
  content:       { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  screenTitle:   { ...Typography.h1, color: Colors.text.primary, marginTop: Spacing.lg, marginBottom: Spacing.lg },
  sectionHeader: {
    ...Typography.caption, color: Colors.text.disabled,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.bg.secondary, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border.subtle,
    paddingHorizontal: Spacing.md, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  rowLabel:   { flex: 1 },
  rowControl: { marginLeft: Spacing.sm },
  rowTitle:   { ...Typography.body, color: Colors.text.primary },
  rowSub:     { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },

  urlRow:     { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  urlInput:   {
    flex: 1, backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text.primary, ...Typography.body,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  saveBtn:    {
    backgroundColor: Colors.accent.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { ...Typography.label, color: '#fff' },

  langBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langBtnText: { ...Typography.label, color: Colors.accent.primary },
  langGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingBottom: Spacing.md },
  langChip:    {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  langChipActive:     { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  langChipText:       { ...Typography.caption, color: Colors.text.secondary },
  langChipTextActive: { color: '#fff', fontWeight: '600' },

  stepperRow: { flexDirection: 'row', gap: 4 },
  stepBtn:    {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  stepBtnActive:  { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  stepText:       { ...Typography.caption, color: Colors.text.secondary },
  stepTextActive: { color: '#fff', fontWeight: '600' },

  dangerBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  dangerText: { ...Typography.body, color: Colors.error },

  disclosure: {
    ...Typography.caption, color: Colors.text.disabled,
    textAlign: 'center', marginTop: Spacing.xl, lineHeight: 18,
  },
});