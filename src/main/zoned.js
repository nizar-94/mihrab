// Local wall-clock time helpers.
//
// The project's standing rule is that scheduling is done in the user's own
// local time, never UTC — the bug the original Lambda shipped, and one the
// retired prayer-times API still has. Prayer times come out of `adhan`
// already anchored correctly, but the calendar-driven features (fasting
// reminders, azkar) need to build an instant from "this local date, at this
// wall-clock time, in this zone", which JavaScript has no direct API for.
//
// Pure: no Electron, no config, no I/O.

/**
 * The offset of `timeZone` from UTC at `date`, in milliseconds.
 * Positive east of Greenwich.
 */
export function zoneOffsetMs(date, timeZone) {
  // toLocaleString with a fixed 'en-US' format is the standard trick: it
  // renders the same instant twice, once as the zone sees it and once as
  // UTC sees it, and the difference is the offset. It is not elegant, but
  // it is correct and needs no timezone database of our own.
  const asZone = new Date(date.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return asZone.getTime() - asUtc.getTime();
}

/** The local calendar date in `timeZone`, as YYYY-MM-DD. */
export function localDateString(date, timeZone) {
  // 'en-CA' formats as YYYY-MM-DD, which is exactly the shape wanted and
  // avoids assembling it from parts.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone
  }).format(date);
}

/**
 * The instant at which the clock in `timeZone` reads `hhmm` on the local
 * date `iso` (YYYY-MM-DD).
 *
 * @param {string} iso - YYYY-MM-DD
 * @param {string} hhmm - HH:MM, zero-padded
 * @param {string} timeZone
 * @returns {Date}
 */
export function zonedTime(iso, hhmm, timeZone) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const naive = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
    hours,
    minutes
  );

  // First guess: treat the wall time as if it were UTC, then subtract the
  // zone's offset. The offset has to be sampled at some instant, and the
  // one we want is not known yet — so sample at the guess and refine once.
  // The second pass matters on DST changeover days, where the offset at the
  // naive instant differs from the offset at the true one; without it a
  // 16:30 reminder lands at 15:30 or 17:30 twice a year.
  let result = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  result = new Date(naive - zoneOffsetMs(result, timeZone));
  return result;
}

/** Add whole days to a YYYY-MM-DD string, staying in calendar space. */
export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
