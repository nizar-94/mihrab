import { applyLanguage, LANGUAGES, t } from './i18n.js';

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
let uiLanguage = 'ar';

// Re-applied after every render that creates nodes, because those are
// built in JS after the initial pass has already walked the document.
function retranslate() {
  applyLanguage(uiLanguage);
}
let fastingConfig = null;
let azkarConfig = null;
let translations = { available: [], downloaded: [] };
let azkarLibrary = { bundled: [], custom: [], counts: { morning: 0, evening: 0 } };
let selectedTranslation = null;

// id suffix in the DOM -> config key.
const FASTING_FIELDS = [
  ['WhiteDays', 'whiteDays'],
  ['MondayThursday', 'mondayThursday'],
  ['Ashura', 'ashura'],
  ['Arafah', 'arafah'],
  ['SixOfShawwal', 'sixOfShawwal']
];

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
const TABS = ['quran', 'athan', 'azkar', 'fasting', 'general', 'about'];

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

function renderKhitmah(progress, order) {
  const box = $('khitmahBox');
  if (!progress || order !== 'sequential') {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  $('khitmahPercent').textContent = `${progress.percent}%`;
  $('khitmahFill').style.width = `${progress.percent}%`;
  $('khitmahText').textContent =
    `${progress.read.toLocaleString()} of ${progress.total.toLocaleString()} ayat read · ${progress.remaining.toLocaleString()} remaining`;
}

function renderTranslations() {
  const select = $('translationSelect');
  select.replaceChildren();

  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None — Arabic only';
  if (!selectedTranslation) none.selected = true;
  select.append(none);

  // Grouped by language, because twenty flat entries is a wall.
  const byLanguage = new Map();
  for (const t of translations.available) {
    if (!byLanguage.has(t.language)) byLanguage.set(t.language, []);
    byLanguage.get(t.language).push(t);
  }
  for (const [language, list] of byLanguage) {
    const group = document.createElement('optgroup');
    group.label = language;
    for (const t of list) {
      const option = document.createElement('option');
      option.value = t.id;
      // A downloaded translation is marked, so "Download" versus "already
      // have it" is visible without clicking anything.
      option.textContent = translations.downloaded.includes(t.id) ? `${t.name} ✓` : t.name;
      if (t.id === selectedTranslation) option.selected = true;
      group.append(option);
    }
    select.append(group);
  }

  const isDownloaded = selectedTranslation && translations.downloaded.includes(selectedTranslation);
  $('translationDownload').disabled = !selectedTranslation || isDownloaded;
  $('translationRemove').disabled = !isDownloaded;
  $('translationStatus').textContent = !selectedTranslation
    ? 'No translation — the card shows Arabic only.'
    : isDownloaded
      ? 'Downloaded and in use.'
      : 'Not downloaded yet.';
  retranslate();
}

function azkarBelongsTo(when, filter) {
  if (filter === 'all') return true;
  return when === 'both' || when === filter;
}

function renderAzkarList() {
  const list = $('azkarList');
  const filter = $('azkarFilter').value;
  list.replaceChildren();

  const row = ({ key, ar, en, count, when, checked, custom, onToggle, onRemove }) => {
    const item = document.createElement('label');
    item.className = custom ? 'azkar-item is-custom' : 'azkar-item';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onToggle(box.checked));

    const body = document.createElement('div');
    body.className = 'body';
    const arabic = document.createElement('div');
    arabic.className = 'ar';
    arabic.lang = 'ar';
    arabic.dir = 'rtl';
    arabic.textContent = ar;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = custom ? 'yours' : when === 'both' ? 'morning + evening' : when;
    meta.append(tag);
    meta.append(document.createTextNode(
      `${count > 1 ? count + '\u00d7' : 'once'}${en ? ' — ' + en.slice(0, 70) : ''}`
    ));
    body.append(arabic, meta);

    item.append(box, body);

    if (onRemove) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.title = 'Remove this dhikr';
      remove.setAttribute('aria-label', 'Remove this dhikr');
      remove.textContent = '\u00d7';
      // stopPropagation: the whole row is a <label>, so a click would
      // otherwise also toggle the checkbox on its way out.
      remove.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onRemove(); });
      item.append(remove);
    }

    list.append(item);
  };

  for (const entry of azkarLibrary.bundled) {
    if (!azkarBelongsTo(entry.when, filter)) continue;
    row({
      ...entry,
      key: entry.order,
      checked: !azkarConfig.disabled.includes(entry.order),
      custom: false,
      onToggle: (on) => {
        azkarConfig.disabled = on
          ? azkarConfig.disabled.filter((n) => n !== entry.order)
          : [...azkarConfig.disabled, entry.order];
        renderAzkarCounts();
      }
    });
  }

  for (const entry of azkarConfig.custom) {
    if (!azkarBelongsTo(entry.when, filter)) continue;
    row({
      ...entry,
      key: entry.id,
      checked: true,
      custom: true,
      // A custom dhikr has no "off" state — unticking it removes it, which
      // is what the × does. The checkbox is kept for visual consistency and
      // simply removes on untick.
      onToggle: (on) => { if (!on) removeCustom(entry.id); },
      onRemove: () => removeCustom(entry.id)
    });
  }

  if (!list.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'azkar-item';
    empty.textContent = 'Nothing matches this filter.';
    list.append(empty);
  }
  retranslate();
}

