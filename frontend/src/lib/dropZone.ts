import type { SplitDirection, SplitPlacement } from './panelLayout';

export type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center';

// Center area = inner 50% × 50% of the leaf rect; outside that, the
// nearest edge wins. Coordinates are normalised (0..1) relative to the
// leaf's bounding rect.
export function classifyDropZone(x: number, y: number): DropZone {
  if (x >= 0.25 && x <= 0.75 && y >= 0.25 && y <= 0.75) return 'center';
  const top = y;
  const bottom = 1 - y;
  const left = x;
  const right = 1 - x;
  const min = Math.min(top, bottom, left, right);
  if (min === top) return 'top';
  if (min === bottom) return 'bottom';
  if (min === left) return 'left';
  return 'right';
}

export function zoneToSplit(
  zone: Exclude<DropZone, 'center'>,
): { direction: SplitDirection; placement: SplitPlacement } {
  switch (zone) {
    case 'top':
      return { direction: 'column', placement: 'before' };
    case 'bottom':
      return { direction: 'column', placement: 'after' };
    case 'left':
      return { direction: 'row', placement: 'before' };
    case 'right':
      return { direction: 'row', placement: 'after' };
  }
}
