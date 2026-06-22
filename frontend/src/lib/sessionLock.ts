// Cross-window, per-session interaction lock.
//
// Problem: opening Mansio in two browser windows attaches TWO tmux clients to
// the same tmux session (each WebSocket spawns its own `tmux attach-session`).
// Both clients drive their own ResizeObserver→fit→resize loop, so tmux keeps
// resizing the shared window between the two client sizes → the terminal
// flickers.
//
// Fix: at most ONE window may hold a live WebSocket for a given session at a
// time. Arbitration is per-session and focus-priority: among the windows that
// want the same session, the most-recently-focused one owns it; the others
// drop that session's socket (which detaches their tmux client, killing the
// resize fight). Windows that want *different* sessions never contend, so two
// monitors each showing a different terminal both stay live.
//
// Coordination is over a same-origin BroadcastChannel. Each Mansio subdomain is
// its own origin, so different workspaces never cross-talk. When BroadcastChannel
// is unavailable (or the lock is never initialized, e.g. in unit tests) there
// are no peers, so every window owns everything it wants — i.e. the original
// single-window behaviour, unchanged.

const CHANNEL_NAME = 'mansio-session-lock';
// How often the owning side re-announces its presence so peers keep its
// sessions alive and learn its current focus timestamp.
const HEARTBEAT_MS = 2000;
// A peer we haven't heard from in this long is treated as gone (window closed
// / crashed without a clean `bye`), freeing its sessions for takeover.
const STALE_MS = 6000;

export interface Presence {
  windowId: string;
  // Date.now() of this window's most recent focus gain. Higher wins.
  focusTs: number;
  // Sessions this window wants a live socket for (every cached terminal it
  // holds, not just the visible one — background sockets contend too).
  sessions: Iterable<string>;
}

// Pure arbitration core (exported for tests): returns the subset of `self`'s
// wanted sessions that `self` actually owns. For each wanted session, `self`
// loses it to any peer that also wants it and has a strictly newer focusTs
// (ties broken by lexicographically greater windowId so the result is
// deterministic and symmetric across windows).
export function computeOwned(self: Presence, peers: Presence[]): Set<string> {
  const owned = new Set<string>();
  const peerSets = peers.map((p) => ({
    windowId: p.windowId,
    focusTs: p.focusTs,
    sessions: p.sessions instanceof Set ? p.sessions : new Set(p.sessions),
  }));
  for (const sid of self.sessions) {
    let win = true;
    for (const p of peerSets) {
      if (!p.sessions.has(sid)) continue;
      const peerWins =
        p.focusTs > self.focusTs ||
        (p.focusTs === self.focusTs && p.windowId > self.windowId);
      if (peerWins) {
        win = false;
        break;
      }
    }
    if (win) owned.add(sid);
  }
  return owned;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ---- module state (this window) ----

const windowId =
  Math.random().toString(36).slice(2) + Date.now().toString(36);
let focusTs = 0;
const claimed = new Set<string>();
let owned: Set<string> = new Set();

interface PeerRecord {
  focusTs: number;
  sessions: Set<string>;
  lastSeen: number;
}
const peers = new Map<string, PeerRecord>();

type OwnershipListener = (owned: ReadonlySet<string>) => void;
const listeners = new Set<OwnershipListener>();

let channel: BroadcastChannel | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let initialized = false;

function peersAsPresence(): Presence[] {
  const out: Presence[] = [];
  for (const [id, p] of peers) {
    out.push({ windowId: id, focusTs: p.focusTs, sessions: p.sessions });
  }
  return out;
}

function recompute(): void {
  const next = computeOwned(
    { windowId, focusTs, sessions: claimed },
    peersAsPresence(),
  );
  if (setsEqual(next, owned)) return;
  owned = next;
  for (const cb of listeners) cb(owned);
}

interface PresenceMsg {
  type: 'presence';
  windowId: string;
  focusTs: number;
  sessions: string[];
}
interface ByeMsg {
  type: 'bye';
  windowId: string;
}
type LockMsg = PresenceMsg | ByeMsg;

function postPresence(): void {
  channel?.postMessage({
    type: 'presence',
    windowId,
    focusTs,
    sessions: [...claimed],
  } satisfies PresenceMsg);
}

// ---- public API ----

// Declare that this window wants a live socket for `sid`. Call when a terminal
// instance is (re)created. Owning is recomputed; if nobody else with newer
// focus wants it, this window owns it immediately.
export function claimSession(sid: string): void {
  if (claimed.has(sid)) return;
  claimed.add(sid);
  recompute();
  postPresence();
}

// Drop a session from this window's wanted set (terminal disposed).
export function releaseSession(sid: string): void {
  if (!claimed.delete(sid)) return;
  recompute();
  postPresence();
}

export function ownsSession(sid: string): boolean {
  return owned.has(sid);
}

export function getOwnedSessions(): ReadonlySet<string> {
  return owned;
}

export function subscribeOwnership(cb: OwnershipListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Mark this window as the most-recently-focused. It then wins every session it
// shares with other windows. Called on window focus and when the user clicks a
// paused panel's "take over" overlay.
export function takeFocus(): void {
  focusTs = Date.now();
  recompute();
  postPresence();
}

// Wire BroadcastChannel + focus/visibility/unload listeners + heartbeat.
// Call once at app startup (main.tsx). Tests don't call it, so the lock stays a
// no-op there (no peers ⇒ owns everything claimed ⇒ original behaviour).
export function initSessionLock(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // A foreground window on open should grab its sessions right away; a tab
  // opened in the background (hidden) waits until it's actually focused.
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    focusTs = Date.now();
  }

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent<LockMsg>) => {
      const m = e.data;
      if (!m || m.windowId === windowId) return;
      if (m.type === 'bye') {
        if (peers.delete(m.windowId)) recompute();
        return;
      }
      if (m.type === 'presence') {
        const isNew = !peers.has(m.windowId);
        peers.set(m.windowId, {
          focusTs: m.focusTs ?? 0,
          sessions: new Set(m.sessions ?? []),
          lastSeen: Date.now(),
        });
        recompute();
        // A newcomer doesn't know we exist yet — answer once so it can account
        // for our sessions. Bounded to O(windows): we only reply to first
        // contact, so this can't ping-pong forever.
        if (isNew) postPresence();
      }
    };
  }

  const onFocus = () => takeFocus();
  const onVisibility = () => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      (typeof document.hasFocus !== 'function' || document.hasFocus())
    ) {
      takeFocus();
    }
  };
  const onPageHide = () => {
    channel?.postMessage({ type: 'bye', windowId } satisfies ByeMsg);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  heartbeatTimer = setInterval(() => {
    postPresence();
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    for (const [id, p] of peers) {
      if (p.lastSeen < cutoff) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) recompute();
  }, HEARTBEAT_MS);

  // Announce ourselves so existing windows account for our sessions (and reply,
  // letting us learn theirs).
  postPresence();

  return () => {
    initialized = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    onPageHide();
    channel?.close();
    channel = null;
  };
}

// Test-only: wipe cross-window state so suites don't leak into each other.
// Intentionally does NOT clear `listeners` — useTerminal registers a permanent
// reconciler at import time that must survive a reset.
export function __resetSessionLockForTests(): void {
  claimed.clear();
  owned = new Set();
  peers.clear();
  focusTs = 0;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
  channel?.close();
  channel = null;
  initialized = false;
}
