import { useEffect, useState } from 'react';
import { useAppStore, type Toast } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import type { UIColors } from '../../lib/theme';

const TOAST_DURATION_MS = 6000;

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const { ui } = useEffectiveTheme();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1100,
        pointerEvents: 'none',
        maxWidth: 320,
      }}
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          ui={ui}
          onDismiss={() => dismissToast(t.id)}
          onClick={async () => {
            if (t.workspaceId !== activeWorkspaceId) {
              await setActiveWorkspace(t.workspaceId);
            }
            setActiveSession(t.sessionId);
            dismissToast(t.id);
          }}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  ui: UIColors;
  onDismiss: () => void;
  onClick: () => void;
}

function ToastItem({ toast, ui, onDismiss, onClick }: ToastItemProps) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      style={{
        pointerEvents: 'auto',
        backgroundColor: ui.tabActiveBg,
        border: `1px solid ${ui.sidebarBorder}`,
        borderLeft: `3px solid ${ui.accent}`,
        borderRadius: 6,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.28)',
        color: ui.textPrimary,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: 1.4,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: 'pointer',
        opacity: hovered ? 1 : 0.96,
        transition: 'opacity 120ms ease',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            color: ui.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={toast.sessionTitle}
        >
          {toast.sessionTitle || 'Terminal'}
        </div>
        <div style={{ color: ui.textSecondary, marginTop: 2 }}>
          Output finished
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
        title="Dismiss"
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: ui.textMuted,
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
  );
}
