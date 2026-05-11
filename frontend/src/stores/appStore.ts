import { create } from 'zustand';
import type { Workspace, Session } from '../types';
import { api } from '../api/client';
import {
  type PanelNode,
  type SplitDirection,
  type SplitPlacement,
  createLeaf,
  detachSession,
  findLeafById,
  findLeafBySessionId,
  firstLeaf,
  listVisibleSessionIds,
  removeLeaf,
  setLeafSession,
  setSplitSizes,
  splitLeaf,
} from '../lib/panelLayout';
import {
  loadLayouts,
  saveLayouts,
  reconcileLayout,
  type PersistedLayouts,
} from '../lib/panelPersistence';

export interface SessionActivity {
  unread: boolean;
  lastOutputAt: number;
  notifiedAt: number;
}

export interface Toast {
  id: string;
  sessionId: string;
  workspaceId: string;
  sessionTitle: string;
  createdAt: number;
}

const MAX_TOASTS = 5;

// "Idle-after-busy" heuristic: an output burst marks unread only after
// IDLE_MS of silence and only if the burst was longer than MIN_BUSY_MS.
// This filters spinner/cursor noise (which never goes idle and is too
// brief individually) while still catching real task completion — the
// moment a Claude/Codex/build-process stops producing output.
const IDLE_MS = 1500;
const MIN_BUSY_MS = 500;

interface BusyTrack {
  startedAt: number;
  lastByteAt: number;
}

const busyTrack = new Map<string, BusyTrack>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelIdleTracking(sessionId: string): void {
  const t = idleTimers.get(sessionId);
  if (t !== undefined) {
    clearTimeout(t);
    idleTimers.delete(sessionId);
  }
  busyTrack.delete(sessionId);
}

export function __resetActivityTrackingForTests(): void {
  for (const t of idleTimers.values()) clearTimeout(t);
  idleTimers.clear();
  busyTrack.clear();
}

interface AppState {
  workspaces: Workspace[];
  sessions: Record<string, Session[]>;
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  // Last active session per workspace. Used to restore the right session
  // when switching workspaces and to pick which session's CWD the sidebar
  // shows.
  activeSessionByWorkspace: Record<string, string>;
  sessionActivity: Record<string, SessionActivity>;
  toasts: Toast[];
  initialized: boolean;

  // Multi-panel layout state.
  layoutByWorkspace: Record<string, PanelNode>;
  focusedPanelByWorkspace: Record<string, string>;

  init: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  setActiveWorkspace: (id: string) => Promise<void>;

