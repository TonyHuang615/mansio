import { useAppStore } from '../../stores/appStore';
import { ui } from '../../lib/theme';

export function TabBar() {
  const {
    activeWorkspaceId,
    activeSessionId,
    sessions,
    setActiveSession,
    createSession,
    deleteSession,
  } = useAppStore();

  if (!activeWorkspaceId) return null;

  const currentSessions = sessions[activeWorkspaceId] || [];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      backgroundColor: ui.tabBarBg,
      borderBottom: `1px solid ${ui.tabBorder}`,
      height: '36px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'auto',
      }}>
        {currentSessions.map((sess) => (
          <div
            key={sess.id}
            onClick={() => setActiveSession(sess.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              cursor: 'pointer',
              backgroundColor: sess.id === activeSessionId ? ui.tabActiveBg : 'transparent',
              color: sess.id === activeSessionId ? ui.textPrimary : ui.textSecondary,
              borderRight: `1px solid ${ui.tabBorder}`,
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sess.title}
            </span>
            {currentSessions.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(sess.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: ui.textMuted,
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: 0,
                  lineHeight: 1,
                  opacity: sess.id === activeSessionId ? 0.7 : 0.3,
                }}
              >×</button>
            )}
          </div>
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
          fontSize: '16px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
        }}
        title="New Tab"
      >+</button>
    </div>
  );
}
