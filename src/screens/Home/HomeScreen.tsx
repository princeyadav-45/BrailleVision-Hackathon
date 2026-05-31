/**
 * src/screens/Home/HomeScreen.tsx
 * ================================
 * Onboarding dashboard — Tab 1.
 *
 * Shows:
 *   • App hero header with tagline
 *   • Backend health status indicator
 *   • Feature card grid (4 capabilities)
 *   • Quick-start CTA → navigates to Scan tab
 *   • Crash-recovery banner if a previous scan was recovered
 *
 * Accessibility:
 *   - All interactive elements have accessibilityLabel + accessibilityRole
 *   - Semantic heading hierarchy (accessibilityRole="header")
 *   - Status badge announced as a live region
 *
 * Vibe-Coding Disclosure: Screen layout designed with Claude (Anthropic).
 */

import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/tokens';
import { useAppStore } from '../../store/appStore';
import type { RootTabParamList } from '../../navigation/AppNavigator';

type NavProp = BottomTabNavigationProp<RootTabParamList, 'Home'>;

// ---------------------------------------------------------------------------
// Feature cards data
// ---------------------------------------------------------------------------

interface FeatureCard {
  icon:    React.ComponentProps<typeof Ionicons>['name'];
  title:   string;
  desc:    string;
  color:   string;
}