  fetchSessions: (workspaceId: string) => Promise<void>;
  pollActive: () => Promise<void>;
  createSession: (workspaceId: string, title?: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  setActiveSession: (id: string) => void;

  markSessionOutput: (sessionId: string) => void;
  clearSessionUnread: (sessionId: string) => void;
  clearWorkspaceVisibleUnread: () => void;
  dismissToast: (id: string) => void;

  // Layout actions.
  splitPanel: (
    panelId: string,
    direction: SplitDirection,
    placement?: SplitPlacement,
  ) => string | null;
  closePanel: (panelId: string) => Promise<void>;
  focusPanel: (panelId: string) => void;
  assignSession: (panelId: string, sessionId: string) => void;
  resizeSplit: (splitId: string, sizes: number[]) => void;
}

function deriveActiveSession(
  layout: PanelNode | undefined,
  focusedId: string | undefined,
): string | null {
  if (!layout || !focusedId) return null;
  const leaf = findLeafById(layout, focusedId);
  return leaf?.kind === 'leaf' ? leaf.sessionId : null;
}

// Returns true if the session is currently rendered in any leaf of the
// active workspace's layout. Falls back to the legacy "is the active
// session" check when no layout has been seeded yet (e.g. in tests that
// bypass init()).
function isSessionVisibleInActiveWorkspace(s: AppState, sessionId: string): boolean {
  const wid = s.activeWorkspaceId;
  if (!wid) return false;
  const layout = s.layoutByWorkspace[wid];
  if (!layout) return s.activeSessionId === sessionId;
  return findLeafBySessionId(layout, sessionId) !== null;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  sessions: {},
  activeWorkspaceId: null,
  activeSessionId: null,
  activeSessionByWorkspace: {},
  sessionActivity: {},
  toasts: [],
  initialized: false,
  layoutByWorkspace: {},
  focusedPanelByWorkspace: {},

  init: async () => {
    let workspaces = await api.listWorkspaces();

    if (workspaces.length === 0) {
      const ws = await api.createWorkspace('Default');
      workspaces = [ws];
    }

    const lists = await Promise.all(workspaces.map((w) => api.listSessions(w.id)));
    const sessions: Record<string, Session[]> = {};
    const activeSessionByWorkspace: Record<string, string> = {};
    workspaces.forEach((w, i) => {
      sessions[w.id] = lists[i];
      if (lists[i].length > 0) {
        activeSessionByWorkspace[w.id] = lists[i][0].id;
      }
    });

    const wid = workspaces[0].id;
    if (sessions[wid].length === 0) {
      const sess = await api.createSession(wid);
      sessions[wid] = [sess];
      activeSessionByWorkspace[wid] = sess.id;
    }

    const saved = loadLayouts();
    const layoutByWorkspace: Record<string, PanelNode> = {};
    const focusedPanelByWorkspace: Record<string, string> = {};
    for (const w of workspaces) {
      const wSessions = sessions[w.id] ?? [];
      const validIds = new Set(wSessions.map((s) => s.id));
      const persisted = saved[w.id];
      let layout: PanelNode;
      let focusedId: string;
      if (persisted) {
        const { layout: pruned, focusedPanelId } = reconcileLayout(persisted, validIds);
        layout = pruned;
        focusedId = focusedPanelId;
        // If the saved layout has no sessions left and the workspace has
        // some, seed the first session into the focused leaf so the user
        // sees something instead of an empty panel.
        const anyVisible = listVisibleSessionIds(layout).length > 0;
        if (!anyVisible && wSessions.length > 0) {
          layout = setLeafSession(layout, focusedId, wSessions[0].id);
        }
      } else {
        const firstSessionId = wSessions[0]?.id ?? null;
        layout = createLeaf(firstSessionId);
        focusedId = firstLeaf(layout).id;
      }
      layoutByWorkspace[w.id] = layout;
      focusedPanelByWorkspace[w.id] = focusedId;
    }

    set({
      workspaces,
      sessions,
      activeWorkspaceId: wid,
      activeSessionId: deriveActiveSession(layoutByWorkspace[wid], focusedPanelByWorkspace[wid]),
      activeSessionByWorkspace,
      layoutByWorkspace,
      focusedPanelByWorkspace,
      initialized: true,
    });
  },

  fetchWorkspaces: async () => {
    const workspaces = await api.listWorkspaces();
    set({ workspaces });
  },

  createWorkspace: async (name: string) => {
    const ws = await api.createWorkspace(name);
    const sess = await api.createSession(ws.id);
    const layout = createLeaf(sess.id);
    const focusedId = firstLeaf(layout).id;
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      sessions: { ...s.sessions, [ws.id]: [sess] },
      activeWorkspaceId: ws.id,
      activeSessionId: sess.id,
      activeSessionByWorkspace: { ...s.activeSessionByWorkspace, [ws.id]: sess.id },
      layoutByWorkspace: { ...s.layoutByWorkspace, [ws.id]: layout },
      focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [ws.id]: focusedId },
    }));
  },

  deleteWorkspace: async (id: string) => {
    await api.deleteWorkspace(id);
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const removedSessions = s.sessions[id] ?? [];
      const sessions = { ...s.sessions };
      delete sessions[id];
      const activeSessionByWorkspace = { ...s.activeSessionByWorkspace };
      delete activeSessionByWorkspace[id];
      const layoutByWorkspace = { ...s.layoutByWorkspace };
      delete layoutByWorkspace[id];
      const focusedPanelByWorkspace = { ...s.focusedPanelByWorkspace };
      delete focusedPanelByWorkspace[id];
      const nextWid = workspaces.length > 0 ? workspaces[0].id : null;
      const nextLayout = nextWid ? layoutByWorkspace[nextWid] : undefined;
      const nextFocus = nextWid ? focusedPanelByWorkspace[nextWid] : undefined;
      const nextActive = deriveActiveSession(nextLayout, nextFocus);
      const sessionActivity = { ...s.sessionActivity };
      const removedIds = new Set<string>();
      for (const sess of removedSessions) {
        delete sessionActivity[sess.id];
        cancelIdleTracking(sess.id);
        removedIds.add(sess.id);
      }
      const toasts = s.toasts.some((t) => removedIds.has(t.sessionId))
        ? s.toasts.filter((t) => !removedIds.has(t.sessionId))
        : s.toasts;
      return {
        workspaces,
        sessions,
        activeWorkspaceId: nextWid,
        activeSessionId: nextActive,
        activeSessionByWorkspace,
        layoutByWorkspace,
        focusedPanelByWorkspace,
        sessionActivity,
        toasts,
      };
    });
  },

  renameWorkspace: async (id: string, name: string) => {
    const updated = await api.updateWorkspace(id, name);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)),
    }));
  },

  setActiveWorkspace: async (id: string) => {
    const state = get();
    let sessions = state.sessions[id];
    if (!sessions) {
      sessions = await api.listSessions(id);
    }
    set((s) => {
      let layout = s.layoutByWorkspace[id];
      let focusedId = s.focusedPanelByWorkspace[id];
      if (!layout) {
        const firstSessionId = sessions[0]?.id ?? null;
        layout = createLeaf(firstSessionId);
        focusedId = firstLeaf(layout).id;
      }
      const activeSessionId = deriveActiveSession(layout, focusedId);
      // Switching to a workspace counts as viewing its focused session, so
      // clear unread/toasts for it the same way setActiveSession does.
      let sessionActivity = s.sessionActivity;
      let toasts = s.toasts;
      if (activeSessionId) {
        cancelIdleTracking(activeSessionId);
        const prev = s.sessionActivity[activeSessionId];
        if (prev?.unread) {
          sessionActivity = {
            ...s.sessionActivity,
            [activeSessionId]: { ...prev, unread: false },
          };
        }
        if (toasts.some((t) => t.sessionId === activeSessionId)) {
          toasts = toasts.filter((t) => t.sessionId !== activeSessionId);
        }
      }
      return {
        sessions: { ...s.sessions, [id]: sessions },
        activeWorkspaceId: id,
        activeSessionId,
        activeSessionByWorkspace: activeSessionId
          ? { ...s.activeSessionByWorkspace, [id]: activeSessionId }
          : s.activeSessionByWorkspace,
        layoutByWorkspace: { ...s.layoutByWorkspace, [id]: layout },
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [id]: focusedId },
        sessionActivity,
        toasts,
      };
    });
  },

  fetchSessions: async (workspaceId: string) => {
    const sessions = await api.listSessions(workspaceId);
    set((s) => ({
      sessions: { ...s.sessions, [workspaceId]: sessions },
    }));
  },

  pollActive: async () => {
    const wid = get().activeWorkspaceId;
    if (!wid) return;
    const sessions = await api.listSessions(wid);
    set((s) => ({
      sessions: { ...s.sessions, [wid]: sessions },
    }));
  },

  createSession: async (workspaceId: string, title?: string) => {
    const sess = await api.createSession(workspaceId, title);
    set((s) => {
      const sessions = {
        ...s.sessions,
        [workspaceId]: [...(s.sessions[workspaceId] || []), sess],
      };
      let layout = s.layoutByWorkspace[workspaceId];
      let focusedId = s.focusedPanelByWorkspace[workspaceId];
      if (!layout) {
        layout = createLeaf(sess.id);
        focusedId = firstLeaf(layout).id;
      } else {
        const target = focusedId && findLeafById(layout, focusedId);
        const targetId = target ? focusedId : firstLeaf(layout).id;
        layout = setLeafSession(detachSession(layout, sess.id), targetId, sess.id);
        focusedId = targetId;
      }
      const activeSessionId =
        workspaceId === s.activeWorkspaceId ? sess.id : s.activeSessionId;
      return {
        sessions,
        activeSessionId,
        activeSessionByWorkspace: { ...s.activeSessionByWorkspace, [workspaceId]: sess.id },
        layoutByWorkspace: { ...s.layoutByWorkspace, [workspaceId]: layout },
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [workspaceId]: focusedId },
      };
    });
  },

  deleteSession: async (id: string) => {
    await api.deleteSession(id);
    cancelIdleTracking(id);
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const remaining = (s.sessions[wid] || []).filter((sess) => sess.id !== id);

      // Detach the session from every workspace's layout.
      let layoutByWorkspace = s.layoutByWorkspace;
      for (const w of Object.keys(s.layoutByWorkspace)) {
        const before = layoutByWorkspace[w];
        const after = detachSession(before, id);
        if (after !== before) {
          layoutByWorkspace = { ...layoutByWorkspace, [w]: after };
        }
      }

      // If the focused leaf in the active workspace is now empty and
      // sessions remain, auto-assign the next available session —
      // preserves the legacy "close a tab and the next one becomes active"
      // UX so the user doesn't see a black panel after closing a tab.
      let currentLayout = layoutByWorkspace[wid];
      const focusedId = s.focusedPanelByWorkspace[wid];
      if (currentLayout) {
        const focusedLeaf = focusedId ? findLeafById(currentLayout, focusedId) : null;
        if (
          focusedLeaf &&
          focusedLeaf.kind === 'leaf' &&
          focusedLeaf.sessionId === null &&
          remaining.length > 0
        ) {
          const nextSessionId = remaining[0].id;
          currentLayout = setLeafSession(
            detachSession(currentLayout, nextSessionId),
            focusedLeaf.id,
            nextSessionId,
          );
          layoutByWorkspace = { ...layoutByWorkspace, [wid]: currentLayout };
        }
      }

      const newFocus = layoutByWorkspace[wid] ? s.focusedPanelByWorkspace[wid] : undefined;
      // Without a layout (tests bypassing init), the active session was the
      // single source of truth — fall back to picking the next remaining
      // session, matching the pre-layout behaviour.
      const layoutPresent = !!layoutByWorkspace[wid];
      const wasActive = s.activeSessionId === id;
      const activeSessionId = layoutPresent
        ? deriveActiveSession(layoutByWorkspace[wid], newFocus)
        : wasActive
          ? remaining[0]?.id ?? null
          : s.activeSessionId;

      const activeSessionByWorkspace = { ...s.activeSessionByWorkspace };
      if (activeSessionByWorkspace[wid] === id) {
        const fallback = remaining[0]?.id;
        if (fallback) activeSessionByWorkspace[wid] = fallback;
        else delete activeSessionByWorkspace[wid];
      }

      const sessionActivity = { ...s.sessionActivity };
      delete sessionActivity[id];
      const toasts = s.toasts.some((t) => t.sessionId === id)
        ? s.toasts.filter((t) => t.sessionId !== id)
        : s.toasts;

      return {
        sessions: { ...s.sessions, [wid]: remaining },
        activeSessionId,
        activeSessionByWorkspace,
        layoutByWorkspace,
        sessionActivity,
        toasts,
      };
    });
  },

  renameSession: async (id: string, title: string) => {
    const updated = await api.updateSession(id, title);
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      return {
        sessions: {
          ...s.sessions,
          [wid]: (s.sessions[wid] || []).map((sess) =>
            sess.id === id ? updated : sess,
          ),
        },
      };
    });
  },

  setActiveSession: (id: string) => {
    cancelIdleTracking(id);
    set((s) => {
      const wid = s.activeWorkspaceId;
      const prev = s.sessionActivity[id];
      const clearedActivity = prev?.unread
        ? { ...s.sessionActivity, [id]: { ...prev, unread: false } }
        : s.sessionActivity;
      const clearedToasts = s.toasts.some((t) => t.sessionId === id)
        ? s.toasts.filter((t) => t.sessionId !== id)
        : s.toasts;

      if (!wid || !s.layoutByWorkspace[wid]) {
        // No layout yet (e.g. legacy/test path) — fall back to direct field set.
        return {
          activeSessionId: id,
          activeSessionByWorkspace: wid
            ? { ...s.activeSessionByWorkspace, [wid]: id }
            : s.activeSessionByWorkspace,
          sessionActivity: clearedActivity,
          toasts: clearedToasts,
        };
      }

      let layout = s.layoutByWorkspace[wid];
      let focusedId = s.focusedPanelByWorkspace[wid];

      const existingLeaf = findLeafBySessionId(layout, id);
      if (existingLeaf) {
        // Session already visible — just focus its leaf.
        focusedId = existingLeaf.id;
      } else {
        // Session not visible — drop it into the focused leaf, replacing
        // whatever's there.
        const focusedLeaf = focusedId ? findLeafById(layout, focusedId) : null;
        const targetId = focusedLeaf ? focusedLeaf.id : firstLeaf(layout).id;
        layout = setLeafSession(detachSession(layout, id), targetId, id);
        focusedId = targetId;
      }

      const activeSessionId = deriveActiveSession(layout, focusedId);
      return {
        activeSessionId,
        activeSessionByWorkspace: { ...s.activeSessionByWorkspace, [wid]: id },
        layoutByWorkspace: { ...s.layoutByWorkspace, [wid]: layout },
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [wid]: focusedId },
        sessionActivity: clearedActivity,
        toasts: clearedToasts,
      };
    });
  },

  // Idle-after-busy: each output chunk only updates the in-memory busy
  // tracker and resets a debounce timer. The store mutates (and Sidebar /
  // TabBar re-render) only when IDLE_MS of silence follows a burst longer
  // than MIN_BUSY_MS — i.e. when an agent / build / shell command has
  // genuinely finished, not while a spinner is animating.
  markSessionOutput: (sessionId: string) => {
    const state = get();
    const isVisibleForeground =
      isSessionVisibleInActiveWorkspace(state, sessionId) &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible';
    if (isVisibleForeground) {
      cancelIdleTracking(sessionId);
      return;
    }

    const now = Date.now();
    const track = busyTrack.get(sessionId);
    if (track) {
      track.lastByteAt = now;
    } else {
      busyTrack.set(sessionId, { startedAt: now, lastByteAt: now });
    }

    const existing = idleTimers.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);

    idleTimers.set(
      sessionId,
      setTimeout(() => {
        idleTimers.delete(sessionId);
        const t = busyTrack.get(sessionId);
        busyTrack.delete(sessionId);
        if (!t) return;
        if (t.lastByteAt - t.startedAt < MIN_BUSY_MS) return;

        const fresh = get();
        const stillBackground =
          !isSessionVisibleInActiveWorkspace(fresh, sessionId) ||
          (typeof document !== 'undefined' &&
            document.visibilityState !== 'visible');
        if (!stillBackground) return;

        set((s) => {
          const prev = s.sessionActivity[sessionId];
          if (prev?.unread) return s;
          const nextActivity = {
            ...s.sessionActivity,
            [sessionId]: {
              unread: true,
              lastOutputAt: t.lastByteAt,
              notifiedAt: t.lastByteAt,
            },
          };
          let sessionTitle = '';
          let workspaceId = '';
          for (const [wid, list] of Object.entries(s.sessions)) {
            const found = list.find((sess) => sess.id === sessionId);
            if (found) {
              sessionTitle = found.title;
              workspaceId = wid;
              break;
            }
          }
          if (!workspaceId) {
            return { sessionActivity: nextActivity };
          }
          const toast: Toast = {
            id: `${sessionId}-${t.lastByteAt}`,
            sessionId,
            workspaceId,
            sessionTitle,
            createdAt: t.lastByteAt,
          };
          const filtered = s.toasts.filter((x) => x.sessionId !== sessionId);
          const toasts = [...filtered, toast].slice(-MAX_TOASTS);
          return {
            sessionActivity: nextActivity,
            toasts,
          };
        });
      }, IDLE_MS),
    );
  },

  clearSessionUnread: (sessionId: string) => {
    cancelIdleTracking(sessionId);
    set((s) => {
      const prev = s.sessionActivity[sessionId];
      const hasToast = s.toasts.some((t) => t.sessionId === sessionId);
      if ((!prev || !prev.unread) && !hasToast) return s;
      return {
        sessionActivity:
          prev && prev.unread
            ? { ...s.sessionActivity, [sessionId]: { ...prev, unread: false } }
            : s.sessionActivity,
        toasts: hasToast
          ? s.toasts.filter((t) => t.sessionId !== sessionId)
          : s.toasts,
      };
    });
  },

  // Clears unread+toasts for every session currently rendered in the active
  // workspace's layout. Used when the browser tab becomes visible again —
  // anything the user can see should not appear as unread.
  clearWorkspaceVisibleUnread: () => {
    const state = get();
    const wid = state.activeWorkspaceId;
    if (!wid) return;
    const layout = state.layoutByWorkspace[wid];
    const ids = layout
      ? listVisibleSessionIds(layout)
      : state.activeSessionId
        ? [state.activeSessionId]
        : [];
    if (ids.length === 0) return;
    for (const id of ids) cancelIdleTracking(id);
    set((s) => {
      let sessionActivity = s.sessionActivity;
      let toasts = s.toasts;
      for (const id of ids) {
        const prev = sessionActivity[id];
        if (prev?.unread) {
          sessionActivity = { ...sessionActivity, [id]: { ...prev, unread: false } };
        }
      }
      if (s.toasts.some((t) => ids.includes(t.sessionId))) {
        toasts = s.toasts.filter((t) => !ids.includes(t.sessionId));
      }
      return { sessionActivity, toasts };
    });
  },

  dismissToast: (id: string) => {
    set((s) => {
      if (!s.toasts.some((t) => t.id === id)) return s;
      return { toasts: s.toasts.filter((t) => t.id !== id) };
    });
  },

  splitPanel: (panelId, direction, placement = 'after') => {
    let newLeafId: string | null = null;
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const layout = s.layoutByWorkspace[wid];
      if (!layout) return s;
      const result = splitLeaf(layout, panelId, direction, placement);
      if (!result) return s;
      newLeafId = result.newLeafId;
      return {
        layoutByWorkspace: { ...s.layoutByWorkspace, [wid]: result.root },
        focusedPanelByWorkspace: {
          ...s.focusedPanelByWorkspace,
          [wid]: result.newLeafId,
        },
        activeSessionId: deriveActiveSession(result.root, result.newLeafId),
      };
    });
    return newLeafId;
  },

  closePanel: async (panelId: string) => {
    const state = get();
    const wid = state.activeWorkspaceId;
    if (!wid) return;
    const layout = state.layoutByWorkspace[wid];
    if (!layout) return;
    const leaf = findLeafById(layout, panelId);
    if (!leaf) return;
    const sessionId = leaf.sessionId;
    if (sessionId) {
      try {
        await api.deleteSession(sessionId);
      } catch {
        // Backend may already be gone; we still clean up local state.
      }
      cancelIdleTracking(sessionId);
    }

    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const oldLayout = s.layoutByWorkspace[wid];
      if (!oldLayout) return s;
      const reduced = removeLeaf(oldLayout, panelId);
      // Never let the workspace become panel-less — leave an empty leaf.
      const newLayout: PanelNode = reduced ?? createLeaf(null);
      const oldFocus = s.focusedPanelByWorkspace[wid];
      const focusedId =
        oldFocus && oldFocus !== panelId && findLeafById(newLayout, oldFocus)
          ? oldFocus
          : firstLeaf(newLayout).id;

      let sessions = s.sessions;
      let sessionActivity = s.sessionActivity;
      let toasts = s.toasts;
      let activeSessionByWorkspace = s.activeSessionByWorkspace;
      if (sessionId) {
        sessions = {
          ...s.sessions,
          [wid]: (s.sessions[wid] ?? []).filter((sess) => sess.id !== sessionId),
        };
        if (s.sessionActivity[sessionId]) {
          sessionActivity = { ...s.sessionActivity };
          delete sessionActivity[sessionId];
        }
        if (s.toasts.some((t) => t.sessionId === sessionId)) {
          toasts = s.toasts.filter((t) => t.sessionId !== sessionId);
        }
        if (activeSessionByWorkspace[wid] === sessionId) {
          const remaining = sessions[wid];
          activeSessionByWorkspace = { ...activeSessionByWorkspace };
          const fallback = remaining[0]?.id;
          if (fallback) activeSessionByWorkspace[wid] = fallback;
          else delete activeSessionByWorkspace[wid];
        }
      }

      return {
        sessions,
        sessionActivity,
        toasts,
        activeSessionByWorkspace,
        layoutByWorkspace: { ...s.layoutByWorkspace, [wid]: newLayout },
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [wid]: focusedId },
        activeSessionId: deriveActiveSession(newLayout, focusedId),
      };
    });
  },

  focusPanel: (panelId: string) => {
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const layout = s.layoutByWorkspace[wid];
      if (!layout) return s;
      if (s.focusedPanelByWorkspace[wid] === panelId) return s;
      if (!findLeafById(layout, panelId)) return s;
      const activeSessionId = deriveActiveSession(layout, panelId);
      let sessionActivity = s.sessionActivity;
      let toasts = s.toasts;
      let activeSessionByWorkspace = s.activeSessionByWorkspace;
      if (activeSessionId) {
        cancelIdleTracking(activeSessionId);
        const prev = s.sessionActivity[activeSessionId];
        if (prev?.unread) {
          sessionActivity = {
            ...s.sessionActivity,
            [activeSessionId]: { ...prev, unread: false },
          };
        }
        if (s.toasts.some((t) => t.sessionId === activeSessionId)) {
          toasts = s.toasts.filter((t) => t.sessionId !== activeSessionId);
        }
        activeSessionByWorkspace = {
          ...activeSessionByWorkspace,
          [wid]: activeSessionId,
        };
      }
      return {
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [wid]: panelId },
        activeSessionId,
        activeSessionByWorkspace,
        sessionActivity,
        toasts,
      };
    });
  },

  assignSession: (panelId: string, sessionId: string) => {
    cancelIdleTracking(sessionId);
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const layout = s.layoutByWorkspace[wid];
      if (!layout) return s;
      const leaf = findLeafById(layout, panelId);
      if (!leaf) return s;
      // Detach session from any other leaf first, then place it on the target.
      const detached = detachSession(layout, sessionId);
      const newLayout = setLeafSession(detached, panelId, sessionId);
      const activeSessionId = deriveActiveSession(newLayout, panelId);

      let sessionActivity = s.sessionActivity;
      let toasts = s.toasts;
      const prev = s.sessionActivity[sessionId];
      if (prev?.unread) {
        sessionActivity = {
          ...s.sessionActivity,
          [sessionId]: { ...prev, unread: false },
        };
      }
      if (s.toasts.some((t) => t.sessionId === sessionId)) {
        toasts = s.toasts.filter((t) => t.sessionId !== sessionId);
      }

      return {
        layoutByWorkspace: { ...s.layoutByWorkspace, [wid]: newLayout },
        focusedPanelByWorkspace: { ...s.focusedPanelByWorkspace, [wid]: panelId },
        activeSessionId,
        activeSessionByWorkspace: { ...s.activeSessionByWorkspace, [wid]: sessionId },
        sessionActivity,
        toasts,
      };
    });
  },

  resizeSplit: (splitId: string, sizes: number[]) => {
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const layout = s.layoutByWorkspace[wid];
      if (!layout) return s;
      const next = setSplitSizes(layout, splitId, sizes);
      if (next === layout) return s;
      return {
        layoutByWorkspace: { ...s.layoutByWorkspace, [wid]: next },
      };
    });
  },
}));

