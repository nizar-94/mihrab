import { nextFireAfter } from './nextFire.js';
import { isWithinQuietHours } from './quietHours.js';

export const TICK_MS = 30_000;

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

  constructor(read, onFire, now = () => new Date(), loadElectron = () => import('electron')) {
    this.read = read;
    this.onFire = onFire;
    this.now = now;
    this.loadElectron = loadElectron;
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
      if (shouldFire({ ...this.read(), now: this.now() })) this.onFire();
      this.consecutiveFailures = 0;
      this.lastError = null;
    } catch (err) {
      this.consecutiveFailures += 1;
      this.lastError = err;
      console.error('scheduler tick failed', err);
    }
  }
}
