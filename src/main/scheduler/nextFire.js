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
