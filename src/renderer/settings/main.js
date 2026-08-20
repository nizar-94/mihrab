const $ = (id) => document.getElementById(id);
const panes = ['interval', 'minuteOfHour', 'dailyTimes'];

function showPane(mode) {
  panes.forEach((p) => $(`pane-${p}`).classList.toggle('hidden', p !== mode));
}

function currentSchedule() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'interval') return { mode, everyMinutes: Number($('everyMinutes').value) };
  if (mode === 'minuteOfHour') {
    return { mode, minutes: $('minutes').value.split(',').map((s) => Number(s.trim())) };
  }
  return { mode, times: $('times').value.split(',').map((s) => s.trim()) };
}

async function load() {
  const { config, surahName, ayahNumber } = await window.settingsAPI.load();
  document.querySelector(`input[name=mode][value=${config.schedule.mode}]`).checked = true;
  showPane(config.schedule.mode);
  $('everyMinutes').value = config.schedule.everyMinutes ?? 90;
  $('minutes').value = (config.schedule.minutes ?? []).join(', ');
  $('times').value = (config.schedule.times ?? []).join(', ');
  $('qhEnabled').checked = config.quietHours.enabled;
  $('qhFrom').value = config.quietHours.from;
  $('qhTo').value = config.quietHours.to;
  document.querySelector(`input[name=order][value=${config.verseOrder}]`).checked = true;
  $('position').textContent = `Next in order: ${surahName} — ayah ${ayahNumber}`;
  $('soundEnabled').checked = config.sound.enabled;
  $('volume').value = config.sound.volume;
}

document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', () => showPane(r.value))
);

$('save').addEventListener('click', async () => {
  const res = await window.settingsAPI.save({
    schedule: currentSchedule(),
    quietHours: { enabled: $('qhEnabled').checked, from: $('qhFrom').value, to: $('qhTo').value },
    verseOrder: document.querySelector('input[name=order]:checked').value,
    sound: { enabled: $('soundEnabled').checked, volume: Number($('volume').value) }
  });
  $('error').textContent = res.ok ? '' : res.error;
  if (res.ok) window.close();
});

$('reset').addEventListener('click', async () => {
  await window.settingsAPI.resetPosition();
  await load();
});

$('preview').addEventListener('click', () => window.settingsAPI.preview());

// If `settings:load` rejects (e.g. the main process failed to read config
// even after falling back to defaults), surface it instead of leaving the
// form blank and letting Save later throw on a null querySelector.
load().catch((err) => {
  $('error').textContent = `Failed to load settings: ${err?.message ?? err}`;
});
