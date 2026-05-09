import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

interface FakeMQ {
  matches: boolean;
  listeners: Array<(e: { matches: boolean }) => void>;
  addEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, fn: (e: { matches: boolean }) => void) => void;
  fire: (matches: boolean) => void;
}

let fakeMQ: FakeMQ;

beforeEach(() => {
  fakeMQ = {
    matches: false,
    listeners: [],
    addEventListener(_t, fn) { this.listeners.push(fn); },
    removeEventListener(_t, fn) { this.listeners = this.listeners.filter((l) => l !== fn); },
    fire(matches) { this.matches = matches; this.listeners.forEach((l) => l({ matches })); },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => fakeMQ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('returns initial match value', () => {
    fakeMQ.matches = true;
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    fakeMQ.matches = false;
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
    act(() => fakeMQ.fire(true));
    expect(result.current).toBe(true);
  });
});
