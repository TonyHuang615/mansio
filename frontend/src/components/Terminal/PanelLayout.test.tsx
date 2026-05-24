import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore, __resetActivityTrackingForTests } from '../../stores/appStore';
import {
  createLeaf,
  createSplit,
  __resetPanelIdForTests,
} from '../../lib/panelLayout';
import { PanelLayout } from './PanelLayout';

vi.mock('./TerminalView', () => ({
  TerminalView: (props: { sessionId: string | null }) => (
    <div data-testid="terminal-view" data-session={props.sessionId ?? ''} />
  ),
}));

const mockWorkspace = {
  id: 'ws-1',
  name: 'WS',
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  // Override matchMedia for MOBILE_QUERY: (max-width: 768px)
  window.matchMedia = (query: string) => {
    const m = /\(max-width:\s*(\d+)px\)/.exec(query);
    const breakpoint = m ? Number(m[1]) : 0;
    const matches = width <= breakpoint;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}

describe('PanelLayout', () => {
  beforeEach(() => {
    __resetActivityTrackingForTests();
    __resetPanelIdForTests();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders every leaf of a split tree on desktop viewport', () => {
    setViewport(1280);
    const a = createLeaf('s-1', 'A');
    const b = createLeaf('s-2', 'B');
    const root = createSplit('row', [a, b], [50, 50], 'split-1');
    useAppStore.setState({
      workspaces: [mockWorkspace],
      sessions: {
        'ws-1': [
          { id: 's-1', workspaceId: 'ws-1', title: 'A', sortOrder: 0, createdAt: '', updatedAt: '' },
          { id: 's-2', workspaceId: 'ws-1', title: 'B', sortOrder: 0, createdAt: '', updatedAt: '' },
        ],
      },
      activeWorkspaceId: 'ws-1',
      activeSessionId: 's-1',
      activeSessionByWorkspace: { 'ws-1': 's-1' },
      layoutByWorkspace: { 'ws-1': root },
      focusedPanelByWorkspace: { 'ws-1': 'A' },
      sessionActivity: {},
      toasts: [],
      initialized: true,
    });
    render(<PanelLayout />);
    const views = screen.getAllByTestId('terminal-view');
    expect(views).toHaveLength(2);
    const sessions = views.map((v) => v.getAttribute('data-session'));
    expect(sessions).toContain('s-1');
    expect(sessions).toContain('s-2');
  });

  it('renders only the focused leaf on mobile viewport', () => {
    setViewport(400);
    const a = createLeaf('s-1', 'A');
    const b = createLeaf('s-2', 'B');
    const root = createSplit('row', [a, b], [50, 50], 'split-1');
    useAppStore.setState({
      workspaces: [mockWorkspace],
      sessions: {
        'ws-1': [
          { id: 's-1', workspaceId: 'ws-1', title: 'A', sortOrder: 0, createdAt: '', updatedAt: '' },
          { id: 's-2', workspaceId: 'ws-1', title: 'B', sortOrder: 0, createdAt: '', updatedAt: '' },
        ],
      },
      activeWorkspaceId: 'ws-1',
      activeSessionId: 's-2',
      activeSessionByWorkspace: { 'ws-1': 's-2' },
      layoutByWorkspace: { 'ws-1': root },
      focusedPanelByWorkspace: { 'ws-1': 'B' },
      sessionActivity: {},
      toasts: [],
      initialized: true,
    });
    render(<PanelLayout />);
    const views = screen.getAllByTestId('terminal-view');
    expect(views).toHaveLength(1);
    expect(views[0].getAttribute('data-session')).toBe('s-2');
  });

  it('renders nothing when no workspace is active', () => {
    setViewport(1280);
    useAppStore.setState({
      workspaces: [],
      sessions: {},
      activeWorkspaceId: null,
      activeSessionId: null,
      activeSessionByWorkspace: {},
      sessionActivity: {},
      toasts: [],
      initialized: false,
      layoutByWorkspace: {},
      focusedPanelByWorkspace: {},
    });
    const { container } = render(<PanelLayout />);
    expect(container.firstChild).toBeNull();
  });
});
