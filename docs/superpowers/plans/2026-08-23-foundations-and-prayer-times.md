# Foundations and Prayer Times — Implementation Plan

> **Plan 1 of 5.** Covers the shared foundations (location, Hijri calendar,
> prayer engine, scheduler providers) and roadmap Phase 2. Plans 2–5 cover
> Phase 7 (athan audio), Phase 4 (fasting), Phase 3 (azkar) and Phase 5
> (translations); each is written once the interfaces below exist.

**Goal:** The app can compute prayer times for a user-chosen location
anywhere in the world, verified against a year of captured reference data,
and fire notifications for them.

**Architecture:** Prayer times become an additional *source of fire times*
for the existing scheduler, not new scheduling machinery. `SchedulerEngine`
gains a provider list; the verse logic moves behind that interface unchanged.
All calculation lives in pure modules with no Electron imports, so it is
testable under Vitest against committed fixtures.

**Tech Stack:** `adhan` 4.4.4 (MIT), `Intl.DateTimeFormat` with
`islamic-umalqura`, GeoNames `cities15000` (CC-BY 4.0), existing
electron-vite / Vitest setup.

**Spec:** [`docs/superpowers/specs/2026-08-23-prayer-times-and-reminders-design.md`](../specs/2026-08-23-prayer-times-and-reminders-design.md)

## Global Constraints

- **The user performs all commits.** Every task ends with a suggested
  message. Do not run `git commit`.
- **Plain JavaScript, ESM, no TypeScript.** JSDoc typedefs for non-obvious
  shapes.
- **No scheduling, selection, or calculation logic in any renderer.**
  Renderers read and write config over IPC only.
- **Local wall-clock time only** in scheduling. No UTC conversion. The
  original Lambda's bug was mixing the two; the old Railway API still has it.
- **Any module Vitest must import may not use named `electron` imports.**
  Use `import electron from 'electron'` then destructure — under plain Node
  `'electron'` resolves to a string, so named imports fail to load at all.
  See `config.js`, `updater.js`, `tray.js`.
- **Existing tests must pass unmodified.** 165 at the time of writing. If a
  refactor requires editing an existing test, it changed behaviour it was not
  meant to touch.
- **Wrong prayer times rank with wrong Quran text.** Task 6's validation
  gate is not optional and must not be softened to ship.

---

## File Structure

**Created:**

| File | Responsibility |
|------|----------------|
| `src/main/location/cities.js` | Load and search the bundled city database |
| `src/main/prayer/times.js` | Pure `adhan` wrapper: coords + date + settings → six times |
| `src/main/prayer/methods.js` | Method/school/high-latitude presets, incl. Palestine (legacy) |
| `src/main/prayer/schedule.js` | Prayer times → fire times (enabled, remind-before, offsets) |
| `src/main/hijri.js` | Hijri date via `Intl`, pinned to `islamic-umalqura` |
| `src/main/scheduler/providers.js` | Provider interface + earliest-wins selection |
| `tools/make-cities.mjs` | Regenerates the trimmed city database from GeoNames |
| `tests/prayerTimes.test.js` | Unit tests for the wrapper and presets |
| `tests/prayerFixtures.test.js` | **The validation gate** — fixtures, 365 days |
| `tests/prayerSchedule.test.js` | Fire-time derivation |
| `tests/hijri.test.js` | Calendar correctness, incl. the umalqura-vs-civil trap |
| `tests/providers.test.js` | Earliest-wins, empty list, provider errors |
| `tests/cities.test.js` | Search ranking and manual-coordinate fallback |

**Modified:**

| File | Change |
|------|--------|
| `src/main/config.js` | Schema v2: `location`, `prayer` sections; migration |
| `src/main/validate.js` | `validateLocation`, `validatePrayer` |
| `src/main/scheduler/engine.js` | Take a provider list instead of one hardcoded source |
| `src/main/index.js` | Register providers; prayer IPC; wire location into config |
| `src/main/notifier.js` | Render a prayer card as well as a verse card |
| `src/renderer/settings/index.html` | Location picker, prayer settings panes |
| `src/renderer/settings/main.js` | Load/save the new sections |
| `src/preload/settings.js` | Expose city search over IPC |
| `electron-builder.yml` | Ship the city database via `extraResources` |
| `NOTICE` | GeoNames CC-BY 4.0 attribution |

