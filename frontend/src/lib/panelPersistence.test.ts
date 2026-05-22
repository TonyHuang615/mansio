import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLayouts,
  saveLayouts,
  clearStoredLayouts,
  reconcileLayout,
} from './panelPersistence';
import { createLeaf, createSplit, __resetPanelIdForTests } from './panelLayout';

describe('panelPersistence', () => {
  beforeEach(() => {
    __resetPanelIdForTests();
    clearStoredLayouts();
  });

  it('round-trips an empty store as {}', () => {
    expect(loadLayouts()).toEqual({});
  });

  it('round-trips a persisted layout', () => {
    const a = createLeaf('s1', 'A');
    const b = createLeaf('s2', 'B');
    const split = createSplit('row', [a, b], [40, 60], 'split-1');
    saveLayouts({
      'ws-1': { layout: split, focusedPanelId: 'A' },
    });
    const loaded = loadLayouts();
    expect(loaded['ws-1']).toBeDefined();
    expect(loaded['ws-1'].focusedPanelId).toBe('A');
    expect(loaded['ws-1'].layout).toEqual(split);
  });

  it('discards malformed entries on load', () => {
    localStorage.setItem(
      'mansio.panelLayout.v1',
      JSON.stringify({
        version: 1,
        workspaces: {
          'ws-1': { layout: 'not-a-node', focusedPanelId: 'X' },
          'ws-2': {
            layout: { kind: 'leaf', id: 'A', sessionId: null },
            focusedPanelId: 'A',
          },
        },
      }),
    );
    const loaded = loadLayouts();
    expect(loaded['ws-1']).toBeUndefined();
    expect(loaded['ws-2']).toBeDefined();
  });

  it('returns {} when version mismatches', () => {
    localStorage.setItem(
      'mansio.panelLayout.v1',
      JSON.stringify({ version: 99, workspaces: {} }),
    );
    expect(loadLayouts()).toEqual({});
  });

  it('reconcileLayout prunes sessionIds not in validSet and fixes focus', () => {
    const a = createLeaf('s1', 'A');
    const b = createLeaf('s2', 'B');
    const split = createSplit('row', [a, b], [50, 50], 'split-1');
    const reconciled = reconcileLayout(
      { layout: split, focusedPanelId: 'A' },
      new Set(['s1']),
    );
    expect(reconciled.focusedPanelId).toBe('A');
    if (reconciled.layout.kind !== 'split') throw new Error('expected split');
    expect(reconciled.layout.children[0]).toMatchObject({ id: 'A', sessionId: 's1' });
    expect(reconciled.layout.children[1]).toMatchObject({ id: 'B', sessionId: null });
  });

  it('reconcileLayout falls back to firstLeaf when stored focus is gone', () => {
    const a = createLeaf('s1', 'A');
    const reconciled = reconcileLayout(
      { layout: a, focusedPanelId: 'missing' },
      new Set(['s1']),
    );
    expect(reconciled.focusedPanelId).toBe('A');
  });
});
