import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffectiveTheme } from './useEffectiveTheme';
import { useThemeStore } from '../stores/themeStore';

interface FakeMQ {
  matches: boolean;
  listeners: Array<(e: { matches: boolean }) => void>;
  addEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void;
  fire: (matches: boolean) => void;
}

let fakeMQ: FakeMQ;

beforeEach(() => {
  useThemeStore.setState({ mode: 'system' });
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
  fakeMQ = {
    matches: false,
    listeners: [],
    addEventListener(_type, fn) { this.listeners.push(fn); },
    removeEventListener(_type, fn) {
      this.listeners = this.listeners.filter((l) => l !== fn);
    },
    fire(matches) {
      this.matches = matches;
      this.listeners.forEach((l) => l({ matches }));
    },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => fakeMQ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEffectiveTheme', () => {
  it('defaults to system mode and resolves to dark when prefers-color-scheme is dark', () => {
    fakeMQ.matches = false;
    const { result } = renderHook(() => useEffectiveTheme());
    expect(result.current.mode).toBe('system');
    expect(result.current.effective).toBe('dark');
  });

  it('resolves to light when system prefers light', () => {
    fakeMQ.matches = true;
    const { result } = renderHook(() => useEffectiveTheme());
    expect(result.current.effective).toBe('light');
  });

  it('reacts to system theme change events', () => {
    fakeMQ.matches = false;
    const { result } = renderHook(() => useEffectiveTheme());
    expect(result.current.effective).toBe('dark');

    act(() => fakeMQ.fire(true));
    expect(result.current.effective).toBe('light');
  });

  it('user-selected light overrides system dark preference', () => {
    fakeMQ.matches = false;
    const { result } = renderHook(() => useEffectiveTheme());
    act(() => result.current.setMode('light'));
    expect(result.current.effective).toBe('light');
  });

  it('cycleMode goes system → light → dark → system', () => {
    const { result } = renderHook(() => useEffectiveTheme());
    expect(result.current.mode).toBe('system');
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('light');
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('dark');
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('system');
  });

  it('updates document.documentElement color-scheme + theme-color meta', () => {
    fakeMQ.matches = false;
    renderHook(() => useEffectiveTheme());
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    expect(meta).not.toBeNull();
    expect(meta.content).toBeTruthy();
  });
});
