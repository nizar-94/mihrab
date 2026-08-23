import electron from 'electron';
// electron-updater is CommonJS and ships no *working* named ESM export.
// `autoUpdater` is defined on its `exports` object via a lazy getter
// (`Object.defineProperty(exports, "autoUpdater", { get: ... })` in
// out/main.js), not a plain assignment — and that getter is NOT inert: the
// first read constructs a real NsisUpdater/MacUpdater/etc., whose
// constructor chain calls `electron.app.getVersion()` immediately (see
// node_modules/electron-updater/src/AppUpdater.ts and
// ElectronAppAdapter.ts). Two consequences, both confirmed empirically
// (see Group B report), not assumed from docs:
//   1. `import { autoUpdater } from 'electron-updater'` fails at runtime —
//      Node's CJS/ESM interop does not reliably rebind a getter-based named
//      export, so the named form comes back broken.
//   2. Even `const { autoUpdater } = electronUpdater` (default import then
//      destructure) is only safe if done LAZILY, inside a function that
//      only runs under a real packaged Electron app. Destructuring it at
//      module scope — which is what every "just use the default import"
//      example implies — reads the getter immediately at import time, which
//      threw under plain Node/Vitest (`app` is undefined there, so
//      `app.getVersion()` throws) and would equally throw in an unpackaged
//      `electron .` dev run before app.isPackaged is even checked. So: the
//      module object is imported eagerly (safe, inert), but `.autoUpdater`
//      is only ever read from inside configureAutoUpdater()/runCheck()
//      below, both of which are reached exclusively through the
//      isPackaged() guard.
import electronUpdater from 'electron-updater';

function getAutoUpdater() {
  return electronUpdater.autoUpdater;
}

// electron itself: default import + destructure, same reasoning as
// config.js — under plain Node (Vitest) 'electron' resolves to a plain
// string, so `electron.app` is undefined rather than throwing, which keeps
// every pure export below testable without an Electron process.
const { app } = electron;

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

// Deliberately not "0" or "on ready": the first check must never compete
// with startup (tray creation, scheduler start, autostart reconciliation
// in index.js). A short fixed delay is enough headroom without meaningfully
// delaying the user ever seeing an update.
export const INITIAL_CHECK_DELAY_MS = 15_000;

export const UpdateStatus = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  NOT_AVAILABLE: 'not-available',
  ERROR: 'error'
});

export function initialUpdateState() {
  return {
    status: UpdateStatus.IDLE,
    version: null,
    percent: null,
    error: null,
    lastCheckedAt: null
  };
}

// Pure reducer: given the current state and an event name/payload mirroring
// electron-updater's own events, returns the next state. No autoUpdater
// reference, no I/O — this is the "state machine for update status" the
// task asks to cover with real tests, exercisable without mocking
// electron-updater or electron at all.
export function reduceUpdateState(state, event, payload = {}) {
  switch (event) {
    case 'checking-for-update':
      return { ...state, status: UpdateStatus.CHECKING, error: null };
    case 'update-available':
      return { ...state, status: UpdateStatus.AVAILABLE, version: payload.version ?? null, percent: null, error: null };
    case 'update-not-available':
      return {
        ...state,
        status: UpdateStatus.NOT_AVAILABLE,
        version: null,
        percent: null,
        error: null,
        lastCheckedAt: payload.now ?? state.lastCheckedAt
      };
    case 'download-progress':
      return {
        ...state,
        status: UpdateStatus.DOWNLOADING,
        percent: typeof payload.percent === 'number' ? payload.percent : state.percent
      };
    case 'update-downloaded':
      return {
        ...state,
        status: UpdateStatus.DOWNLOADED,
        version: payload.version ?? state.version,
        percent: 100,
        error: null
      };
    case 'error':
      return {
        ...state,
        status: UpdateStatus.ERROR,
        error: payload.message || 'Update check failed',
        lastCheckedAt: payload.now ?? state.lastCheckedAt
      };
    default:
      return state;
  }
}

// Tray-facing label. Pure, so the three required manual-check outcomes
// (available/downloading, up to date, failed) are directly assertable
// against a status value without touching the Menu/Tray APIs.
export function statusLabel(state) {
  switch (state.status) {
    case UpdateStatus.CHECKING:
      return 'Checking for updates…';
    case UpdateStatus.AVAILABLE:
      return `Update available${state.version ? ` (v${state.version})` : ''} — downloading…`;
    case UpdateStatus.DOWNLOADING:
      return `Downloading update${typeof state.percent === 'number' ? ` (${Math.round(state.percent)}%)` : ''}…`;
    case UpdateStatus.DOWNLOADED:
      return `Update ready${state.version ? ` (v${state.version})` : ''} — installs next time you quit`;
    case UpdateStatus.NOT_AVAILABLE:
      return 'Mihrab is up to date';
    case UpdateStatus.ERROR:
      return 'Update check failed — will retry automatically';
    default:
      return null; // idle: nothing worth surfacing yet
  }
}

