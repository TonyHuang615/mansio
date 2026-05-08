import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { ui } from '../../lib/theme';

export function Sidebar() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = useAppStore();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = async () => {
    if (newName.trim()) {
      await createWorkspace(newName.trim());
      setNewName('');
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (editName.trim()) {
      await renameWorkspace(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: ui.sidebarBg,
      borderRight: `1px solid ${ui.sidebarBorder}`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        padding: '12px 16px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        color: ui.textMuted,
        borderBottom: `1px solid ${ui.sidebarBorder}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Workspaces</span>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: 'none',
            border: 'none',
            color: ui.textSecondary,
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="New Workspace"
        >+</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              backgroundColor: ws.id === activeWorkspaceId ? ui.tabActiveBg : 'transparent',
              color: ws.id === activeWorkspaceId ? ui.textPrimary : ui.textSecondary,
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            {editingId === ws.id ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRename(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(ws.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                style={{
                  background: 'transparent',
                  border: `1px solid ${ui.accent}`,
                  color: ui.textPrimary,
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  padding: '2px 4px',
                  width: '100%',
                  outline: 'none',
                }}
              />
            ) : (
              <>
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(ws.id);
                    setEditName(ws.name);
                  }}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {ws.name}
                </span>
                {workspaces.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkspace(ws.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: ui.textMuted,
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '0 2px',
                      opacity: 0.5,
                    }}
                  >×</button>
                )}
              </>
            )}
          </div>
        ))}

        {creating && (
          <div style={{ padding: '4px 16px' }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
              autoFocus
              placeholder="Workspace name..."
              style={{
                width: '100%',
                background: 'transparent',
                border: `1px solid ${ui.accent}`,
                color: ui.textPrimary,
                fontSize: '13px',
                fontFamily: 'inherit',
                padding: '6px 8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${ui.sidebarBorder}`,
        fontSize: '11px',
        color: ui.textMuted,
      }}>
        GhostTerm
      </div>
    </div>
  );
}
