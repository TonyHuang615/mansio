import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import type { Session } from '../../types';
import type { UIColors } from '../../lib/theme';

interface TabBarProps {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function TabBar({ showMenuButton, onMenuClick }: TabBarProps) {
  // Per-field selectors so unrelated mutations (toasts, layout resizes, etc.)
  // don't trigger a TabBar re-render mid-drag, which would abort the in-flight
  // useDraggable session on the tab being dragged.
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const sessionActivity = useAppStore((s) => s.sessionActivity);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const createSession = useAppStore((s) => s.createSession);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const { ui } = useEffectiveTheme();

  if (!activeWorkspaceId) return null;

  const currentSessions = sessions[activeWorkspaceId] || [];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: ui.tabBarBg,
        borderBottom: `1px solid ${ui.tabBorder}`,
        height: '40px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
        overflow: 'hidden',
      }}
    >
      {showMenuButton && (
        <button
          onClick={onMenuClick}
          style={{
            background: 'none',
            border: 'none',
            borderRight: `1px solid ${ui.tabBorder}`,
            color: ui.textSecondary,
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            minWidth: 44,
          }}
          aria-label="Open sidebar"
          title="Workspaces"
        >
          ☰
        </button>
      )}

      <div
        style={{
          display: 'flex',
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {currentSessions.map((sess) => (
          <DraggableTab
            key={sess.id}
            session={sess}
            isActive={sess.id === activeSessionId}
            hasUnread={
              sess.id !== activeSessionId &&
              sessionActivity[sess.id]?.unread === true
            }
            canClose={currentSessions.length > 1}
            ui={ui}
            onSelect={() => setActiveSession(sess.id)}
            onClose={() => deleteSession(sess.id)}
          />
        ))}
      </div>

      <button
        onClick={() => activeWorkspaceId && createSession(activeWorkspaceId)}
        style={{
          background: 'none',
          border: 'none',
          borderLeft: `1px solid ${ui.tabBorder}`,
          color: ui.textSecondary,
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          minWidth: 44,
        }}
        title="New Tab"
        aria-label="New tab"
      >
        +
      </button>
    </div>
  );
}

interface DraggableTabProps {
  session: Session;
  isActive: boolean;
  hasUnread: boolean;
  canClose: boolean;
  ui: UIColors;
  onSelect: () => void;
  onClose: () => void;
}

function DraggableTab({
  session,
  isActive,
  hasUnread,
  canClose,
  ui,
  onSelect,
  onClose,
}: DraggableTabProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tab-${session.id}`,
    data: { type: 'tab', sessionId: session.id, sessionTitle: session.title },
  });
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 12px',
    cursor: 'pointer',
    backgroundColor: isActive ? ui.tabActiveBg : 'transparent',
    color: isActive ? ui.textPrimary : ui.textSecondary,
    borderRight: `1px solid ${ui.tabBorder}`,
    whiteSpace: 'nowrap',
    minWidth: 0,
    maxWidth: 200,
    flexShrink: 0,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none',
  };
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      style={style}
      {...listeners}
      {...attributes}
    >
      {hasUnread && (
        <span
          aria-label="unread output"
          title="New output"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: ui.accent,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {session.title}
      </span>
      {canClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            background: 'none',
            border: 'none',
            color: ui.textMuted,
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px 6px',
            lineHeight: 1,
            opacity: isActive ? 0.7 : 0.3,
          }}
          aria-label={`Close ${session.title}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