export function sessionUnread(state: AppState, sessionId: string): boolean {
  return state.sessionActivity[sessionId]?.unread === true;
}

export function workspaceUnread(state: AppState, workspaceId: string): boolean {
  const list = state.sessions[workspaceId];
  if (!list) return false;
  for (const s of list) {
    if (state.sessionActivity[s.id]?.unread === true) return true;
  }
  return false;
}

// Wires localStorage persistence for layoutByWorkspace + focusedPanelByWorkspace.
// Called from main.tsx — tests don't call this, so they don't pollute storage.
let persistenceWired = false;
export function wireLayoutPersistence(): () => void {
  if (persistenceWired) return () => {};
  persistenceWired = true;
  const unsub = useAppStore.subscribe((state, prev) => {
    if (
      state.layoutByWorkspace === prev.layoutByWorkspace &&
      state.focusedPanelByWorkspace === prev.focusedPanelByWorkspace
    ) {
      return;
    }
    const layouts: PersistedLayouts = {};
    for (const wid of Object.keys(state.layoutByWorkspace)) {
      const layout = state.layoutByWorkspace[wid];
      const focusedId =
        state.focusedPanelByWorkspace[wid] ?? firstLeaf(layout).id;
      layouts[wid] = { layout, focusedPanelId: focusedId };
    }
    saveLayouts(layouts);
  });
  return () => {
    unsub();
    persistenceWired = false;
  };
}
