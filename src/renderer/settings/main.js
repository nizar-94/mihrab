const $ = (id) => document.getElementById(id);
const panes = ['interval', 'minuteOfHour', 'dailyTimes'];

// The renderer holds location and prayer settings as plain state and sends
// them to main on save. It never calculates a prayer time itself — the
// project's standing rule that no scheduling or calculation logic lives in
// a renderer. Every time shown here came from main via prayer:preview.
let location = null;
let prayerConfig = null;
let systemTimeZone = 'UTC';
// The notification section as loaded. The form only edits verseFontSize;
// durationMs and position are round-tripped so saving cannot drop them.
let loadedNotification = {};
let searchTimer = null;

// Kept in step with VERSE_FONT_SIZE_MIN/MAX in src/main/validate.js, which
// is what actually enforces them — this is only so the buttons disable at
// the limits instead of letting the user push into a value Save rejects.
const FONT_MIN = 14;
const FONT_MAX = 40;
let verseFontSize = 22;

function renderFontSize() {
  $('fontValue').textContent = String(verseFontSize);
  $('fontDown').disabled = verseFontSize <= FONT_MIN;
  $('fontUp').disabled = verseFontSize >= FONT_MAX;
  // The sample renders at the real size, so the number is not abstract.
  $('verseSample').style.fontSize = `${verseFontSize}px`;
}

const PRAYER_ROWS = [
  { key: 'fajr', en: 'Fajr', ar: 'الفجر' },
  { key: 'sunrise', en: 'Sunrise', ar: 'الشروق' },
  { key: 'dhuhr', en: 'Dhuhr', ar: 'الظهر' },
  { key: 'asr', en: 'Asr', ar: 'العصر' },
  { key: 'maghrib', en: 'Maghrib', ar: 'المغرب' },
  { key: 'isha', en: 'Isha', ar: 'العشاء' }
];

function showPane(mode) {
  panes.forEach((p) => $(`pane-${p}`).classList.toggle('hidden', p !== mode));
}

// ---- Settings tabs ---------------------------------------------------
// Qur'an, Athan, General, About. Note these are unrelated to showPane()
// above, which switches the three SCHEDULE MODES inside the Qur'an tab —
// same word, different thing, which is exactly why this one is named
// showTab().
const TABS = ['quran', 'athan', 'general', 'about'];

function showTab(name) {
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    const pane = $(`pane-${tab}`);
    const selected = tab === name;
    button.setAttribute('aria-selected', String(selected));
    pane.classList.toggle('hidden', !selected);
  }
  // Each tab starts at its own top rather than inheriting the previous
  // tab's scroll position, which otherwise lands you mid-section.
  document.querySelector('.content').scrollTop = 0;
}

for (const tab of TABS) {
  $(`tab-${tab}`).addEventListener('click', () => showTab(tab));
}

// Arrow keys move between tabs, as expected for a role="tablist". Up/Down
// are the meaningful pair now that the list is vertical; Left/Right are
// kept as well because both are conventional and neither costs anything.
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
  const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
  if (!forward && !back) return;
  e.preventDefault(); // stop Up/Down also scrolling the sidebar
  const current = TABS.findIndex((t) => $(`tab-${t}`).getAttribute('aria-selected') === 'true');
  const next = (current + (forward ? 1 : TABS.length - 1)) % TABS.length;
  showTab(TABS[next]);
  $(`tab-${TABS[next]}`).focus();
});

function currentSchedule() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'interval') return { mode, everyMinutes: Number($('everyMinutes').value) };
  if (mode === 'minuteOfHour') {
    return { mode, minutes: $('minutes').value.split(',').map((s) => Number(s.trim())) };
  }
  return { mode, times: $('times').value.split(',').map((s) => s.trim()) };
}

function renderLocation() {
  $('currentLocation').textContent = location
    ? `${location.name} — ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (${location.timezone})`
    : 'No location set';
  $('prayerNoLocation').classList.toggle('hidden', Boolean(location));
  $('prayerBody').classList.toggle('disabled', !location);
}

