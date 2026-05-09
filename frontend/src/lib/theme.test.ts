import { describe, it, expect } from 'vitest';
import {
  uiFor,
  terminalThemeFor,
  nextThemeMode,
  darkUI,
  lightUI,
  darkTerminalTheme,
  lightTerminalTheme,
} from './theme';
import { contrastRatio } from './contrast';
import type { ITheme } from '@xterm/xterm';

describe('theme helpers', () => {
  it('uiFor returns the matching palette', () => {
    expect(uiFor('dark')).toBe(darkUI);
    expect(uiFor('light')).toBe(lightUI);
  });

  it('terminalThemeFor returns the matching xterm theme', () => {
    expect(terminalThemeFor('dark')).toBe(darkTerminalTheme);
    expect(terminalThemeFor('light')).toBe(lightTerminalTheme);
  });

  it('nextThemeMode cycles system → light → dark → system', () => {
    expect(nextThemeMode('system')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
  });

  it('palettes use distinct backgrounds so themes are visually different', () => {
    expect(darkUI.appBg).not.toBe(lightUI.appBg);
    expect(darkUI.textPrimary).not.toBe(lightUI.textPrimary);
    expect(darkTerminalTheme.background).not.toBe(lightTerminalTheme.background);
  });
});

const ANSI_KEYS: Array<keyof ITheme> = [
  'foreground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

const WCAG_AA_NORMAL = 4.5;

describe('terminal palette readability (WCAG AA, ≥4.5:1 vs background)', () => {
  it.each(ANSI_KEYS)('dark theme: %s contrasts ≥4.5:1 with background', (key) => {
    const fg = darkTerminalTheme[key] as string;
    const bg = darkTerminalTheme.background as string;
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${key}=${fg} on ${bg} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });

  it.each(ANSI_KEYS)('light theme: %s contrasts ≥4.5:1 with background', (key) => {
    const fg = lightTerminalTheme[key] as string;
    const bg = lightTerminalTheme.background as string;
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${key}=${fg} on ${bg} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });
});

describe('UI palette readability', () => {
  it.each([
    ['dark textPrimary on appBg', darkUI.textPrimary, darkUI.appBg, 4.5],
    ['dark textSecondary on appBg', darkUI.textSecondary, darkUI.appBg, 4.5],
    ['dark textPrimary on sidebarBg', darkUI.textPrimary, darkUI.sidebarBg, 4.5],
    ['dark textPrimary on tabActiveBg', darkUI.textPrimary, darkUI.tabActiveBg, 4.5],
    ['dark warning on tabActiveBg', darkUI.warning, darkUI.tabActiveBg, 4.5],
    ['dark danger on tabActiveBg', darkUI.danger, darkUI.tabActiveBg, 4.5],
    ['dark accent on tabActiveBg', darkUI.accent, darkUI.tabActiveBg, 3.0],

    ['light textPrimary on appBg', lightUI.textPrimary, lightUI.appBg, 4.5],
    ['light textSecondary on appBg', lightUI.textSecondary, lightUI.appBg, 4.5],
    ['light textPrimary on sidebarBg', lightUI.textPrimary, lightUI.sidebarBg, 4.5],
    ['light textPrimary on tabActiveBg', lightUI.textPrimary, lightUI.tabActiveBg, 4.5],
    ['light warning on tabActiveBg', lightUI.warning, lightUI.tabActiveBg, 4.5],
    ['light danger on tabActiveBg', lightUI.danger, lightUI.tabActiveBg, 4.5],
    ['light accent on tabActiveBg', lightUI.accent, lightUI.tabActiveBg, 4.5],
  ])('%s', (label, fg, bg, min) => {
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${label}: ${fg}/${bg} ratio=${ratio.toFixed(2)} (min ${min})`).toBeGreaterThanOrEqual(min);
  });
});
