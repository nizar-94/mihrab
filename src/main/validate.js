// Standalone by design: no imports. config.js imports this module, so any
// import back into config.js would create a cycle.

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

export function validateNotification(n) {
  if (!n || typeof n !== 'object') return bad('Notification settings are missing.');
  const d = n.durationMs;
  if (!Number.isInteger(d) || d < 1000 || d > 300000) {
    return bad('Duration must be a whole number of milliseconds between 1000 and 300000.');
  }
  if (n.position !== 'bottom-right') return bad(`Unknown notification position: ${n?.position}`);
  return ok({ durationMs: d, position: n.position });
}
