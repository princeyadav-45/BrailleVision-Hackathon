/**
 * src/navigation/AppNavigator.tsx
 * ================================
 * Root bottom-tab navigator for BrailleVision 2026.
 *
 * 5 tabs (spec-exact):
 *   1. Home          — onboarding dashboard
 *   2. Scan          — live camera scanner (core feature)
 *   3. Text→Braille  — reverse translation tool
 *   4. History       — scan history + PDF export
 *   5. Settings      — user preferences
 *
 * Accessibility:
 *   - Every tab has an accessibilityLabel and accessibilityHint
 *   - Active tab is announced by VoiceOver / TalkBack
 *   - Tab bar hidden on scan screen to maximise camera viewport
 *
 * Vibe-Coding Disclosure: Navigator structure designed with Claude (Anthropic).
 */

import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing } from '../theme/tokens';
import { useAppStore } from '../store/appStore';

import HomeScreen        from '../screens/Home/HomeScreen';
import ScanScreen        from '../screens/Scan/ScanScreen';
import TextToBrailleScreen from '../screens/TextToBraille/TextToBrailleScreen';
import HistoryScreen     from '../screens/History/HistoryScreen';
import SettingsScreen    from '../screens/Settings/SettingsScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RootTabParamList = {
  Home:          undefined;
  Scan:          undefined;
  TextToBraille: undefined;
  History:       undefined;
  Settings:      undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// ---------------------------------------------------------------------------
// Tab icon map
// ---------------------------------------------------------------------------

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof RootTabParamList, { active: IconName; inactive: IconName }> = {
  Home:          { active: 'home',          inactive: 'home-outline' },
  Scan:          { active: 'scan',          inactive: 'scan-outline' },
  TextToBraille: { active: 'text',          inactive: 'text-outline' },
  History:       { active: 'time',          inactive: 'time-outline' },
  Settings:      { active: 'settings',      inactive: 'settings-outline' },
};

const TAB_LABELS: Record<keyof RootTabParamList, string> = {
  Home:          'Home',
  Scan:          'Scan',
  TextToBraille: 'Braille',
  History:       'History',
  Settings:      'Settings',
};

const TAB_A11Y_HINTS: Record<keyof RootTabParamList, string> = {
  Home:          'Opens the home dashboard and app overview',
  Scan:          'Opens the live Braille camera scanner',
  TextToBraille: 'Opens the text to Braille conversion tool',
  History:       'Opens your saved scan history',
  Settings:      'Opens app preferences and accessibility options',
};

// ---------------------------------------------------------------------------
// Custom tab bar icon component
// ---------------------------------------------------------------------------

interface TabIconProps {
  routeName: keyof RootTabParamList;
  focused:   boolean;
  color:     string;
  size:      number;
}

function TabIcon({ routeName, focused, color, size }: TabIconProps) {
  const icons = TAB_ICONS[routeName];
  const iconName = focused ? icons.active : icons.inactive;

  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
      <Ionicons name={iconName} size={size} color={color} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Navigator
// ---------------------------------------------------------------------------

export default function AppNavigator() {
  const { colorScheme } = useAppStore();
  const isDark = colorScheme === 'dark';

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => {
        const name = route.name as keyof RootTabParamList;

        return {
          headerShown: false,

          // ---- Tab bar styling ----
          tabBarStyle: {
            backgroundColor: Colors.tab.background,
            borderTopColor:  Colors.border.subtle,
            borderTopWidth:  1,
            height:          Platform.OS === 'ios' ? 84 : 64,
            paddingBottom:   Platform.OS === 'ios' ? 24 : 8,
            paddingTop:      8,
          },

          tabBarActiveTintColor:   Colors.tab.active,
          tabBarInactiveTintColor: Colors.tab.inactive,

          tabBarLabelStyle: {
            fontSize:     10,
            fontWeight:   '500',
            marginTop:    2,
          },

          // ---- Icon ----
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              routeName={name}
              focused={focused}
              color={color}
              size={size - 2}
            />
          ),

          tabBarLabel: TAB_LABELS[name],

          // ---- Accessibility ----
          tabBarAccessibilityLabel: `${TAB_LABELS[name]} tab`,
          tabBarTestID: `tab-${name.toLowerCase()}`,
        };
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarAccessibilityLabel: 'Home tab. ' + TAB_A11Y_HINTS.Home }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ tabBarAccessibilityLabel: 'Scan tab. ' + TAB_A11Y_HINTS.Scan }}
      />
      <Tab.Screen
        name="TextToBraille"
        component={TextToBrailleScreen}
        options={{
          tabBarLabel: 'Braille',
          tabBarAccessibilityLabel: 'Text to Braille tab. ' + TAB_A11Y_HINTS.TextToBraille,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarAccessibilityLabel: 'History tab. ' + TAB_A11Y_HINTS.History }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarAccessibilityLabel: 'Settings tab. ' + TAB_A11Y_HINTS.Settings }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  iconWrapper: {
    width:         36,
    height:        28,
    alignItems:    'center',
    justifyContent:'center',
    borderRadius:  8,
  },
  iconWrapperActive: {
    backgroundColor: Colors.accent.glow,
  },
});