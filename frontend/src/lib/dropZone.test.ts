import { describe, it, expect } from 'vitest';
import { classifyDropZone, zoneToSplit } from './dropZone';

describe('classifyDropZone', () => {
  it('returns center for points inside the 50% × 50% middle', () => {
    expect(classifyDropZone(0.5, 0.5)).toBe('center');
    expect(classifyDropZone(0.3, 0.3)).toBe('center');
    expect(classifyDropZone(0.75, 0.75)).toBe('center');
  });

  it('returns top when nearest to the top edge', () => {
    expect(classifyDropZone(0.5, 0.1)).toBe('top');
    expect(classifyDropZone(0.4, 0.05)).toBe('top');
  });

  it('returns bottom when nearest to the bottom edge', () => {
    expect(classifyDropZone(0.5, 0.95)).toBe('bottom');
    expect(classifyDropZone(0.6, 0.85)).toBe('bottom');
  });

  it('returns left when nearest to the left edge', () => {
    expect(classifyDropZone(0.05, 0.5)).toBe('left');
    expect(classifyDropZone(0.15, 0.4)).toBe('left');
  });

  it('returns right when nearest to the right edge', () => {
    expect(classifyDropZone(0.95, 0.5)).toBe('right');
    expect(classifyDropZone(0.9, 0.6)).toBe('right');
  });
});

describe('zoneToSplit', () => {
  it('maps top → column/before', () => {
    expect(zoneToSplit('top')).toEqual({ direction: 'column', placement: 'before' });
  });
  it('maps bottom → column/after', () => {
    expect(zoneToSplit('bottom')).toEqual({ direction: 'column', placement: 'after' });
  });
  it('maps left → row/before', () => {
    expect(zoneToSplit('left')).toEqual({ direction: 'row', placement: 'before' });
  });
  it('maps right → row/after', () => {
    expect(zoneToSplit('right')).toEqual({ direction: 'row', placement: 'after' });
  });
});
