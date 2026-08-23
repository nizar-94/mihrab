import { describe, it, expect } from 'vitest';
import { khitmahProgress, progressFromPosition } from '../src/main/khitmah.js';
import { TOTAL_AYAHS } from '../src/main/config.js';

describe('khitmahProgress — after showing an ayah', () => {
  it('counts the ayah just shown as read', () => {
    // A bar that stays empty after you have actually read something is
    // simply wrong, so index 0 reports 1 of 6236.
    const p = khitmahProgress(0);
    expect(p.read).toBe(1);
    expect(p.total).toBe(TOTAL_AYAHS);
    expect(p.remaining).toBe(TOTAL_AYAHS - 1);
  });

  it('reports a complete khitmah on the last ayah', () => {
    const p = khitmahProgress(TOTAL_AYAHS - 1);
    expect(p.read).toBe(TOTAL_AYAHS);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it('gives one decimal place, so a single ayah moves the number', () => {
    // Whole percentages would sit unchanged for sixty readings at a time.
    expect(khitmahProgress(0).percent).toBe(0);
    expect(khitmahProgress(311).percent).toBe(5);
    expect(khitmahProgress(3117).percent).toBe(50);
    expect(Number.isInteger(khitmahProgress(1000).percent * 10)).toBe(true);
  });

  it('wraps rather than exceeding 100%', () => {
    expect(khitmahProgress(TOTAL_AYAHS).read).toBe(1);
    expect(khitmahProgress(TOTAL_AYAHS + 5).read).toBe(6);
  });

  it('treats a corrupt index as the start rather than throwing', () => {
    for (const bad of [-1, 1.5, NaN, 'x', null, undefined]) {
      expect(khitmahProgress(bad).read).toBe(1);
    }
  });

  it('never reports more read than the total', () => {
    for (const i of [0, 1, 500, 3000, TOTAL_AYAHS - 1]) {
      const p = khitmahProgress(i);
      expect(p.read).toBeLessThanOrEqual(p.total);
      expect(p.read + p.remaining).toBe(p.total);
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('progressFromPosition — the stored cursor', () => {
  it('treats a fresh install as nothing read', () => {
    // sequencePosition points at the NEXT ayah, so 0 means nothing shown
    // yet. It is also what a just-wrapped khitmah looks like; nothing-read
    // is the far commoner case and the one reported.
    const p = progressFromPosition(0);
    expect(p.read).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.remaining).toBe(TOTAL_AYAHS);
  });

  it('reports one behind the equivalent shown-index', () => {
    // After showing index 9, the stored position is 10 and 10 are read.
    expect(progressFromPosition(10).read).toBe(10);
    expect(khitmahProgress(9).read).toBe(10);
  });

  it('repairs a corrupt position', () => {
    for (const bad of [-5, 2.5, 'x', null, undefined]) {
      expect(progressFromPosition(bad).read).toBe(0);
    }
  });

  it('wraps a position past the end', () => {
    expect(progressFromPosition(TOTAL_AYAHS).read).toBe(0);
    expect(progressFromPosition(TOTAL_AYAHS + 3).read).toBe(3);
  });
});
