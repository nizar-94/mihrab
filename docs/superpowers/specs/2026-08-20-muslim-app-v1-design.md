# Muslim App — v1 Design (Random Verse Reminders)

**Date:** 2026-08-20
**Status:** Draft for review

## 1. Overview

A cross-platform desktop app (Windows first) that shows Islamic reminders as native
desktop notifications. It replaces an existing AWS Lambda + Slack webhook script that
ran on a 1-minute cron.

**v1 delivers one feature end to end:** a random Quran verse on a user-configured
schedule, with a tray icon, settings screen, Windows autostart, and auto-updates.

The app is open source and intended for wide use, which drives two hard constraints:

- **No servers.** No API the maintainer has to pay for, keep alive, or scale.
- **No licensing ambiguity.** Every bundled byte must be redistributable.

## 2. Non-goals for v1

Deliberately deferred. They shaped the architecture but are not built now:

- Prayer time reminders (athan)
- Azkar as-sabah / al-masa
- Fasting reminders (white days, Mon/Thu, Ashura)
- Prayer audio playback
- macOS and Linux builds
- Mobile

## 3. Framework: Electron

**Chosen: Electron.** Tauri v2 was evaluated and recommended on footprint
(~42 MB vs ~168 MB idle) and native-API access, but Electron was chosen for
developer familiarity, ecosystem maturity, and the widest contributor pool for
an open-source project.

Trade-off accepted: larger install and higher idle memory.

**Mitigations, treated as requirements not optimizations:**

- The settings window is **destroyed on close, not hidden.** When idle in the tray
  the app runs main + GPU only, with no renderer process resident. This is the
  single largest lever on idle memory.
- Notification windows are **equally transient** — created when a verse fires,
  destroyed on dismiss or timeout. The steady state remains zero renderers.
  Spawning a window costs ~100–300 ms, which is irrelevant for a reminder, so
  no window is pre-warmed.
- `asar` packaging enabled; the Quran dataset stays outside `asar` for direct reads.
- Idle RSS is measured once the app runs and recorded here. No target is claimed
  in advance.

Electron's built-ins cover nearly all platform integration needed:
`Tray`, `Notification`, `app.setLoginItemSettings()`, and critically
`powerMonitor` for suspend/resume. No native modules are required for v1.

## 4. Architecture

The main process is the application. The renderer is an occasional guest.

```
main process (always alive)
├── scheduler.js    tick loop, next-fire computation, missed-fire policy
├── verses.js       ayah selection: random or sequential, position tracking
├── translation.js  first-run download, local cache, graceful absence
├── notifier.js     spawns, positions, and dismisses notification windows
├── config.js       electron-store: schema, defaults, migrations
├── tray.js         tray icon and menu
├── windows.js      create/destroy settings + notification windows
└── updater.js      electron-updater against GitHub Releases

renderer (exists only while a window is open)
├── settings/       schedule config, translation choice, sound, autostart
└── notification/   the verse card itself — RTL, Quranic font, sound playback
```

**Design rule:** no scheduling, data, or notification logic in the renderer.
The renderer only reads and writes config over IPC. Anything that must work
while the app is tray-only lives in the main process. This keeps the memory
mitigation in section 3 viable — the app must be fully functional with zero
windows open.

## 5. Data and licensing

| Asset | Source | License | Shipped how |
|---|---|---|---|
| Quran Arabic (Uthmani) | Tanzil Project | CC-BY 3.0 | **Bundled** (~1–2 MB JSON) |
| English translation | User-selected | Non-commercial, varies | **Downloaded on first run** |
| Quranic font | Amiri Quran | SIL OFL | **Bundled** |
| Notification sound | TBD — must be permissively licensed | TBD | **Bundled** (short, soft) |

### Why translations are not bundled

Tanzil publishes no per-translation license and states translations are
"for non-commercial purposes only. If used otherwise, you need to obtain necessary
permission from the translator or the publisher." That clause is not
open-source compatible: this repo being public would permit downstream commercial
use that those terms forbid.

**Resolution:** the repository ships **no translation text at all**. On first run the
user picks a translation and the app downloads it from its canonical source into
`userData/`. Redistribution never occurs — the user obtains it directly, exactly as
they would visiting the site.

**Requirements:**
- Arabic-only is a fully supported state. Translation download is optional and
  skippable, and failure is non-fatal.
- Attribution for the Arabic text (Tanzil Project + link to tanzil.net) appears in
  an About screen and in `NOTICE`.
- Downloaded translations display their translator and source.
- The exact download endpoint must be verified during implementation. It is
  **not** to be mirrored on any maintainer-controlled host.

## 6. Scheduling engine

Three user-facing modes, one internal engine. All modes implement a single
pure function: given a schedule and a reference time, return the next fire time.

```js
{ mode: 'interval',     everyMinutes: 90 }
{ mode: 'minuteOfHour', minutes: [25, 55] }
{ mode: 'dailyTimes',   times: ['09:00', '14:30', '20:00'] }
```

