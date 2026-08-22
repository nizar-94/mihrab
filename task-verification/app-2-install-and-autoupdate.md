# Verification — first install and real auto-update

Covers the first genuine installation of Muslim App from a published GitHub
Release, and an end-to-end auto-update from one released version to the next.

Everything here is manual and on Windows. Nothing in this file can be
automated: it exercises the Windows notification area, the NSIS installer,
SmartScreen, and electron-updater against a live GitHub Releases feed.

## Environment

- Windows 11, the machine you actually use — not a VM snapshot you discard,
  since part of what is being checked is that install/autostart/uninstall
  behave on a normal desktop.
- No prior copy of Muslim App installed. If you have ever run `npm run dev`,
  that is fine — dev runs use the same `electron-store` config path, so
  settings may carry over. That is expected, not a defect.
- A GitHub account with write access to `nizar-94/muslim-app` (you), for
  publishing releases.

## Preconditions

- `npx vitest run` is green (154 tests at the time of writing).
- The version-in-tray change is committed — without it, step 8 has no
  in-app way to prove the update landed.

---

## Step 1 — Settle what v1.0.0 is

The `v1.0.0` tag was pushed and the Release workflow ran successfully, but
electron-builder publishes to a **draft** release by default, so nothing was
ever visible to the public or to electron-updater. That draft was also built
from a commit that predates the version-in-tray change.

Pick one:

**1a — Re-cut v1.0.0 (recommended).** The tag was never published, so
nothing downstream depends on it and re-cutting is free. This makes your
first public release contain the version line.

1. Delete the draft release in the GitHub UI (Releases → the draft → Delete).
2. Delete and re-push the tag:
   ```bash
   git push --delete origin v1.0.0 && git tag -d v1.0.0
   ```
   then, after committing the tray change, re-tag and push it.
3. Wait for the Release workflow, then publish the new draft.

**1b — Leave v1.0.0 alone.** Publish the existing draft as-is. It will not
show a version line in the tray; v1.0.1 will. The update is still provable
(the line appears where there was none), just less direct.

**Expected:** <https://github.com/nizar-94/muslim-app/releases> shows a
published, non-draft release with `Muslim-App-Setup-1.0.0.exe`,
`latest.yml`, and a `.blockmap` attached.

**If it fails:** an empty releases page means the release is still a draft.
`curl -s https://api.github.com/repos/nizar-94/muslim-app/releases` returning
`[]` confirms it — drafts are invisible unauthenticated.

## Step 2 — Disable autostart before installing

`autoInstallOnAppQuit` applies the update when the app quits. If autostart
relaunches it immediately, the swap can happen too fast to observe.

Leave autostart **off** in Settings for the whole of this procedure, and turn
it back on at step 10.

## Step 3 — Download and install

Download `Muslim-App-Setup-1.0.0.exe` from the Release page — the
CI-built artifact, not a local `npm run dist` build. The point is to test
what a real user receives.

**Expected:**

- SmartScreen shows "Windows protected your PC". **This is correct and
  expected** — the build is unsigned (see `docs/code-signing.md`). Click
  *More info* → *Run anyway*.
- No UAC/admin prompt: the installer is `perMachine: false`.
- You are offered a choice of install directory
  (`allowToChangeInstallationDirectory: true`).
- A Start Menu shortcut named "Muslim App" is created; no desktop shortcut.

**If it fails:** a UAC prompt means `perMachine` is not being honoured;
capture the installer's behaviour and check `electron-builder.yml`.

## Step 4 — Tray icon (never verified before this)

The tray icon has never once been visually confirmed — Windows would not
expose notification-area icons to automation during development.

**Expected:** an icon appears in the notification area. Check behind the
hidden-icons chevron (`^`) too — Windows hides new icons by default. Hover
shows the tooltip "Muslim App".

**If it fails:** if there is no icon anywhere, including behind the chevron,
the `nativeImage.createFromPath` asar path resolution in `src/main/tray.js`
is wrong in a packaged build. Capture whether the app process is running at
all (Task Manager) before concluding the icon is the problem.

## Step 5 — Tray menu and version line

Right-click the tray icon.

**Expected, in order:** Show verse now / Pause reminders / Settings /
separator / **`Muslim App v1.0.0`** (greyed out, not clickable) /
Check for updates / separator / Quit.

Under path 1b the version line is absent — expected for that path.

**If it fails:** a line reading `Muslim App v null` means `trayState()` in
`src/main/index.js` is not passing `app.getVersion()`.

## Step 6 — Notification and chime (chime never verified before)

The notification chime has never been heard — the file is valid and
`play()` resolves, but nobody has confirmed audible output.

1. Tray → **Show verse now**.
2. Open Settings, confirm sound is enabled with a non-zero volume, and fire
   another verse.

**Expected:** a verse card appears near the taskbar showing Arabic text in
Amiri Quran, right-to-left, with tashkeel intact. It sizes to its content —
no scrollbar on a long ayah, no large transparent gap on a short one. It
auto-dismisses. The chime is **audible**.

Try a long verse (Al-Baqarah 255, Ayat al-Kursi) and a short one
(Al-Kawthar 1-3) if you can get them to come up — these were the two
overflow defects fixed after the last plan.

**If it fails:** note precisely which — silent chime, clipped text, or a
mis-sized card — they have different causes.

## Step 6b — The five reported fixes

All five came from your first run of the installed app.

### Taskbar icon

Open Settings (tray → Settings). Look at the taskbar button next to Chrome
and the rest.

