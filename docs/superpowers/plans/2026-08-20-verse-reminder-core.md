# Verse Reminder Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Electron app that boots to the system tray and shows a Quran verse in a custom notification window on a user-configured schedule, with sound and a settings screen.

**Architecture:** The main process is the entire application; renderers are transient windows created on demand and destroyed on close. All scheduling, selection, and validation logic lives in the main process as pure, clock-injected functions so it is unit-testable without launching Electron.

**Tech Stack:** Electron, electron-vite, plain JavaScript (ESM), electron-store, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-mihrab-v1-design.md`

---

## STATUS — Plan 1 complete (2026-08-20)

All 9 tasks implemented, each individually reviewed, plus a final whole-project
review and a fix wave. **76/76 tests passing.** Verified running on real hardware:
the app boots to tray, fires on schedule, and renders verses in Amiri Quran with
correct RTL and tashkeel.

| # | Task | Status |
|---|------|--------|
| 1 | Scaffold and boot to tray | Done (1 fix round) |
| 2 | Config store with migrations | Done (1 fix round) |
| 3 | Quiet hours | Done |
| 4 | Next-fire computation | Done |
| 5 | Verse selection + Quran dataset | Done — dataset independently verified |
| 6 | Scheduler engine | Done (1 fix round) |
| 7 | Notification window | Done (after one abnormal agent termination) |
| 8 | Wire the loop together | Done |
| 9 | Settings window + validation gap | Done |
| — | Final review fix wave | Done |

### Deliberately deferred by the user

- **No LICENSE file.** Without one, default copyright applies and nobody may
  legally fork or contribute. `package.json` still says `ISC` from `npm init -y`.
  Must be settled before the repo goes public.

### Known defects — logged, not fixed (carry into Plan 2)

1. **Long ayahs overflow the notification window.** Confirmed visually: the
   fixed 420×260 window produces a scrollbar for long verses (e.g. At-Tawbah 42),
   which is useless on a card that auto-dismisses in 15s. Ayat al-Kursi is far
   worse. Needs content-sized height, a smaller font for long verses, or both.
2. **Short ayahs leave a large transparent gap.** The card auto-heights inside a
   fixed 260px window, so the visible card floats well above the taskbar.
   Same root cause as (1): the window does not size to its content.
3. **`fire()` mutates state before the concurrency guard.** It persists
   `sequencePosition`, then calls `showVerse()`, which early-returns if a card is
   already showing — so a second fire inside the display window silently SKIPS an
   ayah in sequential mode. Spec §7 promises the user never loses their place.
4. **`showVerse` can wedge permanently** if `loadFile` fails or `ready-to-show`
   never fires: `current` stays non-null and every future verse is suppressed.
   The `loadFile` promise is unhandled.
5. **`notification.durationMs` is unvalidated** — the one config field not
   hardened. A non-numeric value makes `setTimeout(close, NaN)` fire instantly.
6. **Spec §9 items never built and never listed as deferred:** the notification
   pin control and the slide-in animation.

### Test gaps worth closing early

1. **The Quran dataset has no regression test.** Its integrity was verified once,
   by hand. Wrong Quran text is this project's worst possible defect and nothing
   currently guards it. ~5 lines: assert 6236 entries, index 0 = Al-Fatiha 1,
   index 6235 = An-Nas 6.
2. **`shouldFire` is only ever tested in `interval` mode** — never against
   `minuteOfHour` or `dailyTimes`, and `dailyTimes` is the mode whose next fire
   can land tomorrow.
3. **No DST regression test.** The interval/wall-clock asymmetry was verified
   empirically by a reviewer but is not locked in by any test, so a future
   "cleanup" unifying the two approaches would pass all 76 tests.
4. `notifier.js` pause/resume arithmetic is untested (welded to `BrowserWindow`).
5. `validate.test.js` asserts only `.ok === false`, never the error string.

### Still to verify manually

- The tray icon has never been seen — Windows' notification area would not expose
  its icons to automation. Check it, including behind the hidden-icons chevron.
- The chime has never been heard. The file is valid and `play()` resolves.
- Idle memory measured at **~200 MB private / ~410 MB working set**, zero
  renderers when idle. The destroy-on-close design works; this is the Electron
  tray-app floor.

## Global Constraints

- **The user performs all commits.** Every task ends at a Checkpoint with a suggested message. Stop there; do not run `git commit`.
- **Plain JavaScript, ESM, no TypeScript.** Use JSDoc typedefs where a shape is non-obvious. No build-time type checking.
- **No scheduling, selection, or validation logic in any renderer.** Renderers read and write config over IPC only. The app must be fully functional with zero windows open.
- **Windows are destroyed, never hidden.** Idle steady state is zero renderer processes.
- **All time logic takes an injected `now` Date.** No module calls `new Date()` internally except the engine's tick and `fire()`.
- **Local wall-clock time only.** No UTC conversion anywhere in scheduling. The original Lambda's bug was mixing the two.
- **`contextIsolation: true`, `nodeIntegration: false`** on every window, without exception.
- **Config written by a renderer is always re-validated in the main process.** Never trust the form.
- Node 20+, Electron 32+.

---

## File Structure

```
src/main/
  index.js              app bootstrap, single-instance lock, IPC wiring
  config.js             electron-store, defaults, migrate(), JSDoc shapes
  validate.js           PURE: schedule/quietHours/sound validation
  quran.js              dataset load + ayah lookup by flat index
  verses.js             selection: random | sequential
  scheduler/
    quietHours.js       PURE: is a time suppressed?
    nextFire.js         PURE: (schedule, after) -> next Date
    engine.js           tick loop, powerMonitor, missed-fire policy
  windows.js            window factory (notification + settings)
  notifier.js           spawn/position/dismiss notification windows
  tray.js               tray icon and menu
