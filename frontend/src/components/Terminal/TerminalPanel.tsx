import { useAppStore } from '../../stores/appStore';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';

interface TerminalPanelProps {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function TerminalPanel({ showMenuButton, onMenuClick }: TerminalPanelProps) {
  const { activeSessionId } = useAppStore();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
    }}>
      <TabBar showMenuButton={showMenuButton} onMenuClick={onMenuClick} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Single mount point. Inactive sessions live in the cache with their
            xterm DOM nodes detached — VS Code's pattern, the only one xterm.js
            supports for tab-style switching (see xtermjs/xterm.js#3029). */}
        <TerminalView sessionId={activeSessionId} />
      </div>
    </div>
  );
}
