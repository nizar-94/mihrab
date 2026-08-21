import { describe, it, expect, vi } from 'vitest';
import {
  shouldFire,
  SchedulerEngine,
  shouldEnterFailureAlert,
  shouldExitFailureAlert,
  FAILURE_ALERT_THRESHOLD
} from '../src/main/scheduler/engine.js';

const schedule = { mode: 'interval', everyMinutes: 90 };
const quietHours = { enabled: true, from: '23:00', to: '07:00' };
const d = (h, m) => new Date(2026, 7, 20, h, m, 0, 0);

describe('shouldFire', () => {
  it('does not fire before the next slot', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: d(9, 0), now: d(10, 0) })).toBe(false);
  });

  it('fires once the slot is reached', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: d(9, 0), now: d(10, 30) })).toBe(true);
  });

  it('fires exactly once after a long sleep, not once per missed slot', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: d(9, 0), now: d(16, 0) })).toBe(true);
  });

  it('is suppressed during quiet hours', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: d(22, 0), now: d(23, 30) })).toBe(false);
  });

  it('fires on first run when nothing has fired yet', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: null, now: d(10, 0) })).toBe(true);
  });

  it('does not fire on first run inside quiet hours', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: null, now: d(2, 0) })).toBe(false);
  });

  it('does not fire when the clock jumps backwards', () => {
    expect(shouldFire({ schedule, quietHours, lastFiredAt: d(15, 0), now: d(10, 0) })).toBe(false);
  });
});

describe('SchedulerEngine lifecycle', () => {
  const read = () => ({ schedule, quietHours, lastFiredAt: null });
  const now = () => d(10, 0);

  function makePowerMonitor() {
    return { on: vi.fn(), removeListener: vi.fn() };
  }

  function deferred() {
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('stop() during the loader await leaves isRunning() false and attaches no resume listener', async () => {
    const powerMonitor = makePowerMonitor();
    const { promise, resolve } = deferred();
    const engine = new SchedulerEngine(read, () => {}, now, () => promise);

    const startPromise = engine.start();
    engine.stop();
    resolve({ powerMonitor });
    await startPromise;

    expect(engine.isRunning()).toBe(false);
    expect(powerMonitor.on).not.toHaveBeenCalled();
  });

  it('attaches a resume listener after start() resolves, and removes it on stop()', async () => {
    const powerMonitor = makePowerMonitor();
    const engine = new SchedulerEngine(read, () => {}, now, () => Promise.resolve({ powerMonitor }));

    await engine.start();

    expect(powerMonitor.on).toHaveBeenCalledTimes(1);
    expect(powerMonitor.on).toHaveBeenCalledWith('resume', expect.any(Function));

    engine.stop();

    expect(powerMonitor.removeListener).toHaveBeenCalledTimes(1);
    expect(powerMonitor.removeListener).toHaveBeenCalledWith('resume', expect.any(Function));
  });

  it('does not reject when the loader throws, and the timer keeps running', async () => {
    const engine = new SchedulerEngine(read, () => {}, now, () => {
      throw new Error('boom');
    });

    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.isRunning()).toBe(true);

    engine.stop();
  });

  it('start -> stop -> start results in exactly one active resume listener, not two', async () => {
    const powerMonitor = makePowerMonitor();
    const engine = new SchedulerEngine(read, () => {}, now, () => Promise.resolve({ powerMonitor }));

    await engine.start();
    const firstHandler = powerMonitor.on.mock.calls[0][1];
    engine.stop();
    await engine.start();
    const secondHandler = powerMonitor.on.mock.calls[1][1];

    expect(powerMonitor.on).toHaveBeenCalledTimes(2);
    expect(powerMonitor.removeListener).toHaveBeenCalledTimes(1);
    expect(powerMonitor.removeListener.mock.calls[0][1]).toBe(firstHandler);
    expect(firstHandler).not.toBe(secondHandler);

    engine.stop();
  });
});

describe('SchedulerEngine tick failure tracking', () => {
  const now = () => d(10, 0);
  const failingRead = () => {
    throw new Error('read failed');
  };
  const okRead = () => ({ schedule, quietHours, lastFiredAt: null });

  it('starts with consecutiveFailures at 0 on a fresh instance', () => {
    const engine = new SchedulerEngine(okRead, () => {}, now, () => Promise.resolve({}));
    expect(engine.consecutiveFailures).toBe(0);
    expect(engine.lastError).toBe(null);
  });

  it('records the error and increments consecutiveFailures after a failing tick', () => {
    const engine = new SchedulerEngine(failingRead, () => {}, now, () => Promise.resolve({}));

    engine.tick();

    expect(engine.consecutiveFailures).toBe(1);
    expect(engine.lastError).toBeInstanceOf(Error);
    expect(engine.lastError.message).toBe('read failed');
  });

  it('accumulates consecutiveFailures across repeated failing ticks', () => {
    const engine = new SchedulerEngine(failingRead, () => {}, now, () => Promise.resolve({}));

    engine.tick();
    engine.tick();
    engine.tick();

    expect(engine.consecutiveFailures).toBe(3);
  });

  it('resets consecutiveFailures and clears lastError after a successful tick', () => {
    const engine = new SchedulerEngine(failingRead, () => {}, now, () => Promise.resolve({}));

    engine.tick();
    engine.tick();
    expect(engine.consecutiveFailures).toBe(2);

    engine.read = okRead;
    engine.tick();

    expect(engine.consecutiveFailures).toBe(0);
    expect(engine.lastError).toBe(null);
  });

  it('does not let a tick failure propagate to the caller', () => {
    const engine = new SchedulerEngine(failingRead, () => {}, now, () => Promise.resolve({}));

    expect(() => engine.tick()).not.toThrow();
  });
});

