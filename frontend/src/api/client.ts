import type { Workspace, Session } from '../types';

const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

export const api = {
  listWorkspaces: () => request<Workspace[]>('/workspaces'),

  createWorkspace: (name: string) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateWorkspace: (id: string, name: string) =>
    request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/workspaces/${id}`, { method: 'DELETE' }),

  listSessions: (workspaceId: string) =>
    request<Session[]>(`/workspaces/${workspaceId}/sessions`),

  createSession: (workspaceId: string, title?: string) =>
    request<Session>(`/workspaces/${workspaceId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title: title || 'Terminal' }),
    }),

  updateSession: (id: string, title: string) =>
    request<Session>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
};
