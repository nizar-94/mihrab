# Future Phases

High-level roadmap. Titles only — each phase gets its own spec and plan when it
is picked up, following the same brainstorm → spec → plan → build cycle used for
Phase 1.

Phase 1 (random/sequential Quran verse reminders, tray, settings, packaging,
auto-updates) is complete.

---

## Phase 2 — Prayer Times (Athan)

Local prayer time calculation and per-prayer reminders, replacing the retired
Lambda + Railway API.

## Phase 3 — Azkar (Morning & Evening)

Adhkar as-sabah and al-masa on their own schedule.

## Phase 4 — Fasting Reminders

White days, Mondays and Thursdays, Ashura and Tasu'a.

## Phase 5 — Quran Translations

Optional translation shown alongside the Arabic, downloaded on first run rather
than bundled.

## Phase 6 — Cross-Platform

macOS and Linux builds.

## Phase 7 — Athan Audio

Optional call-to-prayer audio playback.

---

## Notes on sequencing

- **Phases 2 and 4 share groundwork** — both need Hijri dates and the user's
  location, so building them together is cheaper than separately.
- **All phases reuse the existing scheduler unchanged.** They are additional
  sources of fire times, not new scheduling machinery.
- **Phase 2 is gated on a validation step**, not just implementation: prayer
  times must be checked against the previous API before being trusted. Wrong
  prayer times are as serious a defect as wrong Quran text.
- **Phases 3 and 5 are gated on licensing checks** before any data is bundled or
  downloaded.
