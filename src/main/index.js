import { app, ipcMain, Notification } from 'electron';
import { join } from 'path';
import { createTray, updateTray } from './tray.js';
import { getConfig, setConfig, decideAutostartAction } from './config.js';
import { selectIndex } from './verses.js';
import { getAyah } from './quran.js';
import { showVerse, registerNotifierIpc } from './notifier.js';
import { SchedulerEngine, shouldEnterFailureAlert, shouldExitFailureAlert } from './scheduler/engine.js';
import { createSettingsWindow } from './windows.js';
import { validateSchedule, validateQuietHours, validateSound } from './validate.js';
import { startUpdateChecks, checkForUpdatesManually, onUpdateStateChange, getUpdateState, statusLabel } from './updater.js';

let tray = null;
let engine = null;
let settingsWin = null;

// FEATURE 1: shared between every setLoginItemSettings/getLoginItemSettings
// call. On Windows, getLoginItemSettings() only reports openAtLogin: true
// for a launch item matching the SAME args it's queried with — querying
// with no args after registering with args: ['--hidden'] silently reads
// back false even though the item genuinely is registered (confirmed live:
// app.getLoginItemSettings().openAtLogin stayed false after
// setLoginItemSettings({ openAtLogin: true, args: AUTOSTART_ARGS }) until
// the query itself also passed { args: AUTOSTART_ARGS }). Every read must
// use this exact same array or the reconcile-on-startup logic silently
// treats a real autostart registration as absent.
const AUTOSTART_ARGS = ['--hidden'];

// FEATURE 2: pause is session-only by explicit design (spec: must not
// survive a restart) — held purely as a module-level variable in this
// process, never written to config.js, never touched by migrate().
let paused = false;

// FEATURE 3: tracks whether the tray is currently in the "reminders have
// stopped" state, so the tick handler below can tell "just crossed the
// threshold" (alert once) apart from "still over threshold" (do nothing)
// and "just recovered" (reset). engine.consecutiveFailures/lastError remain
// the only source of truth for the counts themselves.
let failing = false;

const trayHandlers = {
  onShowNow: () => fire(),
  onSettings: () => openSettings(),
  onTogglePause: () => togglePause(),
  // checkForUpdatesManually() itself is inert-and-logs in dev (no-op) and
  // never throws (network/GitHub failures are swallowed inside updater.js).
  // Its own 'checking-for-update'/'update-available'/'update-not-available'/
  // 'error' events already flow through onUpdateStateChange -> refreshTray
  // below, so this handler doesn't need to touch the tray itself.
  onCheckForUpdates: () => checkForUpdatesManually(),
  onQuit: () => app.quit()
};

function trayState() {
  return {
    paused,
    failing,
    errorLabel: failing && engine?.lastError ? `Reminders stopped: ${engine.lastError.message}` : null,
    // statusLabel() returns null while idle (nothing checked yet, or a
    // packaged-only feature that's a no-op in dev) — buildMenu/tooltipFor in
    // tray.js already treat a null/falsy label as "nothing to show".
    updateLabel: statusLabel(getUpdateState()),
    // Read here rather than in tray.js so menuTemplate() stays pure and
    // testable without an Electron process. In a packaged build this is the
    // version from package.json; it is what makes an applied auto-update
    // visible from inside the app at all.
    version: app.getVersion()
  };
}

function refreshTray() {
  updateTray(tray, trayHandlers, trayState());
}

function togglePause() {
  paused = !paused;
  refreshTray();
}

// One native OS notification per failure streak (guarded by the `failing`
// transition in handleTick below, never called on every tick).
// showVerse() is deliberately NOT used for this: it expects an ayah-shaped
// payload (Arabic verse text, surah/ayah reference, optional chime tied to
// the user's sound settings) and renders through the Quran-verse card UI —
// forcing a plain error string through that contract would mean either
// fabricating fake ayah fields (hacking the contract) or a "verse" card
// that reads like corrupted scripture, which is worse than no card at all.
// Electron's built-in Notification is the correct primitive for a plain
// system alert and does not require touching notifier.js or windows.js.
function alertSchedulerFailure() {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Muslim App',
    body: 'Reminders have stopped working. Open Settings from the tray menu for details.'
  }).show();
}

// FEATURE 3: invoked by SchedulerEngine after every tick. Reads the
// engine's own counters (never recomputes them) and only decides the UI
// transition via the pure helpers in engine.js.
function handleTick(eng) {
  if (shouldEnterFailureAlert(eng.consecutiveFailures, failing)) {
    failing = true;
    refreshTray();
    alertSchedulerFailure();
  } else if (shouldExitFailureAlert(eng.consecutiveFailures, failing)) {
    failing = false;
    refreshTray();
  }
}

