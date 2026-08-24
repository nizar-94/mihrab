import { app, ipcMain, Notification } from 'electron';
import { join } from 'path';
import { createTray, updateTray } from './tray.js';
import { getConfig, setConfig, decideAutostartAction } from './config.js';
import { selectIndex } from './verses.js';
import { getAyah } from './quran.js';
import { showVerse, registerNotifierIpc } from './notifier.js';
import { SchedulerEngine, shouldEnterFailureAlert, shouldExitFailureAlert } from './scheduler/engine.js';
import { createSettingsWindow } from './windows.js';
import { validateSchedule, validateQuietHours, validateSound, validateNotification, validateLocation, validatePrayer, validateFasting, validateAzkar, validateLanguage, FASTING_KEYS } from './validate.js';
import { startUpdateChecks, checkForUpdatesManually, onUpdateStateChange, getUpdateState, statusLabel } from './updater.js';
import { nextPrayerFire } from './prayer/schedule.js';
import { khitmahProgress, progressFromPosition } from './khitmah.js';
import { nextFastingFire } from './fasting.js';
import {
  nextAzkarFire,
  selectDhikr,
  allEntries,
  effectiveEntries,
  sessionEntries,
  MORNING_ANCHORS,
  EVENING_ANCHORS
} from './azkar.js';
import { hijriDate, formatHijri } from './hijri.js';
import { zonedTime } from './zoned.js';
import { METHODS, SCHOOLS, HIGH_LATITUDE_RULES } from './prayer/methods.js';
import { prayerTimes, formatPrayerTime, PRAYER_LABELS, PRAYER_KEYS } from './prayer/times.js';
import { dueFires, suppressedByQuietHours } from './scheduler/providers.js';
import { isWithinQuietHours } from './scheduler/quietHours.js';
import { findCities, manualLocation, nearestCity, loadCities } from './location/cities.js';
import {
  AVAILABLE as TRANSLATIONS,
  downloadTranslation,
  removeTranslation,
  downloadedIds,
  translatedVerse
} from './translations.js';
import { showPrayer, showFasting, showDhikr } from './notifier.js';

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
    title: 'Mihrab',
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

/**
 * The fasting provider. Also location-gated, because both the Hijri day and
 * the weekday depend on the user's timezone — a reminder that fires on the
 * wrong day is worse than none.
 */
function fastingProvider() {
  const cfg = getConfig();
  if (!cfg.location) return null;
  if (!FASTING_KEYS.some((key) => cfg.fasting?.[key])) return null;
  return {
    id: 'fasting',
    // Unlike prayers, these DO respect quiet hours: a fasting reminder is
    // an ambient nudge about tomorrow, not a moment that must be observed
    // now, so there is no reason for it to override a user's quiet window.
    respectsQuietHours: true,
    nextFire: (after) => {
      const fire = nextFastingFire(after, cfg.location.timezone, cfg.fasting);
      return fire ? { at: fire.at, payload: fire } : null;
    }
  };
}

/**
 * The azkar provider. Anchored to prayer times, so location-gated like the
 * others.
 */
function azkarProvider() {
  const cfg = getConfig();
  if (!cfg.location) return null;
  if (!cfg.azkar?.morning?.enabled && !cfg.azkar?.evening?.enabled) return null;
  return {
    id: 'azkar',
    // Adhkar have a window rather than a fixed moment, so a quiet period is
    // a legitimate reason to skip one.
    respectsQuietHours: true,
    nextFire: (after) => {
      const fire = nextAzkarFire(after, cfg.location, cfg.prayer, cfg.azkar);
      return fire ? { at: fire.at, payload: fire } : null;
    }
  };
}

