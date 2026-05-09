import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';
import {
  uiFor,
  terminalThemeFor,
  nextThemeMode,
  type EffectiveTheme,
  type ThemeMode,
  type UIColors,
} from '../lib/theme';
import type { ITheme } from '@xterm/xterm';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

function readSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

export interface EffectiveThemeResult {
  mode: ThemeMode;
  effective: EffectiveTheme;
  ui: UIColors;
  terminalTheme: ITheme;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
}

export function useEffectiveTheme(): EffectiveThemeResult {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(readSystemTheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(LIGHT_QUERY);
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effective: EffectiveTheme = mode === 'system' ? systemTheme : mode;
  const ui = uiFor(effective);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = effective;
    document.documentElement.dataset.theme = effective;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = ui.metaThemeColor;
  }, [effective, ui.metaThemeColor]);

  return {
    mode,
    effective,
    ui,
    terminalTheme: terminalThemeFor(effective),
    setMode,
    cycleMode: () => setMode(nextThemeMode(mode)),
  };
}
