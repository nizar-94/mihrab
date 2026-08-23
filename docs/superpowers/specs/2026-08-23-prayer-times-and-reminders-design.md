# Prayer Times, Athan, Azkar, Fasting and Translations — Design

Covers roadmap phases 2, 7, 4, 3 and 5 as one body of work, in that order.
They are grouped because they share three foundations that would otherwise be
built three times: the user's **location**, the **Hijri calendar**, and the
existing **scheduler**.

Phase 1 (verse reminders) is unchanged by any of this. Every feature below is
an additional *source of fire times*, not new scheduling machinery — the
constraint the roadmap set, and this design keeps it.

---

## 1. What the captured fixtures established

Before any design decisions, a full year of reference data was captured into
`tests/fixtures/prayer-times/` (see `tools/capture-prayer-fixtures.mjs`).
The roadmap gates this work on validating prayer times against the previous
API; that validation is done up front, and it produced four findings that the
design below is built around.

### 1.1 The old API covers three locations, not six

`railway.json` holds 6 Palestinian cities × 365 days. Compared day by day
against Jerusalem:

| City | Days differing | Max delta |
|------|----------------|-----------|
| Ramallah | 0 / 365 | 0 min |
| Nablus | 0 / 365 | 0 min |
| Bethlehem | 0 / 365 | 0 min |
| Gaza | 365 / 365 | 3 min |
| Hebron | 365 / 365 | 1 min |

Three of the six are the same numbers relabelled. It also ignores any
coordinates passed to it. It is a small lookup table, not a calculator, and
it cannot validate a worldwide app.

### 1.2 The Palestine convention is MWL plus a fixed offset

Railway vs aladhan Muslim World League, Jerusalem, 363 days (the two DST
days in §1.3 excluded):

| Prayer | mean Δ | range |
|--------|--------|-------|
| Fajr | −0.8 | −3 .. +1 |
| Sunrise | −3.0 | −5 .. −1 |
| Dhuhr | −0.6 | −1 .. 0 |
| Asr | −0.5 | −3 .. +2 |
| **Maghrib** | **+6.0** | **+5 .. +7** |
| **Isha** | **+5.0** | **+3 .. +7** |

Fajr, Dhuhr and Asr agree to within a rounding minute — the method is
settled as MWL. Sunrise runs ~3 min early and Maghrib ~6 min late; both
lengthen the day, which is the signature of a horizon/elevation correction
that a sea-level calculation does not apply. `adhan` is sea-level too, so a
naive implementation is **6 minutes early on Maghrib** — the worst prayer to
be early on, since people break their fast by it.

This is stable enough to reproduce exactly with per-prayer offsets, which is
why the design ships a **Palestine (legacy)** preset: MWL with
`{sunrise: −3, maghrib: +6, isha: +5}`.

### 1.3 Two days a year disagree by an hour

Dhuhr is pure solar noon — no method, angle or school affects it — so any
large disagreement there is a clock problem. Exactly two days exceed 20
minutes:

- `2026-10-24` — Railway 11:23, aladhan 12:23 (−60)
- `2027-03-26` — Railway 11:44, aladhan 12:45 (−61)

These are the Asia/Jerusalem DST transition dates. The sources agree on the
rule and disagree on which day the clocks move. This is the single most
likely source of a "the app is an hour off" report, and it becomes a
regression test rather than a surprise.

### 1.4 High latitudes break the naive calculation

At Tromsø (69.6°N), in `aladhan.json`:

- **65 of 365 days** return `Fajr == Sunrise == Maghrib == Isha` — one
  identical time for all four, because the sun never sets between 19 May and
  25 July and angle-based times are undefined.
- **14 days** have Isha earlier than Maghrib, i.e. Isha falls after midnight.

Shipping without a high-latitude rule means 18% of the year fires four
notifications in the same minute for users at that latitude. This is a
correctness requirement, not an edge case to defer.

---

## 2. Shared foundations

### 2.1 Location

Per the product decision: a **bundled offline city database**, with manual
coordinate entry as the fallback. The app's entire pitch is "fully offline,
no servers", and geocoding over the network would break it.

- Source: GeoNames `cities15000` (CC-BY 4.0 — attribution goes in `NOTICE`
  alongside Tanzil and Amiri).
- Trimmed by `tools/make-cities.mjs` to `{name, country, admin1, lat, lon,
  timezone, population}`, sorted by population, emitted as a single JSON.
  Target under 3 MB; it ships via `extraResources` beside the Quran dataset
  rather than inside `app.asar`, for the same reason: it is a large blob read
  once, not application code.
- Settings offers a search field (substring match, ranked by population) and
  a "enter coordinates manually" escape hatch for anywhere not listed.
