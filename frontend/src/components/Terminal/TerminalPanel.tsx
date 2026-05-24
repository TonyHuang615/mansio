import { useAppStore } from '../../stores/appStore';
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery';
import { TabBar } from './TabBar';
import { PanelLayout } from './PanelLayout';
import { MobileInputBar } from './MobileInputBar';

interface TerminalPanelProps {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function TerminalPanel({ showMenuButton, onMenuClick }: TerminalPanelProps) {
  // Selector form: destructuring `useAppStore()` subscribes to the whole store
  // and re-renders on every unread/toast mutation, which can disrupt an
  // in-progress xterm text selection.
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <TabBar showMenuButton={showMenuButton} onMenuClick={onMenuClick} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <PanelLayout />
      </div>
      {isMobile && <MobileInputBar sessionId={activeSessionId} />}
    </div>
  );
}
