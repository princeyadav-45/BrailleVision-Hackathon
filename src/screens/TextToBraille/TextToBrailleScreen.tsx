/**
 * src/screens/TextToBraille/TextToBrailleScreen.tsx — FINAL
 * No expo-clipboard dependency — uses React Native Share instead
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/tokens';
import { useAppStore, LANGUAGE_LABELS, type SupportedLanguage } from '../../store/appStore';
import { exportAndShare } from '../../services/pdfHelper';
import type { ScanResult } from '../../store/appStore';

// ---------------------------------------------------------------------------
// Braille encoder
// ---------------------------------------------------------------------------
const GRADE1: Record<string, string> = {
  'a':'100000','b':'110000','c':'100100','d':'100110','e':'100010',
  'f':'110100','g':'110110','h':'110010','i':'010100','j':'010110',
  'k':'101000','l':'111000','m':'101100','n':'101110','o':'101010',
  'p':'111100','q':'111110','r':'111010','s':'011100','t':'011110',
  'u':'101001','v':'111001','w':'010111','x':'101101','y':'101111',
  'z':'101011',' ':'000000',
};
const BRAILLE_OFFSET = 0x2800;

function textToBrailleUnicode(text: string): string {
  return text.toLowerCase().split('').map(ch => {
    const bits = GRADE1[ch];
    if (!bits) return ch;
    const offset = bits.split('').reduce((acc, b, i) =>
      acc + (parseInt(b) * [1,2,4,8,16,32][i]), 0);
    return String.fromCodePoint(BRAILLE_OFFSET + offset);
  }).join('');
}

const LANG_TO_BCP47: Record<string, string> = {
  en:'en-US',hi:'hi-IN',fr:'fr-FR',de:'de-DE',es:'es-ES',pt:'pt-BR',
  ar:'ar-SA',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',ru:'ru-RU',it:'it-IT',
  nl:'nl-NL',tr:'tr-TR',pl:'pl-PL',sv:'sv-SE',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TextToBrailleScreen() {
  const store = useAppStore();
  const [inputText,      setInputText]      = useState('');
  const [brailleOutput,  setBrailleOutput]  = useState('');
  const [isExporting,    setIsExporting]    = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [converted,      setConverted]      = useState(false);

  function handleConvert() {
    if (!inputText.trim()) return;
    const braille = textToBrailleUnicode(inputText);
    setBrailleOutput(braille);
    setConverted(true);
  }

  function handleReadAloud() {
    if (!inputText.trim()) return;
    Speech.speak(inputText, {
      language: LANG_TO_BCP47[store.targetLanguage] ?? 'en-US',
      rate:  store.ttsSpeed,
      pitch: store.ttsPitch,
    });
  }

  // Uses built-in React Native Share — no extra package needed
  async function handleCopy() {
    if (!brailleOutput) return;
    try {
      await Share.share({ message: brailleOutput });
    } catch (e: any) {
      Alert.alert('Share Failed', e.message);
    }
  }

  async function handleExport() {
    if (!converted || !inputText.trim()) return;
    try {
      setIsExporting(true);
      const fakeScan: ScanResult = {
        scan_id:            `t2b-${Date.now()}`,
        raw_braille_text:   brailleOutput,
        corrected_text:     inputText,
        translated_text:    null,
        detected_cells:     [],
        cell_count:         brailleOutput.length,
        confidence_avg:     1.0,
        processing_time_ms: 0,
        warnings:           [],
        scanned_at:         new Date().toISOString(),
        note:               'Generated via Text-to-Braille tab',
      };
      await exportAndShare([fakeScan]);
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setIsExporting(false);
    }
  }

  function handleClear() {
    setInputText('');
    setBrailleOutput('');
    setConverted(false);
    Speech.stop();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title} accessibilityRole="header">Text to Braille</Text>
            <Text style={styles.subtitle}>Type text → Unicode Braille instantly</Text>
          </View>
          {inputText.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}
              accessibilityLabel="Clear all" accessibilityRole="button">
              <Ionicons name="close-circle" size={22} color={Colors.text.disabled} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Language selector ───────────────────────────────────── */}
        <TouchableOpacity
          style={styles.langRow}
          onPress={() => setShowLangPicker(!showLangPicker)}
          accessibilityLabel={`Language: ${LANGUAGE_LABELS[store.targetLanguage]}`}
          accessibilityRole="button"
        >
          <Ionicons name="language" size={16} color={Colors.accent.primary} />
          <Text style={styles.langText}>{LANGUAGE_LABELS[store.targetLanguage]}</Text>
          <Ionicons
            name={showLangPicker ? 'chevron-up' : 'chevron-down'}
            size={14} color={Colors.accent.secondary}
          />
        </TouchableOpacity>

        {showLangPicker && (
          <View style={styles.langGrid}>
            {(Object.entries(LANGUAGE_LABELS) as [SupportedLanguage, string][]).map(([code, label]) => (
              <TouchableOpacity
                key={code}
                style={[styles.langChip, store.targetLanguage === code && styles.langChipActive]}
                onPress={() => { store.setTargetLanguage(code); setShowLangPicker(false); }}
                accessibilityLabel={label}
                accessibilityRole="radio"
                accessibilityState={{ selected: store.targetLanguage === code }}
              >
                <Text style={[styles.langChipText,
                  store.targetLanguage === code && styles.langChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Text input ──────────────────────────────────────────── */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Input Text</Text>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={(t) => { setInputText(t); setConverted(false); }}
            placeholder="Type or paste text here…"
            placeholderTextColor={Colors.text.disabled}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            accessibilityLabel="Text input for Braille conversion"
          />
          <Text style={styles.charCount}>{inputText.length} characters</Text>
        </View>

        {/* ── Action buttons ──────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleReadAloud}
            disabled={!inputText.trim()}
            accessibilityLabel="Read text aloud"
            accessibilityRole="button"
          >
            <Ionicons
              name="volume-high-outline" size={18}
              color={inputText.trim() ? Colors.accent.primary : Colors.text.disabled}
            />
            <Text style={[styles.secondaryBtnText,
              !inputText.trim() && { color: Colors.text.disabled }]}>
              Read
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.convertBtn, !inputText.trim() && styles.convertBtnDisabled]}
            onPress={handleConvert}
            disabled={!inputText.trim()}
            accessibilityLabel="Convert text to Braille"
            accessibilityRole="button"
          >
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
            <Text style={styles.convertBtnText}>Convert to Braille</Text>
          </TouchableOpacity>
        </View>

        {/* ── Braille output ──────────────────────────────────────── */}
        {converted && brailleOutput.length > 0 && (
          <View style={styles.outputCard}>
            <View style={styles.outputHeader}>
              <View>
                <Text style={styles.outputLabel}>Unicode Braille Output</Text>
                <Text style={styles.outputMeta}>{brailleOutput.length} chars · Grade 1</Text>
              </View>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopy}
                accessibilityLabel="Share Braille output"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={16} color={Colors.accent.primary} />
                <Text style={styles.copyBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.brailleScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.brailleText}>{brailleOutput}</Text>
            </ScrollView>

            {/* Side-by-side comparison */}
            <View style={styles.comparisonRow}>
              <View style={styles.comparisonCol}>
                <Text style={styles.comparisonLabel}>Original</Text>
                <Text style={styles.comparisonText} numberOfLines={3}>{inputText}</Text>
              </View>
              <View style={styles.comparisonDivider} />
              <View style={styles.comparisonCol}>
                <Text style={styles.comparisonLabel}>Braille</Text>
                <Text style={[styles.comparisonText, { fontSize: 18, letterSpacing: 2 }]}
                  numberOfLines={3}>
                  {brailleOutput}
                </Text>
              </View>
            </View>

            {/* Export / Share */}
            <View style={styles.exportRow}>
              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExport}
                disabled={isExporting}
                accessibilityLabel="Export as PDF"
                accessibilityRole="button"
              >
                {isExporting
                  ? <ActivityIndicator size="small" color={Colors.accent.primary} />
                  : <Ionicons name="document-text-outline" size={16} color={Colors.accent.primary} />
                }
                <Text style={styles.exportBtnText}>Export PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExport}
                disabled={isExporting}
                accessibilityLabel="Share"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={16} color={Colors.accent.primary} />
                <Text style={styles.exportBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Info card (when nothing converted yet) ──────────────── */}
        {!converted && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
            <Text style={styles.infoText}>
              Converts text to Grade 1 English Braille Unicode instantly.
              Use the Scan tab to read physical Braille documents.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea:   { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:     { flex: 1 },
  content:    { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },

  header:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: Spacing.lg, marginBottom: Spacing.md },
  title:      { ...Typography.h1, color: Colors.text.primary },
  subtitle:   { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  clearBtn:   { padding: 4 },

  langRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border.subtle, marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  langText:   { ...Typography.label, color: Colors.accent.primary },

  langGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  langChip:   { paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.bg.tertiary, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.subtle },
  langChipActive:     { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  langChipText:       { ...Typography.caption, color: Colors.text.secondary },
  langChipTextActive: { color: '#fff', fontWeight: '600' },

  inputCard:  { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.subtle, padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.subtle },
  inputLabel: { ...Typography.caption, color: Colors.text.disabled, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  textInput:  { ...Typography.body, color: Colors.text.primary, minHeight: 120, textAlignVertical: 'top' },
  charCount:  { ...Typography.caption, color: Colors.text.disabled, textAlign: 'right', marginTop: 4 },

  actionRow:  { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border.subtle },
  secondaryBtnText: { ...Typography.label, color: Colors.accent.primary },
  convertBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.accent.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, ...Shadows.accent },
  convertBtnDisabled: { backgroundColor: Colors.text.disabled, shadowOpacity: 0 },
  convertBtnText: { ...Typography.label, color: '#fff' },

  outputCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.accent, padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.card },
  outputHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.md },
  outputLabel:  { ...Typography.label, color: Colors.text.primary },
  outputMeta:   { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  copyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.accent.glow, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  copyBtnText:  { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },

  brailleScroll: { maxHeight: 100, marginBottom: Spacing.md },
  brailleText:   { fontSize: 28, color: Colors.text.primary, letterSpacing: 3, lineHeight: 42, fontFamily: 'monospace' },

  comparisonRow:     { flexDirection: 'row', backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md },
  comparisonCol:     { flex: 1 },
  comparisonDivider: { width: 1, backgroundColor: Colors.border.subtle, marginHorizontal: Spacing.sm },
  comparisonLabel:   { ...Typography.caption, color: Colors.text.disabled, marginBottom: 4 },
  comparisonText:    { ...Typography.body, color: Colors.text.primary, lineHeight: 22 },

  exportRow:    { flexDirection: 'row', gap: Spacing.sm },
  exportBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border.subtle },
  exportBtnText:{ ...Typography.label, color: Colors.accent.primary },

  infoCard:   { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.info + '11', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.info + '33', padding: Spacing.md, marginTop: Spacing.sm },
  infoText:   { ...Typography.body, color: Colors.text.secondary, flex: 1, lineHeight: 22 },
});