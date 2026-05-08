import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { terminalTheme } from '../lib/theme';

interface UseTerminalOptions {
  sessionId: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
}

const instances = new Map<string, TerminalInstance>();

export function useTerminal({ sessionId, containerRef }: UseTerminalOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | undefined>(undefined);

  const connect = useCallback((term: Terminal, sid: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/terminal/${sid}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      const fitAddon = instances.get(sid)?.fitAddon;
      if (fitAddon) {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'attached') {
            console.log('Terminal attached');
          }
        } catch {}
      }
    };

    ws.onclose = () => {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(() => {
        if (instances.has(sid)) {
          connect(term, sid);
        }
      }, 2000);
    };

    wsRef.current = ws;
    const inst = instances.get(sid);
    if (inst) inst.ws = ws;

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        ws.send(encoder.encode(data));
      }
    });

    term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          buffer[i] = data.charCodeAt(i);
        }
        ws.send(buffer);
      }
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !containerRef.current) return;

    let inst = instances.get(sessionId);

    if (!inst) {
      const terminal = new Terminal({
        theme: terminalTheme,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        allowProposedApi: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      inst = { terminal, fitAddon, ws: null };
      instances.set(sessionId, inst);
    }

    const container = containerRef.current;
    if (container.children.length === 0) {
      inst.terminal.open(container);

      try {
        inst.terminal.loadAddon(new WebglAddon());
      } catch {
        console.warn('WebGL addon failed, using canvas renderer');
      }
    }

    inst.fitAddon.fit();

    if (!inst.ws || inst.ws.readyState === WebSocket.CLOSED) {
      connect(inst.terminal, sessionId);
    }

    const resizeObserver = new ResizeObserver(() => {
      inst!.fitAddon.fit();
      const dims = inst!.fitAddon.proposeDimensions();
      if (dims && inst!.ws?.readyState === WebSocket.OPEN) {
        inst!.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [sessionId, containerRef, connect]);

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimer.current);
    };
  }, []);
}

export function disposeTerminal(sessionId: string) {
  const inst = instances.get(sessionId);
  if (inst) {
    inst.ws?.close();
    inst.terminal.dispose();
    instances.delete(sessionId);
  }
}