---

## Task 1: Hijri calendar

**Files:** Create `src/main/hijri.js`, `tests/hijri.test.js`

**Produces:** `hijriDate(date, timeZone) -> {day, month, year}`,
`isWhiteDay(h)`, `HIJRI_MONTHS` (array of 12 English names).

Pure, no dependencies. Uses `Intl.DateTimeFormat` with the
`en-u-ca-islamic-umalqura` locale and an explicit `timeZone`, parsing the
numeric parts via `formatToParts` rather than string splitting.

- [ ] Implement `hijriDate`, reading `day`/`month`/`year` from
      `formatToParts` so output is not locale-order dependent.
- [ ] Pin the calendar choice with a test asserting 2026-08-23 in
      `Asia/Jerusalem` is 10 Rabīʿ al-awwal 1448 — matching the captured
      aladhan response — **and** that `islamic-civil` would give day 9.
      That one-day error would misfire every Phase 4 reminder.
- [ ] Test that the timezone argument matters: a UTC-evening instant must
      give different Hijri days for `Pacific/Kiritimati` and `Pacific/Midway`.
- [ ] Test `isWhiteDay` for 13/14/15 true, 12/16 false.

**Commit:** `feat: add Hijri date helpers pinned to islamic-umalqura`

---

## Task 2: City database and tooling

**Files:** Create `tools/make-cities.mjs`, `src/main/location/cities.js`,
`tests/cities.test.js`. Modify `electron-builder.yml`, `NOTICE`.

**Consumes:** nothing.
**Produces:** `searchCities(query, limit) -> City[]`,
`loadCities(path)`, where
`City = {name, country, admin1, latitude, longitude, timezone, population}`.

- [ ] `tools/make-cities.mjs` downloads GeoNames `cities15000.zip`, keeps
      only the seven fields above, sorts by population descending, writes
      `resources/cities.json`. Document the CC-BY 4.0 source in the file
      header, as `make-chime.mjs` documents its output.
- [ ] Add the GeoNames attribution to `NOTICE`, in the same form as the
      existing Tanzil and Amiri entries.
- [ ] Ship via `extraResources` beside `quran-uthmani.json`, and exclude
      `resources/cities.json` from the asar — same reasoning as the Quran
      dataset: a large blob read on demand, not application code.
- [ ] `cities.js` loads lazily on first search (never at import) and caches.
      Resolve the path from `process.resourcesPath` when packaged and from
      the repo when not, mirroring `quran.js`.
- [ ] `searchCities` matches case- and diacritic-insensitively on a prefix
      first, then substring, ranking by population within each group so
      "lon" surfaces London before Longview.
- [ ] Test ranking, an empty query returning nothing, and a query matching
      nothing returning `[]` rather than throwing.

**Commit:** `feat: bundle an offline city database for location selection`

---

## Task 3: Prayer calculation methods

**Files:** Create `src/main/prayer/methods.js`

**Produces:** `METHODS` (array of `{id, label, adhanKey}`), `SCHOOLS`,
`HIGH_LATITUDE_RULES`, `PRESETS`, and
`paramsFor(prayerConfig, coordinates) -> CalculationParameters`.

- [ ] Expose MWL, ISNA, Egyptian, Umm Al-Qura, Karachi, Tehran, Dubai,
      Kuwait, Qatar, Singapore, Turkey.
- [ ] Add the **Palestine (legacy)** preset: MWL with offsets
      `{sunrise: -3, maghrib: +6, isha: +5}`, derived in spec §1.2 from 363
      days of captured data. Comment it with that provenance — it is an
      empirical match to a retired API, not a published convention, and a
      future maintainer must not "clean it up".
- [ ] Default `highLatitudeRule` from `HighLatitudeRule.recommended()` for
      the coordinates when the user has not chosen one. Spec §1.4: without
      this, 65 days a year are degenerate at 69°N.
- [ ] `paramsFor` applies method, school and high-latitude rule. Per-prayer
      offsets are **not** applied here — they belong in Task 4, applied
      after calculation, so the preset stays a data row.

