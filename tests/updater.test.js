import { describe, it, expect, vi } from 'vitest';
import {
  reduceUpdateState,
  initialUpdateState,
  statusLabel,
  createUpdateScheduler,
  UpdateStatus,
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS
} from '../src/main/updater.js';

describe('reduceUpdateState', () => {
  it('starts idle with no version/percent/error', () => {
    const state = initialUpdateState();
    expect(state).toEqual({ status: UpdateStatus.IDLE, version: null, percent: null, error: null, lastCheckedAt: null });
  });

  it('moves to checking and clears any previous error', () => {
    const prior = { ...initialUpdateState(), status: UpdateStatus.ERROR, error: 'boom' };
    const next = reduceUpdateState(prior, 'checking-for-update');
    expect(next.status).toBe(UpdateStatus.CHECKING);
    expect(next.error).toBe(null);
  });

  it('records the available version and clears percent/error', () => {
    const next = reduceUpdateState(initialUpdateState(), 'update-available', { version: '1.2.0' });
    expect(next.status).toBe(UpdateStatus.AVAILABLE);
    expect(next.version).toBe('1.2.0');
    expect(next.percent).toBe(null);
    expect(next.error).toBe(null);
  });

  it('falls back to null version when update-available has no payload', () => {
    const next = reduceUpdateState(initialUpdateState(), 'update-available');
    expect(next.version).toBe(null);
  });

  it('not-available resets version/percent/error and stamps lastCheckedAt', () => {
    const busy = { status: UpdateStatus.CHECKING, version: '9.9.9', percent: 40, error: null, lastCheckedAt: null };
    const next = reduceUpdateState(busy, 'update-not-available', { now: '2026-08-21T00:00:00.000Z' });
    expect(next).toEqual({
      status: UpdateStatus.NOT_AVAILABLE,
      version: null,
      percent: null,
      error: null,
      lastCheckedAt: '2026-08-21T00:00:00.000Z'
    });
  });

  it('not-available keeps the previous lastCheckedAt when no now is given', () => {
    const state = { ...initialUpdateState(), lastCheckedAt: 'earlier' };
    const next = reduceUpdateState(state, 'update-not-available', {});
    expect(next.lastCheckedAt).toBe('earlier');
  });

  it('download-progress updates percent and moves to downloading', () => {
    const next = reduceUpdateState(initialUpdateState(), 'download-progress', { percent: 42.7 });
    expect(next.status).toBe(UpdateStatus.DOWNLOADING);
    expect(next.percent).toBe(42.7);
  });

  it('download-progress keeps the last known percent when the payload omits it', () => {
    const state = { ...initialUpdateState(), status: UpdateStatus.DOWNLOADING, percent: 10 };
    const next = reduceUpdateState(state, 'download-progress', {});
    expect(next.percent).toBe(10);
  });

  it('update-downloaded sets percent to 100 and keeps the version', () => {
    const state = { ...initialUpdateState(), status: UpdateStatus.DOWNLOADING, version: '1.2.0', percent: 55 };
    const next = reduceUpdateState(state, 'update-downloaded', {});
    expect(next.status).toBe(UpdateStatus.DOWNLOADED);
    expect(next.version).toBe('1.2.0');
    expect(next.percent).toBe(100);
  });

  it('update-downloaded prefers the payload version over the prior one', () => {
    const state = { ...initialUpdateState(), version: '1.2.0' };
    const next = reduceUpdateState(state, 'update-downloaded', { version: '1.3.0' });
    expect(next.version).toBe('1.3.0');
  });

  it('error records a message and stamps lastCheckedAt', () => {
    const next = reduceUpdateState(initialUpdateState(), 'error', { message: 'ENOTFOUND', now: 't1' });
    expect(next.status).toBe(UpdateStatus.ERROR);
    expect(next.error).toBe('ENOTFOUND');
    expect(next.lastCheckedAt).toBe('t1');
  });

  it('error falls back to a generic message when none is given', () => {
    const next = reduceUpdateState(initialUpdateState(), 'error', {});
    expect(next.error).toBe('Update check failed');
  });

  it('ignores unknown events and returns the same state unchanged', () => {
    const state = initialUpdateState();
    expect(reduceUpdateState(state, 'not-a-real-event')).toEqual(state);
  });
});

