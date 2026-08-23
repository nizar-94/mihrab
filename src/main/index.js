import { app, ipcMain, Notification } from 'electron';
import { join } from 'path';
import { createTray, updateTray } from './tray.js';
import { getConfig, setConfig, decideAutostartAction } from './config.js';
import { selectIndex } from './verses.js';
import { getAyah } from './quran.js';
import { showVerse, registerNotifierIpc } from './notifier.js';
import { SchedulerEngine, shouldEnterFailureAlert, shouldExitFailureAlert } from './scheduler/engine.js';
import { createSettingsWindow } from './windows.js';
import { validateSchedule, validateQuietHours, validateSound, validateNotification, validateLocation, validatePrayer } from './validate.js';
import { startUpdateChecks, checkForUpdatesManually, onUpdateStateChange, getUpdateState, statusLabel } from './updater.js';
import { nextPrayerFire } from './prayer/schedule.js';
import { METHODS, SCHOOLS, HIGH_LATITUDE_RULES } from './prayer/methods.js';
import { prayerTimes, formatPrayerTime, PRAYER_LABELS, PRAYER_KEYS } from './prayer/times.js';
import { dueFires, suppressedByQuietHours } from './scheduler/providers.js';
import { isWithinQuietHours } from './scheduler/quietHours.js';
import { findCities, manualLocation } from './location/cities.js';
import { showPrayer } from './notifier.js';

let tray = null;
let engine = null;
let settingsWin = null;

// Providers are the mechanism the roadmap calls for: prayer times (and
// later azkar and fasting) are additional SOURCES OF FIRE TIMES, not new
// scheduling machinery. They are consulted from the scheduler's existing
// onTick hook, so everything still runs on one timer and SchedulerEngine
// itself is untouched.
//
// `providerCursor` is the high-water mark of what has already been
// dispatched. It starts at process start rather than at epoch so that
// launching the app does not immediately fire every prayer that has already
// passed today.
let providerCursor = new Date();

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
  dispatchProviders();
}

/**
 * The prayer provider. Rebuilt from config on every call rather than held,
 * so a location or method change in Settings takes effect on the next tick
 * with nothing to invalidate.
 *
 * Returns null when no location is set — the deliberate "no location, no
 * prayer features" rule. Guessing a position produces confidently wrong
 * prayer times, which is worse than none at all.
 */
function prayerProvider() {
  const cfg = getConfig();
  if (!cfg.location) return null;
  return {
    id: 'prayer',
    // Prayer notifications deliberately ignore quiet hours — see
    // providers.js. A 23:00-07:00 window would otherwise silently swallow
    // Fajr and Isha, the two most likely to fall inside it.
    respectsQuietHours: false,
    nextFire: (after) => {
      const fire = nextPrayerFire(after, cfg.location, cfg.prayer);
      return fire ? { at: fire.at, payload: fire } : null;
    }
  };
}

function activeProviders() {
  return [prayerProvider()].filter(Boolean);
}

/**
 * Consult the providers and show whatever became due since the last tick.
 *
 * Never throws: this runs inside the scheduler's onTick, and an exception
 * here would be counted as a scheduler failure and eventually surface as
 * "reminders have stopped" — punishing verse reminders for a prayer bug.
 */
function dispatchProviders() {
  try {
    const now = new Date();
    // A backwards clock jump (manual change, VM restore) leaves the cursor
    // in the future, which would freeze dispatch until real time caught up.
    // Resetting is the safe response: at worst one notification is skipped.
    if (providerCursor > now) providerCursor = now;

    const cfg = getConfig();
    const inQuietHours = isWithinQuietHours(now, cfg.quietHours);

    const due = dueFires(activeProviders(), providerCursor, now, {
      onError: (id, err) => console.error(`provider ${id} failed`, err)
    });

    providerCursor = now;
    if (paused) return;

    for (const fire of due) {
      if (suppressedByQuietHours(fire.provider, inQuietHours)) continue;
      if (fire.provider.id === 'prayer') showPrayerNotification(fire.payload, cfg);
    }
  } catch (err) {
    console.error('provider dispatch failed', err);
  }
}

function showPrayerNotification(fire, cfg) {
  const label = PRAYER_LABELS[fire.prayer] ?? { en: fire.prayer, ar: '' };
  const time = formatPrayerTime(fire.at, cfg.location.timezone);
  showPrayer({
    prayer: fire.prayer,
    en: label.en,
    ar: label.ar,
    kind: fire.kind,
    // For a 'before' reminder the card should name the prayer's own time,
    // not the reminder's — "Maghrib at 19:21", shown fifteen minutes early.
    time: fire.kind === 'before' ? formatPrayerTime(prayerTimeFor(fire.prayer, cfg), cfg.location.timezone) : time,
    location: cfg.location.name
  }, cfg);
}

function prayerTimeFor(prayer, cfg) {
  const times = prayerTimes(cfg.location, new Date(), cfg.prayer);
  return times[prayer];
}

/**
 * Today's prayer times as display strings, for the Settings form and the
 * tray. Returns null when there is no location, which every caller renders
 * as "set a location first" rather than as an error.
 */
