import { useAppStore } from '../../stores/appStore';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';

export function TerminalPanel() {
  const { activeSessionId, activeWorkspaceId, sessions } = useAppStore();
  const currentSessions = activeWorkspaceId ? sessions[activeWorkspaceId] || [] : [];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
    }}>
      <TabBar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {currentSessions.map((sess) => (
          <div
            key={sess.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: sess.id === activeSessionId ? 'block' : 'none',
            }}
          >
            <TerminalView sessionId={sess.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
