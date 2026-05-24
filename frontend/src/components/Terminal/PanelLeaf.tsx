import { useState, type CSSProperties } from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { TerminalView } from './TerminalView';
import type { PanelLeafNode } from '../../lib/panelLayout';
import type { DropZone } from '../../lib/dropZone';

interface PanelLeafProps {
  node: PanelLeafNode;
  hideToolbar?: boolean;
  disableSplit?: boolean;
}

export function PanelLeaf({ node, hideToolbar, disableSplit }: PanelLeafProps) {
  const focusPanel = useAppStore((s) => s.focusPanel);
  const splitPanel = useAppStore((s) => s.splitPanel);
  const closePanel = useAppStore((s) => s.closePanel);
  const isFocused = useAppStore((s) => {
    const wid = s.activeWorkspaceId;
    return wid ? s.focusedPanelByWorkspace[wid] === node.id : false;
  });
  const { ui } = useEffectiveTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      data-testid="panel-leaf"
      data-leaf-id={node.id}
      onMouseDown={() => focusPanel(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: `2px solid ${isFocused ? ui.accent : 'transparent'}`,
        transition: 'border-color 100ms',
      }}
    >
      <TerminalView sessionId={node.sessionId} />
      {!hideToolbar && hovered && (
        <LeafToolbar
          disableSplit={disableSplit}
          onSplitRow={() => splitPanel(node.id, 'row', 'after')}
          onSplitColumn={() => splitPanel(node.id, 'column', 'after')}
          onClose={() => {
            void closePanel(node.id);
          }}
        />
      )}
      <DropZoneOverlay leafId={node.id} />
    </div>
  );
}

interface LeafToolbarProps {
  disableSplit?: boolean;
  onSplitRow: () => void;
  onSplitColumn: () => void;
  onClose: () => void;
}

function LeafToolbar({
  disableSplit,
  onSplitRow,
  onSplitColumn,
  onClose,
}: LeafToolbarProps) {
  const { ui } = useEffectiveTheme();
  const btnStyle: CSSProperties = {
    width: 26,
    height: 26,
    background: ui.tabActiveBg,
    border: `1px solid ${ui.tabBorder}`,
    borderRadius: 4,
    color: ui.textSecondary,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <div
      data-testid="leaf-toolbar"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: 'flex',
        gap: 4,
        zIndex: 15,
      }}
    >
      {!disableSplit && (
        <>
          <button
            type="button"
            title="Split right"
            aria-label="Split panel right"
            onClick={onSplitRow}
            style={btnStyle}
          >
            ▯
          </button>
          <button
            type="button"
            title="Split down"
            aria-label="Split panel down"
            onClick={onSplitColumn}
            style={btnStyle}
          >
            ▭
          </button>
        </>
      )}
      <button
        type="button"
        title="Close panel (kills session)"
        aria-label="Close panel"
        onClick={onClose}
        style={{ ...btnStyle, color: ui.danger }}
      >
        ×
      </button>
    </div>
  );
}

const ZONE_RECTS: Record<DropZone, CSSProperties> = {
  top: { top: 0, left: 0, width: '100%', height: '25%' },
  bottom: { bottom: 0, left: 0, width: '100%', height: '25%' },
  left: { top: '25%', height: '50%', left: 0, width: '25%' },
  right: { top: '25%', height: '50%', right: 0, width: '25%' },
  center: { top: '25%', left: '25%', width: '50%', height: '50%' },
};

function DropZoneOverlay({ leafId }: { leafId: string }) {
  const { active } = useDndContext();
  const isDragging = active !== null;
  if (!isDragging) return null;
  return (
    <>
      {(Object.keys(ZONE_RECTS) as DropZone[]).map((zone) => (
        <Zone key={zone} leafId={leafId} zone={zone} rect={ZONE_RECTS[zone]} />
      ))}
    </>
  );
}

function Zone({
  leafId,
  zone,
  rect,
}: {
  leafId: string;
  zone: DropZone;
  rect: CSSProperties;
}) {
  const { ui } = useEffectiveTheme();
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-${leafId}-${zone}`,
    data: { leafId, zone },
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={`dropzone-${zone}`}
      style={{
        position: 'absolute',
        ...rect,
        backgroundColor: isOver ? `${ui.accent}33` : 'transparent',
        outline: isOver ? `2px dashed ${ui.accent}` : 'none',
        outlineOffset: -2,
        pointerEvents: 'auto',
        zIndex: 20,
        transition: 'background-color 80ms',
      }}
    />
  );
}
