import { useEffect, useState, useRef, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useAppStore } from './stores/appStore';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { LoginForm } from './components/Auth/LoginForm';
import { ToastContainer } from './components/Toast/ToastContainer';
import { useEffectiveTheme } from './hooks/useEffectiveTheme';
import { useMediaQuery, MOBILE_QUERY } from './hooks/useMediaQuery';
import { zoneToSplit, type DropZone } from './lib/dropZone';
import { findLeafBySessionId } from './lib/panelLayout';

type AuthState = 'loading' | 'needs-setup' | 'needs-login' | 'authenticated';

export default function App() {
  const { initialized, init, pollActive } = useAppStore();
  const { ui } = useEffectiveTheme();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const PERM_DISMISS_KEY = 'lociterm.permissionBannerDismissed';

  const [authState, setAuthState] = useState<AuthState>('loading');
  const [permWarning, setPermWarning] = useState<string | null>(null);
  const [permChecking, setPermChecking] = useState(false);
  const [permDismissed, setPermDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PERM_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  const checkPermissions = useCallback(async () => {
    setPermChecking(true);
    try {
      const res = await fetch('/api/v1/health');
      const data = await res.json();
      if (data.permissions === false && data.permissionMessage) {
        setPermWarning(data.permissionMessage);
      } else {
        setPermWarning(null);
        // Permissions are healthy — clear the dismiss flag so the banner
        // can reappear if permissions later break again.
        try {
          localStorage.removeItem(PERM_DISMISS_KEY);
        } catch {}
        setPermDismissed(false);
      }
    } catch {}
    setPermChecking(false);
  }, []);

  const dismissPermBanner = useCallback(() => {
    try {
      localStorage.setItem(PERM_DISMISS_KEY, '1');
    } catch {}
    setPermDismissed(true);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authState === 'authenticated' && !initialized) {
      init();
      checkPermissions();
    }
  }, [authState, initialized, init, checkPermissions]);

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  // Poll the active workspace's session list every 5s so the sidebar's CWD
  // subtitle reflects `cd` activity. Pauses when the tab is hidden — no point
  // refreshing data the user can't see.
  useEffect(() => {
    if (!initialized) return;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        pollActive();
      }
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [initialized, pollActive]);

  // getState() — the listener only needs to read the workspace layout at
  // the moment visibility flips, so don't subscribe.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      useAppStore.getState().clearWorkspaceVisibleUnread();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const [draggingTab, setDraggingTab] = useState<{ sessionId: string; title: string } | null>(null);

  // distance=5 lets a quick click pass through as a normal click handler
  // rather than starting a drag; only sustained pointer movement triggers
  // the drag interaction.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; sessionId?: string; sessionTitle?: string }
      | undefined;
    if (data?.type === 'tab' && data.sessionId) {
      setDraggingTab({ sessionId: data.sessionId, title: data.sessionTitle ?? '' });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingTab(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as
      | { type?: string; sessionId?: string }
      | undefined;
    const overData = over.data.current as
      | { leafId?: string; zone?: DropZone }
      | undefined;
    if (
      activeData?.type !== 'tab' ||
      !activeData.sessionId ||
      !overData?.leafId ||
      !overData.zone
    ) {
      return;
    }
    const { sessionId } = activeData;
    const { leafId, zone } = overData;
    const state = useAppStore.getState();

    // Drop-to-self: the dragged tab is already on the leaf the user just
    // dropped it on. Center = obvious no-op; edge = also a no-op because
    // splitting and re-assigning would leave the original half empty,
    // which is rarely what the user meant.
    const wid = state.activeWorkspaceId;
    if (wid) {
      const layout = state.layoutByWorkspace[wid];
      if (layout) {
        const sourceLeaf = findLeafBySessionId(layout, sessionId);
        if (sourceLeaf && sourceLeaf.id === leafId) return;
      }
    }

    if (zone === 'center') {
      state.assignSession(leafId, sessionId);
      return;
    }
    const split = zoneToSplit(zone);
    const newLeafId = state.splitPanel(leafId, split.direction, split.placement);
    if (newLeafId) state.assignSession(newLeafId, sessionId);
  }, []);

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
        minHeight: '100vh',
        backgroundColor: ui.appBg,
        color: ui.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
        padding: '24px',
      }}>
        Starting LociTerm...
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
        minHeight: '100vh',
        backgroundColor: ui.appBg,
        color: ui.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
        padding: '24px',
      }}>
        Loading...
      </div>
    );
  }

  const sidebarPanelWidth = isMobile ? Math.min(280, window.innerWidth - 56) : sidebarWidth;

  const showPermBanner = !!permWarning && !permDismissed;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100dvh',
      backgroundColor: ui.appBg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {showPermBanner && (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          backgroundColor: ui.warning,
          color: '#000',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          lineHeight: 1.4,
          borderBottom: `1px solid ${ui.sidebarBorder}`,
        }}>
          <span style={{ fontWeight: 600, flexShrink: 0 }}>Permission</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Full Disk Access required — System Settings ▸ Privacy & Security ▸ Full Disk Access ▸ add <code style={{ background: 'rgba(0,0,0,0.12)', padding: '0 4px', borderRadius: 2 }}>/usr/local/bin/lociterm</code>
          </span>
          <button
            onClick={checkPermissions}
            disabled={permChecking}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              backgroundColor: 'rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.25)',
              color: '#000',
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: permChecking ? 'wait' : 'pointer',
              opacity: permChecking ? 0.6 : 1,
              borderRadius: 3,
            }}
          >
            {permChecking ? 'Checking…' : 'Recheck'}
          </button>
          <button
            onClick={dismissPermBanner}
            aria-label="Dismiss"
            title="Dismiss"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              padding: 0,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#000',
              fontSize: 16,
              lineHeight: 1,
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        position: 'relative',
      }}>
      {!isMobile && (
        <>
          <div style={{ width: sidebarPanelWidth, flexShrink: 0, height: '100%' }}>
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
        </>
      )}

      {isMobile && mobileSidebarOpen && (
        <>
          <div
            onClick={() => setMobileSidebarOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: ui.overlayBg,
              zIndex: 999,
            }}
            aria-hidden
          />
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: sidebarPanelWidth,
            zIndex: 1000,
            boxShadow: '2px 0 8px rgba(0,0,0,0.35)',
          }}>
            <Sidebar onCloseMobile={() => setMobileSidebarOpen(false)} />
          </div>
        </>
      )}

      <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }}>
        <TerminalPanel
          showMenuButton={isMobile}
          onMenuClick={() => setMobileSidebarOpen(true)}
        />
      </div>
      </div>
      <ToastContainer />
    </div>
    <DragOverlay dropAnimation={null}>
      {draggingTab && (
        <div
          style={{
            padding: '4px 10px',
            backgroundColor: ui.tabActiveBg,
            border: `1px solid ${ui.accent}`,
            borderRadius: 3,
            color: ui.textPrimary,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          {draggingTab.title}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}
