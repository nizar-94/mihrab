# Verification — location and prayer times (v1.1.0)

Covers roadmap Phase 2 and the shared foundations it needed: an offline city
database, the Hijri calendar, the prayer calculation engine, and the
scheduler provider mechanism that later phases will reuse.

Automated coverage is unusually deep here — 258 tests, including a full year
of reference data for nine worldwide locations. What follows is only what a
test cannot reach: the Windows notification area, real notification cards,
and the Settings window.

## Environment

- Windows 11.
- `npm run dev` for a quick pass, or install the packaged build to also test
  the tray icon and Start Menu entry.
- Prayer reminders need a location. Verse reminders do not, and must keep
  working with no location set — that is explicitly checked below.

## Preconditions

- `npm test` green (258 at time of writing).
- If you want to see the "no location" state, move your config aside first:
  `mv "$APPDATA/muslim-app/config.json" "$APPDATA/muslim-app/config.json.bak"`

---

## Step 1 — No location set

Open Settings from the tray.

**Expected:** a **Location** card with a search box, and a **Prayer times**
card that is visibly greyed out with the line "Set a location above to
enable prayer reminders." The controls are present but not usable.

**Expected:** verse reminders continue firing on their own schedule. The
absence of a location must never affect them.

**If it fails:** if the prayer card is fully hidden rather than greyed, or
if verse reminders stop, that is a defect — capture which.

## Step 2 — Find your city

Type at least two characters into the search box, e.g. `jerus`.

**Expected:** a list appears within a moment, each row showing
`City, Country` with coordinates and timezone beneath. Results are ranked
biggest-first, so `lon` puts London above Longview.

Try a name with diacritics typed plainly: `zurich` must find **Zürich**, and
`nabulus` must find **Nābulus**. Typing one character must show nothing.

Click a result.

**Expected:** the line under the search box updates to the city, its
coordinates to four decimals, and its IANA timezone. The prayer card
un-greys. **Today's times appear in the rightmost column** of the prayer
table immediately.

**If it fails:** an empty list for a major city means the database did not
load — check `resources/cities.json` exists (dev) or sits beside the app in
`resources/` (packaged).

## Step 3 — Manual coordinates

Click **Enter coordinates**, type a latitude and longitude, optionally a
label, then **Use these coordinates**.

**Expected:** accepted, and the location line updates. Out-of-range values
(latitude 91, longitude 181) produce a visible error and change nothing.

This is the escape hatch for anywhere smaller than 15,000 people, so it must
work without a search result.

## Step 4 — The times are right

This is the one that matters. Compare the displayed times against what you
normally use — your local mosque, or a prayer app you already trust.

**Expected for Jerusalem, with method "Palestine (legacy)":** the times
should match the app's retired API essentially exactly. That preset was
derived from a full year of its output; measured agreement is within a
minute on every prayer.

**Expected elsewhere:** pick the method your local mosque follows. The
default is Muslim World League, which is not what everyone uses — Umm
Al-Qura in Saudi, ISNA in North America, Diyanet in Turkey, Karachi in much
of South Asia.

**If they are wrong by a large amount** (an hour or more), suspect the
timezone on the chosen location rather than the calculation. If they are
wrong by a few minutes, that is what the **Adjust** column is for — but tell
me, because a systematic few minutes may mean the wrong method preset.

## Step 5 — Method, school and adjustments

1. Change **Calculation method** and watch the Today column.
   **Expected:** Fajr and Isha move, often by 20 minutes or more. Dhuhr
   barely moves — it is solar noon and almost method-independent.
2. Change **Asr calculation** from Standard to Hanafi.
   **Expected:** Asr jumps by roughly an hour. Nothing else moves.
3. Put `5` in the **Adjust** box for Maghrib.
   **Expected:** Maghrib's time moves five minutes later, immediately.
   Nothing else changes.
4. Press **Save**, close Settings, reopen.
   **Expected:** everything you set is still there.

## Step 6 — A prayer notification

Easiest way to force one without waiting: set **Before** to a number of
minutes that lands within the next minute or two of the next prayer, then
Save and wait.

**Expected:** the notification card appears in the same place and style as a
verse card, showing the prayer name in Arabic, "It is time for *X*" (or
"*X* soon" for an early warning), the time, and your location. It
auto-dismisses, and hovering pauses that, exactly like a verse card.

**For an early warning, the card shows the PRAYER's time, not the
reminder's** — a fifteen-minute warning for a 19:21 Maghrib says 19:21.

**If it fails:** if the card shows a verse instead, or shows blank fields,
capture which.

## Step 7 — Quiet hours do not swallow prayers

Enable quiet hours covering the next prayer, then wait for it.

**Expected:** the prayer notification **still fires**. This is deliberate: a
23:00–07:00 window would otherwise silently hide Fajr and Isha, which are
the two people most want. Quiet hours mute verse reminders only.

Tell me if you would rather it worked the other way — it is a one-line
change, but I think this is the right default.

## Step 8 — Version in Settings

**Expected:** the About card reads **Muslim App v1.1.0**, and lists the new
attributions — adhan (MIT) and GeoNames (CC-BY 4.0) — alongside Tanzil and
Amiri.

The tray menu should show the same version.

## Step 9 — Nothing regressed

- Verse reminders still fire on their schedule.
- Pause still silences everything; resume restores it.
- Tray icon still correct on both light and dark taskbars (right-click the
  taskbar → Taskbar settings → switch between light and dark, and watch the
  tray icon swap without restarting).
- **Show verse now** still works.

---

## What this closes

- The roadmap's Phase 2 validation gate, verified against a year of captured
  reference data for nine locations.
- Prayer times for anywhere in the world, calculated offline.
- The provider mechanism that Phases 3, 4 and 7 will reuse.

## Known and deliberate

- **Two days a year disagree with the old API by an hour** — the
  Asia/Jerusalem DST transition dates, where the retired service moves the
  clocks on a different day than the astronomical reference. Pinned as an
  explicit test rather than hidden.
- **adhan and aladhan differ by 1–2 minutes on Dhuhr and Asr.** They are
  independent implementations of solar position; this is normal and not a
  defect in either.
- **Prayer reminders ignore quiet hours** (step 7).
- **Sunrise is off by default** — it is not a prayer.