**Commit:** `feat: add prayer calculation method presets`

---

## Task 4: Prayer times wrapper

**Files:** Create `src/main/prayer/times.js`, `tests/prayerTimes.test.js`

**Consumes:** `paramsFor` from Task 3.
**Produces:** `prayerTimes(coordinates, date, prayerConfig) -> {fajr,
sunrise, dhuhr, asr, maghrib, isha}` as `Date` objects, and
`PRAYER_KEYS` (ordered array of the six keys).

- [ ] Wrap `adhan`'s `PrayerTimes`. No other module may import `adhan`
      directly — a single seam keeps the library swappable and the rest of
      the codebase testable without it.
- [ ] Apply per-prayer offsets last, uniformly, in minutes.
- [ ] Return `null` for a prayer `adhan` reports as invalid rather than an
      `Invalid Date`. Spec §1.4: at high latitudes some prayers genuinely do
      not exist on some days, and downstream code must be able to tell.
- [ ] Test offsets shift the result exactly, including negative offsets.
- [ ] Test the Palestine preset reproduces the offsets from the plain MWL
      result for one known date.

**Commit:** `feat: add prayer time calculation wrapper`

---

## Task 5: Fire-time derivation

**Files:** Create `src/main/prayer/schedule.js`, `tests/prayerSchedule.test.js`

**Consumes:** `prayerTimes`, `PRAYER_KEYS` from Task 4.
**Produces:** `nextPrayerFire(after, coordinates, prayerConfig) ->
{at: Date, prayer: string, kind: 'before'|'at'} | null`

- [ ] Generate candidate fire times for each enabled prayer: the time
      itself when `remindAt`, and `time - remindBeforeMinutes` when
      `remindBefore > 0`. Both, independently, per spec §3.
- [ ] Skip prayers that are `null` (Task 4) rather than throwing.
- [ ] Look ahead across the day boundary: the next fire after 23:50 is
      tomorrow's Fajr, so compute today and tomorrow and take the earliest
      strictly after `after`.
- [ ] Test: a `remindBefore` of 15 produces two distinct fires; disabling
      `remindAt` leaves only the warning; disabling the prayer leaves
      neither; late-night lookahead crosses midnight correctly.

**Commit:** `feat: derive prayer notification fire times`

---

## Task 6: The validation gate

**Files:** Create `tests/prayerFixtures.test.js`

**Consumes:** `prayerTimes` from Task 4.

This is the roadmap's gate made executable. It must run in CI on every
commit. Fixtures are committed, never fetched at test time.

- [ ] Assert `prayerTimes` reproduces `aladhan.json` for all 9 locations ×
      365 days, within **1 minute** per prayer, using MWL and Standard
      school to match the capture parameters.
- [ ] Assert the **Palestine (legacy)** preset reproduces `railway.json`
      for Jerusalem, Gaza and Hebron within **1 minute**, excluding
      `2026-10-24` and `2027-03-26`.
- [ ] Assert those two dates explicitly as a **known discrepancy** with the
      measured ~60-minute delta, so the DST disagreement is documented in
      executable form rather than silently filtered. A future change that
      accidentally "fixes" it will fail loudly and be reviewed on purpose.
- [ ] Assert the Tromsø degenerate window: with a high-latitude rule
      applied, no day may return four identical times — the failure mode
      spec §1.4 measured at 65 days a year.
- [ ] Skip days where the fixture itself has a null/degenerate value, and
      **log the skip count**. A silent skip would let the gate pass while
      testing nothing.

**Commit:** `test: validate prayer times against a year of reference data`

---

## Task 7: Scheduler providers

**Files:** Create `src/main/scheduler/providers.js`, `tests/providers.test.js`.
Modify `src/main/scheduler/engine.js`.

**Produces:** `Provider = {id, nextFire(after) -> {at, payload} | null,
render(payload)}`, and `earliestFire(providers, after) -> {provider, fire}
| null`.

**This is the riskiest task in the plan** — it touches working Phase 1 code.

- [ ] Extract the existing verse logic into a verse provider, moved
      unchanged behind the interface.
