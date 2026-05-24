import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { useAppStore, __resetActivityTrackingForTests } from '../../stores/appStore';
import { createLeaf, __resetPanelIdForTests } from '../../lib/panelLayout';
import { TerminalPanel } from './TerminalPanel';

// Count how many times TerminalView is invoked. The point of the selector
// subscription is that TerminalView should NOT re-render when sessionActivity
// (or any other unrelated store slice) mutates — otherwise xterm's in-progress
// text selection gets disrupted.
const viewRenderCount = { value: 0 };

vi.mock('./TerminalView', () => ({
  TerminalView: (props: { sessionId: string | null }) => {
    viewRenderCount.value += 1;
    return <div data-testid="terminal-view" data-session={props.sessionId ?? ''} />;
  },
}));

vi.mock('./TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}));

vi.mock('./MobileInputBar', () => ({
  MobileInputBar: () => <div data-testid="mobile-input-bar" />,
}));

const mockWorkspace = {
  id: 'ws-1',
  name: 'WS',
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};
const mockSessionA = {
  id: 'sess-A',
  workspaceId: 'ws-1',
  title: 'A',
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};
const mockSessionB = { ...mockSessionA, id: 'sess-B', title: 'B' };

describe('TerminalPanel — selector subscription', () => {
  beforeEach(() => {
    viewRenderCount.value = 0;
    __resetActivityTrackingForTests();
    __resetPanelIdForTests();
    useAppStore.setState({
      workspaces: [mockWorkspace],
      sessions: { 'ws-1': [mockSessionA, mockSessionB] },
      activeWorkspaceId: 'ws-1',
      activeSessionId: 'sess-A',
      activeSessionByWorkspace: { 'ws-1': 'sess-A' },
      sessionActivity: {},
      toasts: [],
      initialized: true,
      layoutByWorkspace: { 'ws-1': createLeaf('sess-A', 'leaf-root') },
      focusedPanelByWorkspace: { 'ws-1': 'leaf-root' },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does NOT re-render TerminalView when an unrelated store slice (sessionActivity) mutates', () => {
    render(<TerminalPanel />);
    const baseline = viewRenderCount.value;
    expect(baseline).toBeGreaterThan(0);

    // Mutate a slice TerminalPanel/PanelLayout don't select on.
    act(() => {
      useAppStore.setState((s) => ({
        sessionActivity: {
          ...s.sessionActivity,
          'sess-A': { unread: true, lastOutputAt: 1, notifiedAt: 1 },
        },
      }));
    });

    expect(viewRenderCount.value).toBe(baseline);
  });

  it('DOES re-render TerminalView when the focused leaf swaps to a different session', () => {
    render(<TerminalPanel />);
    const baseline = viewRenderCount.value;

    act(() => {
      useAppStore.setState((s) => ({
        layoutByWorkspace: {
          ...s.layoutByWorkspace,
          'ws-1': createLeaf('sess-B', 'leaf-root'),
        },
      }));
    });

    expect(viewRenderCount.value).toBeGreaterThan(baseline);
  });
});
