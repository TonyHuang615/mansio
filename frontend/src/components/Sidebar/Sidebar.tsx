import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { ui } from '../../lib/theme';

interface ContextMenu {
  workspaceId: string;
  x: number;
  y: number;
}

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
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  const startRename = (id: string, name: string) => {
    setContextMenu(null);
    setEditingId(id);
    setEditName(name);
  };

  const handleContextMenu = (e: React.MouseEvent, wsId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ workspaceId: wsId, x: e.clientX, y: e.clientY });
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
            onContextMenu={(e) => handleContextMenu(e, ws.id)}
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
                onClick={(e) => e.stopPropagation()}
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
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(ws.id, ws.name);
                }}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title="Double-click or right-click to rename"
              >
                {ws.name}
              </span>
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
        Loci Terminal
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: ui.tabActiveBg,
            border: `1px solid ${ui.sidebarBorder}`,
            zIndex: 1000,
            minWidth: '140px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
          }}
        >
          <button
            onClick={() => {
              const ws = workspaces.find(w => w.id === contextMenu.workspaceId);
              if (ws) startRename(ws.id, ws.name);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              color: ui.textPrimary,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = ui.sidebarBorder; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            Rename
          </button>
          {workspaces.length > 1 && (
            <button
              onClick={() => {
                deleteWorkspace(contextMenu.workspaceId);
                setContextMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: ui.danger,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = ui.sidebarBorder; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
