/**
 * App.tsx
 * ========
 * Root application component.
 *
 * Responsibilities:
 *   1. Wait for Zustand AsyncStorage rehydration before rendering
 *      (crash-recovery gate — prevents flicker of stale UI)
 *   2. Wrap the app in NavigationContainer + SafeAreaProvider
 *   3. Mount the bottom-tab AppNavigator
 *
 * Vibe-Coding Disclosure: Bootstrapping pattern designed with Claude (Anthropic).
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppNavigator from './src/navigation/AppNavigator';
import { useAppStore } from './src/store/appStore';
import { Colors } from './src/theme/tokens';

export default function App() {
  const isRehydrated = useAppStore((s) => s.isRehydrated);

  // Show a minimal splash while AsyncStorage rehydrates
  if (!isRehydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});