**Expected:** the green circle with the white M — the same artwork as the
installer and the Start Menu shortcut. Previously `createSettingsWindow()`
passed no `icon` at all, so Windows fell back to a generic placeholder.

**If it fails:** if it is still generic, Windows may be serving a cached
icon for the AppUserModelId. Restart Explorer (Task Manager → Windows
Explorer → Restart) and reopen Settings before concluding it is broken.

### Double-click the tray icon

**Expected:** double-clicking the tray icon opens Settings. Single left
click still opens the context menu — that is the Windows convention and is
deliberately left alone.

### Quiet hours default

This one is only observable on a **fresh config**, since your existing
config already has a value for it. See "Testing on a clean profile" below.

**Expected:** on a new install, the quiet-hours checkbox is **unticked**,
with 23:00 and 07:00 still filled in so ticking it needs no further setup.

### Single-digit hours

Settings → schedule mode **Daily times** → enter `1:31, 9:00, 20:30` → Save.

**Expected:** saves without error. Reopen Settings: the field reads
`01:31, 09:00, 20:30` — stored zero-padded, which is what keeps the sort
order and the quiet-hours comparisons correct.

Also try the same in reverse: `9:00, 09:00` should collapse to a single
`09:00` rather than scheduling the same time twice.

Still rejected, correctly: `1:5` (ambiguous minute), `25:00`, `9am`.

### Autostart default

**Not a code change** — see the note below. Verify on a clean profile.

## Testing on a clean profile

Quiet-hours and autostart defaults only apply to a config that has never
existed. Yours has, since you ran `npm run dev` before installing — which is
exactly why autostart appeared off: the dev run marked the config
initialised, so the packaged app's first launch took the *reconcile* branch
(OS is source of truth, and the OS had no login item for the installed exe
yet) instead of the *register* branch that turns it on.

To see what a genuinely new user gets:

1. Quit the app from the tray.
2. Move the config aside — **rename, do not delete**:
   ```bash
   mv "$APPDATA/muslim-app/config.json" "$APPDATA/muslim-app/config.json.bak"
   ```
3. Remove the autostart entry so the register branch has something to do:
   Task Manager → Startup apps → Muslim App → Disable.
4. Launch the app from the Start Menu.

**Expected on that first launch:** Settings shows **Start with Windows
ticked** and **quiet hours unticked**. `config.json` is recreated with
`startWithWindows: true`, `autostartInitialised: true`, and
`quietHours.enabled: false`, and the Run key entry is back.

5. Restore your real config afterwards if you want your old settings:
   ```bash
   mv "$APPDATA/muslim-app/config.json.bak" "$APPDATA/muslim-app/config.json"
   ```

**If autostart is still off on a clean profile**, that *is* a real bug —
capture the contents of the freshly created `config.json` and whether
`HKCU:\Software\Microsoft\Windows\CurrentVersion\Run` gained a
`com.nizar.muslimapp` value.

## Step 7 — Cut the update

1. Bump `version` in `package.json` to `1.0.1`.
2. Commit, tag `v1.0.1`, push the tag.
3. Wait for the Release workflow to go green.
4. **Publish the resulting draft release** — the update is invisible to the
   installed app until you do.

**Expected:** two published releases, `latest.yml` on the newer one reading
`version: 1.0.1`.

**If it fails:** a green workflow with nothing on the releases page is the
draft default again, not a build failure.

## Step 8 — The update check

On the still-running installed v1.0.0: tray → **Check for updates**.

**Expected:** the menu item label walks through the update states as you
reopen the menu — `Updates: Update available (v1.0.1) — downloading…` →
`Updates: Downloading update (NN%)…` → `Updates: Update ready (v1.0.1) —
installs next time you quit`. The tooltip mirrors the same text.

The menu does not live-refresh while open — close and reopen it to see the
label advance.

**If it fails:**

- `Updates: Update check failed` → the release is still a draft, or the
  network is blocked. electron-updater's GitHub provider reads the public
  releases feed and cannot see drafts.
- Nothing happens at all → confirm you are running the **installed** app,
  not a dev build. Update checks are inert unless `app.isPackaged`.
- For the underlying error, check
  `%USERPROFILE%\AppData\Roaming\muslim-app\logs\` if present, or relaunch
  from a terminal to see stderr.

## Step 9 — Apply the update

Tray → **Quit**. Wait a few seconds, then relaunch from the Start Menu.

**Expected:** the tray menu now reads **`Muslim App v1.0.1`**. Under path 1b
this is the first time a version line appears at all.

**If it fails:** if it still reads v1.0.0, the NSIS updater did not run on
quit. Check whether `%LOCALAPPDATA%\muslim-app-updater\` holds a downloaded
installer — if the file is there, the download worked and the install step
is what broke.

## Step 10 — Restore and sanity-check

1. Re-enable autostart in Settings if you want it.
2. Confirm reminders still fire on schedule after the update — the config
   store must survive the version bump.

**Expected:** settings and sequence position are preserved across the
update. Config lives outside the install directory, so an NSIS upgrade
should not touch it.

---

## What this closes

- First real installation from a published release.
- Tray icon seen for the first time.
- Chime heard for the first time.
- Auto-update proven end to end against a live GitHub Releases feed —
  previously covered only by `updater.js`'s pure-reducer unit tests, which
  never touch the network or a real installer.
- A published release, which is a prerequisite for the SignPath application
  (see `docs/signpath-application.md`).