function prayerPreview(cfg) {
  if (!cfg?.location) return null;
  try {
    const times = prayerTimes(cfg.location, new Date(), cfg.prayer);
    return PRAYER_KEYS.map((key) => ({
      key,
      en: PRAYER_LABELS[key].en,
      ar: PRAYER_LABELS[key].ar,
      // null is a real answer inside the polar circles when the user has
      // chosen not to resolve them — shown as a dash, not as a failure.
      time: formatPrayerTime(times[key], cfg.location.timezone)
    }));
  } catch (err) {
    console.error('prayer preview failed', err);
    return null;
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
    return {
      config,
      surahName: a.surahName,
      ayahNumber: a.ayahNumber,
      version: app.getVersion(),
      // Sent rather than duplicated in the renderer, so adding a
      // calculation method in prayer/methods.js cannot leave the dropdown
      // out of step with what the validator accepts. Mapped to {id, label}
      // because the source arrays also carry adhan enum values, which have
      // no business crossing into a renderer.
      options: {
        methods: METHODS.map(({ id, label }) => ({ id, label })),
        schools: SCHOOLS.map(({ id, label }) => ({ id, label })),
        highLatitudeRules: HIGH_LATITUDE_RULES.map(({ id, label }) => ({ id, label }))
      },
      // Today's times for the current location, so Settings can show the
      // effect of a method or offset change immediately instead of making
      // the user wait until the next prayer to find out what they did.
      preview: prayerPreview(config),
      // The system zone is the sensible default for a manually entered
      // location — someone typing their own coordinates is almost always
      // where their computer is.
      systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  });

  // Search is in main, not the renderer: the 2.3 MB city database is loaded
  // and cached once in this process, and shipping it into a renderer that is
  // destroyed on every Settings close would re-parse it every time.
  ipcMain.handle('cities:search', (_e, query) => {
    try {
      return findCities(String(query ?? ''), 20);
    } catch (err) {
      console.error('city search failed', err);
      return [];
    }
  });

  // Live preview for the Settings form: the times a given prayer config
  // WOULD produce, without saving anything.
  ipcMain.handle('prayer:preview', (_e, patch) => {
    const location = validateLocation(patch?.location ?? null);
    if (!location.ok || !location.value) return null;
    const prayer = validatePrayer(patch?.prayer);
    if (!prayer.ok) return null;
    return prayerPreview({ location: location.value, prayer: prayer.value });
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

    // Location may legitimately be null — "I haven't chosen anywhere" is a
    // valid state, and the one every user starts in.
    const loc = validateLocation(patch.location ?? null);
    if (!loc.ok) return loc;
    const pr = validatePrayer(patch.prayer);
    if (!pr.ok) return pr;

    // The notification section had no editable field until the verse text
    // size was added, so this handler never carried it — which meant the
    // size was silently dropped on every save. Falls back to the stored
    // value when the renderer sends nothing, so an older or partial payload
    // cannot wipe durationMs or position.
    const notif = validateNotification(patch.notification ?? getConfig().notification);
    if (!notif.ok) return notif;

    setConfig({
      schedule: s.value,
      quietHours: q.value,
      sound: snd.value,
      notification: notif.value,
      verseOrder,
      startWithWindows,
      location: loc.value,
      prayer: pr.value
    });

    // A changed location or method changes every upcoming fire time, so the
    // cursor must not carry a stale "already dispatched up to here" mark
    // from the old settings. Resetting to now means the next tick schedules
    // against the new configuration cleanly.
    providerCursor = new Date();
    // Keep the OS login item in lockstep with what the user just chose in
    // Settings. '--hidden' is a no-op today — the app already boots
    // straight to tray with no window regardless of how it was launched —
    // but is included intentionally as the correct signal for an autostart
    // launch, in case a future change ever makes windows appear on launch.
    //
    // Packaged only, for the same reason as the startup reconciliation: in
    // a dev run this would register a login item pointing at electron.exe,
    // or deregister the real installed app's one. The config VALUE is still
    // saved either way, so the toggle behaves normally in dev — only the OS
    // registration is left alone.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: startWithWindows, args: AUTOSTART_ARGS });
    }
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
    // PACKAGED BUILDS ONLY. A dev run (`npm run dev`) launches through
    // Electron's own binary, so getLoginItemSettings() looks for a login
    // item pointing at electron.exe, finds none, and reports false — even
    // when the INSTALLED app is registered perfectly well. Because dev and
    // the installed app share one electron-store config file, the reconcile
    // branch below would then write startWithWindows: false into the very
    // config production reads, silently switching autostart off for the
    // real install every time the app is run from source.
    //
    // Skipping entirely is right rather than merely not writing: a
    // development run has no business registering or deregistering a login
    // item on the developer's machine either.
    if (!app.isPackaged) {
      console.log('muslim-app: autostart reconciliation skipped (not a packaged build)');
    } else {
      const osAutostart = app.getLoginItemSettings({ args: AUTOSTART_ARGS }).openAtLogin;
      const startupConfig = getConfig();
      const decision = decideAutostartAction(startupConfig.autostartInitialised, osAutostart);
      if (decision.action === 'register') {
        app.setLoginItemSettings({ openAtLogin: true, args: AUTOSTART_ARGS });
        setConfig({ startWithWindows: true, autostartInitialised: true });
      } else if (startupConfig.startWithWindows !== decision.startWithWindows) {
        setConfig({ startWithWindows: decision.startWithWindows });
      }
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
