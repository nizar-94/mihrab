# Muslim App

A Windows system-tray app that shows a random or sequential Quran verse as a
custom desktop notification, on a schedule you choose. Fully offline — no
servers, no accounts, no telemetry.

## Features

- **Three scheduling modes** — pick whichever fits how you want to be
  reminded:
  - Every N minutes
  - At given minutes of each hour (e.g. `:00` and `:30`)
  - At specific daily times (e.g. `09:00`, `13:30`, `21:00`)
- **Quiet hours** — suppress notifications during a configurable overnight
  window.
- **Random or sequential verse order** — either a random ayah each time, or
  work through the Quran in order starting from where you left off.
- **Notification sound** — an optional chime, with adjustable volume.
- **Settings window** — configure everything from the tray icon; no config
  file editing required for normal use.

## Getting started

```bash
npm install
npm run dev    # runs the app in development mode
npm test       # runs the test suite
```

### Gotcha: Electron binary not downloaded

On some setups, `npm install` does not automatically download the Electron
binary. If `npm run dev` fails to launch, run:

```bash
node node_modules/electron/install.js
```

This was hit during development on a fresh clone and will likely bite other
fresh clones too — try it first if `npm run dev` errors out immediately.

## Attribution

This project bundles third-party data and assets. Full details, sources,
and license terms are in [`NOTICE`](./NOTICE). In summary:

- **Quran text** — from the [Tanzil Project](https://tanzil.net), licensed
  under Creative Commons Attribution 3.0 (CC-BY 3.0).
- **Amiri Quran font** — from the
  [Amiri type project](https://github.com/aliftype/amiri), licensed under
  the SIL Open Font License 1.1 (OFL-1.1).
- **Notification chime** — an original two-tone sound generated
  programmatically by [`tools/make-chime.mjs`](./tools/make-chime.mjs); not
  a third-party asset.

## Not yet implemented

The following are deliberately out of scope for now:

- Translations (only the original Arabic text is shown)
- Autostart on login
- Installer / packaged distributable
- Auto-updates

## Licence

Licensed under the **GNU General Public License v3.0 or later** — see
[`LICENSE`](./LICENSE).

In short: you are free to use, study, share, and modify this software. If you
distribute a modified version, you must release your source under the GPL too,
so it stays free for everyone downstream. This is deliberate — the intent is
that nobody can take this work closed-source and build a proprietary product
on top of it.

Note that the bundled Quran text and font carry their own separate licences
(CC-BY 3.0 and OFL-1.1 respectively) — see [`NOTICE`](./NOTICE).

## Contributing

Contributions are welcome. Please note that this project requires contributors
to sign a **Contributor License Agreement (CLA)** before their code can be
merged. This keeps the copyright consolidated so the project's licensing can be
adjusted in future if it ever needs to be — without having to track down every
past contributor for permission.

If you are opening your first pull request, say so and the CLA process will be
sorted out with you.