const FEATURES: FeatureCard[] = [
  {
    icon:  'scan',
    title: 'Shadow Detection',
    desc:  'CV pipeline captures Braille bump shadows — same colour as paper.',
    color: '#3B82F6',
  },
  {
    icon:  'sparkles',
    title: 'GPT-4o-mini Correction',
    desc:  'OpenAI fixes OCR errors for 92–96% accuracy after raw decode.',
    color: '#8B5CF6',
  },
  {
    icon:  'language',
    title: '16 Languages',
    desc:  'Native TTS reads output aloud in your chosen language.',
    color: '#10B981',
  },
  {
    icon:  'pulse',
    title: 'Haptic Guidance',
    desc:  'Vibration guides you to perfectly frame the Braille page.',
    color: '#F59E0B',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const navigation    = useNavigation<NavProp>();
  const {
    backendHealthy, yoloLoaded, openaiReady,
    currentResult, setBackendHealth, backendUrl,
  } = useAppStore();

  // ---- Poll backend health on mount ----
  useEffect(() => {
    checkBackendHealth();
  }, [backendUrl]);

  async function checkBackendHealth() {
    try {
      const res  = await fetch(`${backendUrl}/api/v1/health`, { method: 'GET' });
      const data = await res.json();
      setBackendHealth(data.status === 'healthy', data.yolo_loaded, data.openai_ready);
    } catch {
      setBackendHealth(false, false, false);
    }
  }

  function goToScan() {
    navigation.navigate('Scan');
  }

  // ---- Accessibility: announce backend status changes ----
  useEffect(() => {
    const status = backendHealthy ? 'Backend connected and ready' : 'Backend not connected';
    AccessibilityInfo.announceForAccessibility(status);
  }, [backendHealthy]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.logoRow}>
            <View style={styles.logoIconWrapper}>
              <Ionicons name="eye" size={28} color={Colors.accent.primary} />
            </View>
            <Text style={styles.logoText} accessibilityRole="header">
              BrailleVision
            </Text>
            <View style={styles.yearBadge}>
              <Text style={styles.yearText}>2026</Text>
            </View>
          </View>

          <Text style={styles.tagline}>
            Physical Braille → Text → Speech
          </Text>
          <Text style={styles.subTagline}>
            Shadow-detection CV · GPT-4o-mini correction · 16-language TTS
          </Text>
        </View>

        {/* ── Backend status ───────────────────────────────────── */}
        <View
          style={[styles.statusCard, backendHealthy ? styles.statusOk : styles.statusErr]}
          accessible
          accessibilityLabel={
            backendHealthy
              ? `Backend connected. YOLO ${yoloLoaded ? 'loaded' : 'in stub mode'}. OpenAI ${openaiReady ? 'ready' : 'not connected'}.`
              : 'Backend not connected. Open Settings and check your backend URL.'
          }
          accessibilityRole="alert"
        >
          <Ionicons
            name={backendHealthy ? 'checkmark-circle' : 'warning'}
            size={18}
            color={backendHealthy ? Colors.success : Colors.warning}
          />
          <View style={styles.statusText}>
            <Text style={[styles.statusTitle, { color: backendHealthy ? Colors.success : Colors.warning }]}>
              {backendHealthy ? 'Backend Connected' : 'Backend Offline'}
            </Text>
            <Text style={styles.statusSub}>
              {backendHealthy
                ? `YOLO: ${yoloLoaded ? '✓ Loaded' : '⚡ Stub'}  ·  OpenAI: ${openaiReady ? '✓ Ready' : '✗ Check key'}`
                : 'Go to Settings → set your backend IP address'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={checkBackendHealth}
            accessibilityLabel="Refresh backend status"
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── Crash recovery banner ────────────────────────────── */}
        {currentResult && (
          <TouchableOpacity
            style={styles.recoveryBanner}
            onPress={goToScan}
            accessibilityLabel={`Recovered scan: ${currentResult.corrected_text.slice(0, 40)}. Tap to view.`}
            accessibilityRole="button"
          >
            <Ionicons name="refresh-circle" size={20} color={Colors.info} />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={styles.recoveryTitle}>Scan Recovered</Text>
              <Text style={styles.recoveryText} numberOfLines={1}>
                {currentResult.corrected_text}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.secondary} />
          </TouchableOpacity>
        )}

        {/* ── Feature cards ────────────────────────────────────── */}
        <Text style={styles.sectionHeader} accessibilityRole="header">
          Capabilities
        </Text>

        <View style={styles.cardGrid}>
          {FEATURES.map((feat) => (
            <View
              key={feat.title}
              style={styles.featureCard}
              accessible
              accessibilityLabel={`${feat.title}: ${feat.desc}`}
            >
              <View style={[styles.featureIcon, { backgroundColor: feat.color + '22' }]}>
                <Ionicons name={feat.icon} size={22} color={feat.color} />
              </View>
              <Text style={styles.featureTitle}>{feat.title}</Text>
              <Text style={styles.featureDesc}>{feat.desc}</Text>
            </View>
          ))}
        </View>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={goToScan}
          activeOpacity={0.85}
          accessibilityLabel="Start scanning Braille"
          accessibilityRole="button"
          accessibilityHint="Opens the live camera Braille scanner"
        >
          <Ionicons name="scan" size={22} color={Colors.text.inverse} />
          <Text style={styles.ctaText}>Start Scanning</Text>
        </TouchableOpacity>

        {/* Vibe-coding disclosure */}
        <Text style={styles.disclosure}>
          AI-assisted development: Claude (Anthropic) · OpenAI GPT-4o-mini
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },

  // Hero
  hero:       { marginTop: Spacing.xl, marginBottom: Spacing.lg },
  logoRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  logoIconWrapper: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.accent.glow, alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  logoText:   { ...Typography.h1, color: Colors.text.primary, flex: 1 },
  yearBadge:  {
    backgroundColor: Colors.accent.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  yearText:   { ...Typography.caption, color: '#fff', fontWeight: '700' },
  tagline:    { ...Typography.h2, color: Colors.text.primary, marginBottom: Spacing.xs },
  subTagline: { ...Typography.body, color: Colors.text.secondary },

  // Status card
  statusCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  statusOk:  { backgroundColor: Colors.success + '11', borderColor: Colors.success + '33' },
  statusErr: { backgroundColor: Colors.warning + '11', borderColor: Colors.warning + '33' },
  statusText: { flex: 1 },
  statusTitle:{ ...Typography.label },
  statusSub:  { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },

  // Recovery banner
  recoveryBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.info + '11', borderColor: Colors.info + '33',
    borderWidth: 1, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  recoveryTitle: { ...Typography.label, color: Colors.info },
  recoveryText:  { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },

  // Section header
  sectionHeader: {
    ...Typography.h3, color: Colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginBottom: Spacing.md,
  },

  // Feature cards
  cardGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  featureCard: {
    width: '47%', backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border.subtle,
    ...Shadows.subtle,
  },
  featureIcon:  {
    width: 40, height: 40, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  featureTitle: { ...Typography.label, color: Colors.text.primary, marginBottom: 4 },
  featureDesc:  { ...Typography.caption, color: Colors.text.secondary, lineHeight: 16 },

  // CTA
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent.primary, borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2, gap: Spacing.sm,
    marginBottom: Spacing.lg, ...Shadows.accent,
  },
  ctaText: { ...Typography.h3, color: Colors.text.inverse },

  // Disclosure
  disclosure: {
    ...Typography.caption, color: Colors.text.disabled,
    textAlign: 'center', marginTop: Spacing.sm,
  },
});