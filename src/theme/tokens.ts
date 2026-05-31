export const Colors = {
  bg: {
    primary: '#121212',
    secondary: '#1E1E1E',
    tertiary: '#2C2C2C',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A0A0A0',
    disabled: '#666666',
    inverse: '#000000', 
  },
  border: {
    default: '#333333',
    subtle: '#222222',
    accent: '#BB86FC',
  },
  accent: {
    primary: '#BB86FC',
    secondary: '#03DAC6',
    glow: 'rgba(187, 134, 252, 0.3)',
  },
  tab: {
    active: '#BB86FC',
    inactive: '#666666',
    background: '#1E1E1E',
  },
  success: '#4CAF50',
  warning: '#FF9800',
  info: '#2196F3',
  error: '#CF6679',
};

export const Spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const Radius = {
  sm: 4, md: 8, lg: 12, xl: 16, full: 9999,
};

export const Typography = {
  h1: { fontSize: 32, fontWeight: 'bold' as const },
  h2: { fontSize: 24, fontWeight: 'bold' as const },
  h3: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: 'normal' as const },
  caption: { fontSize: 14, fontWeight: 'normal' as const },
  label: { fontSize: 12, fontWeight: '600' as const, textTransform: 'uppercase' as const },
  mono: { fontSize: 14, fontFamily: 'monospace' },
};

export const Shadows = {
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  accent: { shadowColor: Colors.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  subtle: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
};