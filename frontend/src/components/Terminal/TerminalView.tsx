import { useRef } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminal({ sessionId, containerRef });

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#0d1117',
      }}
    />
  );
}
