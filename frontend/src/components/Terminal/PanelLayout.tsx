import { Fragment } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useMediaQuery, MOBILE_QUERY } from '../../hooks/useMediaQuery';
import { findLeafById, firstLeaf, type PanelNode } from '../../lib/panelLayout';
import { PanelLeaf } from './PanelLeaf';

export function PanelLayout() {
  const wid = useAppStore((s) => s.activeWorkspaceId);
  const layout = useAppStore((s) => (wid ? s.layoutByWorkspace[wid] ?? null : null));
  const focusedId = useAppStore((s) =>
    wid ? s.focusedPanelByWorkspace[wid] ?? null : null,
  );
  const isMobile = useMediaQuery(MOBILE_QUERY);

  if (!layout) return null;

  if (isMobile) {
    const matched = focusedId ? findLeafById(layout, focusedId) : null;
    const focusedLeaf = matched ?? firstLeaf(layout);
    return <PanelLeaf node={focusedLeaf} hideToolbar disableSplit />;
  }

  return <PanelNodeRenderer node={layout} />;
}

function PanelNodeRenderer({ node }: { node: PanelNode }) {
  const resizeSplit = useAppStore((s) => s.resizeSplit);
  const { ui } = useEffectiveTheme();
  if (node.kind === 'leaf') {
    return <PanelLeaf node={node} />;
  }
  const orientation = node.direction === 'row' ? 'horizontal' : 'vertical';
  const defaultLayout: Layout = {};
  node.children.forEach((c, i) => {
    defaultLayout[c.id] = node.sizes[i];
  });

  const handleLayoutChanged = (next: Layout) => {
    const newSizes = node.children.map((c) => next[c.id] ?? 0);
    if (newSizes.some((s, i) => s !== node.sizes[i])) {
      resizeSplit(node.id, newSizes);
    }
  };

  return (
    <Group
      id={node.id}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
      style={{ width: '100%', height: '100%' }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <Separator
              style={{
                backgroundColor: ui.tabBorder,
                flexShrink: 0,
                width: orientation === 'horizontal' ? 4 : undefined,
                height: orientation === 'vertical' ? 4 : undefined,
              }}
            />
          )}
          <Panel id={child.id} minSize={10}>
            <PanelNodeRenderer node={child} />
          </Panel>
        </Fragment>
      ))}
    </Group>
  );
}