function removeCustom(id) {
  azkarConfig.custom = azkarConfig.custom.filter((c) => c.id !== id);
  renderAzkarList();
  renderAzkarCounts();
}

function renderAzkarCounts() {
  // Counted here rather than round-tripping to main: the form's state is
  // what the user is about to save, and it changes on every tick.
  const active = [
    ...azkarLibrary.bundled.filter((e) => !azkarConfig.disabled.includes(e.order)),
    ...azkarConfig.custom
  ];
  const morning = active.filter((e) => e.when !== 'evening').length;
  const evening = active.filter((e) => e.when !== 'morning').length;
  $('azkarCounts').textContent = `${morning} morning · ${evening} evening`;
  // An empty set means the reminder fires with nothing to show, so say so
  // rather than letting it fail silently at 5am.
  const emptied = (azkarConfig.morning.enabled && morning === 0)
    || (azkarConfig.evening.enabled && evening === 0);
  $('azkarCounts').style.color = emptied ? 'var(--danger)' : '';
}

function renderAzkar() {
  for (const session of ['morning', 'evening']) {
    const cap = session[0].toUpperCase() + session.slice(1);
    $(`azkar${cap}Enabled`).checked = azkarConfig[session].enabled === true;
    $(`azkar${cap}Offset`).value = String(azkarConfig[session].offsetMinutes);
  }
  $('azkarNoLocation').classList.toggle('hidden', Boolean(location));
  $('azkarBody').classList.toggle('disabled', !location);
  // The editor is deliberately NOT location-gated: which adhkar you want is
  // a content choice, and there is no reason to block editing the list just
  // because prayer times have nowhere to anchor yet.
  renderAzkarCounts();
}

function renderFasting() {
  for (const [suffix, key] of FASTING_FIELDS) {
    $(`fast${suffix}`).checked = fastingConfig[key] === true;
  }
  $('fastRemindAt').value = fastingConfig.remindAt;
  // Location-gated for the same reason prayer times are: the Hijri day and
  // the weekday both depend on the user's timezone.
  $('fastingNoLocation').classList.toggle('hidden', Boolean(location));
  $('fastingBody').classList.toggle('disabled', !location);
}

