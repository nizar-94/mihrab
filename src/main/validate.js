// Validators. Each returns {ok: true, value} or {ok: false, error}, so the
// settings form and the disk-read path in config.js share one definition of
// what is acceptable.
//
// Imports only ever point AWAY from config.js — config.js imports this
// module, so importing it back would create a cycle. The prayer imports
// below are safe for that reason: prayer/methods.js and prayer/schedule.js
// depend on adhan and each other, never on config.
import {
  METHODS,
  SCHOOLS,
  HIGH_LATITUDE_RULES,
  POLAR_RESOLUTIONS,
  DEFAULT_METHOD,
  DEFAULT_SCHOOL,
  DEFAULT_HIGH_LATITUDE_RULE,
  DEFAULT_POLAR_RESOLUTION
} from './prayer/methods.js';
import { NOTIFIABLE_KEYS, DEFAULT_PER_PRAYER } from './prayer/schedule.js';

// Hour may be one or two digits: "1:31" and "01:31" are the same time, and
// typing the leading zero is friction with no purpose. Everything is
// normalised to zero-padded HH:MM by normaliseTime() below before it is
// stored or compared, so the rest of the app (quietHours.js's string
// comparisons, nextFire.js's parsing, dailyTimes' .sort()) continues to see
// exactly one format and needs no changes.
const HHMM = /^(\d{1,2}):([0-5]\d)$/;

const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });

// Returns zero-padded "HH:MM", or null if the input is not a valid time.
// Exported for tests; callers below treat null as "reject".
export function normaliseTime(t) {
  if (typeof t !== 'string') return null;
  const m = HHMM.exec(t.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${m[2]}`;
}

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
    const normalised = s.times.map(normaliseTime);
    if (normalised.some((t) => t === null)) {
      return bad('Times must be in HH:MM format, e.g. 9:00 or 21:30.');
    }
    // Dedupe AFTER normalising, so "9:00" and "09:00" in the same list
    // collapse to one entry rather than surviving as two identical fire
    // times. Sorting stays a plain string sort, which is correct precisely
    // because every entry is now zero-padded.
    return ok({ mode: 'dailyTimes', times: [...new Set(normalised)].sort() });
  }

  return bad(`Unknown schedule mode: ${s?.mode}`);
}

export function validateQuietHours(q) {
  if (!q || typeof q !== 'object') return bad('Quiet hours are missing.');
  if (typeof q.enabled !== 'boolean') return bad('Quiet hours enabled must be true or false.');
  const from = normaliseTime(q.from);
  const to = normaliseTime(q.to);
  if (from === null || to === null) {
    return bad('Quiet hours must be in HH:MM format, e.g. 9:00 or 21:30.');
  }
  // Equal bounds make the window either empty or the whole day depending on
  // which branch quietHours.js takes. Reject rather than guess. Compared
  // after normalising so "7:00" and "07:00" are correctly seen as equal.
  if (from === to) return bad('Quiet hours start and end cannot be the same.');
  return ok({ enabled: q.enabled, from, to });
}

export function validateSound(s) {
  if (!s || typeof s !== 'object') return bad('Sound settings are missing.');
  if (typeof s.enabled !== 'boolean') return bad('Sound enabled must be true or false.');
  if (typeof s.volume !== 'number' || Number.isNaN(s.volume) || s.volume < 0 || s.volume > 1) {
    return bad('Volume must be between 0 and 1.');
  }
  return ok({ enabled: s.enabled, volume: s.volume });
}

export const VERSE_FONT_SIZE_MIN = 14;
export const VERSE_FONT_SIZE_MAX = 40;
export const VERSE_FONT_SIZE_DEFAULT = 22;

export function validateNotification(n) {
  if (!n || typeof n !== 'object') return bad('Notification settings are missing.');
  const d = n.durationMs;
  if (!Number.isInteger(d) || d < 1000 || d > 300000) {
    return bad('Duration must be a whole number of milliseconds between 1000 and 300000.');
  }
  if (n.position !== 'bottom-right') return bad(`Unknown notification position: ${n?.position}`);

  // Bounds are about legibility, not taste: below ~14px the tashkeel on
  // Amiri Quran stop being distinguishable, and above ~40px even a short
  // ayah overflows the card's 60%-of-screen height cap.
  const size = n.verseFontSize ?? VERSE_FONT_SIZE_DEFAULT;
  if (!Number.isInteger(size) || size < VERSE_FONT_SIZE_MIN || size > VERSE_FONT_SIZE_MAX) {
    return bad(`Verse text size must be a whole number between ${VERSE_FONT_SIZE_MIN} and ${VERSE_FONT_SIZE_MAX}.`);
  }
  return ok({ durationMs: d, position: n.position, verseFontSize: size });
}

// --- Schema v2: location and prayer settings --------------------------
//
// These are imported from prayer/methods.js and prayer/schedule.js rather
// than duplicated, so adding a calculation method in one place cannot leave
// the validator rejecting it in another.

// Deliberately permissive about the zone STRING but strict about its
// validity: Intl throws a RangeError on an unknown zone, and that throw
// would otherwise surface on the first scheduler tick rather than here.
function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateLocation(l) {
  if (l === null) return ok(null);
  if (!l || typeof l !== 'object') return bad('Location is missing.');

  const lat = Number(l.latitude);
  const lon = Number(l.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return bad('Latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return bad('Longitude must be between -180 and 180.');
  }
  if (!isValidTimeZone(l.timezone)) {
    return bad('Location needs a valid IANA time zone, e.g. Asia/Jerusalem.');
  }
  const name = typeof l.name === 'string' ? l.name.trim() : '';
  if (!name) return bad('Location needs a name.');

  return ok({ name, latitude: lat, longitude: lon, timezone: l.timezone });
}

export function validatePrayer(p) {
  if (!p || typeof p !== 'object') return bad('Prayer settings are missing.');

  const method = METHODS.some((m) => m.id === p.method) ? p.method : DEFAULT_METHOD;
  const school = SCHOOLS.some((s) => s.id === p.school) ? p.school : DEFAULT_SCHOOL;
  const highLatitudeRule = HIGH_LATITUDE_RULES.some((r) => r.id === p.highLatitudeRule)
    ? p.highLatitudeRule
    : DEFAULT_HIGH_LATITUDE_RULE;
  const polarCircleResolution = POLAR_RESOLUTIONS.some((r) => r.id === p.polarCircleResolution)
    ? p.polarCircleResolution
    : DEFAULT_POLAR_RESOLUTION;

  // Unknown ids fall back to defaults rather than failing the whole object.
  // A config naming a method removed in a later version should cost the user
  // their method choice, not every prayer setting they have.

  const offsets = {};
  for (const key of NOTIFIABLE_KEYS) {
    const value = p.offsets?.[key];
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value)) return bad(`Offset for ${key} must be a whole number of minutes.`);
    if (value < -59 || value > 59) return bad(`Offset for ${key} must be between -59 and 59 minutes.`);
    offsets[key] = value;
  }

  const perPrayer = {};
  for (const key of NOTIFIABLE_KEYS) {
    const raw = p.perPrayer?.[key] ?? DEFAULT_PER_PRAYER[key];
    const before = raw?.remindBefore ?? 0;
    if (!Number.isInteger(before) || before < 0 || before > 120) {
      return bad(`Reminder lead time for ${key} must be between 0 and 120 minutes.`);
    }
    perPrayer[key] = {
      enabled: raw?.enabled === true,
      remindAt: raw?.remindAt !== false,
      remindBefore: before
    };
  }

  return ok({ method, school, highLatitudeRule, polarCircleResolution, offsets, perPrayer });
}