- [ ] `engine.js` takes a provider list, asks each for its next fire,
      dispatches to the earliest. Quiet hours, pause, catch-up and failure
      alerting stay exactly where they are — they wrap the dispatch, not the
      selection.
- [ ] A provider that throws must be skipped, logged, and must not stop the
      others. One bad prayer calculation cannot take down verse reminders.
- [ ] Test earliest-wins, ties (lowest index wins, deterministically), an
      empty provider list, all-null, and the throwing provider.
- [ ] **Acceptance:** the existing `engine.test.js` passes with zero edits.
      If it needs editing, stop — behaviour changed that shouldn't have.

**Commit:** `refactor: let the scheduler take fire times from multiple providers`

---

## Task 8: Config, validation and IPC

**Files:** Modify `src/main/config.js`, `src/main/validate.js`,
`src/main/index.js`, `src/preload/settings.js`

**Consumes:** everything above.

- [ ] Bump `DEFAULT_CONFIG.version` 1 → 2. Add `location: null` and the
      `prayer` section with the spec §8 shape.
- [ ] Extend `migrate()` so a v1 config gains the new sections at defaults
      and loses nothing. Test with a real v1 config object.
- [ ] `validateLocation` — latitude −90..90, longitude −180..180, non-empty
      name, IANA timezone string. `validatePrayer` — known method id, known
      school, offsets integer −59..59, per-prayer booleans and
      `remindBefore` 0..120.
- [ ] IPC: `cities:search` (query → results) and the existing settings
      load/save extended with the new sections. No calculation in the
      renderer.
- [ ] Register the prayer provider on startup **only when a location is
      set** — spec §2.1: no location, no prayer features, and verse
      reminders keep working regardless.

**Commit:** `feat: add location and prayer configuration`

---

## Task 9: Settings UI and the prayer card

**Files:** Modify `src/renderer/settings/index.html`,
`src/renderer/settings/main.js`, `src/main/notifier.js`

- [ ] Location: a search field querying `cities:search`, a result list, the
      current selection, and a "enter coordinates manually" fallback with
      latitude/longitude inputs. Every field gets a visible label.
- [ ] Prayer pane: method, school, high-latitude rule, and a row per prayer
      with enable / remind-before / remind-at / offset.
- [ ] Disable the prayer pane with a single explanatory prompt when no
      location is set, rather than letting it look broken.
- [ ] Prayer notification card: prayer name in Arabic and English, the
      time, and the location label. Reuses the phase 1 window and its
      content-height measurement — no new window code.

**Commit:** `feat: add location and prayer settings UI`

---

## Task 10: Verification document

**Files:** Create `task-verification/app-3-prayer-times.md`

- [ ] Environment, preconditions, numbered manual steps with expected
      results and what to do on failure — matching the existing
      `app-2-install-and-autoupdate.md` format.
- [ ] Must cover: picking a city, manual coordinates, switching method and
      seeing times change, an offset shifting a single prayer, a
      remind-before firing separately from the prayer itself, and the
      no-location disabled state.

**Commit:** `docs: add prayer times verification steps`

---

## Self-Review

**Spec coverage:** §1 findings → Task 6. §2.1 location → Tasks 2, 8, 9.
§2.2 Hijri → Task 1. §2.3 engine → Tasks 3, 4. §2.4 scheduler → Task 7.
§3 prayer reminders → Tasks 5, 8, 9. §8 config → Task 8. §9 testing →
Tasks 6, 10.

§2.2's Hijri work is used by Phase 4, not Phase 2 — it is built here
because it is a shared foundation and its correctness test belongs with the
other calendar work.

Spec §4 (athan), §5 (fasting), §6 (azkar) and §7 (translations) are
deliberately **not** covered — they are Plans 2–5.

**Placeholders:** none. Every task names exact files and concrete
assertions.

**Type consistency:** `prayerTimes` returns `Date | null` per prayer
(Task 4), and Task 5 handles `null` explicitly. `paramsFor` (Task 3) is
consumed only by Task 4. `Provider.nextFire` returns `{at, payload}` and
`earliestFire` returns `{provider, fire}` — used consistently in Tasks 7
and 8.
