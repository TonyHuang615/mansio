import type { ITheme } from '@xterm/xterm';

export type ThemeMode = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export interface UIColors {
  appBg: string;
  sidebarBg: string;
  sidebarBorder: string;
  tabBarBg: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  tabBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  danger: string;
  warning: string;
  terminalBg: string;
  overlayBg: string;
  hoverBg: string;
  dropOverlayBg: string;
  dropOverlayBorder: string;
  dropOverlayText: string;
  metaThemeColor: string;
}

export const darkUI: UIColors = {
  appBg: '#0d1117',
  sidebarBg: '#010409',
  sidebarBorder: '#21262d',
  tabBarBg: '#0d1117',
  tabActiveBg: '#161b22',
  tabInactiveBg: '#0d1117',
  tabBorder: '#21262d',
  textPrimary: '#c9d1d9',
  textSecondary: '#8b949e',
  textMuted: '#484f58',
  accent: '#58a6ff',
  danger: '#ff7b72',
  warning: '#e3b341',
  terminalBg: '#0d1117',
  overlayBg: 'rgba(0, 0, 0, 0.65)',
  hoverBg: 'rgba(255, 255, 255, 0.06)',
  dropOverlayBg: 'rgba(126, 20, 255, 0.22)',
  dropOverlayBorder: '#a274ff',
  dropOverlayText: '#f0e9ff',
  metaThemeColor: '#0d1117',
};

export const lightUI: UIColors = {
  appBg: '#ffffff',
  sidebarBg: '#f6f8fa',
  sidebarBorder: '#d0d7de',
  tabBarBg: '#ffffff',
  tabActiveBg: '#ffffff',
  tabInactiveBg: '#f6f8fa',
  tabBorder: '#d0d7de',
  textPrimary: '#1f2328',
  textSecondary: '#59636e',
  textMuted: '#818b98',
  accent: '#0969da',
  danger: '#cf222e',
  warning: '#7d4e00',
  terminalBg: '#ffffff',
  overlayBg: 'rgba(0, 0, 0, 0.45)',
  hoverBg: 'rgba(0, 0, 0, 0.06)',
  dropOverlayBg: 'rgba(105, 33, 255, 0.10)',
  dropOverlayBorder: '#6639ba',
  dropOverlayText: '#3a1a78',
  metaThemeColor: '#f6f8fa',
};

// Dark terminal theme — bright on dark, designed for ≥4.5:1 contrast vs #0d1117 bg.
export const darkTerminalTheme: ITheme = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#7d8590',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39d2c0',
  white: '#c9d1d9',
  brightBlack: '#9da7b3',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

// Light terminal theme — every ANSI color must hit ≥4.5:1 contrast vs #ffffff
// to stay readable. "bright*" variants are darkened on purpose since literally
// brighter colors disappear on a white background. Verified by theme.test.ts.
export const lightTerminalTheme: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0969da',
  cursorAccent: '#ffffff',
  selectionBackground: '#b6e3ff',
  selectionForeground: '#0a3069',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0550ae',
  magenta: '#6639ba',
  cyan: '#0e6772',
  white: '#57606a',
  brightBlack: '#3d444d',
  brightRed: '#a40e26',
  brightGreen: '#055d20',
  brightYellow: '#633c01',
  brightBlue: '#0a3069',
  brightMagenta: '#512a91',
  brightCyan: '#0a4f57',
  brightWhite: '#1f2328',
};

export function uiFor(theme: EffectiveTheme): UIColors {
  return theme === 'light' ? lightUI : darkUI;
}

export function terminalThemeFor(theme: EffectiveTheme): ITheme {
  return theme === 'light' ? lightTerminalTheme : darkTerminalTheme;
}

export function nextThemeMode(current: ThemeMode): ThemeMode {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

// Backward-compat exports — prefer useEffectiveTheme().
export const terminalTheme = darkTerminalTheme;
export const ui = darkUI;