- Stored in config as `{name, latitude, longitude, timezone}`. The stored
  *coordinates* are the source of truth; the name is a display label. This
  matters — a user who moves keeps working times if they re-pick, and nothing
  downstream ever re-resolves a name.

**No location, no prayer features.** Until a location is set, prayer/athan/
fasting settings are visible but disabled, with a single prompt to set it.
Verse reminders continue to work untouched, so the app is never broken by
the absence of a location.

### 2.2 Hijri calendar

`Intl.DateTimeFormat` with `islamic-umalqura`, no dependency and no API.
Verified against the aladhan response for 2026-08-23: `islamic-umalqura`
agrees to the day (3/10/1448), while `islamic-civil` — the tempting default —
is off by one. That one-day error would silently misfire every white-day and
Ashura reminder in phase 4, so the calendar choice is pinned by a test.

Hijri dates are computed for the user's location timezone, never UTC.

### 2.3 Prayer time engine

`adhan` 4.4.4 (MIT, 766 KB), wrapped in `src/main/prayer/times.js` so no
other module imports it directly. The wrapper is pure: coordinates + date +
settings in, six times out. No Electron, no I/O, so it is testable directly
against the captured fixtures.

Settings exposed:

- **Method** — MWL, ISNA, Egyptian, Umm Al-Qura, Karachi, Tehran, Dubai,
  Kuwait, Qatar, Singapore, Turkey, plus **Palestine (legacy)** (§1.2).
- **Asr school** — Standard or Hanafi (roughly an hour apart; not a detail).
- **High-latitude rule** — defaulted from `HighLatitudeRule.recommended()`
  for the coordinates, overridable. §1.4 is why this exists.
- **Per-prayer offsets** — integer minutes, −59..+59, applied after
  calculation, so anyone can match their local mosque exactly.

Offsets are applied last and uniformly, which is what makes the Palestine
preset a data row rather than a special case in code.

### 2.4 Scheduler integration

The existing `SchedulerEngine` keeps its timing behaviour — its tick loop,
quiet-hours handling, catch-up logic and failure alerting are untouched. What
changes is where it gets fire times from.

Today it computes the next fire time from one hardcoded source. It gains a
list of *providers*, each answering "what is your next fire time after T"
and owning how its own notification renders: verses (the existing logic,
moved behind the interface unchanged), prayers, azkar, fasting. The engine
takes the earliest and dispatches to that provider.

The existing behaviour is preserved by construction: with only the verse
provider registered, the engine does exactly what it does today, and the
current scheduler tests must pass unmodified. That is the acceptance
criterion for this refactor — if any of them need editing, the refactor has
changed behaviour it was not supposed to touch.

This keeps quiet hours, pause, and the failure-alert path working for every
new feature for free, and means none of the new features can break verse
reminders.

---

## 3. Phase 2 — Prayer times

Per-prayer configuration, since people want these differently:

| Setting | Per prayer | Default |
|---------|-----------|---------|
| Enabled | yes | on for the five obligatory prayers |
| Remind before (minutes) | yes | 0 |
| Remind at time | yes | on |
| Sound | yes | athan chime (§4) |

Sunrise is available but off by default — it is not a prayer, and it is
useful mainly as the end of Fajr's window.

"Remind before" and "remind at" are independent fire times, so a user can
have a 15-minute warning *and* the athan itself.

The notification card reuses the phase 1 window with a different body: prayer
name in Arabic and English, the time, and the location label.

**Validation gate.** Before this ships, `times.js` must reproduce
`aladhan.json` for all 9 locations × 365 days within 1 minute per prayer, and
`railway.json` for Jerusalem/Gaza/Hebron under the Palestine preset within 1
minute, excluding the two DST days of §1.3, which get their own explicit
test asserting the known discrepancy. A failure here blocks the phase — this
is the roadmap's gate, made executable.

---

## 4. Phase 7 — Athan audio

Per the product decision: **generated, not recorded**. `tools/make-athan.mjs`
extends the existing `tools/make-chime.mjs` approach — programmatic tone
generation, no third-party audio, no licensing question, nothing that
jeopardises the SignPath application.

- A distinct short motif per prayer, so Fajr and Maghrib are
  distinguishable without looking.
- A longer "call" motif, opt-in per prayer, for users who want something more
  than a chime.
- Volume shared with the existing sound setting; per-prayer override.

A real muezzin recording is deliberately not bundled — every recording is
someone's performance and carries rights. Users who want one can point at
their own file; the setting accepts a path to a local `.mp3`/`.wav` and falls
back to the generated motif if the file is missing or unreadable.

---

## 5. Phase 4 — Fasting reminders

Pure calendar arithmetic on the Hijri date from §2.2. No new data, no
network, no licensing.