**Behaviour:**

- **Interval anchors to local midnight**, not app start. "Every 90 minutes" means
  00:00, 01:30, 03:00 … deterministic across restarts and reboots, no drift.
- **Quiet hours** — default 23:00–07:00, user-editable, can be disabled. Fires
  landing inside the window are suppressed, not queued.
- **Missed fires** — if the machine slept through one or more fire times, exactly
  **one** notification is shown on resume. Never a backlog burst.
- **Tick** — 30s interval. Recomputation is also triggered by
  `powerMonitor.on('resume')`, config change, and local date rollover.
- **State** — `lastFiredAt` is persisted, so a restart cannot cause a double fire.

**Edge cases the scheduler must handle explicitly:**

- DST transitions: a 23-hour or 25-hour local day must not double-fire or skip
  in `dailyTimes` mode.
- Timezone change while running (travel, manual clock change).
- System clock jumping backwards.

This module is pure and fully unit-testable with an injected clock. It is the
highest-value test target in the codebase — see section 10.

## 7. Verse selection

User-configurable, two modes:

- **Random** (default) — uniform random ayah across all 6,236. Stateless.
- **Sequential** — walks the Quran in order from the user's saved position,
  advancing one ayah per fire and wrapping from the last ayah back to the first.
  This turns the app into a slow, complete read-through.

Sequential mode persists `sequencePosition` after **every** fire, so a crash or
reboot never loses or repeats the user's place. Settings shows the current position
(surah and ayah) and offers a reset-to-beginning action.

Switching modes preserves `sequencePosition` — a user can move to random and back
without losing their place.

## 8. Configuration

Persisted via `electron-store` in `userData`, with a versioned schema and
migrations from day one.

```js
{
  version: 1,
  schedule: { mode: 'interval', everyMinutes: 90 },
  quietHours: { enabled: true, from: '23:00', to: '07:00' },
  verseOrder: 'random',                 // 'random' | 'sequential'
  sequencePosition: 0,                  // ayah index 0..6235, sequential only
  translation: { id: null, downloadedAt: null },   // null = Arabic only
  sound: { enabled: true, volume: 0.5 },
  notification: { durationMs: 15000, position: 'bottom-right' },
  startWithWindows: true,
  autostartInitialised: false,
  lastFiredAt: null
}
```

### Decision reversal (2026-08-21): autostart defaults on

`startWithWindows` now defaults to **true** for new installs. This reverses
the original v1 design intent stated above through 2026-08-20 — the app was
meant to ask on first run rather than enable itself silently, and that
decision has been deliberately overturned by the user.

This is not a one-line default flip. Startup logic added shortly after v1
made the **OS the source of truth**: on `app.whenReady()` the app reads
`app.getLoginItemSettings({ args: AUTOSTART_ARGS }).openAtLogin` and
reconciles `config.startWithWindows` to match it, so a user who disables
autostart via Task Manager's Startup tab is never silently re-enabled by
this app. Flipping only the config default would have no visible effect: on
a fresh install the OS has no login item yet, so the very same reconcile
would immediately flip the config straight back to `false` before the user
ever saw the "on" state.

`autostartInitialised` is a persisted marker added to resolve this. It
distinguishes "this install has never gone through the autostart decision"
from "it has, and the OS is now the ongoing source of truth":

- **First run ever** (`autostartInitialised: false`): the app calls
  `app.setLoginItemSettings({ openAtLogin: true, args: AUTOSTART_ARGS })` to
  actually register autostart with the OS, sets `startWithWindows: true`,
  and flips `autostartInitialised: true`.
- **Every subsequent run** (`autostartInitialised: true`): unchanged from
  the original reconcile design — the OS remains the source of truth, so if
  the user turns autostart off (in Settings, or via Task Manager), it stays
  off and is never silently re-enabled by this app.

The decision itself (`register` vs `reconcile`) is implemented as a pure
function (`decideAutostartAction` in `config.js`) taking only
`autostartInitialised` and the current OS state, so it is unit-testable
without mocking Electron's `app`.

A config saved before this field existed (i.e. missing the marker but
carrying other fields) is treated as already initialised, not fresh — this
avoids force-enabling autostart for an existing install purely because it
predates the new field.

## 9. UI surfaces

**Tray menu** — the primary interface. Show verse now · Settings · Pause reminders ·
Check for updates · Quit.

**Settings window** — schedule mode and its parameters, quiet hours, verse order
(random/sequential + position), translation picker, sound toggle and volume,
autostart toggle, About/attribution. Destroyed on close.

**Notification window** — a custom frameless window, not an OS toast. This is *the*
verse display; there is no separate verse window. Windows toasts truncate long text,
cap formatting, and give no control over Arabic typography — none of which is
acceptable for Uthmani script with tashkeel.

- Frameless, transparent, always-on-top, `skipTaskbar: true`
- **`focusable: false`** — must never steal focus from what the user is typing in
- Positioned bottom-right above the taskbar, respecting the work area of the
  **active** monitor