src/preload/
  notification.js       contextBridge for the notification renderer
  settings.js           contextBridge for the settings renderer
src/renderer/
  notification/         index.html, main.js
  settings/             index.html, main.js
resources/
  quran-uthmani.json    Tanzil, CC-BY 3.0
  fonts/                Amiri Quran (SIL OFL)
  sounds/notify.mp3     CC0 — see spec open item 3
  icons/tray.png
tests/
  config.test.js  validate.test.js  quietHours.test.js
  nextFire.test.js  verses.test.js  engine.test.js
```

---

### Task 1: Scaffold and boot to tray

**Files:**
- Create: `package.json`, `electron.vite.config.js`, `vitest.config.js`
- Create: `src/main/index.js`, `src/main/tray.js`
- Create: `resources/icons/tray.png` (16x16 and 32x32)

**Interfaces:**
- Consumes: nothing
- Produces: `createTray(handlers)` where `handlers = { onShowNow, onSettings, onQuit }`, returns a `Tray`

- [ ] **Step 1: Initialise the project**

```bash
cd C:/Users/AZ/projects/mihrab
npm init -y
npm i electron electron-store
npm i -D electron-vite electron-builder vitest
```

- [ ] **Step 2: Set up `package.json`**

```json
{
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Create `electron.vite.config.js`**

```js
import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('src/main/index.js') } } },
  preload: {
    build: {
      rollupOptions: {
        input: {
          notification: resolve('src/preload/notification.js'),
          settings: resolve('src/preload/settings.js')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          notification: resolve('src/renderer/notification/index.html'),
          settings: resolve('src/renderer/settings/index.html')
        }
      }
    }
  }
});
```

- [ ] **Step 4: Write `src/main/tray.js`**

```js
import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'path';

export function createTray(handlers) {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icons/tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('Mihrab');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show verse now', click: handlers.onShowNow },
    { label: 'Settings', click: handlers.onSettings },
    { type: 'separator' },
    { label: 'Quit', click: handlers.onQuit }
  ]));
  return tray;
}
```

- [ ] **Step 5: Write `src/main/index.js`**

The single-instance lock matters: an autostart app the user also clicks must not run twice and fire duplicate verses.

```js
import { app } from 'electron';
import { createTray } from './tray.js';

let tray = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.nizar.mihrab');

  app.whenReady().then(() => {
    tray = createTray({
      onShowNow: () => console.log('show now'),
      onSettings: () => console.log('settings'),
      onQuit: () => app.quit()
    });
  });

  // A tray app must survive all windows closing.
  app.on('window-all-closed', (e) => e.preventDefault());
}
```

- [ ] **Step 6: Run it**

Run: `npm run dev`
Expected: no window appears, a tray icon is present, "Quit" exits, and no taskbar entry exists.

- [ ] **Step 7: Checkpoint**

Suggested message: `feat: scaffold electron app with tray and single-instance lock`

---

### Task 2: Config store with migrations

**Files:**
- Create: `src/main/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `TOTAL_AYAHS`, `DEFAULT_CONFIG`, `migrate(raw)`, `getConfig()`, `setConfig(patch)`

- [ ] **Step 1: Write the failing test**

```js
// tests/config.test.js
import { describe, it, expect } from 'vitest';
import { migrate, DEFAULT_CONFIG, TOTAL_AYAHS } from '../src/main/config.js';

describe('migrate', () => {
  it('returns defaults for empty input', () => {
    expect(migrate({})).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults for corrupt input', () => {
    expect(migrate(null)).toEqual(DEFAULT_CONFIG);
    expect(migrate('garbage')).toEqual(DEFAULT_CONFIG);
  });

  it('preserves known values', () => {
    const r = migrate({ version: 1, verseOrder: 'sequential', sequencePosition: 42 });
    expect(r.verseOrder).toBe('sequential');
    expect(r.sequencePosition).toBe(42);
  });

  it('fills missing keys without discarding present ones', () => {
    const r = migrate({ version: 1, sequencePosition: 7 });
    expect(r.sequencePosition).toBe(7);
    expect(r.schedule).toEqual(DEFAULT_CONFIG.schedule);
  });

  it('clamps an out-of-range sequencePosition', () => {
    expect(migrate({ sequencePosition: 99999 }).sequencePosition).toBe(0);
    expect(migrate({ sequencePosition: -5 }).sequencePosition).toBe(0);
    expect(migrate({ sequencePosition: 1.5 }).sequencePosition).toBe(0);
  });

  it('rejects an unknown verseOrder', () => {
    expect(migrate({ verseOrder: 'sideways' }).verseOrder).toBe('random');
  });

  it('deep-merges nested objects', () => {
    const r = migrate({ sound: { volume: 0.9 } });
    expect(r.sound.volume).toBe(0.9);
    expect(r.sound.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk npx vitest run tests/config.test.js`
Expected: FAIL — cannot resolve `../src/main/config.js`.

- [ ] **Step 3: Write `src/main/config.js`**

`migrate` is exported separately from the store so it is testable without Electron.

```js
import Store from 'electron-store';

export const TOTAL_AYAHS = 6236;

/**
 * @typedef {{mode:'interval', everyMinutes:number}
 *          |{mode:'minuteOfHour', minutes:number[]}
 *          |{mode:'dailyTimes', times:string[]}} Schedule
 * @typedef {{enabled:boolean, from:string, to:string}} QuietHours
 */

export const DEFAULT_CONFIG = {
  version: 1,
  schedule: { mode: 'interval', everyMinutes: 90 },
  quietHours: { enabled: true, from: '23:00', to: '07:00' },
  verseOrder: 'random',
  sequencePosition: 0,
  translation: { id: null, downloadedAt: null },
  sound: { enabled: true, volume: 0.5 },
  notification: { durationMs: 15000, position: 'bottom-right' },
  startWithWindows: false,
  lastFiredAt: null
};

const VALID_MODES = ['interval', 'minuteOfHour', 'dailyTimes'];

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_CONFIG);
  const merged = {
    ...DEFAULT_CONFIG,
    ...raw,
    quietHours: { ...DEFAULT_CONFIG.quietHours, ...(raw.quietHours ?? {}) },
    translation: { ...DEFAULT_CONFIG.translation, ...(raw.translation ?? {}) },
    sound: { ...DEFAULT_CONFIG.sound, ...(raw.sound ?? {}) },
    notification: { ...DEFAULT_CONFIG.notification, ...(raw.notification ?? {}) }
  };
  const pos = merged.sequencePosition;
  if (!Number.isInteger(pos) || pos < 0 || pos >= TOTAL_AYAHS) merged.sequencePosition = 0;
  if (merged.verseOrder !== 'sequential') merged.verseOrder = 'random';
  // Schedule is a discriminated union — never deep-merge it, or a dailyTimes
  // schedule laid over the interval default yields an object carrying both
  // `everyMinutes` and `times`. Validate the mode and replace wholesale.
  // A corrupt mode reaching nextFireAfter would throw inside the engine's
  // try/catch, silently stopping reminders forever (spec §12).
  if (!merged.schedule || !VALID_MODES.includes(merged.schedule.mode)) {
    merged.schedule = structuredClone(DEFAULT_CONFIG.schedule);
  }
  merged.version = 1;
  return merged;
}

const store = new Store({ defaults: { config: DEFAULT_CONFIG } });

export function getConfig() {
  return migrate(store.get('config'));
}

export function setConfig(patch) {
  store.set('config', { ...getConfig(), ...patch });
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run tests/config.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Checkpoint**

Suggested message: `feat: add config store with schema validation and migrations`

---

### Task 3: Quiet hours (pure)

**Files:**
- Create: `src/main/scheduler/quietHours.js`
- Test: `tests/quietHours.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `toMinutes(hhmm)` (reused by Task 4), `isWithinQuietHours(now, q)`

- [ ] **Step 1: Write the failing test**

The wrap-around case (23:00→07:00) is the whole point of this module.

```js
// tests/quietHours.test.js
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk npx vitest run tests/quietHours.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/scheduler/quietHours.js`**

```js
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinQuietHours(now, q) {
  if (!q.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(q.from);
  const to = toMinutes(q.to);
  // A wrapping window (23:00 -> 07:00) spans midnight.
  return from > to ? cur >= from || cur < to : cur >= from && cur < to;
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run tests/quietHours.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Checkpoint**

Suggested message: `feat: add quiet hours with midnight wrap handling`

---

### Task 4: Next-fire computation (pure) — the critical module

**Files:**
- Create: `src/main/scheduler/nextFire.js`
- Test: `tests/nextFire.test.js`

**Interfaces:**
- Consumes: `toMinutes` from `./quietHours.js`
- Produces: `nextFireAfter(schedule, after)` → `Date`

Contract: returns the earliest fire time **strictly after** `after`. Never returns
`after` itself, so one slot can never fire twice.

- [ ] **Step 1: Write the failing test**

```js
// tests/nextFire.test.js
import { describe, it, expect } from 'vitest';
import { nextFireAfter } from '../src/main/scheduler/nextFire.js';

const d = (h, m) => new Date(2026, 7, 20, h, m, 0, 0);

describe('interval mode', () => {
  const s = { mode: 'interval', everyMinutes: 90 };

  it('anchors to local midnight, not to the current time', () => {
    expect(nextFireAfter(s, d(0, 10))).toEqual(d(1, 30));
  });

  it('advances to the next slot mid-day', () => {
    expect(nextFireAfter(s, d(4, 0))).toEqual(d(4, 30));
  });

  it('returns the next slot, never the current instant', () => {
    expect(nextFireAfter(s, d(1, 30))).toEqual(d(3, 0));
  });

  it('rolls over to the next day', () => {
    expect(nextFireAfter(s, d(23, 30))).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0));
  });
});

describe('minuteOfHour mode', () => {
  const s = { mode: 'minuteOfHour', minutes: [25, 55] };

  it('picks the next minute within the hour', () => {
    expect(nextFireAfter(s, d(9, 10))).toEqual(d(9, 25));
    expect(nextFireAfter(s, d(9, 30))).toEqual(d(9, 55));
  });

  it('rolls into the next hour', () => {
    expect(nextFireAfter(s, d(9, 55))).toEqual(d(10, 25));
  });

  it('sorts unsorted input', () => {
    expect(nextFireAfter({ mode: 'minuteOfHour', minutes: [55, 25] }, d(9, 10))).toEqual(d(9, 25));
  });

  it('rolls across midnight', () => {
    expect(nextFireAfter(s, d(23, 55))).toEqual(new Date(2026, 7, 21, 0, 25, 0, 0));
  });
});

describe('dailyTimes mode', () => {
  const s = { mode: 'dailyTimes', times: ['09:00', '14:30', '20:00'] };

  it('picks the next time today', () => {
    expect(nextFireAfter(s, d(10, 0))).toEqual(d(14, 30));
  });

  it('rolls to tomorrow after the last time', () => {
    expect(nextFireAfter(s, d(21, 0))).toEqual(new Date(2026, 7, 21, 9, 0, 0, 0));
  });

  it('sorts unsorted input', () => {
    expect(nextFireAfter({ mode: 'dailyTimes', times: ['20:00', '09:00'] }, d(0, 0))).toEqual(d(9, 0));
  });

  it('uses wall-clock construction so DST cannot shift the hour', () => {
    const r = nextFireAfter(s, new Date(2026, 2, 28, 23, 0, 0, 0));
    expect(r.getHours()).toBe(9);
    expect(r.getMinutes()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk npx vitest run tests/nextFire.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/scheduler/nextFire.js`**

Note the deliberate split: `dailyTimes` and `minuteOfHour` build dates from
**wall-clock components** so DST cannot shift them, while `interval` uses elapsed
milliseconds because it genuinely means "every N minutes of real time".

```js
import { toMinutes } from './quietHours.js';

function startOfLocalDay(t) {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
}

function nextInterval(everyMinutes, after) {
  const midnight = startOfLocalDay(after);
  const elapsed = (after.getTime() - midnight.getTime()) / 60000;
  const slot = Math.floor(elapsed / everyMinutes) + 1;
  const candidate = new Date(midnight.getTime() + slot * everyMinutes * 60000);
  // Past the end of the day, re-anchor to the next day's midnight.
  const tomorrow = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1);
  return candidate >= tomorrow ? tomorrow : candidate;
}

function nextMinuteOfHour(minutes, after) {
  const sorted = [...minutes].sort((a, b) => a - b);
  const m = sorted.find((x) => x > after.getMinutes());
  if (m !== undefined) {
    return new Date(after.getFullYear(), after.getMonth(), after.getDate(), after.getHours(), m, 0, 0);
  }
  return new Date(
    after.getFullYear(), after.getMonth(), after.getDate(), after.getHours() + 1, sorted[0], 0, 0
  );
}

function nextDailyTime(times, after) {
  const sorted = [...times].sort((a, b) => toMinutes(a) - toMinutes(b));
  const cur = after.getHours() * 60 + after.getMinutes();
  const today = sorted.find((t) => toMinutes(t) > cur);
  const pick = today ?? sorted[0];
  const [h, mi] = pick.split(':').map(Number);
  return new Date(after.getFullYear(), after.getMonth(), after.getDate() + (today ? 0 : 1), h, mi, 0, 0);
}

export function nextFireAfter(schedule, after) {
  switch (schedule.mode) {
    case 'interval': return nextInterval(schedule.everyMinutes, after);
    case 'minuteOfHour': return nextMinuteOfHour(schedule.minutes, after);
    case 'dailyTimes': return nextDailyTime(schedule.times, after);
    default: throw new Error(`Unknown schedule mode: ${schedule.mode}`);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run tests/nextFire.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Checkpoint**

Suggested message: `feat: add next-fire computation for all three schedule modes`

---

### Task 5: Verse selection

**Files:**
- Create: `src/main/verses.js`, `src/main/quran.js`
- Create: `resources/quran-uthmani.json`
- Test: `tests/verses.test.js`

**Interfaces:**
- Consumes: `TOTAL_AYAHS` from `./config.js`
- Produces: `selectIndex(order, position, rand?)` → `{ index, nextPosition }`; `getAyah(index)` → `{ index, surahNumber, surahName, ayahNumber, text }`

- [ ] **Step 1: Obtain the dataset**

Download the Tanzil Uthmani text and convert it to a flat JSON array of 6,236
entries at `resources/quran-uthmani.json`, each
`{ surahNumber, surahName, ayahNumber, text }`. The array index **is** the flat
ayah index used everywhere else. Record the source URL and the CC-BY 3.0 notice
in `NOTICE` at the repo root.

- [ ] **Step 2: Write the failing test**

`rand` is injected so randomness is testable without mocking globals.

```js
// tests/verses.test.js
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `rtk npx vitest run tests/verses.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/main/verses.js`**

```js
import { TOTAL_AYAHS } from './config.js';

export function selectIndex(order, position, rand = Math.random) {
  if (order === 'sequential') {
    const index = position % TOTAL_AYAHS;
    return { index, nextPosition: (index + 1) % TOTAL_AYAHS };
  }
  // Random must not disturb the saved sequential position.
  return { index: Math.floor(rand() * TOTAL_AYAHS), nextPosition: position };
}
```

- [ ] **Step 5: Write `src/main/quran.js`**

```js
import { readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

let cache = null;

function load() {
  if (!cache) {
    cache = JSON.parse(readFileSync(join(app.getAppPath(), 'resources/quran-uthmani.json'), 'utf8'));
  }
  return cache;
}

export function getAyah(index) {
  const row = load()[index];
  if (!row) throw new Error(`Ayah index out of range: ${index}`);
  return { index, ...row };
}
```

- [ ] **Step 6: Run the tests**

Run: `rtk npx vitest run tests/verses.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 7: Checkpoint**

Suggested message: `feat: add quran dataset loading and random/sequential verse selection`

---

### Task 6: Scheduler engine

**Files:**
- Create: `src/main/scheduler/engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- Consumes: `nextFireAfter`, `isWithinQuietHours`
- Produces: `shouldFire({ schedule, quietHours, lastFiredAt, now })` → boolean; `class SchedulerEngine { start(), stop() }`

The decision is a pure function; the class only supplies time and wiring. That is
what makes sleep, DST, and clock-jump behaviour testable without a running app.

- [ ] **Step 1: Write the failing test**

```js
// tests/engine.test.js
import { describe, it, expect } from 'vitest';
import { shouldFire } from '../src/main/scheduler/engine.js';

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk npx vitest run tests/engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/scheduler/engine.js`**

Note: `electron` is imported lazily inside `start()`, not at module scope, so the
pure `shouldFire` export stays importable under plain Node with no Electron
present. That is what keeps this module unit-testable.

```js
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
      const { powerMonitor } = await this.loadElectron();
      if (!this.#timer) return; // stop() ran while awaiting — do not attach
      this.#powerMonitor = powerMonitor;
      this.#resumeHandler = () => this.tick();
      powerMonitor.on('resume', this.#resumeHandler);
    } catch (err) {
      // Never reject. Callers do not await start(), so a rejection would become
      // an unhandled rejection and take the whole app down with it.
      console.error('scheduler: could not attach resume listener', err);
    }
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    // The listener must be detached explicitly, or every start() leaks one more
    // and each fires tick() independently on resume.
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
    } catch (err) {
      console.error('scheduler tick failed', err);
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run tests/engine.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite**

Run: `rtk npx vitest run`
Expected: PASS — all tests from Tasks 2–6.

- [ ] **Step 6: Checkpoint**

Suggested message: `feat: add scheduler engine with sleep and clock-jump handling`

---

### Task 7: Notification window

**Files:**
- Create: `src/main/windows.js`, `src/main/notifier.js`, `src/preload/notification.js`
- Create: `src/renderer/notification/index.html`, `src/renderer/notification/main.js`
- Create: `resources/fonts/AmiriQuran.ttf`, `resources/sounds/notify.mp3`

**Interfaces:**
- Consumes: an `ayah` object from `quran.js`, an `AppConfig` from `config.js`
- Produces: `createNotificationWindow()`; `showVerse(ayah, cfg)`; `registerNotifierIpc()`

- [ ] **Step 1: Write `src/main/windows.js`**

`focusable: false` is the critical flag — without it the window steals focus from
whatever the user is typing in, which makes the app hostile to use.

```js
import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

const WIDTH = 420;
const HEIGHT = 260;
const MARGIN = 16;

export function createNotificationWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: x + width - WIDTH - MARGIN,
    y: y + height - HEIGHT - MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/notification.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  return win;
}
```

- [ ] **Step 2: Write `src/preload/notification.js`**

```js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('verseAPI', {
  onVerse: (cb) => ipcRenderer.on('verse:show', (_e, payload) => cb(payload)),
  dismiss: () => ipcRenderer.send('verse:dismiss'),
  pauseTimer: () => ipcRenderer.send('verse:pause'),
  resumeTimer: () => ipcRenderer.send('verse:resume')
});
```

- [ ] **Step 3: Write `src/main/notifier.js`**

One verse at a time — a concurrent fire is ignored, not stacked.

```js
import { ipcMain } from 'electron';
import { join } from 'path';
import { createNotificationWindow } from './windows.js';

let current = null;
let dismissTimer = null;
let remainingMs = 0;
let startedAt = 0;

function close() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
  if (current && !current.isDestroyed()) current.destroy();
  current = null;
}

function arm(ms) {
  remainingMs = ms;
  startedAt = Date.now();
  dismissTimer = setTimeout(close, ms);
}

export function registerNotifierIpc() {
  ipcMain.on('verse:dismiss', close);
  ipcMain.on('verse:pause', () => {
    if (!dismissTimer) return;
    clearTimeout(dismissTimer);
    dismissTimer = null;
    remainingMs -= Date.now() - startedAt;
  });
  ipcMain.on('verse:resume', () => {
    if (!dismissTimer && current) arm(Math.max(remainingMs, 1000));
  });
}

export function showVerse(ayah, cfg) {
  if (current) return;
  current = createNotificationWindow();
  current.on('closed', () => { current = null; });
  current.loadFile(join(import.meta.dirname, '../renderer/notification/index.html'));
  current.once('ready-to-show', () => {
    current.showInactive(); // show without taking focus
    current.webContents.send('verse:show', { ayah, sound: cfg.sound });
    arm(cfg.notification.durationMs);
  });
}
```

- [ ] **Step 4: Write `src/renderer/notification/index.html`**

```html
<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; font-src 'self'" />
  <style>
    @font-face { font-family: 'Amiri Quran'; src: url('../../../resources/fonts/AmiriQuran.ttf'); }
    body { margin: 0; font-family: system-ui; background: transparent; user-select: none; }
    .card {
      margin: 8px; padding: 20px; border-radius: 12px;
      background: #12261fee; color: #f4f1e8;
      box-shadow: 0 8px 32px #0007; cursor: pointer;
    }
    .ayah { font-family: 'Amiri Quran', serif; font-size: 22px; line-height: 2; }
    .ref { margin-top: 12px; font-size: 13px; opacity: .7; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="ayah" id="ayah"></div>
    <div class="ref" id="ref"></div>
  </div>
  <audio id="chime" src="../../../resources/sounds/notify.mp3" preload="auto"></audio>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write `src/renderer/notification/main.js`**

```js
const card = document.getElementById('card');

window.verseAPI.onVerse(({ ayah, sound }) => {
  document.getElementById('ayah').textContent = ayah.text;
  document.getElementById('ref').textContent = `${ayah.surahName} — الآية ${ayah.ayahNumber}`;
  if (sound.enabled) {
    const chime = document.getElementById('chime');
    chime.volume = sound.volume;
    // Audio failure must never break the notification.
    chime.play().catch(() => {});
  }
});

card.addEventListener('click', () => window.verseAPI.dismiss());
card.addEventListener('mouseenter', () => window.verseAPI.pauseTimer());
card.addEventListener('mouseleave', () => window.verseAPI.resumeTimer());
```

- [ ] **Step 6: Verify manually**

Temporarily wire the tray's "Show verse now" to `showVerse(getAyah(0), getConfig())`.
Run `npm run dev`, click it, and confirm all of:
- The card appears bottom-right and plays the sound once.
- **Typing in another app continues uninterrupted** while it appears.
- Hovering stops the countdown; leaving resumes it.
- Clicking dismisses it.
- Clicking the tray item twice does not open two windows.
- On a second monitor, it appears on the monitor holding the cursor.

- [ ] **Step 7: Checkpoint**

Suggested message: `feat: add custom notification window with sound and hover-pause`

---

### Task 8: Wire the loop together

**Files:**
- Modify: `src/main/index.js`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces: `fire()` — used by both the tray and the scheduler

- [ ] **Step 1: Rewrite `src/main/index.js`**

```js
import { app } from 'electron';
import { createTray } from './tray.js';
import { getConfig, setConfig } from './config.js';
import { selectIndex } from './verses.js';
import { getAyah } from './quran.js';
import { showVerse, registerNotifierIpc } from './notifier.js';
import { SchedulerEngine } from './scheduler/engine.js';

let tray = null;
let engine = null;

export function fire() {
  const cfg = getConfig();
  const { index, nextPosition } = selectIndex(cfg.verseOrder, cfg.sequencePosition);
  // Persist position and lastFiredAt BEFORE showing, so a crash mid-display
  // cannot replay the same ayah or double-fire the slot.
  setConfig({ sequencePosition: nextPosition, lastFiredAt: new Date().toISOString() });
  showVerse(getAyah(index), cfg);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.nizar.mihrab');

  app.whenReady().then(() => {
    registerNotifierIpc();
    tray = createTray({
      onShowNow: fire,
      onSettings: () => console.log('settings'),
      onQuit: () => app.quit()
    });

    engine = new SchedulerEngine(() => {
      const c = getConfig();
      return {
        schedule: c.schedule,
        quietHours: c.quietHours,
        lastFiredAt: c.lastFiredAt ? new Date(c.lastFiredAt) : null
      };
    }, fire);
    engine.start();
  });

  app.on('window-all-closed', (e) => e.preventDefault());
}
```

- [ ] **Step 2: Verify the schedule end to end**

Edit the config file in `userData` so `schedule` is
`{ "mode": "minuteOfHour", "minutes": [0,1,2, ... ,59] }`, then run `npm run dev`.
Expected: a verse each minute; `sequencePosition` advances in the config file when
`verseOrder` is `sequential`; nothing fires inside quiet hours.

- [ ] **Step 3: Verify sleep recovery**

Sleep the machine longer than one interval, then wake it.
Expected: exactly **one** verse shortly after resume — not one per missed slot.

- [ ] **Step 4: Measure idle memory**

With no notification showing, check Task Manager for the app's total across
processes. Record it in spec section 3 (open item 5). Confirm **no renderer
process is resident** while idle.

- [ ] **Step 5: Run the full suite**

Run: `rtk npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 6: Checkpoint**

Suggested message: `feat: wire scheduler to verse selection and notification display`

---

### Task 9: Settings window

**Files:**
- Create: `src/main/validate.js`
- Create: `src/preload/settings.js`
- Create: `src/renderer/settings/index.html`, `src/renderer/settings/main.js`
- Modify: `src/main/windows.js` (add `createSettingsWindow`)
- Modify: `src/main/index.js` (IPC handlers, tray wiring)
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG`, `TOTAL_AYAHS` from `./config.js`
- Produces: `validateSchedule(s)`, `validateQuietHours(q)`, `validateSound(s)` — each returns `{ ok: true, value }` or `{ ok: false, error }`

**Design note:** the implementing agent should invoke the `frontend-design` skill
before writing the settings HTML/CSS. The form below defines structure and
behaviour, not visual design.

- [ ] **Step 1: Write the failing test**

Validation is the guard between an untrusted form and a scheduler that must never
receive `everyMinutes: 0` — that would make `nextInterval` divide by zero and spin.

```js
// tests/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateSchedule, validateQuietHours, validateSound } from '../src/main/validate.js';

describe('validateSchedule interval', () => {
  it('accepts a sane interval', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 90 }))
      .toEqual({ ok: true, value: { mode: 'interval', everyMinutes: 90 } });
  });

  it('rejects zero, negative, and non-integer intervals', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 0 }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: -5 }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: 1.5 }).ok).toBe(false);
  });

  it('rejects an interval longer than a day', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 1441 }).ok).toBe(false);
  });
});

describe('validateSchedule minuteOfHour', () => {
  it('accepts and sorts valid minutes', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [55, 25] }).value.minutes).toEqual([25, 55]);
  });

  it('rejects an empty list', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [] }).ok).toBe(false);
  });

  it('rejects out-of-range minutes', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [60] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [-1] }).ok).toBe(false);
  });

  it('de-duplicates', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [25, 25] }).value.minutes).toEqual([25]);
  });
});

describe('validateSchedule dailyTimes', () => {
  it('accepts and sorts valid times', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: ['20:00', '09:00'] }).value.times)
      .toEqual(['09:00', '20:00']);
  });

  it('rejects malformed times', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: ['9am'] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'dailyTimes', times: ['25:00'] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'dailyTimes', times: ['09:70'] }).ok).toBe(false);
  });

  it('rejects an empty list', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: [] }).ok).toBe(false);
  });
});

describe('validateSchedule mode', () => {
  it('rejects an unknown mode', () => {
    expect(validateSchedule({ mode: 'whenever' }).ok).toBe(false);
    expect(validateSchedule(null).ok).toBe(false);
  });
});

describe('validateQuietHours', () => {
  it('accepts a wrapping window', () => {
    expect(validateQuietHours({ enabled: true, from: '23:00', to: '07:00' }).ok).toBe(true);
  });

  it('rejects malformed times', () => {
    expect(validateQuietHours({ enabled: true, from: 'x', to: '07:00' }).ok).toBe(false);
  });

  it('rejects an identical from and to, which would suppress everything', () => {
    expect(validateQuietHours({ enabled: true, from: '07:00', to: '07:00' }).ok).toBe(false);
  });
});

describe('validateSound', () => {
  it('accepts a valid volume', () => {
    expect(validateSound({ enabled: true, volume: 0.5 }).ok).toBe(true);
  });

  it('rejects an out-of-range volume', () => {
    expect(validateSound({ enabled: true, volume: 1.5 }).ok).toBe(false);
    expect(validateSound({ enabled: true, volume: -0.1 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `rtk npx vitest run tests/validate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/validate.js`**

```js
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });

export function validateSchedule(s) {
  if (!s || typeof s !== 'object') return bad('Schedule is missing.');

  if (s.mode === 'interval') {
    const n = s.everyMinutes;
    if (!Number.isInteger(n) || n < 1) return bad('Interval must be a whole number of minutes, at least 1.');
    if (n > 1440) return bad('Interval cannot exceed 24 hours.');
    return ok({ mode: 'interval', everyMinutes: n });
  }

  if (s.mode === 'minuteOfHour') {
    if (!Array.isArray(s.minutes) || s.minutes.length === 0) return bad('Pick at least one minute.');
    if (!s.minutes.every((m) => Number.isInteger(m) && m >= 0 && m <= 59)) {
      return bad('Minutes must be whole numbers between 0 and 59.');
    }
    return ok({ mode: 'minuteOfHour', minutes: [...new Set(s.minutes)].sort((a, b) => a - b) });
  }

  if (s.mode === 'dailyTimes') {
    if (!Array.isArray(s.times) || s.times.length === 0) return bad('Pick at least one time.');
    if (!s.times.every((t) => typeof t === 'string' && HHMM.test(t))) {
      return bad('Times must be in HH:MM format.');
    }
    const times = [...new Set(s.times)].sort();
    return ok({ mode: 'dailyTimes', times });
  }

  return bad(`Unknown schedule mode: ${s?.mode}`);
}

export function validateQuietHours(q) {
  if (!q || typeof q !== 'object') return bad('Quiet hours are missing.');
  if (typeof q.enabled !== 'boolean') return bad('Quiet hours enabled must be true or false.');
  if (!HHMM.test(q.from) || !HHMM.test(q.to)) return bad('Quiet hours must be in HH:MM format.');
  // Equal bounds would make the window either empty or the whole day, depending
  // on which branch quietHours.js takes. Reject rather than guess.
  if (q.from === q.to) return bad('Quiet hours start and end cannot be the same.');
  return ok({ enabled: q.enabled, from: q.from, to: q.to });
}

export function validateSound(s) {
  if (!s || typeof s !== 'object') return bad('Sound settings are missing.');
  if (typeof s.enabled !== 'boolean') return bad('Sound enabled must be true or false.');
  if (typeof s.volume !== 'number' || s.volume < 0 || s.volume > 1) {
    return bad('Volume must be between 0 and 1.');
  }
  return ok({ enabled: s.enabled, volume: s.volume });
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run tests/validate.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 5: Add `createSettingsWindow` to `src/main/windows.js`**

Append to the existing file. Unlike the notification window this one *is*
focusable and normal — but still destroyed on close.

```js
export function createSettingsWindow() {
  return new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
}
```

- [ ] **Step 6: Write `src/preload/settings.js`**

```js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (patch) => ipcRenderer.invoke('settings:save', patch),
  resetPosition: () => ipcRenderer.invoke('settings:resetPosition'),
  preview: () => ipcRenderer.send('settings:preview')
});
```

- [ ] **Step 7: Write `src/renderer/settings/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
  <title>Settings — Mihrab</title>
  <style>
    body { font-family: system-ui; margin: 0; padding: 24px; }
    fieldset { border: 1px solid #ccc; border-radius: 8px; margin-bottom: 16px; }
    label { display: block; margin: 8px 0; }
    .hidden { display: none; }
    #error { color: #b00; min-height: 20px; }
    footer { display: flex; gap: 8px; justify-content: flex-end; }
  </style>
</head>
<body>
  <fieldset>
    <legend>Schedule</legend>
    <label><input type="radio" name="mode" value="interval" /> Every N minutes</label>
    <label><input type="radio" name="mode" value="minuteOfHour" /> At given minutes of every hour</label>
    <label><input type="radio" name="mode" value="dailyTimes" /> At specific times each day</label>

    <div id="pane-interval" class="hidden">
      <label>Every <input type="number" id="everyMinutes" min="1" max="1440" /> minutes</label>
    </div>
    <div id="pane-minuteOfHour" class="hidden">
      <label>Minutes (comma separated, 0–59)
        <input type="text" id="minutes" placeholder="25, 55" /></label>
    </div>
    <div id="pane-dailyTimes" class="hidden">
      <label>Times (comma separated, HH:MM)
        <input type="text" id="times" placeholder="09:00, 14:30" /></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Quiet hours</legend>
    <label><input type="checkbox" id="qhEnabled" /> Do not show verses during</label>
    <label>From <input type="time" id="qhFrom" /> to <input type="time" id="qhTo" /></label>
  </fieldset>

  <fieldset>
    <legend>Verses</legend>
    <label><input type="radio" name="order" value="random" /> Random</label>
    <label><input type="radio" name="order" value="sequential" /> In order</label>
    <p id="position"></p>
    <button id="reset" type="button">Reset to the beginning</button>
  </fieldset>

  <fieldset>
    <legend>Sound</legend>
    <label><input type="checkbox" id="soundEnabled" /> Play a sound</label>
    <label>Volume <input type="range" id="volume" min="0" max="1" step="0.05" /></label>
  </fieldset>

  <fieldset>
    <legend>About</legend>
    <p>Quran text from the <a href="https://tanzil.net">Tanzil Project</a>, CC-BY 3.0.</p>
  </fieldset>

  <div id="error"></div>
  <footer>
    <button id="preview" type="button">Show a verse now</button>
    <button id="save" type="button">Save</button>
  </footer>

  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 8: Write `src/renderer/settings/main.js`**

```js
const $ = (id) => document.getElementById(id);
const panes = ['interval', 'minuteOfHour', 'dailyTimes'];

function showPane(mode) {
  panes.forEach((p) => $(`pane-${p}`).classList.toggle('hidden', p !== mode));
}

function currentSchedule() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'interval') return { mode, everyMinutes: Number($('everyMinutes').value) };
  if (mode === 'minuteOfHour') {
    return { mode, minutes: $('minutes').value.split(',').map((s) => Number(s.trim())) };
  }
  return { mode, times: $('times').value.split(',').map((s) => s.trim()) };
}

async function load() {
  const { config, surahName, ayahNumber } = await window.settingsAPI.load();
  document.querySelector(`input[name=mode][value=${config.schedule.mode}]`).checked = true;
  showPane(config.schedule.mode);
  $('everyMinutes').value = config.schedule.everyMinutes ?? 90;
  $('minutes').value = (config.schedule.minutes ?? []).join(', ');
  $('times').value = (config.schedule.times ?? []).join(', ');
  $('qhEnabled').checked = config.quietHours.enabled;
  $('qhFrom').value = config.quietHours.from;
  $('qhTo').value = config.quietHours.to;
  document.querySelector(`input[name=order][value=${config.verseOrder}]`).checked = true;
  $('position').textContent = `Next in order: ${surahName} — ayah ${ayahNumber}`;
  $('soundEnabled').checked = config.sound.enabled;
  $('volume').value = config.sound.volume;
}

document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', () => showPane(r.value))
);

$('save').addEventListener('click', async () => {
  const res = await window.settingsAPI.save({
    schedule: currentSchedule(),
    quietHours: { enabled: $('qhEnabled').checked, from: $('qhFrom').value, to: $('qhTo').value },
    verseOrder: document.querySelector('input[name=order]:checked').value,
    sound: { enabled: $('soundEnabled').checked, volume: Number($('volume').value) }
  });
  $('error').textContent = res.ok ? '' : res.error;
  if (res.ok) window.close();
});

$('reset').addEventListener('click', async () => {
  await window.settingsAPI.resetPosition();
  await load();
});

$('preview').addEventListener('click', () => window.settingsAPI.preview());

load();
```

- [ ] **Step 9: Wire IPC in `src/main/index.js`**

Add these imports and handlers inside `app.whenReady()`. Note every field is
re-validated here — the renderer's own checks are a convenience, not a guarantee.

```js
import { ipcMain } from 'electron';
import { createSettingsWindow } from './windows.js';
import { validateSchedule, validateQuietHours, validateSound } from './validate.js';
import { getAyah } from './quran.js';

let settingsWin = null;

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = createSettingsWindow();
  settingsWin.loadFile(join(import.meta.dirname, '../renderer/settings/index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  // Destroyed, never hidden — see spec section 3.
  settingsWin.on('closed', () => { settingsWin = null; });
}

function registerSettingsIpc() {
  ipcMain.handle('settings:load', () => {
    const config = getConfig();
    const a = getAyah(config.sequencePosition);
    return { config, surahName: a.surahName, ayahNumber: a.ayahNumber };
  });

  ipcMain.handle('settings:save', (_e, patch) => {
    const s = validateSchedule(patch.schedule);
    if (!s.ok) return s;
    const q = validateQuietHours(patch.quietHours);
    if (!q.ok) return q;
    const snd = validateSound(patch.sound);
    if (!snd.ok) return snd;
    const verseOrder = patch.verseOrder === 'sequential' ? 'sequential' : 'random';
    setConfig({ schedule: s.value, quietHours: q.value, sound: snd.value, verseOrder });
    return { ok: true };
  });

  ipcMain.handle('settings:resetPosition', () => { setConfig({ sequencePosition: 0 }); });
  ipcMain.on('settings:preview', () => fire());
}
```

Call `registerSettingsIpc()` next to `registerNotifierIpc()`, and change the tray
wiring to `onSettings: openSettings`.

**No engine restart is needed** — `SchedulerEngine` calls `getConfig()` on every
tick, so a saved schedule takes effect within 30 seconds automatically.

- [ ] **Step 10: Verify manually**

Run `npm run dev`, open Settings from the tray, and confirm:
- Each schedule mode shows only its own inputs.
- Saving `everyMinutes: 0` shows an error and does **not** close the window.
- Saving `minutes: 25, 55` persists, and reopening shows `25, 55`.
- Setting quiet hours to cover now suppresses firing.
- "Show a verse now" displays a verse while Settings is open.
- Switching to sequential and back preserves the position.
- Closing Settings leaves no renderer process (Task Manager).

- [ ] **Step 11: Run the full suite**

Run: `rtk npx vitest run`
Expected: PASS, all tests from Tasks 2–9.

- [ ] **Step 12: Checkpoint**

Suggested message: `feat: add settings window with validated schedule configuration`

---

## Out of scope — Plan 2

- Translation download on first run (and its picker in Settings)
- Autostart via `setLoginItemSettings` (and its toggle in Settings)
- `electron-builder` packaging, NSIS installer, code signing
- `electron-updater` against GitHub Releases
- "Pause reminders" and "Check for updates" tray items

## Self-Review Notes

**Spec coverage:** sections 4 (architecture), 6 (scheduler), 7 (verse selection),
8 (config), 9 (notification + settings windows), 10 (sound), 12 (error handling)
and 13 (testing) are covered by Tasks 1–9. Section 5 (translation) and section 11
(platform integration) are deferred to Plan 2 and listed above.

**Known gap:** spec open items 1–3 (translation endpoint, font licensing, CC0
sound) are unresolved. Tasks 5 and 7 assume `resources/quran-uthmani.json`,
`resources/fonts/AmiriQuran.ttf`, and `resources/sounds/notify.mp3` exist. Source
them before starting those tasks.
