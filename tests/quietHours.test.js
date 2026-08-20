import { describe, it, expect } from 'vitest';
import { isWithinQuietHours } from '../src/main/scheduler/quietHours.js';

const q = { enabled: true, from: '23:00', to: '07:00' };
const at = (h, m = 0) => new Date(2026, 7, 20, h, m, 0, 0);

describe('isWithinQuietHours', () => {
  it('is true at the start boundary', () => expect(isWithinQuietHours(at(23), q)).toBe(true));
  it('is true after midnight', () => expect(isWithinQuietHours(at(3), q)).toBe(true));
  it('is true just before the end', () => expect(isWithinQuietHours(at(6, 59), q)).toBe(true));
  it('is false at the end boundary', () => expect(isWithinQuietHours(at(7), q)).toBe(false));
  it('is false at midday', () => expect(isWithinQuietHours(at(12), q)).toBe(false));

  it('handles a non-wrapping window', () => {
    const day = { enabled: true, from: '09:00', to: '17:00' };
    expect(isWithinQuietHours(at(12), day)).toBe(true);
    expect(isWithinQuietHours(at(8), day)).toBe(false);
    expect(isWithinQuietHours(at(20), day)).toBe(false);
  });

  it('is always false when disabled', () => {
    expect(isWithinQuietHours(at(3), { ...q, enabled: false })).toBe(false);
  });
});
