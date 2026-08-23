# Verification — azkar, fasting and translations (v1.2.0)

Covers roadmap phases 3, 4 and 5. Athan audio (phase 7) was dropped at your
request; prayer reminders use the standard notification chime.

314 automated tests cover the calculation and selection logic. What follows
is what tests cannot reach: real notifications, the download path, and the
Settings UI.

## Preconditions

- `npm test` green (314 passing, 1 skipped — see the note at the end).
- **A location must be set** in the Athan tab. Azkar anchor to prayer times
  and fasting needs the Hijri day, so both are gated on it. Verse reminders
  and translations work without one.

---

## Step 1 — Settings has six tabs

Open Settings from the tray.

**Expected:** a vertical sidebar reading **Qur'an, Athan, Azkar, Fasting,
General, About**. Arrow keys move between them; each tab opens scrolled to
its own top.

## Step 2 — Translations

Qur'an tab → **Translation**.

1. The dropdown lists twenty translations grouped by language, plus
   "None — Arabic only".
2. Pick one. **Expected:** status reads "Not downloaded yet", the Download
   button enables.
3. Click **Download**. **Expected:** status goes to "Downloading…", then
   "Downloaded and in use", and a ✓ appears beside the name in the list.
4. Tray → **Show verse now**. **Expected:** the translation appears beneath
   the Arabic, separated by a hairline rule, in a smaller size.
5. Pick an Urdu or Persian translation and download it. **Expected:** it
   renders right-to-left; European languages render left-to-right.
6. Click **Remove**, then show a verse. **Expected:** Arabic only, no gap
   or empty rule.
7. Disconnect the network and try downloading. **Expected:** a visible
   error, and the app keeps working with Arabic only.

**Note:** nothing is bundled — the first download is the first time the app
contacts Tanzil. That is deliberate; see the NOTICE entry for why.

## Step 3 — Verse text size still applies

Qur'an tab → **Verse text size** → `+` a few times → **Save** → show a
verse.

**Expected:** both the Arabic and the sample scale. The translation stays
at its own size — it is a reading aid, not scripture.

## Step 4 — Azkar

Azkar tab.

1. Without a location, **expected:** the pane is greyed with "Set a location
   in the Athan tab".
2. With a location: enable **Morning**, anchor **After Fajr**, offset `30`.
   Enable **Evening**, anchor **After Asr**, offset `30`. Save.
3. To force one without waiting for Fajr: temporarily set the offset so the
   anchor lands within the next minute or two — e.g. if Asr is at 16:19 and
   it is now 17:00, set the evening anchor to Asr with an offset of about
   `45`. Save and wait.

**Expected:** a card headed "Morning adhkar" or "Evening adhkar", showing
the Arabic, a transliteration, the English, the repeat count ("3 times"),
and a position such as "4 of 26".

4. Let a second one fire, or restart and fire again. **Expected:** the next
   dhikr in the set, not the same one — the position advances.

**Design note worth your opinion:** each reminder shows **one** dhikr and
moves to the next the following day, matching how verse reminders cycle. It
does *not* show the whole set of 26 at once. Tell me if you would rather it
presented the full set — that is a different card and a different
interaction, and better decided now than later.

## Step 5 — Fasting

Fasting tab.

1. Enable **Mondays and Thursdays** — the easiest to observe, since one
   comes round within a few days.
2. Set **Remind me at** to a couple of minutes from now, and Save.
3. If tomorrow is a Monday or Thursday, the reminder fires at that time.

**Expected:** a card reading "Tomorrow is *Monday* — a day you fast", the
reason beneath it, and the Hijri date.

4. Enable **White days** and check the Hijri date shown lines up with the
   13th, 14th or 15th.

**Expected behaviours to confirm:**
- Reminders arrive the **day before**, never on the morning of the fast.
- Nothing fires during Ramadan, whatever is enabled.
- Nothing fires on Eid al-Fitr (Shawwal 1) — fasting is not permitted then,
  so the six-days window starts on the 2nd.
- A day that is both a white day and a Monday names **both** reasons.

## Step 6 — Quiet hours behave differently per feature

Enable quiet hours covering the next reminder of each type.

**Expected:**
- **Prayer** reminders still fire — an overnight window would otherwise
  hide Fajr and Isha.
- **Azkar** and **fasting** reminders are suppressed — both are ambient
  nudges with a window, not moments that must be observed now.
- **Verse** reminders are suppressed, as before.

Say if you disagree with any of those three; each is a one-line change.

## Step 7 — Nothing regressed

- Verse reminders still fire on schedule.
- Prayer times unchanged, still correct for your location.
- Pause silences everything; resume restores it.
- Tray icon still swaps with the Windows light/dark taskbar.
- About reads **Mihrab v1.2.0**.

---

## Known and deliberate

- **Athan audio was dropped** at your request. Prayer reminders use the
  standard chime.
- **One dhikr per reminder**, advancing daily — see the note in step 4.
- **No translation is bundled or committed.** Tanzil provide them for
  non-commercial use only, which is not an open-source licence, so the
  project cannot redistribute one — not in the installer and not in the
  repository. `tests/fixtures/*.txt` is gitignored for that reason, and the
  single skipped test is the one that runs against a real Tanzil file if a
  developer has downloaded one locally.
- **Azkar provenance was checked** before the dataset was adopted: nine
  well-known adhkar were verified present and correctly attributed, and
  every entry keeps its own hadith citation. Details in `NOTICE`.
