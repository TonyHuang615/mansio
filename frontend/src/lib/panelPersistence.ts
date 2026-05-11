import {
  type PanelNode,
  findLeafById,
  firstLeaf,
  isValidPanelNode,
  pruneSessionIds,
} from './panelLayout';

const STORAGE_KEY = 'lociterm.panelLayout.v1';

export interface PersistedWorkspaceLayout {
  layout: PanelNode;
  focusedPanelId: string;
}

export type PersistedLayouts = Record<string, PersistedWorkspaceLayout>;

interface PersistedFile {
  version: 1;
  workspaces: PersistedLayouts;
}

export function loadLayouts(): PersistedLayouts {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedFile>;
    if (!parsed || parsed.version !== 1 || !parsed.workspaces) return {};
    const out: PersistedLayouts = {};
    for (const [wid, entry] of Object.entries(parsed.workspaces)) {
      if (
        entry &&
        typeof entry === 'object' &&
        isValidPanelNode((entry as PersistedWorkspaceLayout).layout) &&
        typeof (entry as PersistedWorkspaceLayout).focusedPanelId === 'string'
      ) {
        out[wid] = entry as PersistedWorkspaceLayout;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLayouts(layouts: PersistedLayouts): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const file: PersistedFile = { version: 1, workspaces: layouts };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    // localStorage may be full or blocked; the next mutation retries.
  }
}

export function clearStoredLayouts(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Validates a restored layout against a workspace's live session set.
// Returns the pruned layout + a focusedPanelId that is guaranteed to
// reference an existing leaf in the returned tree.
export function reconcileLayout(
  saved: PersistedWorkspaceLayout,
  validSessionIds: Set<string>,
): PersistedWorkspaceLayout {
  const layout = pruneSessionIds(saved.layout, validSessionIds);
  const focusedExists = findLeafById(layout, saved.focusedPanelId) !== null;
  const focusedPanelId = focusedExists ? saved.focusedPanelId : firstLeaf(layout).id;
  return { layout, focusedPanelId };
}
