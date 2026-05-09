import { describe, it, expect, vi } from 'vitest';
import { createResizeHandler } from './useTerminal';

function makeContainer(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  // jsdom doesn't compute layout, so stub the dimensions we read.
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
  return el;
}

function makeInstance(opts?: { wsState?: number }) {
  const sentMessages: string[] = [];
  const refreshCalls: Array<[number, number]> = [];
  const fitCalls = { count: 0 };

  const fakeFitAddon = {
    fit: vi.fn(() => { fitCalls.count++; }),
    proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
  };
  const fakeTerminal = {
    rows: 24,
    refresh: vi.fn((start: number, end: number) => { refreshCalls.push([start, end]); }),
  };
  const fakeWs = opts?.wsState != null
    ? {
        readyState: opts.wsState,
        send: (data: string) => { sentMessages.push(data); },
      }
    : null;

  return {
    inst: {
      terminal: fakeTerminal as never,
      fitAddon: fakeFitAddon as never,
      ws: fakeWs as never,
    },
    sentMessages,
    refreshCalls,
    fitCalls,
  };
}

function entryFor(width: number, height: number): ResizeObserverEntry {
  return { contentRect: { width, height } } as unknown as ResizeObserverEntry;
}

describe('createResizeHandler', () => {
  it('skips fit when container has zero dimensions', () => {
    const { inst, sentMessages, fitCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(0, 0);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(0, 0)], {} as ResizeObserver);

    expect(fitCalls.count).toBe(0);
    expect(sentMessages).toEqual([]);
  });

  it('skips fit when only width is zero (display:none collapses both, but be defensive)', () => {
    const { inst, fitCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(0, 100);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(0, 100)], {} as ResizeObserver);

    expect(fitCalls.count).toBe(0);
  });

  it('fits and sends resize when container has real size and ws is open', () => {
    const { inst, sentMessages, fitCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(800, 600);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(800, 600)], {} as ResizeObserver);

    expect(fitCalls.count).toBe(1);
    expect(sentMessages).toEqual([
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
    ]);
  });

  it('does not send resize over a ws that is not open', () => {
    const { inst, sentMessages, fitCalls } = makeInstance({ wsState: WebSocket.CONNECTING });
    const container = makeContainer(800, 600);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(800, 600)], {} as ResizeObserver);

    expect(fitCalls.count).toBe(1);
    expect(sentMessages).toEqual([]);
  });

  it('forces a refresh when transitioning from hidden (0x0) to visible (>0)', () => {
    const { inst, refreshCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(800, 600);
    const handler = createResizeHandler(inst, container);

    // Step 1 — go hidden
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 0 });
    Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 0 });
    handler([entryFor(0, 0)], {} as ResizeObserver);
    expect(refreshCalls).toEqual([]);

    // Step 2 — back to visible
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 600 });
    handler([entryFor(800, 600)], {} as ResizeObserver);

    // refresh is called with (0, rows-1) so xterm repaints its full buffer
    expect(refreshCalls).toEqual([[0, 23]]);
  });

  it('does not refresh when only resizing while staying visible', () => {
    const { inst, refreshCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(800, 600);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(800, 600)], {} as ResizeObserver);
    handler([entryFor(900, 700)], {} as ResizeObserver);

    expect(refreshCalls).toEqual([]);
  });

  it('handles a hide → resize-while-hidden → show cycle by still refreshing on show', () => {
    const { inst, refreshCalls } = makeInstance({ wsState: WebSocket.OPEN });
    const container = makeContainer(800, 600);
    const handler = createResizeHandler(inst, container);

    handler([entryFor(0, 0)], {} as ResizeObserver);
    handler([entryFor(0, 0)], {} as ResizeObserver);
    handler([entryFor(800, 600)], {} as ResizeObserver);

    expect(refreshCalls).toEqual([[0, 23]]);
  });
});