function renderCityResults(cities) {
  const box = $('cityResults');
  box.replaceChildren();
  for (const city of cities) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-result';
    const main = document.createElement('span');
    main.textContent = city.label;
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${city.latitude.toFixed(3)}, ${city.longitude.toFixed(3)} · ${city.timezone}`;
    button.append(main, sub);
    button.addEventListener('click', () => {
      location = {
        name: city.label,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone
      };
      $('citySearch').value = '';
      box.replaceChildren();
      renderLocation();
      refreshPreview();
    });
    box.append(button);
  }
}

function fillSelect(el, options, selected) {
  el.replaceChildren();
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.id;
    node.textContent = option.label;
    if (option.id === selected) node.selected = true;
    el.append(node);
  }
}

function renderPrayerRows() {
  const body = $('prayerRows');
  body.replaceChildren();

  for (const row of PRAYER_ROWS) {
    const settings = prayerConfig.perPrayer[row.key];
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    const ar = document.createElement('span');
    ar.className = 'prayer-ar';
    ar.lang = 'ar';
    ar.dir = 'rtl';
    ar.textContent = row.ar;
    nameCell.append(ar, document.createTextNode(` ${row.en}`));

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = settings.enabled;
    enabled.setAttribute('aria-label', `Enable ${row.en}`);
    enabled.addEventListener('change', () => { settings.enabled = enabled.checked; });

    const remindAt = document.createElement('input');
    remindAt.type = 'checkbox';
    remindAt.checked = settings.remindAt;
    remindAt.setAttribute('aria-label', `Remind at ${row.en}`);
    remindAt.addEventListener('change', () => { settings.remindAt = remindAt.checked; });

    const before = document.createElement('input');
    before.type = 'number';
    before.min = '0';
    before.max = '120';
    before.step = '1';
    before.value = String(settings.remindBefore);
    before.setAttribute('aria-label', `Minutes before ${row.en}`);
    before.addEventListener('change', () => { settings.remindBefore = Number(before.value) || 0; });

    const offset = document.createElement('input');
    offset.type = 'number';
    offset.min = '-59';
    offset.max = '59';
    offset.step = '1';
    offset.value = String(prayerConfig.offsets[row.key] ?? 0);
    offset.setAttribute('aria-label', `Adjust ${row.en} by minutes`);
    offset.addEventListener('change', () => {
      const value = Number(offset.value) || 0;
      // Zero means "no adjustment", so the key is dropped rather than
      // stored — keeps saved configs free of a pile of meaningless zeroes.
      if (value === 0) delete prayerConfig.offsets[row.key];
      else prayerConfig.offsets[row.key] = value;
      refreshPreview();
    });

    const time = document.createElement('td');
    time.className = 'time';
    time.id = `time-${row.key}`;
    time.textContent = '—';

    tr.append(nameCell);
    for (const control of [enabled, remindAt, before, offset]) {
      const td = document.createElement('td');
      td.append(control);
      tr.append(td);
    }
    tr.append(time);
    body.append(tr);
  }
}

/** Ask main what times the current form state would produce. */
async function refreshPreview() {
  if (!location) return;
  const preview = await window.settingsAPI.previewPrayerTimes({ location, prayer: prayerConfig });
  for (const row of PRAYER_ROWS) {
    const cell = $(`time-${row.key}`);
    if (!cell) continue;
    const found = preview?.find((p) => p.key === row.key);
    cell.textContent = found?.time ?? '—';
  }
}

async function load() {
  const { config, surahName, ayahNumber, version, preview, options, systemTimeZone: tz } = await window.settingsAPI.load();
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
  $('startWithWindows').checked = config.startWithWindows;

  loadedNotification = { ...config.notification };
  verseFontSize = config.notification?.verseFontSize ?? 22;
  renderFontSize();

  $('appVersion').textContent = `Muslim App v${version}`;
  systemTimeZone = tz ?? systemTimeZone;

  // structuredClone so editing the form never mutates the object that came
  // over IPC — Save is what commits, and Cancel (closing the window) must
  // genuinely discard.
  location = config.location ? structuredClone(config.location) : null;
  prayerConfig = structuredClone(config.prayer);

  fillSelect($('prayerMethod'), options.methods, prayerConfig.method);
  fillSelect($('prayerSchool'), options.schools, prayerConfig.school);
  fillSelect($('prayerHlr'), options.highLatitudeRules, prayerConfig.highLatitudeRule);

  $('prayerMethod').addEventListener('change', (e) => {
    prayerConfig.method = e.target.value;
    refreshPreview();
  });
  $('prayerSchool').addEventListener('change', (e) => {
    prayerConfig.school = e.target.value;
    refreshPreview();
  });
  $('prayerHlr').addEventListener('change', (e) => {
    prayerConfig.highLatitudeRule = e.target.value;
    refreshPreview();
  });

  renderLocation();
  renderPrayerRows();

  // settings:load already computed today's times for the saved config, so
  // the table is populated without a second round trip on open.
  if (preview) {
    for (const row of preview) {
      const cell = $(`time-${row.key}`);
      if (cell) cell.textContent = row.time ?? '—';
    }
  }
}

document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', () => showPane(r.value))
);

// Debounced: every keystroke would otherwise cross IPC and scan 34,000
// rows. 180ms is below the threshold where typing feels laggy but well
// above a fast typist's inter-key interval.
$('citySearch').addEventListener('input', (e) => {
  const query = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    renderCityResults(await window.settingsAPI.searchCities(query));
  }, 180);
});

$('fontDown').addEventListener('click', () => {
  verseFontSize = Math.max(FONT_MIN, verseFontSize - 1);
  renderFontSize();
});

$('fontUp').addEventListener('click', () => {
  verseFontSize = Math.min(FONT_MAX, verseFontSize + 1);
  renderFontSize();
});

$('manualToggle').addEventListener('click', () => {
  $('manualPane').classList.toggle('hidden');
});

$('manualApply').addEventListener('click', () => {
  const lat = Number($('manualLat').value);
  const lon = Number($('manualLon').value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    $('error').textContent = 'Enter a latitude between -90 and 90 and a longitude between -180 and 180.';
    return;
  }
  $('error').textContent = '';
  location = {
    name: $('manualName').value.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    latitude: lat,
    longitude: lon,
    // Manually entered coordinates are almost always where the machine is,
    // so the system zone is the right default. Deriving a zone from
    // coordinates would need a dataset larger than the city list itself.
    timezone: systemTimeZone
  };
  renderLocation();
  refreshPreview();
});

$('save').addEventListener('click', async () => {
  const res = await window.settingsAPI.save({
    schedule: currentSchedule(),
    quietHours: { enabled: $('qhEnabled').checked, from: $('qhFrom').value, to: $('qhTo').value },
    verseOrder: document.querySelector('input[name=order]:checked').value,
    sound: { enabled: $('soundEnabled').checked, volume: Number($('volume').value) },
    startWithWindows: $('startWithWindows').checked,
    notification: { ...loadedNotification, verseFontSize },
    location,
    prayer: prayerConfig
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
