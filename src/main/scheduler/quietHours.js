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
