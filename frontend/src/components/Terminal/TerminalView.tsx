import { useCallback, useRef, useState } from 'react';
import { useTerminal, pasteToTerminal } from '../../hooks/useTerminal';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { uploadFile } from '../../api/upload';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ui, terminalTheme } = useEffectiveTheme();
  useTerminal({ sessionId, containerRef, theme: terminalTheme });

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setErrorMsg(null);
      for (const file of files) {
        setUploadingName(file.name);
        try {
          const result = await uploadFile(sessionId, file);
          pasteToTerminal(sessionId, result.path + ' ');
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
      setUploadingName(null);
    },
    [sessionId],
  );

  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: ui.terminalBg,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ui.dropOverlayBg,
            border: `2px dashed ${ui.dropOverlayBorder}`,
            color: ui.dropOverlayText,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16,
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          Drop to upload
        </div>
      )}

      {uploadingName && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            padding: '6px 12px',
            backgroundColor: ui.tabActiveBg,
            border: `1px solid ${ui.accent}`,
            borderRadius: 4,
            color: ui.textPrimary,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            zIndex: 11,
            maxWidth: '70%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Uploading {uploadingName}...
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            padding: '6px 12px',
            backgroundColor: ui.tabActiveBg,
            border: `1px solid ${ui.danger}`,
            borderRadius: 4,
            color: ui.danger,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            zIndex: 11,
            cursor: 'pointer',
            maxWidth: '70%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onClick={() => setErrorMsg(null)}
          title="Click to dismiss"
        >
          Upload failed: {errorMsg}
        </div>
      )}
    </div>
  );
}
