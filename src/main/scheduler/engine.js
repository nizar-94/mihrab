import { nextFireAfter } from './nextFire.js';
import { isWithinQuietHours } from './quietHours.js';

export const TICK_MS = 30_000;

// FEATURE 3: after this many consecutive tick failures (~90s at TICK_MS =
// 30s), the failure is surfaced to the user (tray tooltip/menu + a one-time
// notification) instead of dying silently.
export const FAILURE_ALERT_THRESHOLD = 3;

// Pure decision helpers for "should the UI alert/clear right now", given the
// engine's own counters plus the caller's own "have I already alerted for
// this streak" flag. These hold no state of their own — the engine
// (consecutiveFailures / lastError) remains the sole source of truth for the
// failure counts; these functions only decide what a caller holding a
// `currentlyAlerting` flag should do about them.
export function shouldEnterFailureAlert(consecutiveFailures, currentlyAlerting) {
  return consecutiveFailures >= FAILURE_ALERT_THRESHOLD && !currentlyAlerting;
}

export function shouldExitFailureAlert(consecutiveFailures, currentlyAlerting) {
  return consecutiveFailures === 0 && currentlyAlerting;
}

export function shouldFire({ schedule, quietHours, lastFiredAt, now }) {
  if (isWithinQuietHours(now, quietHours)) return false;
  if (!lastFiredAt) return true;
  // A backwards clock jump leaves lastFiredAt in the future; wait it out
  // rather than firing repeatedly.
  if (lastFiredAt > now) return false;
  // One decision regardless of how many slots elapsed: never a backlog burst.
  return nextFireAfter(schedule, lastFiredAt) <= now;
}

export class SchedulerEngine {
  #timer = null;
  #powerMonitor = null;
  #resumeHandler = null;

  constructor(
    read,
    onFire,
    now = () => new Date(),
    loadElectron = () => import('electron'),
    // FEATURE 3: optional hook invoked after every tick (success or
    // failure) with `this`, so a caller (index.js) can react to
    // consecutiveFailures/lastError without this class needing to know
    // anything about trays or notifications. Defaults to a no-op so the
    // existing 4-argument construction used throughout the test suite is
    // unaffected.
    onTick = () => {}
  ) {
    this.read = read;
    this.onFire = onFire;
    this.now = now;
    this.loadElectron = loadElectron;
    this.onTick = onTick;
    this.consecutiveFailures = 0;
    this.lastError = null;
  }

  isRunning() {
    return this.#timer !== null;
  }

  async start() {
    this.stop();
    // Timer first: it has no electron dependency, so a stop() during the await
    // below must not be able to resurrect it.
    this.#timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    try {
      // Deferred: importing 'electron' at module scope breaks plain-Node/vitest
      // runs of shouldFire. Only start() ever needs powerMonitor, so the import
      // happens here, lazily, via an injectable loader (defaults to the real
      // dynamic import) each time start() runs.
      const { powerMonitor } = await this.loadElectron();
      if (!this.#timer) return; // stop() ran while we awaited — do not attach
      this.#powerMonitor = powerMonitor;
      this.#resumeHandler = () => this.tick();
      powerMonitor.on('resume', this.#resumeHandler);
    } catch (err) {
      // Never reject: a rejected start() would become an unhandled rejection
      // if the caller (Task 8) does not await/catch it.
      console.error('scheduler: could not attach resume listener', err);
    }
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#powerMonitor && this.#resumeHandler) {
      this.#powerMonitor.removeListener('resume', this.#resumeHandler);
    }
    this.#resumeHandler = null;
    this.#powerMonitor = null;
  }

  tick() {
    // A throw here must never kill the interval.
    try {
      const state = this.read();
      // FEATURE 2: pause is a hard gate checked here, not folded into
      // shouldFire — shouldFire stays a pure scheduling decision (quiet
      // hours + next-slot math) with no notion of "paused". Gating before
      // shouldFire is called means onFire() (and therefore fire()'s
      // lastFiredAt write, which happens in index.js only once showVerse's
      // callback confirms the verse is actually on screen) is never reached
      // while paused. lastFiredAt cannot advance during a pause, so
      // resuming later behaves exactly as if no time had passed for
      // scheduling purposes, rather than the scheduler believing it fired
      // throughout the pause.
      if (!state.paused && shouldFire({ ...state, now: this.now() })) this.onFire();
      this.consecutiveFailures = 0;
      this.lastError = null;
    } catch (err) {
      this.consecutiveFailures += 1;
      this.lastError = err;
      console.error('scheduler tick failed', err);
    } finally {
      this.onTick(this);
    }
  }
}
