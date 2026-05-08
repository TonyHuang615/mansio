import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from './stores/appStore';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { LoginForm } from './components/Auth/LoginForm';
import { ui } from './lib/theme';

type AuthState = 'loading' | 'needs-setup' | 'needs-login' | 'authenticated';

export default function App() {
  const { initialized, init } = useAppStore();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const dragging = useRef(false);

  const checkAuth = useCallback(async () => {
    const res = await fetch('/api/v1/auth/check');
    const data = await res.json();

    if (data.needsSetup) {
      setAuthState('needs-setup');
    } else {
      const testRes = await fetch('/api/v1/workspaces');
      if (testRes.status === 401) {
        setAuthState('needs-login');
      } else {
        setAuthState('authenticated');
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authState === 'authenticated' && !initialized) {
      init();
    }
  }, [authState, initialized, init]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current) {
        setSidebarWidth(Math.max(140, Math.min(400, e.clientX)));
      }
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  if (authState === 'loading') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: ui.terminalBg,
        color: ui.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Starting GhostTerm...
      </div>
    );
  }

  if (authState === 'needs-setup' || authState === 'needs-login') {
    return (
      <LoginForm
        needsSetup={authState === 'needs-setup'}
        onSuccess={() => setAuthState('authenticated')}
      />
    );
  }

  if (!initialized) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: ui.terminalBg,
        color: ui.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      backgroundColor: ui.terminalBg,
      overflow: 'hidden',
    }}>
      <div style={{ width: sidebarWidth, flexShrink: 0, height: '100%' }}>
        <Sidebar />
      </div>

      <div
        onMouseDown={onMouseDown}
        style={{
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.backgroundColor = ui.accent;
        }}
        onMouseLeave={(e) => {
          if (!dragging.current) {
            (e.target as HTMLElement).style.backgroundColor = 'transparent';
          }
        }}
      />

      <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        <TerminalPanel />
      </div>
    </div>
  );
}