- Slide-in, auto-dismiss after `durationMs`, hover pauses the dismiss timer
- Click to dismiss; a pin control keeps it open for a longer read
- Full ayah + surah name + ayah number, plus translation when present
- Concurrent fires are ignored rather than stacked — a single verse at a time

### Trade-off accepted

Custom windows lose three things native toasts give for free, and this is a
deliberate choice, not an oversight:

1. **No Windows Action Center history.** A missed verse is gone.
2. **No automatic Do Not Disturb / Focus Assist respect.** A verse could appear
   mid-presentation or mid-screen-share. Detecting Focus Assist requires
   `QUERY_USER_NOTIFICATION_STATE` via a native module — deferred, and tracked
   in open items. Quiet hours partially mitigate this.
3. **Fullscreen apps.** An always-on-top window may draw over a fullscreen game
   or video. Suppressing fires while a fullscreen app is foreground is a
   phase-2 refinement.

## 10. Notification sound

A short, soft sound plays when a verse appears. Enabled by default, with a volume
control and an off switch in Settings.

Played in the notification renderer via HTML5 `Audio` — the window already exists at
that moment, so this needs no extra process and no native audio dependency.

The sound must never play when the notification is suppressed (quiet hours, paused).
Sound respects the same suppression path as the window itself, so the two cannot
diverge.

**Asset licensing is an open item.** The bundled sound must be CC0 or equivalent;
sound effects are a common accidental licensing violation in open-source projects.

## 11. Platform integration

- **App identity** — `app.setAppUserModelId()` is still set, now for taskbar
  identity and the autostart shortcut rather than for toasts. The NSIS installer
  creates the Start Menu shortcut this depends on.
- **Autostart** — `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`.
  Launching with `--hidden` starts to tray without flashing a window.
- **Updates** — `electron-updater` against GitHub Releases (free hosting for public
  repos). Check on launch and every 6 hours; download in background; apply on quit.

**Code signing is an open cost item.** An unsigned Windows installer triggers
SmartScreen's "Windows protected your PC" wall, which severely suppresses adoption.
Options: an OV/EV certificate (~$200–400/yr) or accepting the friction while
reputation accrues. This must be decided before first public release, not after.

## 12. Error handling

The app runs unattended for weeks. Nothing user-visible may crash it.

- Translation download failure → silently fall back to Arabic-only, surface the
  error in Settings only.
- Corrupt or unreadable config → restore defaults, back up the bad file.
- Notification failure → log, continue; never break the tick loop.
- The scheduler tick is wrapped so a throw can never kill the timer.
- Update check failure → silent. Never interrupt the user.

## 13. Testing

- **Unit (priority)** — the scheduler, with an injected clock. Covers all three
  modes, quiet hours, missed-fire-once, DST transitions, backwards clock jumps,
  and midnight rollover. This is where the real bugs live.
- **Unit** — verse selection in both modes, including sequential wrap-around from
  ayah 6235 to 0 and position persistence across simulated restarts.
- **Unit** — config migration, translation cache behaviour, sound suppression
  following the same path as window suppression.
- **Manual** — tray, notification window (focus stealing, multi-monitor placement,
  hover-to-pause), autostart, and update flow, which need a real Windows session.

E2E automation is deferred; it is expensive for tray/notification surfaces and the
value concentrates in the scheduler unit tests.

## 14. Open items

1. Verify the canonical translation download endpoint and its terms.
2. Confirm Amiri Quran OFL licensing and bundle the font files.
3. Source a CC0 notification sound.
4. Decide code signing before public release.
5. Measure and record actual idle RSS.
6. Verify the muslimKit azkar dataset license before phase 2.

Deferred by the custom-notification decision, tracked so they are not forgotten:

7. Focus Assist / Do Not Disturb detection (`QUERY_USER_NOTIFICATION_STATE`,
   needs a native module).
8. Suppressing fires while a fullscreen app is in the foreground.

## 15. Later phases

Phase 2 adds prayer times via `adhan` (npm, MIT) computed locally from user
coordinates, replacing the old Railway API. Hijri dates come from
`Intl.DateTimeFormat` with the `islamic-umalqura` calendar, replacing the aladhan
API. Phase 3 adds azkar and fasting reminders. All reuse the section 6 scheduler
unchanged — prayer times are simply another source of fire times.

---

## Appendix: notes carried over from the Lambda

**Timezone bug not to port.** The original script read `now.getHours()` (UTC, in
Lambda) but formatted `currentTime` in `Asia/Jerusalem`, so the 7am/6am/12pm/6pm
blocks actually fired on UTC hours — a 2–3 hour skew. `getUTCDay()` was likewise
mixed with local-day logic. On desktop this dissolves, since local time is the
user's own.

**Hardcoded location.** The Lambda was fixed to القدس. Desktop users are worldwide,
so phase 2 must take coordinates from the user.

**Exposed credentials.** The Lambda contained two live Slack webhook URLs in
plaintext. These must be revoked and must never appear in this repository.
