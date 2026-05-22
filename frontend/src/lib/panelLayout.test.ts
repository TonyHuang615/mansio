import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLeaf,
  createSplit,
  splitLeaf,
  removeLeaf,
  setLeafSession,
  detachSession,
  setSplitSizes,
  pruneSessionIds,
  findLeafById,
  findLeafBySessionId,
  listLeaves,
  listVisibleSessionIds,
  firstLeaf,
  isValidPanelNode,
  __resetPanelIdForTests,
} from './panelLayout';

describe('panelLayout', () => {
  beforeEach(() => {
    __resetPanelIdForTests();
  });

  describe('createLeaf / createSplit', () => {
    it('creates a leaf with given sessionId', () => {
      const leaf = createLeaf('s1', 'leaf-A');
      expect(leaf).toEqual({ kind: 'leaf', id: 'leaf-A', sessionId: 's1' });
    });

    it('creates a split with even sizes by default', () => {
      const a = createLeaf(null, 'a');
      const b = createLeaf(null, 'b');
      const s = createSplit('row', [a, b], undefined, 'split-1');
      expect(s.sizes).toEqual([50, 50]);
      expect(s.children).toHaveLength(2);
    });
  });

  describe('splitLeaf', () => {
    it('wraps target leaf in a split with new sibling AFTER (placement=after)', () => {
      const root = createLeaf('s1', 'A');
      const result = splitLeaf(root, 'A', 'row', 'after', 'B');
      expect(result).not.toBeNull();
      const split = result!.root;
      expect(split.kind).toBe('split');
      if (split.kind !== 'split') throw new Error('unreachable');
      expect(split.direction).toBe('row');
      expect(split.children[0]).toMatchObject({ id: 'A', sessionId: 's1' });
      expect(split.children[1]).toMatchObject({ id: 'B', sessionId: null });
      expect(result!.newLeafId).toBe('B');
    });

    it('places new sibling BEFORE on placement=before', () => {
      const root = createLeaf('s1', 'A');
      const result = splitLeaf(root, 'A', 'column', 'before', 'B');
      expect(result).not.toBeNull();
      const split = result!.root;
      if (split.kind !== 'split') throw new Error('unreachable');
      expect(split.children[0]).toMatchObject({ id: 'B' });
      expect(split.children[1]).toMatchObject({ id: 'A' });
    });

    it('returns null for a non-existent leafId', () => {
      const root = createLeaf('s1', 'A');
      expect(splitLeaf(root, 'missing', 'row', 'after')).toBeNull();
    });

    it('splits a nested leaf within a deeper tree', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const split = createSplit('row', [a, b], [50, 50], 'split-1');
      const result = splitLeaf(split, 'B', 'column', 'after', 'C');
      expect(result).not.toBeNull();
      const root = result!.root;
      if (root.kind !== 'split') throw new Error('unreachable');
      expect(root.id).toBe('split-1');
      const right = root.children[1];
      if (right.kind !== 'split') throw new Error('right must now be a split');
      expect(right.direction).toBe('column');
      expect(right.children[0]).toMatchObject({ id: 'B' });
      expect(right.children[1]).toMatchObject({ id: 'C' });
    });
  });

  describe('removeLeaf', () => {
    it('returns null when removing the only leaf', () => {
      const root = createLeaf('s1', 'A');
      expect(removeLeaf(root, 'A')).toBeNull();
    });

    it('collapses single-child split after removing a sibling', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const split = createSplit('row', [a, b], [50, 50], 'split-1');
      const reduced = removeLeaf(split, 'B');
      expect(reduced).not.toBeNull();
      expect(reduced!.kind).toBe('leaf');
      expect(reduced).toMatchObject({ id: 'A', sessionId: 's1' });
    });

    it('preserves split with 2+ surviving children and renormalises sizes', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const c = createLeaf('s3', 'C');
      const split = createSplit('row', [a, b, c], [20, 60, 20], 'split-1');
      const reduced = removeLeaf(split, 'B');
      expect(reduced).not.toBeNull();
      if (reduced!.kind !== 'split') throw new Error('expected split');
      expect(reduced!.children).toHaveLength(2);
      // 20:20 -> 50:50
      expect(reduced!.sizes).toEqual([50, 50]);
    });

    it('flattens nested split when grandparent is collapsed', () => {
      // outer = row [ A , inner=column [B, C] ]
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const c = createLeaf('s3', 'C');
      const inner = createSplit('column', [b, c], [50, 50], 'inner');
      const outer = createSplit('row', [a, inner], [50, 50], 'outer');
      // remove B → inner collapses to just C → outer becomes row [A, C]
      const reduced = removeLeaf(outer, 'B');
      if (reduced!.kind !== 'split') throw new Error('expected split');
      expect(reduced!.id).toBe('outer');
      expect(reduced!.children[0]).toMatchObject({ id: 'A' });
      expect(reduced!.children[1]).toMatchObject({ id: 'C' });
    });
  });

  describe('setLeafSession / detachSession', () => {
    it('sets sessionId on the target leaf only', () => {
      const a = createLeaf(null, 'A');
      const b = createLeaf('s2', 'B');
      const split = createSplit('row', [a, b]);
      const updated = setLeafSession(split, 'A', 's1');
      const leafA = findLeafById(updated, 'A');
      const leafB = findLeafById(updated, 'B');
      expect(leafA?.sessionId).toBe('s1');
      expect(leafB?.sessionId).toBe('s2');
    });

    it('detachSession clears the sessionId from every leaf holding it', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s1', 'B'); // defensive: same session somehow
      const split = createSplit('row', [a, b]);
      const detached = detachSession(split, 's1');
      expect(findLeafById(detached, 'A')?.sessionId).toBeNull();
      expect(findLeafById(detached, 'B')?.sessionId).toBeNull();
    });
  });

  describe('setSplitSizes', () => {
    it('updates sizes on a matching split', () => {
      const a = createLeaf(null, 'A');
      const b = createLeaf(null, 'B');
      const split = createSplit('row', [a, b], [50, 50], 'split-1');
      const updated = setSplitSizes(split, 'split-1', [30, 70]);
      if (updated.kind !== 'split') throw new Error('expected split');
      expect(updated.sizes).toEqual([30, 70]);
    });

    it('ignores size array of the wrong length', () => {
      const a = createLeaf(null, 'A');
      const b = createLeaf(null, 'B');
      const split = createSplit('row', [a, b], [50, 50], 'split-1');
      const updated = setSplitSizes(split, 'split-1', [33, 33, 34]);
      if (updated.kind !== 'split') throw new Error('expected split');
      expect(updated.sizes).toEqual([50, 50]);
    });
  });

  describe('pruneSessionIds', () => {
    it('clears sessionIds not in the valid set', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const split = createSplit('row', [a, b]);
      const pruned = pruneSessionIds(split, new Set(['s1']));
      expect(findLeafById(pruned, 'A')?.sessionId).toBe('s1');
      expect(findLeafById(pruned, 'B')?.sessionId).toBeNull();
    });
  });

  describe('listLeaves / listVisibleSessionIds / firstLeaf', () => {
    it('listLeaves returns leaves in document order', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf(null, 'B');
      const c = createLeaf('s3', 'C');
      const inner = createSplit('column', [b, c]);
      const outer = createSplit('row', [a, inner]);
      const ids = listLeaves(outer).map((l) => l.id);
      expect(ids).toEqual(['A', 'B', 'C']);
    });

    it('listVisibleSessionIds returns only non-null sessionIds', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf(null, 'B');
      const c = createLeaf('s3', 'C');
      const inner = createSplit('column', [b, c]);
      const outer = createSplit('row', [a, inner]);
      expect(listVisibleSessionIds(outer)).toEqual(['s1', 's3']);
    });

    it('firstLeaf descends into nested splits', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const inner = createSplit('column', [a, b]);
      const outer = createSplit('row', [inner, createLeaf(null, 'C')]);
      expect(firstLeaf(outer).id).toBe('A');
    });
  });

  describe('findLeafBySessionId', () => {
    it('finds the leaf carrying the given sessionId', () => {
      const a = createLeaf('s1', 'A');
      const b = createLeaf('s2', 'B');
      const split = createSplit('row', [a, b]);
      expect(findLeafBySessionId(split, 's2')?.id).toBe('B');
      expect(findLeafBySessionId(split, 'missing')).toBeNull();
    });
  });

  describe('isValidPanelNode', () => {
    it('accepts a valid leaf', () => {
      expect(isValidPanelNode({ kind: 'leaf', id: 'A', sessionId: 's1' })).toBe(true);
      expect(isValidPanelNode({ kind: 'leaf', id: 'A', sessionId: null })).toBe(true);
    });

    it('rejects malformed inputs', () => {
      expect(isValidPanelNode(null)).toBe(false);
      expect(isValidPanelNode({})).toBe(false);
      expect(isValidPanelNode({ kind: 'leaf' })).toBe(false);
      expect(isValidPanelNode({ kind: 'leaf', id: 'A', sessionId: 42 })).toBe(false);
      expect(
        isValidPanelNode({
          kind: 'split',
          id: 's',
          direction: 'diagonal',
          children: [],
          sizes: [],
        }),
      ).toBe(false);
    });

    it('accepts a valid split', () => {
      const node = {
        kind: 'split',
        id: 's',
        direction: 'row',
        sizes: [50, 50],
        children: [
          { kind: 'leaf', id: 'A', sessionId: null },
          { kind: 'leaf', id: 'B', sessionId: 's2' },
        ],
      };
      expect(isValidPanelNode(node)).toBe(true);
    });
  });
});