describe('statusLabel', () => {
  it('has no label for idle', () => {
    expect(statusLabel(initialUpdateState())).toBe(null);
  });

  it.each([
    [UpdateStatus.CHECKING, {}, 'Checking for updates…'],
    [UpdateStatus.AVAILABLE, { version: '1.2.0' }, 'Update available (v1.2.0) — downloading…'],
    [UpdateStatus.AVAILABLE, {}, 'Update available — downloading…'],
    [UpdateStatus.DOWNLOADING, { percent: 33.2 }, 'Downloading update (33%)…'],
    [UpdateStatus.DOWNLOADING, {}, 'Downloading update…'],
    [UpdateStatus.DOWNLOADED, { version: '1.2.0' }, 'Update ready (v1.2.0) — installs next time you quit'],
    [UpdateStatus.NOT_AVAILABLE, {}, 'Muslim App is up to date'],
    [UpdateStatus.ERROR, {}, 'Update check failed — will retry automatically']
  ])('renders %s correctly', (status, extra, expected) => {
    expect(statusLabel({ ...initialUpdateState(), status, ...extra })).toBe(expected);
  });
});

describe('createUpdateScheduler', () => {
  // Fake timer functions that record what was scheduled/cleared and let the
  // test invoke callbacks directly, rather than vi.useFakeTimers()'s global
  // clock — same style as engine.test.js's injected loader/powerMonitor:
  // deterministic, no reliance on real or simulated wall-clock advancement.
  function fakeTimers() {
    let nextId = 1;
    const timeouts = new Map();
    const intervals = new Map();
    const cleared = { timeouts: [], intervals: [] };
    return {
      timeouts,
      intervals,
      cleared,
      setTimeoutFn: (fn, ms) => {
        const id = nextId++;
        // A real setTimeout callback is one-shot: the timer is already gone
        // by the time the callback body runs. Mirror that so invoking fn()
        // reflects reality instead of leaving a stale "still pending" entry.
        timeouts.set(id, { fn: () => { timeouts.delete(id); fn(); }, ms });
        return id;
      },
      setIntervalFn: (fn, ms) => {
        const id = nextId++;
        intervals.set(id, { fn, ms });
        return id;
      },
      clearTimeoutFn: (id) => {
        cleared.timeouts.push(id);
        timeouts.delete(id);
      },
      clearIntervalFn: (id) => {
        cleared.intervals.push(id);
        intervals.delete(id);
      }
    };
  }

  it('schedules exactly one timeout at the initial delay and does not check immediately', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 15_000, interval: CHECK_INTERVAL_MS });

    scheduler.start();

    expect(t.timeouts.size).toBe(1);
    expect([...t.timeouts.values()][0].ms).toBe(15_000);
    expect(checkFn).not.toHaveBeenCalled();
  });

  it('checks once when the initial delay elapses, then schedules a recurring interval', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: INITIAL_CHECK_DELAY_MS, interval: 999 });

    scheduler.start();
    const [id, { fn }] = [...t.timeouts.entries()][0];
    fn(); // simulate the initial delay elapsing

    expect(checkFn).toHaveBeenCalledTimes(1);
    expect(t.timeouts.has(id)).toBe(false); // consumed, not left dangling
    expect(t.intervals.size).toBe(1);
    expect([...t.intervals.values()][0].ms).toBe(999);
  });

  it('fires again each time the recurring interval elapses', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 1, interval: 999 });

    scheduler.start();
    [...t.timeouts.values()][0].fn();
    const intervalFn = [...t.intervals.values()][0].fn;

    intervalFn();
    intervalFn();

    expect(checkFn).toHaveBeenCalledTimes(3); // 1 initial + 2 interval firings
  });

  it('stop() before the initial delay elapses clears the timeout and never checks', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 1, interval: 999 });

    scheduler.start();
    scheduler.stop();

    expect(t.timeouts.size).toBe(0);
    expect(t.cleared.timeouts).toHaveLength(1);
    expect(checkFn).not.toHaveBeenCalled();
    expect(scheduler.isScheduled()).toBe(false);
  });

  it('stop() after the interval has started clears the interval, not just the (already-fired) timeout', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 1, interval: 999 });

    scheduler.start();
    [...t.timeouts.values()][0].fn();
    scheduler.stop();

    expect(t.intervals.size).toBe(0);
    expect(t.cleared.intervals).toHaveLength(1);
    expect(scheduler.isScheduled()).toBe(false);
  });

  it('calling start() twice never leaves two independent timers running', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 1, interval: 999 });

    scheduler.start();
    scheduler.start();

    expect(t.timeouts.size).toBe(1); // the first was cleared by the second start()
    expect(t.cleared.timeouts).toHaveLength(1);
  });

  it('isScheduled() reflects the timeout-pending and interval-running phases', () => {
    const checkFn = vi.fn();
    const t = fakeTimers();
    const scheduler = createUpdateScheduler(checkFn, { ...t, initialDelay: 1, interval: 999 });

    expect(scheduler.isScheduled()).toBe(false);
    scheduler.start();
    expect(scheduler.isScheduled()).toBe(true); // timeout pending
    [...t.timeouts.values()][0].fn();
    expect(scheduler.isScheduled()).toBe(true); // interval now running
    scheduler.stop();
    expect(scheduler.isScheduled()).toBe(false);
  });
});
