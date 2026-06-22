import { describe, it, expect } from 'vitest';
import { computeOwned, type Presence } from './sessionLock';

function p(windowId: string, focusTs: number, sessions: string[]): Presence {
  return { windowId, focusTs, sessions };
}

describe('computeOwned — per-session focus arbitration', () => {
  it('owns everything it wants when there are no peers', () => {
    const owned = computeOwned(p('me', 100, ['a', 'b', 'c']), []);
    expect([...owned].sort()).toEqual(['a', 'b', 'c']);
  });

  it('loses a contended session to a peer with newer focus', () => {
    const owned = computeOwned(p('me', 100, ['a', 'b']), [p('other', 200, ['a'])]);
    // 'a' is contended and the peer is newer → we keep only 'b'.
    expect([...owned]).toEqual(['b']);
  });

  it('keeps a contended session against a peer with older focus', () => {
    const owned = computeOwned(p('me', 300, ['a', 'b']), [p('other', 200, ['a'])]);
    expect([...owned].sort()).toEqual(['a', 'b']);
  });

  it('does not contend over sessions the peer does not want (two-monitor case)', () => {
    // Peer is newer but only wants 'x'; our 'a'/'b' are uncontended.
    const owned = computeOwned(p('me', 100, ['a', 'b']), [p('other', 999, ['x'])]);
    expect([...owned].sort()).toEqual(['a', 'b']);
  });

  it('breaks focusTs ties deterministically by windowId (higher id wins)', () => {
    const loser = computeOwned(p('aaa', 100, ['s']), [p('bbb', 100, ['s'])]);
    const winner = computeOwned(p('bbb', 100, ['s']), [p('aaa', 100, ['s'])]);
    expect([...loser]).toEqual([]); // 'aaa' < 'bbb' → loses
    expect([...winner]).toEqual(['s']); // 'bbb' > 'aaa' → wins
  });

  it('arbitrates each session independently across multiple peers', () => {
    const owned = computeOwned(p('me', 150, ['a', 'b', 'c']), [
      p('p1', 200, ['a']), // newer → takes 'a'
      p('p2', 100, ['b']), // older → we keep 'b'
      p('p3', 300, ['c', 'a']), // newer → takes 'c' (and also 'a', already lost)
    ]);
    expect([...owned]).toEqual(['b']);
  });

  it('accepts Set-valued sessions as well as arrays', () => {
    const owned = computeOwned(
      { windowId: 'me', focusTs: 100, sessions: new Set(['a', 'b']) },
      [{ windowId: 'o', focusTs: 200, sessions: new Set(['b']) }],
    );
    expect([...owned]).toEqual(['a']);
  });
});
