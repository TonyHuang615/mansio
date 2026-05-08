import { create } from 'zustand';
import type { Workspace, Session } from '../types';
import { api } from '../api/client';

interface AppState {
  workspaces: Workspace[];
  sessions: Record<string, Session[]>;
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  setActiveWorkspace: (id: string) => Promise<void>;

  fetchSessions: (workspaceId: string) => Promise<void>;
  createSession: (workspaceId: string, title?: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  setActiveSession: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  sessions: {},
  activeWorkspaceId: null,
  activeSessionId: null,
  initialized: false,

  init: async () => {
    let workspaces = await api.listWorkspaces();

    if (workspaces.length === 0) {
      const ws = await api.createWorkspace('Default');
      workspaces = [ws];
    }

    const wid = workspaces[0].id;
    let sessions = await api.listSessions(wid);

    if (sessions.length === 0) {
      const sess = await api.createSession(wid);
      sessions = [sess];
    }

    set({
      workspaces,
      sessions: { [wid]: sessions },
      activeWorkspaceId: wid,
      activeSessionId: sessions[0].id,
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
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      sessions: { ...s.sessions, [ws.id]: [sess] },
      activeWorkspaceId: ws.id,
      activeSessionId: sess.id,
    }));
  },

  deleteWorkspace: async (id: string) => {
    await api.deleteWorkspace(id);
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const sessions = { ...s.sessions };
      delete sessions[id];
      const nextWid = workspaces.length > 0 ? workspaces[0].id : null;
      const nextSessions = nextWid ? sessions[nextWid] : undefined;
      return {
        workspaces,
        sessions,
        activeWorkspaceId: nextWid,
        activeSessionId: nextSessions?.[0]?.id ?? null,
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
    if (!state.sessions[id]) {
      const sessions = await api.listSessions(id);
      set((s) => ({
        sessions: { ...s.sessions, [id]: sessions },
        activeWorkspaceId: id,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
      }));
    } else {
      const sessions = state.sessions[id];
      set({
        activeWorkspaceId: id,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
      });
    }
  },

  fetchSessions: async (workspaceId: string) => {
    const sessions = await api.listSessions(workspaceId);
    set((s) => ({
      sessions: { ...s.sessions, [workspaceId]: sessions },
    }));
  },

  createSession: async (workspaceId: string, title?: string) => {
    const sess = await api.createSession(workspaceId, title);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [workspaceId]: [...(s.sessions[workspaceId] || []), sess],
      },
      activeSessionId: sess.id,
    }));
  },

  deleteSession: async (id: string) => {
    await api.deleteSession(id);
    set((s) => {
      const wid = s.activeWorkspaceId;
      if (!wid) return s;
      const sessions = (s.sessions[wid] || []).filter((sess) => sess.id !== id);
      return {
        sessions: { ...s.sessions, [wid]: sessions },
        activeSessionId:
          s.activeSessionId === id
            ? sessions.length > 0
              ? sessions[0].id
              : null
            : s.activeSessionId,
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
            sess.id === id ? updated : sess
          ),
        },
      };
    });
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
  },
}));