function activeProviders() {
  return [prayerProvider(), fastingProvider(), azkarProvider()].filter(Boolean);
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
      else if (fire.provider.id === 'fasting') showFastingNotification(fire.payload, cfg);
      else if (fire.provider.id === 'azkar') showDhikrNotification(fire.payload, cfg);
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

function showDhikrNotification(fire, cfg) {
  // The effective set: bundled minus anything switched off, plus the
  // user's own additions.
  const entries = effectiveEntries(allEntries(), cfg.azkar);
  const picked = selectDhikr(entries, fire.session, cfg.azkar.position?.[fire.session] ?? 0);
  if (!picked) return;

  showDhikr({
    session: fire.session,
    ar: picked.entry.ar,
    en: picked.entry.en,
    translit: picked.entry.translit,
    count: picked.entry.count,
    countLabel: picked.entry.countEn || (picked.entry.count > 1 ? picked.entry.count + ' times' : 'Once'),
    index: picked.index,
    total: picked.total
  }, cfg, () => {
    // Advance ONLY once the card is genuinely on screen, mirroring how the
    // verse sequence position is persisted — otherwise a card that failed
    // to display would silently skip a dhikr.
    const current = getConfig().azkar;
    setConfig({
      azkar: {
        ...current,
        position: { ...current.position, [fire.session]: picked.nextPosition }
      }
    });
  });
}

function showFastingNotification(fire, cfg) {
  const timeZone = cfg.location.timezone;
  // Noon on the fast day, so the weekday and Hijri date are both read for
  // the day being fasted rather than the day the reminder fires.
  const noon = zonedTime(fire.fastDate, '12:00', timeZone);
  showFasting({
    fastDate: fire.fastDate,
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(noon),
    reasons: fire.reasons.map((r) => r.label),
    hijri: formatHijri(hijriDate(noon, timeZone))
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
  // null when no translation is chosen, not downloaded, or unreadable —
  // the card simply shows Arabic only. A translation must never be able to
  // stop a verse appearing.
  const translation = translatedVerse(cfg.translation?.id, index);
  // Only in sequential order: in random order the position is deliberately
  // left untouched, so there is no progress to report and a bar would be
  // meaningless.
  const progress = cfg.verseOrder === 'sequential' ? khitmahProgress(index) : null;
  showVerse({ ...getAyah(index), translation, progress }, cfg, () => {
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
      // Drives the first-run banner and makes Settings open on the Athan
      // tab, where the location field is.
      needsLocation: !config.location,
      // Khitmah progress for the Qur'an tab. Computed from the stored
      // position, which points at the NEXT ayah, so it reads as "how much
      // has been read so far".
      khitmah: progressFromPosition(config.sequencePosition),
      // Sent rather than duplicated in the renderer, so adding a
      // calculation method in prayer/methods.js cannot leave the dropdown
      // out of step with what the validator accepts. Mapped to {id, label}
      // because the source arrays also carry adhan enum values, which have
      // no business crossing into a renderer.
      options: {
        methods: METHODS.map(({ id, label }) => ({ id, label })),
        schools: SCHOOLS.map(({ id, label }) => ({ id, label })),
        highLatitudeRules: HIGH_LATITUDE_RULES.map(({ id, label }) => ({ id, label })),
        morningAnchors: MORNING_ANCHORS.map(({ id, label }) => ({ id, label })),
        eveningAnchors: EVENING_ANCHORS.map(({ id, label }) => ({ id, label }))
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
    const fast = validateFasting(patch.fasting ?? getConfig().fasting);
    if (!fast.ok) return fast;
    // Positions are bookkeeping the form never edits, so they are carried
    // through from the stored config rather than taken from the renderer.
    const storedAzkar = getConfig().azkar;
    // position is bookkeeping the form never edits, so it is preserved from
    // storage; disabled/custom DO come from the form.
    const azk = validateAzkar({ ...(patch.azkar ?? storedAzkar), position: storedAzkar.position });
    if (!azk.ok) return azk;
    const lang = validateLanguage(patch.language ?? getConfig().language);

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
      prayer: pr.value,
      fasting: fast.value,
      azkar: azk.value,
      language: lang.value
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

  // Downloaded on request, never bundled: Tanzil's translations are
  // non-commercial-only, so the project must not redistribute them. See
  // src/main/translations.js.
  // The full bundled list plus the user's own, for the Settings editor.
  // Sent whole rather than paged: 34 short entries is nothing, and the
  // editor needs all of them to render checkboxes.
  // Sample notifications, one per category.
  //
  // These go through the SAME show* functions the scheduler uses, so a
  // sample is not an approximation — it is the real card with a badge. A
  // separately-rendered preview would be free to drift from the thing it
  // claims to preview, which is the usual way previews start lying.
  //
  // Samples work without a location by falling back to representative
  // values: the point is to show what a reminder looks like, and refusing
  // until the user has configured everything defeats that.
  ipcMain.handle('notification:sample', (_e, kind) => {
    const cfg = getConfig();
    try {
      if (kind === 'prayer') {
        const timeZone = cfg.location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const times = cfg.location ? prayerTimes(cfg.location, new Date(), cfg.prayer) : null;
        showPrayer({
          sample: true,
          prayer: 'maghrib',
          en: PRAYER_LABELS.maghrib.en,
          ar: PRAYER_LABELS.maghrib.ar,
          kind: 'at',
          time: times ? formatPrayerTime(times.maghrib, timeZone) : '19:21',
          location: cfg.location?.name ?? 'Your location'
        }, cfg);
        return { ok: true };
      }

      if (kind === 'azkar') {
        const entries = effectiveEntries(allEntries(), cfg.azkar);
        const picked = selectDhikr(entries, 'morning', cfg.azkar?.position?.morning ?? 0);
        if (!picked) return { ok: false, error: 'No adhkar are enabled to show.' };
        showDhikr({
          sample: true,
          session: 'morning',
          ar: picked.entry.ar,
          en: picked.entry.en,
          translit: picked.entry.translit,
          count: picked.entry.count,
          countLabel: picked.entry.countEn || (picked.entry.count > 1 ? picked.entry.count + ' times' : 'Once'),
          index: picked.index,
          total: picked.total
        }, cfg);
        return { ok: true };
      }

      if (kind === 'fasting') {
        const timeZone = cfg.location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const tomorrow = new Date(Date.now() + 24 * 3600_000);
        showFasting({
          sample: true,
          fastDate: '',
          weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(tomorrow),
          // A representative pair, so the sample shows that overlapping
          // reasons are listed rather than collapsed.
          reasons: ['White day — 14 of the month', 'Monday fast'],
          hijri: formatHijri(hijriDate(tomorrow, timeZone))
        }, cfg);
        return { ok: true };
      }

      return { ok: false, error: 'Unknown sample type.' };
    } catch (err) {
      console.error('sample notification failed', err);
      return { ok: false, error: err?.message ?? 'Could not show the sample.' };
    }
  });

  // Turn raw coordinates from the device's location service into a named
  // location with an IANA timezone.
  //
  // Resolved against the BUNDLED city database, not a reverse-geocoding
  // service: sending the user's position to a third party is precisely
  // what this app exists to avoid. The timezone matters more than the
  // name — every scheduling decision depends on it, and the browser
  // geolocation API does not supply one.
  ipcMain.handle('location:resolve', (_e, { latitude, longitude } = {}) => {
    try {
      const db = loadCities();
      const near = nearestCity(db.rows, Number(latitude), Number(longitude), db.countries);
      if (!near) return { ok: false, error: 'Could not match those coordinates to a known place.' };
      return {
        ok: true,
        // The user's ACTUAL coordinates are kept — the city is only used
        // for its name and timezone. Snapping to the city centre would
        // throw away the precision the location service just provided.
        location: {
          name: near.label,
          latitude: Number(latitude),
          longitude: Number(longitude),
          timezone: near.timezone
        },
        nearest: { label: near.label, distanceKm: near.distanceKm }
      };
    } catch (err) {
      console.error('location resolve failed', err);
      return { ok: false, error: err?.message ?? 'Could not resolve that location.' };
    }
  });

  ipcMain.handle('azkar:list', () => {
    const cfg = getConfig();
    const disabled = new Set(cfg.azkar?.disabled ?? []);
    return {
      bundled: allEntries().map((e) => ({
        order: e.order,
        when: e.when,
        ar: e.ar,
        en: e.en,
        count: e.count,
        enabled: !disabled.has(e.order)
      })),
      custom: cfg.azkar?.custom ?? [],
      // How many each session currently has, so the editor can warn before
      // the user empties one.
      counts: {
        morning: sessionEntries(effectiveEntries(allEntries(), cfg.azkar), 'morning').length,
        evening: sessionEntries(effectiveEntries(allEntries(), cfg.azkar), 'evening').length
      }
    };
  });

  ipcMain.handle('translations:list', () => ({
    available: TRANSLATIONS,
    downloaded: downloadedIds()
  }));

  ipcMain.handle('translations:download', async (_e, id) => {
    try {
      const result = await downloadTranslation(id);
      setConfig({ translation: { id, downloadedAt: new Date().toISOString() } });
      return { ok: true, ...result };
    } catch (err) {
      console.error('translation download failed', err);
      return { ok: false, error: err?.message ?? 'Download failed.' };
    }
  });

  ipcMain.handle('translations:remove', (_e, id) => {
    removeTranslation(id);
    if (getConfig().translation?.id === id) {
      setConfig({ translation: { id: null, downloadedAt: null } });
    }
    return { ok: true, downloaded: downloadedIds() };
  });

  // Selecting an already-downloaded translation, or clearing the choice.
  ipcMain.handle('translations:select', (_e, id) => {
    if (id && !TRANSLATIONS.some((t) => t.id === id)) return { ok: false, error: 'Unknown translation.' };
    setConfig({ translation: { id: id ?? null, downloadedAt: getConfig().translation?.downloadedAt ?? null } });
    return { ok: true };
  });

  ipcMain.handle('settings:resetPosition', () => { setConfig({ sequencePosition: 0 }); });
  ipcMain.on('settings:preview', () => fire());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.nizar.mihrab');

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
      console.log('mihrab: autostart reconciliation skipped (not a packaged build)');
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

    // FIRST RUN: no location chosen and never prompted. Open Settings so
    // the very first thing the user sees is the one question the app
    // genuinely cannot answer for them. Marked immediately, so dismissing
    // it means dismissed — the app asks once, not every launch.
    if (!getConfig().location && !getConfig().onboarded) {
      setConfig({ onboarded: true });
      openSettings();
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