export function fire() {
  const cfg = getConfig();
  const { index, nextPosition } = selectIndex(cfg.verseOrder, cfg.sequencePosition);
  // Persist ONLY once the verse is genuinely on screen. showVerse can fail
  // asynchronously (loadFile rejection, ready-to-show timeout) up to ~5s after
  // it returns, so its return value cannot be trusted as proof of display.
  // If it never shows, nothing is persisted and the scheduler simply retries
  // on its next tick — the verse arrives late rather than being silently lost.
  showVerse(getAyah(index), cfg, () => {
    setConfig({ sequencePosition: nextPosition, lastFiredAt: new Date().toISOString() });
  });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = createSettingsWindow();
  // index.js is bundled into out/main/index.js alongside windows.js and
  // notifier.js, so import.meta.dirname is out/main/ at runtime — matches
  // notifier.js's scheme for resolving the built renderer HTML.
  settingsWin.loadFile(join(import.meta.dirname, '../renderer/settings/index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  // Destroyed, never hidden — closing Settings must leave no renderer process.
  settingsWin.on('closed', () => { settingsWin = null; });
}

function registerSettingsIpc() {
  ipcMain.handle('settings:load', () => {
    const config = getConfig();
    const a = getAyah(config.sequencePosition);
    return { config, surahName: a.surahName, ayahNumber: a.ayahNumber };
  });

  ipcMain.handle('settings:save', (_e, patch) => {
    // Every field is re-validated here with the same validators that guard
    // the disk-read path in config.js's migrate(). The renderer's own checks
    // are convenience only.
    const s = validateSchedule(patch.schedule);
    if (!s.ok) return s;
    const q = validateQuietHours(patch.quietHours);
    if (!q.ok) return q;
    const snd = validateSound(patch.sound);
    if (!snd.ok) return snd;
    const verseOrder = patch.verseOrder === 'sequential' ? 'sequential' : 'random';
    // FEATURE 1: boolean coercion, same pattern as every other field here —
    // the renderer's checkbox state should already be a boolean, but the
    // main process never trusts the renderer and re-validates explicitly.
    const startWithWindows = patch.startWithWindows === true;
    setConfig({ schedule: s.value, quietHours: q.value, sound: snd.value, verseOrder, startWithWindows });
    // Keep the OS login item in lockstep with what the user just chose in
    // Settings. '--hidden' is a no-op today — the app already boots
    // straight to tray with no window regardless of how it was launched —
    // but is included intentionally as the correct signal for an autostart
    // launch, in case a future change ever makes windows appear on launch.
    app.setLoginItemSettings({ openAtLogin: startWithWindows, args: AUTOSTART_ARGS });
    return { ok: true };
  });

  ipcMain.handle('settings:resetPosition', () => { setConfig({ sequencePosition: 0 }); });
  ipcMain.on('settings:preview', () => fire());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.nizar.muslimapp');

  app.whenReady().then(() => {
    // FEATURE 1: first run vs. reconcile autostart drift between the OS and
    // our config. decideAutostartAction (config.js) is the pure decision;
    // this block only carries out whichever action it returns.
    //
    // - First run ever (autostartInitialised === false): actually register
    //   the OS login item so the new "on by default" behaviour takes real
    //   effect, not just in config. Skipping this and only flipping the
    //   config default would do nothing — the OS has no entry yet, so this
    //   very code would otherwise reconcile config straight back to false.
    // - Every later run: the OS remains the source of truth, exactly as
    //   before — the user can remove (or add) the login item directly via
    //   Task Manager's Startup tab, independent of this app, or a Windows
    //   reset can clear it. Reality wins over whatever this app last wrote
    //   to config, so the Settings toggle always reflects what is actually
    //   true rather than this app silently re-enabling something the user
    //   just turned off through the OS's own UI. This branch does NOT call
    //   setLoginItemSettings — doing so would be the opposite choice
    //   (config overriding the OS).
    //
    // Must query with the same args used to set it (see AUTOSTART_ARGS
    // above) or this always reads back false.
    const osAutostart = app.getLoginItemSettings({ args: AUTOSTART_ARGS }).openAtLogin;
    const startupConfig = getConfig();
    const decision = decideAutostartAction(startupConfig.autostartInitialised, osAutostart);
    if (decision.action === 'register') {
      app.setLoginItemSettings({ openAtLogin: true, args: AUTOSTART_ARGS });
      setConfig({ startWithWindows: true, autostartInitialised: true });
    } else if (startupConfig.startWithWindows !== decision.startWithWindows) {
      setConfig({ startWithWindows: decision.startWithWindows });
    }

    registerNotifierIpc();
    registerSettingsIpc();
    tray = createTray(trayHandlers);

    // Any updater status change (checking/available/downloading/downloaded/
    // up-to-date/error) re-renders the tray menu/tooltip via the same
    // rebuild-from-current-state path used for paused/failing above.
    // Registered before startUpdateChecks() so the very first
    // 'checking-for-update' event (fired after the initial delay) is not
    // missed. Entirely independent of the scheduler below — an updater
    // failure only ever updates this label, never touches `engine`.
    onUpdateStateChange(() => refreshTray());
    // No-op with a log line when unpackaged (dev run) — see updater.js.
    startUpdateChecks();

    engine = new SchedulerEngine(
      () => {
        const c = getConfig();
        return {
          schedule: c.schedule,
          quietHours: c.quietHours,
          lastFiredAt: c.lastFiredAt ? new Date(c.lastFiredAt) : null,
          // FEATURE 2: read fresh on every tick from the module-level
          // `paused` variable — never persisted, never round-trips through
          // config.js.
          paused
        };
      },
      fire,
      undefined,
      undefined,
      handleTick
    );

    engine.start().catch((err) => console.error('scheduler failed to start', err));
  });

  // A tray app must survive all windows closing.
  app.on('window-all-closed', (e) => e.preventDefault());
}