// Scheduling: "check once after a short delay, then every N ms" as an
// injectable unit, independent of any real timer or of electron-updater
// itself, so tests can assert the scheduling *decisions* (one initial
// check, then recurring; stop() must not leak timers; start() must not
// double-schedule) without waiting on real wall-clock time or relying on
// vi.useFakeTimers's global-clock interaction with other suites.
export function createUpdateScheduler(checkFn, {
  initialDelay = INITIAL_CHECK_DELAY_MS,
  interval = CHECK_INTERVAL_MS,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval
} = {}) {
  let timeoutHandle = null;
  let intervalHandle = null;

  function stop() {
    if (timeoutHandle !== null) clearTimeoutFn(timeoutHandle);
    if (intervalHandle !== null) clearIntervalFn(intervalHandle);
    timeoutHandle = null;
    intervalHandle = null;
  }

  function start() {
    // Idempotent: calling start() twice (e.g. a future re-init) must never
    // leave two independent timers accumulating checks.
    stop();
    timeoutHandle = setTimeoutFn(() => {
      timeoutHandle = null;
      checkFn();
      intervalHandle = setIntervalFn(checkFn, interval);
    }, initialDelay);
  }

  function isScheduled() {
    return timeoutHandle !== null || intervalHandle !== null;
  }

  return { start, stop, isScheduled };
}

// ---------------------------------------------------------------------
// Module-level wiring (mirrors index.js's own module-level state pattern
// for tray/engine/paused/failing — this file owns one updater "session"
// per process, there is only ever one).
// ---------------------------------------------------------------------

let state = initialUpdateState();
let listeners = [];
let scheduler = null;
let configured = false;

function setState(next) {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error('mihrab: updater state listener threw', err);
    }
  }
}

export function getUpdateState() {
  return state;
}

// Lets the tray re-render whenever status changes, the same "rebuild from
// current state" pattern tray.js already uses for paused/failing — this
// file never touches Tray/Menu itself.
export function onUpdateStateChange(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// Unsigned-build note: electron-updater's NsisUpdater verifies the
// downloaded installer's Authenticode publisher only when app-update.yml
// (written at build time by electron-builder) contains a `publisherName`.
// electron-builder only populates that field when it can resolve a signing
// certificate for the build (see app-builder-lib's
// WindowsSignToolManager#computedPublisherName / PublishManager). This
// project has no certificateFile/certificatePassword configured, so that
// resolves to null, publisherName is absent from app-update.yml, and
// NsisUpdater#verifySignature short-circuits to `null` (no error) before
// ever calling the OS signature check — see
// node_modules/electron-updater/out/NsisUpdater.js. Net effect: nothing
// needed to be configured or disabled here to let unsigned updates
// install; the check is already inert for this build because there is no
// publisher identity to verify against. It becomes active automatically,
// with no code change required, the day this project is code-signed (see
// docs/code-signing.md).
function configureAutoUpdater() {
  if (configured) return;
  configured = true;

  const autoUpdater = getAutoUpdater();
  autoUpdater.autoDownload = true;
  // Never yank the app out from under the user mid-session — install is
  // deferred to the next natural quit, not forced.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setState(reduceUpdateState(state, 'checking-for-update')));
  autoUpdater.on('update-available', (info) => setState(reduceUpdateState(state, 'update-available', { version: info?.version })));
  autoUpdater.on('update-not-available', () => setState(reduceUpdateState(state, 'update-not-available', { now: new Date().toISOString() })));
  autoUpdater.on('download-progress', (progress) => setState(reduceUpdateState(state, 'download-progress', { percent: progress?.percent })));
  autoUpdater.on('update-downloaded', (info) => setState(reduceUpdateState(state, 'update-downloaded', { version: info?.version })));
  autoUpdater.on('error', (err) => {
    // Swallowed by design: an unreachable GitHub or a malformed release
    // must never crash the app or touch the reminder scheduler, which is
    // entirely independent of this module.
    console.error('mihrab: auto-update error', err);
    setState(reduceUpdateState(state, 'error', { message: err?.message, now: new Date().toISOString() }));
  });
}

// Fires one check. Never throws: checkForUpdates() can reject (e.g. no
// network, malformed latest.yml) independently of the 'error' event above,
// so both paths funnel into the same swallow-and-record handling.
function runCheck() {
  return Promise.resolve()
    .then(() => getAutoUpdater().checkForUpdates())
    .catch((err) => {
      console.error('mihrab: checkForUpdates rejected', err);
      setState(reduceUpdateState(state, 'error', { message: err?.message, now: new Date().toISOString() }));
    });
}

function isPackaged() {
  return Boolean(app?.isPackaged);
}

// Called once from index.js's app.whenReady() handler. Inert in
// development: checkForUpdates() needs app-update.yml, which only exists
// in a packaged build, and throws/misbehaves without it — so an unpackaged
// run does nothing but log, rather than risking a crash or a dev-only
// error spam loop.
export function startUpdateChecks() {
  if (!isPackaged()) {
    console.log('mihrab: auto-update checks skipped (not a packaged build)');
    return;
  }
  configureAutoUpdater();
  if (!scheduler) scheduler = createUpdateScheduler(runCheck);
  scheduler.start();
}

export function stopUpdateChecks() {
  scheduler?.stop();
}

// Manual "Check for updates" entry point for the tray menu. Always
// resolves (never rejects) so the caller can safely await it and inspect
// getUpdateState() afterwards for one of the three required outcomes:
// available/downloading, up to date, or failed — all three are represented
// in UpdateStatus and covered by reduceUpdateState's tests.
export function checkForUpdatesManually() {
  if (!isPackaged()) {
    console.log('mihrab: manual update check skipped (not a packaged build)');
    return Promise.resolve(state);
  }
  configureAutoUpdater();
  return runCheck().then(() => state);
}