describe('SchedulerEngine pause gate', () => {
  const now = () => d(10, 0);
  // schedule/lastFiredAt=null is a combination that would definitely fire
  // (shouldFire returns true on "nothing has fired yet") if not paused —
  // this isolates the pause gate itself, not shouldFire's own logic (which
  // is already covered above).
  const dueRead = (paused) => () => ({ schedule, quietHours, lastFiredAt: null, paused });

  it('does not call onFire on a tick while paused, even though shouldFire would return true', () => {
    const onFire = vi.fn();
    const engine = new SchedulerEngine(dueRead(true), onFire, now, () => Promise.resolve({}));

    engine.tick();

    expect(onFire).not.toHaveBeenCalled();
  });

  it('calls onFire on a tick when not paused under the same conditions', () => {
    const onFire = vi.fn();
    const engine = new SchedulerEngine(dueRead(false), onFire, now, () => Promise.resolve({}));

    engine.tick();

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('treats a missing paused field as not paused, so existing read() shapes without it are unaffected', () => {
    const onFire = vi.fn();
    const read = () => ({ schedule, quietHours, lastFiredAt: null });
    const engine = new SchedulerEngine(read, onFire, now, () => Promise.resolve({}));

    engine.tick();

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not advance past a failing read while paused: a broken read is still counted as a failure', () => {
    const read = () => {
      throw new Error('boom');
    };
    const engine = new SchedulerEngine(read, () => {}, now, () => Promise.resolve({}));

    engine.tick();

    expect(engine.consecutiveFailures).toBe(1);
  });

  it('resuming after a pause fires on the very next tick, since a suppressed tick never wrote lastFiredAt', () => {
    // Simulates the real flow: index.js's read() would keep returning the
    // same (unchanged) lastFiredAt while paused, because onFire (which is
    // what eventually persists a new lastFiredAt) is never reached.
    const onFire = vi.fn();
    let currentlyPaused = true;
    const read = () => ({ schedule, quietHours, lastFiredAt: null, paused: currentlyPaused });
    const engine = new SchedulerEngine(read, onFire, now, () => Promise.resolve({}));

    engine.tick(); // paused: suppressed
    expect(onFire).not.toHaveBeenCalled();

    currentlyPaused = false;
    engine.tick(); // resumed: fires immediately, as if no time had passed

    expect(onFire).toHaveBeenCalledTimes(1);
  });
});

describe('SchedulerEngine onTick hook', () => {
  const now = () => d(10, 0);
  const okRead = () => ({ schedule, quietHours, lastFiredAt: null });
  const failingRead = () => {
    throw new Error('read failed');
  };

  it('calls onTick with the engine instance after a successful tick', () => {
    const onTick = vi.fn();
    const engine = new SchedulerEngine(okRead, () => {}, now, () => Promise.resolve({}), onTick);

    engine.tick();

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(engine);
  });

  it('calls onTick after a failing tick too, with consecutiveFailures/lastError already updated', () => {
    const seen = [];
    const onTick = (eng) => seen.push({ failures: eng.consecutiveFailures, err: eng.lastError?.message });
    const engine = new SchedulerEngine(failingRead, () => {}, now, () => Promise.resolve({}), onTick);

    engine.tick();
    engine.tick();

    expect(seen).toEqual([
      { failures: 1, err: 'read failed' },
      { failures: 2, err: 'read failed' }
    ]);
  });

  it('defaults to a no-op onTick when none is provided, so the existing 4-arg construction still works', () => {
    const engine = new SchedulerEngine(okRead, () => {}, now, () => Promise.resolve({}));
    expect(() => engine.tick()).not.toThrow();
  });
});

describe('shouldEnterFailureAlert / shouldExitFailureAlert', () => {
  it('does not enter alert state below the threshold', () => {
    for (let n = 0; n < FAILURE_ALERT_THRESHOLD; n++) {
      expect(shouldEnterFailureAlert(n, false)).toBe(false);
    }
  });

  it('enters alert state exactly at the threshold', () => {
    expect(shouldEnterFailureAlert(FAILURE_ALERT_THRESHOLD, false)).toBe(true);
  });

  it('does not re-trigger once the caller is already alerting, even as failures keep climbing', () => {
    expect(shouldEnterFailureAlert(FAILURE_ALERT_THRESHOLD, true)).toBe(false);
    expect(shouldEnterFailureAlert(FAILURE_ALERT_THRESHOLD + 10, true)).toBe(false);
  });

  it('exits alert state only once failures have fully reset to zero', () => {
    expect(shouldExitFailureAlert(0, true)).toBe(true);
    expect(shouldExitFailureAlert(1, true)).toBe(false);
  });

  it('does not report an exit when the caller was never alerting', () => {
    expect(shouldExitFailureAlert(0, false)).toBe(false);
  });
});
