export type SplitDirection = 'row' | 'column';
export type SplitPlacement = 'before' | 'after';

export interface PanelLeafNode {
  kind: 'leaf';
  id: string;
  sessionId: string | null;
}

export interface PanelSplitNode {
  kind: 'split';
  id: string;
  direction: SplitDirection;
  sizes: number[];
  children: PanelNode[];
}

export type PanelNode = PanelLeafNode | PanelSplitNode;

let panelIdCounter = 0;

export function nextPanelId(prefix: string = 'p'): string {
  panelIdCounter += 1;
  return `${prefix}-${panelIdCounter}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function __resetPanelIdForTests(): void {
  panelIdCounter = 0;
}

export function createLeaf(sessionId: string | null = null, id?: string): PanelLeafNode {
  return { kind: 'leaf', id: id ?? nextPanelId('leaf'), sessionId };
}

export function createSplit(
  direction: SplitDirection,
  children: PanelNode[],
  sizes?: number[],
  id?: string,
): PanelSplitNode {
  const finalSizes = sizes ?? children.map(() => 100 / Math.max(1, children.length));
  return {
    kind: 'split',
    id: id ?? nextPanelId('split'),
    direction,
    children,
    sizes: finalSizes,
  };
}

export function findLeafById(root: PanelNode, leafId: string): PanelLeafNode | null {
  if (root.kind === 'leaf') return root.id === leafId ? root : null;
  for (const c of root.children) {
    const found = findLeafById(c, leafId);
    if (found) return found;
  }
  return null;
}

export function findLeafBySessionId(root: PanelNode, sessionId: string): PanelLeafNode | null {
  if (root.kind === 'leaf') return root.sessionId === sessionId ? root : null;
  for (const c of root.children) {
    const found = findLeafBySessionId(c, sessionId);
    if (found) return found;
  }
  return null;
}

export function listLeaves(root: PanelNode): PanelLeafNode[] {
  if (root.kind === 'leaf') return [root];
  return root.children.flatMap(listLeaves);
}

export function listVisibleSessionIds(root: PanelNode): string[] {
  return listLeaves(root)
    .map((l) => l.sessionId)
    .filter((id): id is string => id !== null);
}

export function firstLeaf(root: PanelNode): PanelLeafNode {
  if (root.kind === 'leaf') return root;
  return firstLeaf(root.children[0]);
}

function mapTree(root: PanelNode, fn: (n: PanelNode) => PanelNode): PanelNode {
  if (root.kind === 'leaf') return fn(root);
  const mappedChildren = root.children.map((c) => mapTree(c, fn));
  const same = mappedChildren.every((c, i) => c === root.children[i]);
  const next: PanelNode = same ? root : { ...root, children: mappedChildren };
  return fn(next);
}

export function setLeafSession(
  root: PanelNode,
  leafId: string,
  sessionId: string | null,
): PanelNode {
  return mapTree(root, (n) => {
    if (n.kind === 'leaf' && n.id === leafId) {
      if (n.sessionId === sessionId) return n;
      return { ...n, sessionId };
    }
    return n;
  });
}

export function detachSession(root: PanelNode, sessionId: string): PanelNode {
  return mapTree(root, (n) => {
    if (n.kind === 'leaf' && n.sessionId === sessionId) {
      return { ...n, sessionId: null };
    }
    return n;
  });
}

export function setSplitSizes(root: PanelNode, splitId: string, sizes: number[]): PanelNode {
  return mapTree(root, (n) => {
    if (n.kind === 'split' && n.id === splitId) {
      if (n.sizes.length !== sizes.length) return n;
      const unchanged = n.sizes.every((s, i) => s === sizes[i]);
      if (unchanged) return n;
      return { ...n, sizes: sizes.slice() };
    }
    return n;
  });
}

export function pruneSessionIds(root: PanelNode, validSessionIds: Set<string>): PanelNode {
  return mapTree(root, (n) => {
    if (n.kind === 'leaf' && n.sessionId && !validSessionIds.has(n.sessionId)) {
      return { ...n, sessionId: null };
    }
    return n;
  });
}

function replaceNode(
  root: PanelNode,
  targetId: string,
  replacement: PanelNode,
): PanelNode | null {
  if (root.id === targetId) return replacement;
  if (root.kind === 'leaf') return null;
  let changed = false;
  const children = root.children.map((c) => {
    const replaced = replaceNode(c, targetId, replacement);
    if (replaced) {
      changed = true;
      return replaced;
    }
    return c;
  });
  if (!changed) return null;
  return { ...root, children };
}

export function splitLeaf(
  root: PanelNode,
  leafId: string,
  direction: SplitDirection,
  placement: SplitPlacement,
  newLeafId?: string,
): { root: PanelNode; newLeafId: string } | null {
  const target = findLeafById(root, leafId);
  if (!target) return null;
  const newLeaf = createLeaf(null, newLeafId);
  const children = placement === 'before' ? [newLeaf, target] : [target, newLeaf];
  const replacement = createSplit(direction, children);
  const next = replaceNode(root, leafId, replacement);
  if (!next) return null;
  return { root: next, newLeafId: newLeaf.id };
}

// Removes the leaf. After removal, single-child splits are collapsed
// (the surviving child replaces the split node). Returns null if the
// whole tree dissolves.
export function removeLeaf(root: PanelNode, leafId: string): PanelNode | null {
  if (root.kind === 'leaf') {
    return root.id === leafId ? null : root;
  }
  const survivors: { child: PanelNode; oldSize: number }[] = [];
  for (let i = 0; i < root.children.length; i++) {
    const reduced = removeLeaf(root.children[i], leafId);
    if (reduced !== null) {
      survivors.push({ child: reduced, oldSize: root.sizes[i] ?? 0 });
    }
  }
  if (survivors.length === 0) return null;
  if (survivors.length === 1) return survivors[0].child;
  const totalOld = survivors.reduce((a, p) => a + p.oldSize, 0);
  const sizes =
    totalOld > 0
      ? survivors.map((p) => (p.oldSize / totalOld) * 100)
      : survivors.map(() => 100 / survivors.length);
  return { ...root, children: survivors.map((p) => p.child), sizes };
}

export function isValidPanelNode(value: unknown): value is PanelNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as { kind?: unknown };
  if (node.kind === 'leaf') {
    const leaf = value as Partial<PanelLeafNode>;
    return (
      typeof leaf.id === 'string' &&
      (leaf.sessionId === null || typeof leaf.sessionId === 'string')
    );
  }
  if (node.kind === 'split') {
    const split = value as Partial<PanelSplitNode>;
    return (
      typeof split.id === 'string' &&
      (split.direction === 'row' || split.direction === 'column') &&
      Array.isArray(split.children) &&
      split.children.length >= 2 &&
      split.children.every(isValidPanelNode) &&
      Array.isArray(split.sizes) &&
      split.sizes.length === split.children.length &&
      split.sizes.every((s) => typeof s === 'number' && Number.isFinite(s))
    );
  }
  return false;
}
