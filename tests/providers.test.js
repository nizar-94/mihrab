import { describe, it, expect, vi } from 'vitest';
import { dueFires, earliestFire, suppressedByQuietHours } from '../src/main/scheduler/providers.js';

const at = (iso) => new Date(iso);

/** A provider that always reports one fixed fire time. */
const fixed = (id, iso, extra = {}) => ({
  id,
  nextFire: () => ({ at: at(iso), payload: { id } }),
  ...extra
});

const SINCE = at('2026-08-23T10:00:00Z');
const NOW = at('2026-08-23T10:00:30Z');

describe('dueFires', () => {
  it('returns a provider whose fire falls inside the window', () => {
    const p = fixed('prayer', '2026-08-23T10:00:15Z');
    const due = dueFires([p], SINCE, NOW);
    expect(due).toHaveLength(1);
    expect(due[0].provider.id).toBe('prayer');
    expect(due[0].payload).toEqual({ id: 'prayer' });
  });

  it('excludes a fire in the future', () => {
    expect(dueFires([fixed('a', '2026-08-23T10:05:00Z')], SINCE, NOW)).toEqual([]);
  });

  it('excludes a fire at or before `since` — already handled', () => {
    expect(dueFires([fixed('a', '2026-08-23T10:00:00Z')], SINCE, NOW)).toEqual([]);
    expect(dueFires([fixed('a', '2026-08-23T09:59:00Z')], SINCE, NOW)).toEqual([]);
  });

  it('includes a fire exactly at `now`', () => {
    expect(dueFires([fixed('a', '2026-08-23T10:00:30Z')], SINCE, NOW)).toHaveLength(1);
  });

  it('orders by time, earliest first', () => {
    const due = dueFires([
      fixed('late', '2026-08-23T10:00:25Z'),
      fixed('early', '2026-08-23T10:00:05Z')
    ], SINCE, NOW);
    expect(due.map((d) => d.provider.id)).toEqual(['early', 'late']);
  });

  it('breaks ties by registration order, deterministically', () => {
    const due = dueFires([
      fixed('first', '2026-08-23T10:00:10Z'),
      fixed('second', '2026-08-23T10:00:10Z')
    ], SINCE, NOW);
    expect(due.map((d) => d.provider.id)).toEqual(['first', 'second']);
  });

  it('returns at most one fire per provider — no backlog burst', () => {
    // A laptop resuming after three days must not produce hundreds of
    // notifications, matching the engine's existing rule.
    const p = fixed('prayer', '2026-08-21T10:00:01Z');
    const due = dueFires([p], at('2026-08-21T10:00:00Z'), at('2026-08-24T10:00:00Z'));
    expect(due).toHaveLength(1);
  });

  it('skips a throwing provider and keeps the others', () => {
    const onError = vi.fn();
    const bad = { id: 'bad', nextFire: () => { throw new Error('boom'); } };
    const good = fixed('good', '2026-08-23T10:00:10Z');
    const due = dueFires([bad, good], SINCE, NOW, { onError });
    expect(due.map((d) => d.provider.id)).toEqual(['good']);
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
  });

  it('ignores a provider returning null or a rubbish date', () => {
    const nullish = { id: 'n', nextFire: () => null };
    const rubbish = { id: 'r', nextFire: () => ({ at: new Date('nope'), payload: {} }) };
    const notADate = { id: 'x', nextFire: () => ({ at: 'soon', payload: {} }) };
    expect(dueFires([nullish, rubbish, notADate], SINCE, NOW)).toEqual([]);
  });

  it('handles an empty or missing provider list', () => {
    expect(dueFires([], SINCE, NOW)).toEqual([]);
    expect(dueFires(undefined, SINCE, NOW)).toEqual([]);
  });
});

describe('earliestFire', () => {
  it('returns the soonest upcoming fire regardless of whether it is due', () => {
    const best = earliestFire([
      fixed('later', '2026-08-23T18:00:00Z'),
      fixed('sooner', '2026-08-23T12:00:00Z')
    ], SINCE);
    expect(best.provider.id).toBe('sooner');
  });

  it('ignores fires at or before the given instant', () => {
    expect(earliestFire([fixed('past', '2026-08-23T09:00:00Z')], SINCE)).toBeNull();
  });

  it('returns null when nothing is scheduled', () => {
    expect(earliestFire([{ id: 'n', nextFire: () => null }], SINCE)).toBeNull();
    expect(earliestFire([], SINCE)).toBeNull();
  });

  it('survives a throwing provider', () => {
    const onError = vi.fn();
    const bad = { id: 'bad', nextFire: () => { throw new Error('boom'); } };
    const best = earliestFire([bad, fixed('good', '2026-08-23T12:00:00Z')], SINCE, { onError });
    expect(best.provider.id).toBe('good');
    expect(onError).toHaveBeenCalled();
  });
});

describe('suppressedByQuietHours', () => {
  it('suppresses a provider that opts in, during quiet hours', () => {
    expect(suppressedByQuietHours({ id: 'verse', respectsQuietHours: true }, true)).toBe(true);
  });

  it('does NOT suppress prayers — they default to ignoring quiet hours', () => {
    // The failure this prevents: a user with a 23:00-07:00 window silently
    // losing Fajr and Isha, the two prayers most likely to fall inside it.
    expect(suppressedByQuietHours({ id: 'prayer' }, true)).toBe(false);
    expect(suppressedByQuietHours({ id: 'prayer', respectsQuietHours: false }, true)).toBe(false);
  });

  it('suppresses nothing outside quiet hours', () => {
    expect(suppressedByQuietHours({ id: 'verse', respectsQuietHours: true }, false)).toBe(false);
  });
});
