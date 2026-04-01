import { createTheme, type ThemeOptions } from '@mui/material/styles';

const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Shared typography, shape, and component overrides between light and dark themes
const sharedTypography: ThemeOptions['typography'] = {
  fontFamily,
  h1: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
  h2: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.01em' },
  h3: { fontSize: '1.75rem', fontWeight: 600 },
  h4: { fontSize: '1.5rem', fontWeight: 600 },
  h5: { fontSize: '1.25rem', fontWeight: 600 },
  h6: { fontSize: '1rem', fontWeight: 600 },
  body1: { fontSize: '1rem', lineHeight: 1.5 },
  body2: { fontSize: '0.95rem', lineHeight: 1.5 },
};

const sharedShape: ThemeOptions['shape'] = {
  borderRadius: 12,
};

const createSharedComponents = (colors: {
  bg: string;
  border: string;
  primary: string;
  primaryBgHover: string;
  shadowAlpha: number;
  gradientStart: string;
  gradientEnd: string;
}): ThemeOptions['components'] => ({
  MuiCssBaseline: {
    styleOverrides: {
      body: { backgroundColor: colors.bg },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12,
        boxShadow: `0 1px 3px rgba(0, 0, 0, ${colors.shadowAlpha}), 0 1px 2px rgba(0, 0, 0, ${colors.shadowAlpha * 0.67})`,
        border: `1px solid ${colors.border}`,
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: `0 10px 15px rgba(0, 0, 0, ${colors.shadowAlpha}), 0 4px 6px rgba(0, 0, 0, ${colors.shadowAlpha * 0.5})`,
        },
      },
    },
  },
  MuiCardHeader: {
    styleOverrides: {
      root: {
        background: `linear-gradient(135deg, ${colors.gradientStart} 0%, ${colors.gradientEnd} 100%)`,
        color: '#fff',
        padding: '16px 20px',
        borderBottom: 'none',
      },
      title: { fontSize: '1.1rem', fontWeight: 700 },
      action: { color: '#fff', marginRight: 0 },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        textTransform: 'none' as const,
        fontWeight: 600,
        transition: 'all 0.2s ease',
        padding: '8px 16px',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 10px 15px rgba(0, 0, 0, ${colors.shadowAlpha})`,
        },
        '&:active': { transform: 'translateY(0)' },
      },
      contained: {
        boxShadow: `0 1px 3px rgba(0, 0, 0, ${colors.shadowAlpha})`,
      },
      outlined: {
        borderColor: colors.border,
        '&:hover': {
          borderColor: colors.primary,
          backgroundColor: colors.primaryBgHover,
        },
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8,
          transition: 'all 0.2s ease',
          '&:hover fieldset': { borderColor: colors.primary },
          '&.Mui-focused fieldset': {
            borderColor: colors.primary,
            boxShadow: `0 0 0 3px ${colors.primaryBgHover}`,
          },
        },
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: 'none' },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 8 },
    },
  },
});

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2563eb', light: '#3b82f6', dark: '#1e40af', contrastText: '#ffffff' },
    secondary: { main: '#10b981', light: '#34d399', dark: '#059669', contrastText: '#ffffff' },
    success: { main: '#10b981' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    info: { main: '#3b82f6' },
    background: { default: '#ffffff', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: '#e2e8f0',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: createSharedComponents({
    bg: '#ffffff',
    border: '#e2e8f0',
    primary: '#2563eb',
    primaryBgHover: 'rgba(37, 99, 235, 0.04)',
    shadowAlpha: 0.1,
    gradientStart: '#2563eb',
    gradientEnd: '#3b82f6',
  }),
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#3b82f6', light: '#60a5fa', dark: '#1e40af', contrastText: '#ffffff' },
    secondary: { main: '#10b981', light: '#34d399', dark: '#059669', contrastText: '#ffffff' },
    success: { main: '#10b981' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    info: { main: '#60a5fa' },
    background: { default: '#0f172a', paper: '#1e293b' },
    text: { primary: '#f1f5f9', secondary: '#cbd5e1' },
    divider: '#334155',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: createSharedComponents({
    bg: '#0f172a',
    border: '#334155',
    primary: '#3b82f6',
    primaryBgHover: 'rgba(59, 130, 246, 0.08)',
    shadowAlpha: 0.3,
    gradientStart: '#3b82f6',
    gradientEnd: '#60a5fa',
  }),
});
