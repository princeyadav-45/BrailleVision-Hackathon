/**
 * src/screens/History/HistoryScreen.tsx — FIXED
 * Fixed imports to use relative paths correctly
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/tokens';
import { useAppStore, type ScanResult } from '../../store/appStore';
import { exportAndShare } from '../../services/pdfHelper';
import * as Speech from 'expo-speech';

export default function HistoryScreen() {
  const { scanHistory, deleteFromHistory, updateNote, clearHistory, targetLanguage, ttsSpeed, ttsPitch } = useAppStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [noteText,   setNoteText]   = useState('');
  const [exporting,  setExporting]  = useState(false);

  const LANG_TO_BCP47: Record<string, string> = {
    en:'en-US',hi:'hi-IN',fr:'fr-FR',de:'de-DE',es:'es-ES',pt:'pt-BR',
    ar:'ar-SA',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',ru:'ru-RU',it:'it-IT',
    nl:'nl-NL',tr:'tr-TR',pl:'pl-PL',sv:'sv-SE',
  };

  async function handleExportAll() {
    if (scanHistory.length === 0) return;
    try {
      setExporting(true);
      await exportAndShare(scanHistory);
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportOne(scan: ScanResult) {
    try {
      setExporting(true);
      await exportAndShare([scan]);
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setExporting(false);
    }
  }

  function handleDelete(scan: ScanResult) {
    Alert.alert('Delete Scan', 'Remove this scan from history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        deleteFromHistory(scan.scan_id);
        if (expandedId === scan.scan_id) setExpandedId(null);
      }},
    ]);
  }

  function handleSaveNote(scan_id: string) {
    updateNote(scan_id, noteText);
    setEditingId(null);
  }

  function handleClearAll() {
    Alert.alert('Clear History', 'Delete all saved scans?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: clearHistory },
    ]);
  }

  function readAloud(scan: ScanResult) {
    const text = scan.translated_text ?? scan.corrected_text;
    if (!text?.trim()) return;
    Speech.speak(text, {
      language: LANG_TO_BCP47[targetLanguage] ?? 'en-US',
      rate: ttsSpeed,
      pitch: ttsPitch,
    });
  }

  if (scanHistory.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.screenTitle} accessibilityRole="header">History</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={56} color={Colors.text.disabled} />
          <Text style={styles.emptyTitle}>No Scans Yet</Text>
          <Text style={styles.emptySub}>Your scan history will appear here.{'\n'}Go to the Scan tab to get started.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle} accessibilityRole="header">History</Text>
          <Text style={styles.screenSub}>{scanHistory.length} scan{scanHistory.length > 1 ? 's' : ''} saved</Text>
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}
          accessibilityLabel="Clear all history" accessibilityRole="button">
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.exportBar}>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportAll} disabled={exporting}
          accessibilityLabel="Export all as PDF" accessibilityRole="button">
          {exporting
            ? <ActivityIndicator size="small" color={Colors.accent.primary} />
            : <Ionicons name="document-text-outline" size={16} color={Colors.accent.primary} />}
          <Text style={styles.exportBtnText}>Export All PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportAll} disabled={exporting}
          accessibilityLabel="Share all" accessibilityRole="button">
          <Ionicons name="share-outline" size={16} color={Colors.accent.primary} />
          <Text style={styles.exportBtnText}>Share All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {scanHistory.map((scan) => {
          const expanded = expandedId === scan.scan_id;
          const editing  = editingId  === scan.scan_id;
          const date     = new Date(scan.scanned_at).toLocaleString();

          return (
            <View key={scan.scan_id} style={styles.scanCard}>
              <TouchableOpacity style={styles.cardHeader}
                onPress={() => setExpandedId(expanded ? null : scan.scan_id)}
                accessibilityLabel={`Scan: ${scan.corrected_text.slice(0,60)}`}
                accessibilityRole="button">
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardText} numberOfLines={expanded ? 0 : 2}>
                    {scan.corrected_text || scan.raw_braille_text}
                  </Text>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardMetaText}>{date}</Text>
                    <Text style={styles.cardMetaText}>· {scan.cell_count} cells</Text>
                    <Text style={styles.cardMetaText}>· {(scan.confidence_avg * 100).toFixed(0)}%</Text>
                  </View>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.disabled} />
              </TouchableOpacity>

              {expanded && (
                <View style={styles.cardExpanded}>
                  {scan.translated_text && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Translation</Text>
                      <Text style={styles.translatedText}>{scan.translated_text}</Text>
                    </View>
                  )}

                  <View style={styles.statsRow}>
                    <View style={styles.statChip}><Text style={styles.statChipLabel}>Time</Text><Text style={styles.statChipValue}>{scan.processing_time_ms.toFixed(0)}ms</Text></View>
                    <View style={styles.statChip}><Text style={styles.statChipLabel}>Cells</Text><Text style={styles.statChipValue}>{scan.cell_count}</Text></View>
                    <View style={styles.statChip}><Text style={styles.statChipLabel}>Confidence</Text><Text style={styles.statChipValue}>{(scan.confidence_avg * 100).toFixed(0)}%</Text></View>
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.noteLabelRow}>
                      <Text style={styles.detailLabel}>Note</Text>
                      <TouchableOpacity onPress={() => { setEditingId(editing ? null : scan.scan_id); setNoteText(scan.note); }}>
                        <Ionicons name={editing ? 'close' : 'pencil'} size={14} color={Colors.accent.primary} />
                      </TouchableOpacity>
                    </View>
                    {editing ? (
                      <View>
                        <TextInput style={styles.noteInput} value={noteText} onChangeText={setNoteText}
                          placeholder="Add a note…" placeholderTextColor={Colors.text.disabled} multiline autoFocus />
                        <TouchableOpacity style={styles.saveNoteBtn} onPress={() => handleSaveNote(scan.scan_id)}>
                          <Text style={styles.saveNoteBtnText}>Save Note</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.noteText}>{scan.note || 'No note added.'}</Text>
                    )}
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.cardActionBtn} onPress={() => readAloud(scan)}>
                      <Ionicons name="volume-high-outline" size={16} color={Colors.accent.primary} />
                      <Text style={styles.cardActionText}>Read</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleExportOne(scan)}>
                      <Ionicons name="document-text-outline" size={16} color={Colors.accent.primary} />
                      <Text style={styles.cardActionText}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleExportOne(scan)}>
                      <Ionicons name="share-outline" size={16} color={Colors.accent.primary} />
                      <Text style={styles.cardActionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.cardActionBtn, styles.cardActionBtnDanger]} onPress={() => handleDelete(scan)}>
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                      <Text style={[styles.cardActionText, { color: Colors.error }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: Colors.bg.primary },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  screenTitle: { ...Typography.h1, color: Colors.text.primary },
  screenSub:   { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  clearBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border.subtle },
  exportBar:   { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  exportBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.subtle },
  exportBtnText: { ...Typography.label, color: Colors.accent.primary },
  list:        { flex: 1 },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  scanCard:    { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border.subtle, marginBottom: Spacing.sm, overflow: 'hidden', ...Shadows.subtle },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  cardHeaderLeft: { flex: 1 },
  cardText:    { ...Typography.body, color: Colors.text.primary, lineHeight: 22 },
  cardMeta:    { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: 'wrap' },
  cardMetaText:{ ...Typography.caption, color: Colors.text.secondary },
  cardExpanded:{ borderTopWidth: 1, borderTopColor: Colors.border.subtle, padding: Spacing.md, gap: Spacing.md },
  detailSection: { gap: 4 },
  detailLabel: { ...Typography.caption, color: Colors.text.disabled, textTransform: 'uppercase', letterSpacing: 1 },
  translatedText: { ...Typography.body, color: Colors.accent.secondary, lineHeight: 22 },
  statsRow:    { flexDirection: 'row', gap: Spacing.sm },
  statChip:    { flex: 1, backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border.subtle },
  statChipLabel: { ...Typography.caption, color: Colors.text.disabled },
  statChipValue: { ...Typography.label, color: Colors.text.primary, marginTop: 2 },
  noteLabelRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteInput:   { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm, padding: Spacing.sm, color: Colors.text.primary, ...Typography.body, borderWidth: 1, borderColor: Colors.border.default, minHeight: 60 },
  saveNoteBtn: { marginTop: Spacing.sm, backgroundColor: Colors.accent.primary, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
  saveNoteBtnText: { ...Typography.label, color: '#fff' },
  noteText:    { ...Typography.body, color: Colors.text.secondary },
  cardActions: { flexDirection: 'row', gap: Spacing.xs },
  cardActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.bg.tertiary, borderWidth: 1, borderColor: Colors.border.subtle },
  cardActionBtnDanger: { borderColor: Colors.error + '33', backgroundColor: Colors.error + '11' },
  cardActionText: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },
  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyTitle:  { ...Typography.h2, color: Colors.text.primary },
  emptySub:    { ...Typography.body, color: Colors.text.secondary, textAlign: 'center' },
});