| Fast | Rule |
|------|------|
| White days | 13, 14, 15 of each Hijri month |
| Mondays and Thursdays | Gregorian weekday, user's timezone |
| Ashura and Tasu'a | 9 and 10 Muharram |
| Arafah | 9 Dhul Hijjah |
| Six of Shawwal | 2–7 Shawwal, as an optional reminder window |

Each is independently toggleable. Reminders fire the **day before** at a
configurable time, **default 16:30** — a reminder on the morning of a fast is
useless, and mid-afternoon leaves enough of the day to actually prepare.
This is the kind of detail that decides whether a feature gets used.

Ramadan is deliberately excluded: nobody needs an app to remind them it is
Ramadan, and suhoor/iftar are already covered by Fajr and Maghrib in phase 2.

---

## 6. Phase 3 — Azkar

Source: [Morning-And-Evening-Adhkar-DB](https://github.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB)
— MIT, Arabic and English, exactly the morning/evening scope the roadmap
names.

**Provenance caveat.** The Arabic text is Qur'an and hadith and is not
copyrightable; MIT there covers the compilation and the English translation,
and is a claim by the uploader rather than a guarantee. Before shipping, a
sample of the Arabic is verified against a known reference, and the source,
commit hash and licence are recorded in `NOTICE`. This is the same standard
already applied to the Tanzil text.

Scheduling: morning azkar anchored to Fajr, evening to Asr or Maghrib
(user's choice), each with an offset. Anchoring to prayer times rather than
clock times is the point — that is what makes them *azkar as-sabah* rather
than "a notification at 7am".

The card shows one dhikr with its repeat count, and advances through the set
rather than showing the whole list, matching the existing one-verse-per-card
pattern.

---

## 7. Phase 5 — Translations

**Downloaded on first use, never bundled.** Tanzil's translations carry
blanket terms — *"for non-commercial purposes only"* — unlike the Arabic text
already shipped, which is CC-BY 3.0. A non-commercial restriction is not an
open-source licence: bundling it would conflict with GPL-3.0 and would fail
SignPath's "no non-open component" bar.

Downloading sidesteps this entirely. The project redistributes nothing, the
signed artifact contains nothing non-open, and the user fetches the text
themselves for their own non-commercial use.

- Settings lists available translations; selecting one downloads it once and
  caches it in `userData`.
- Attribution and a link back to Tanzil are shown in the UI, as their terms
  require for applications using more than three translations.
- Everything degrades to Arabic-only if the download fails, is deleted, or
  the user is offline. The app never depends on it.
- The `translation` config field already exists in `DEFAULT_CONFIG`
  (`{id, downloadedAt}`) — it was reserved in phase 1 for exactly this.

This is the one place the app touches the network at the user's request. It
is opt-in, one-off, and clearly labelled; the README's offline claim is
updated to say so plainly rather than quietly becoming untrue.

---

## 8. Config schema and migration

`DEFAULT_CONFIG.version` goes 1 → 2. `migrate()` already merges unknown keys
against defaults per section, so v1 configs gain the new sections with
defaults and lose nothing. New top-level sections:

```
location:  { name, latitude, longitude, timezone } | null
prayer:    { method, school, highLatitudeRule, offsets{}, perPrayer{} }
athan:     { enabled, motif, customFile, volume }
azkar:     { morning{}, evening{} }
fasting:   { whiteDays, mondayThursday, ashura, arafah, sixOfShawwal, remindAt }
```

Every field is validated in `validate.js` following the existing
`{ok, value} | {ok, error}` pattern. The renderer never computes anything;
it reads and writes config over IPC exactly as it does now.

---

## 9. Testing

Three layers, matching the project's existing practice:

1. **Pure unit tests** for every new module — prayer maths, Hijri
   arithmetic, fasting-day rules, offset application, provider selection.
2. **Fixture validation** — the §3 gate, run as ordinary tests against the
   committed JSON. This is the only defence against silently wrong prayer
   times, and it runs on every commit and in CI.
3. **Manual verification** — a `task-verification/` document per phase,
   since notifications, audio and the tray cannot be automated on Windows.

The fixtures are committed (1.5 MB) rather than fetched at test time.
Tests must not depend on a free-tier service that may disappear — which is
the whole reason the capture happened now.

---

## 10. Risks

- **Wrong prayer times are the project's worst possible defect**, ranking
  with wrong Quran text. §3's gate is the mitigation; it must not be
  softened to get the phase shipped.
- **The city database is the largest single addition** to package size. If
  it pushes the installer meaningfully past its current ~104 MB, fall back to
  `cities15000` filtered by population rather than shipping every entry.
- **Scope.** This is five phases at once and is larger than phase 1. The
  implementation plan sequences it so that phase 2 is verifiable before
  phases 3–5 build on it, even though all five land together.
- **The azkar provenance caveat** (§6) is the one item that could still stop
  a phase after implementation starts. It is checked first, before that code
  is written.