function renderLocation() {
  $('currentLocation').textContent = location
    ? `${location.name} — ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (${location.timezone})`
    : 'No location set';
  // The prompt disappears the moment a location exists — no save needed,
  // because it is answering a question, not editing a field.
  $('onboarding').classList.toggle('hidden', Boolean(location));
  $('prayerNoLocation').classList.toggle('hidden', Boolean(location));
  $('prayerBody').classList.toggle('disabled', !location);
  // The fasting and azkar panes are gated on the same location, so they
  // must re-render whenever it changes.
  if (fastingConfig) renderFasting();
  if (azkarConfig) renderAzkar();
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
  retranslate();
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
  retranslate();
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
  const { config, surahName, ayahNumber, version, preview, options, needsLocation, khitmah, systemTimeZone: tz } = await window.settingsAPI.load();
  document.querySelector(`input[name=mode][value=${config.schedule.mode}]`).checked = true;
  showPane(config.schedule.mode);
  $('everyMinutes').value = config.schedule.everyMinutes ?? 90;
  $('minutes').value = (config.schedule.minutes ?? []).join(', ');
  $('times').value = (config.schedule.times ?? []).join(', ');
  $('qhEnabled').checked = config.quietHours.enabled;
  $('qhFrom').value = config.quietHours.from;
  $('qhTo').value = config.quietHours.to;
  document.querySelector(`input[name=order][value=${config.verseOrder}]`).checked = true;
  renderKhitmah(khitmah, config.verseOrder);
  // The bar only means something in sequential order, so it appears and
  // disappears with the choice rather than sitting there showing a number
  // the user is not accumulating.
  for (const radio of document.querySelectorAll('input[name=order]')) {
    radio.addEventListener('change', () => renderKhitmah(khitmah, radio.value));
  }
  $('position').textContent = `Next in order: ${surahName} — ayah ${ayahNumber}`;
  $('soundEnabled').checked = config.sound.enabled;
  $('volume').value = config.sound.volume;
  $('startWithWindows').checked = config.startWithWindows;

  loadedNotification = { ...config.notification };
  verseFontSize = config.notification?.verseFontSize ?? 22;
  renderFontSize();

  $('appVersion').textContent = `Mihrab v${version}`;

  uiLanguage = config.language ?? 'ar';
  fillSelect($('uiLanguage'), LANGUAGES, uiLanguage);
  $('uiLanguage').addEventListener('change', (e) => {
    uiLanguage = e.target.value;
    // Applied immediately rather than on Save: a language switch you have
    // to save before you can read is a poor way to find out you picked the
    // wrong one.
    retranslate();
  });
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

  selectedTranslation = config.translation?.id ?? null;
  translations = await window.settingsAPI.listTranslations();
  renderTranslations();

  $('translationSelect').addEventListener('change', async (e) => {
    selectedTranslation = e.target.value || null;
    // Selection is applied immediately rather than on Save: it is a
    // download, not a form field, and the Download button next to it has to
    // know what it would be fetching.
    await window.settingsAPI.selectTranslation(selectedTranslation);
    renderTranslations();
  });

  $('translationDownload').addEventListener('click', async () => {
    if (!selectedTranslation) return;
    const button = $('translationDownload');
    button.disabled = true;
    $('translationStatus').textContent = 'Downloading…';
    const res = await window.settingsAPI.downloadTranslation(selectedTranslation);
    if (!res.ok) {
      $('error').textContent = `Could not download translation: ${res.error}`;
      $('translationStatus').textContent = 'Download failed.';
      button.disabled = false;
      return;
    }
    $('error').textContent = '';
    translations = await window.settingsAPI.listTranslations();
    renderTranslations();
  });

  $('translationRemove').addEventListener('click', async () => {
    if (!selectedTranslation) return;
    const res = await window.settingsAPI.removeTranslation(selectedTranslation);
    translations.downloaded = res.downloaded;
    selectedTranslation = null;
    renderTranslations();
  });

  fastingConfig = structuredClone(config.fasting);
  azkarConfig = structuredClone(config.azkar);
  azkarConfig.disabled = Array.isArray(azkarConfig.disabled) ? azkarConfig.disabled : [];
  azkarConfig.custom = Array.isArray(azkarConfig.custom) ? azkarConfig.custom : [];

  azkarLibrary = await window.settingsAPI.listAzkar();
  renderAzkarList();

  $('azkarFilter').addEventListener('change', renderAzkarList);

  $('azkarAdd').addEventListener('click', () => {
    const ar = $('azkarNewAr').value.trim();
    if (!ar) {
      $('error').textContent = 'A custom dhikr needs its Arabic text.';
      return;
    }
    $('error').textContent = '';
    azkarConfig.custom.push({
      // Time-free unique id: the config may already hold custom-1, and
      // reusing an id would make removal ambiguous.
      id: `custom-${azkarConfig.custom.length + 1}-${azkarConfig.custom.length}`,
      ar,
      en: $('azkarNewEn').value.trim(),
      translit: '',
      count: Number($('azkarNewCount').value) || 1,
      when: $('azkarNewWhen').value
    });
    $('azkarNewAr').value = '';
    $('azkarNewEn').value = '';
    $('azkarNewCount').value = '1';
    renderAzkarList();
    renderAzkarCounts();
  });

  fillSelect($('azkarMorningAnchor'), options.morningAnchors, azkarConfig.morning.anchor);
  fillSelect($('azkarEveningAnchor'), options.eveningAnchors, azkarConfig.evening.anchor);

  for (const session of ['morning', 'evening']) {
    const cap = session[0].toUpperCase() + session.slice(1);
    $(`azkar${cap}Enabled`).addEventListener('change', (e) => {
      azkarConfig[session].enabled = e.target.checked;
    });
    $(`azkar${cap}Anchor`).addEventListener('change', (e) => {
      azkarConfig[session].anchor = e.target.value;
    });
    $(`azkar${cap}Offset`).addEventListener('change', (e) => {
      azkarConfig[session].offsetMinutes = Number(e.target.value) || 0;
    });
  }
  // First run: land on the Athan tab with the prompt showing, rather than
  // on Qur'an where the one thing that needs answering is invisible.
  if (needsLocation) {
    $('onboarding').classList.remove('hidden');
    showTab('athan');
    $('citySearch').focus();
  }

  renderLocation();
  renderPrayerRows();
  renderFasting();
  renderAzkar();

  for (const [suffix, key] of FASTING_FIELDS) {
    $(`fast${suffix}`).addEventListener('change', (e) => {
      fastingConfig[key] = e.target.checked;
    });
  }
  $('fastRemindAt').addEventListener('change', (e) => {
    fastingConfig.remindAt = e.target.value;
  });

  // settings:load already computed today's times for the saved config, so
  // the table is populated without a second round trip on open.
  if (preview) {
    for (const row of preview) {
      const cell = $(`time-${row.key}`);
      if (cell) cell.textContent = row.time ?? '—';
    }
  }

  // Last, so it covers every node the renders above created.
  retranslate();
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
    prayer: prayerConfig,
    fasting: fastingConfig,
    azkar: azkarConfig,
    language: uiLanguage
  });
  $('error').textContent = res.ok ? '' : res.error;
  if (res.ok) window.close();
});

$('reset').addEventListener('click', async () => {
  await window.settingsAPI.resetPosition();
  await load();
});

$('preview').addEventListener('click', () => window.settingsAPI.preview());

// Sample notifications. Each shows the real card with a "Sample" badge, so
// what you see is exactly what a real reminder will look like.
for (const [id, kind] of [['samplePrayer', 'prayer'], ['sampleAzkar', 'azkar'], ['sampleFasting', 'fasting']]) {
  $(id).addEventListener('click', async () => {
    const res = await window.settingsAPI.showSample(kind);
    // A sample can legitimately fail — "no adhkar are enabled" is a real
    // answer, and the user needs to know why nothing appeared rather than
    // wondering if the button is broken.
    $('error').textContent = res?.ok ? '' : (res?.error ?? 'Could not show the sample.');
  });
}

// If `settings:load` rejects (e.g. the main process failed to read config
// even after falling back to defaults), surface it instead of leaving the
// form blank and letting Save later throw on a null querySelector.
load().catch((err) => {
  $('error').textContent = `Failed to load settings: ${err?.message ?? err}`;
});
