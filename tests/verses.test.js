import { describe, it, expect } from 'vitest';
import { selectIndex } from '../src/main/verses.js';
import { TOTAL_AYAHS } from '../src/main/config.js';

describe('selectIndex sequential', () => {
  it('returns the current position and advances by one', () => {
    expect(selectIndex('sequential', 0)).toEqual({ index: 0, nextPosition: 1 });
    expect(selectIndex('sequential', 41)).toEqual({ index: 41, nextPosition: 42 });
  });

  it('wraps from the final ayah back to the first', () => {
    const r = selectIndex('sequential', TOTAL_AYAHS - 1);
    expect(r.index).toBe(TOTAL_AYAHS - 1);
    expect(r.nextPosition).toBe(0);
  });
});

describe('selectIndex random', () => {
  it('uses the injected generator', () => {
    expect(selectIndex('random', 0, () => 0).index).toBe(0);
    expect(selectIndex('random', 0, () => 0.99999).index).toBe(TOTAL_AYAHS - 1);
  });

  it('never returns an out-of-range index', () => {
    for (let i = 0; i < 500; i++) {
      const { index } = selectIndex('random', 0);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TOTAL_AYAHS);
    }
  });

  it('preserves the sequential position so mode switching is lossless', () => {
    expect(selectIndex('random', 99, () => 0.5).nextPosition).toBe(99);
  });
});
