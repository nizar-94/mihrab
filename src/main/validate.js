// Standalone by design: no imports. config.js imports this module, so any
// import back into config.js would create a cycle.

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
    return ok({ mode: 'dailyTimes', times: [...new Set(s.times)].sort() });
  }

  return bad(`Unknown schedule mode: ${s?.mode}`);
}

export function validateQuietHours(q) {
  if (!q || typeof q !== 'object') return bad('Quiet hours are missing.');
  if (typeof q.enabled !== 'boolean') return bad('Quiet hours enabled must be true or false.');
  if (typeof q.from !== 'string' || typeof q.to !== 'string' || !HHMM.test(q.from) || !HHMM.test(q.to)) {
    return bad('Quiet hours must be in HH:MM format.');
  }
  // Equal bounds make the window either empty or the whole day depending on
  // which branch quietHours.js takes. Reject rather than guess.
  if (q.from === q.to) return bad('Quiet hours start and end cannot be the same.');
  return ok({ enabled: q.enabled, from: q.from, to: q.to });
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
