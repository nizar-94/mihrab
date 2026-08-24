# SignPath Foundation — drafted application

Drafted answers for the SignPath Foundation free OSS code-signing
application, matched field-by-field against the **live** form as read on
2026-08-23 and re-checked on 2026-08-24.

> **Re-check note (2026-08-24).** The form frame now refuses to load
> outside its iframe, so the field list could not be re-read directly. The
> embedded form ID is unchanged (`bf62807d-bb72-4e45-9bde-1f3a53ba2472`),
> which is the same form the field list below was captured from.

**You submit this, not an agent.** The form is a HubSpot embed behind
reCAPTCHA Enterprise, it creates a SignPath user account, and it carries
Code of Conduct and personal-data consent checkboxes. All four of those are
yours to complete.

Form location: <https://signpath.org/apply> (the `apply.html` URL in
`code-signing.md` still redirects, but the canonical paths dropped the
`.html` extension).

---

## Read this before submitting

Two required fields are weak-to-empty for this project today. Neither is
fatal, but going in with them unaddressed invites a rejection or a deferral,
and SignPath's review is a human judgement call rather than a mechanical
pass/fail.

### 1. `Reputation*` — thin, but no longer empty

The form asks for "links or information showing that your project is widely
used or trusted. Examples include media coverage, blog posts, download
statistics, GitHub insights, or community discussions."

As of **2026-08-24**:

| Signal | Value |
|--------|-------|
| Published releases | 3 (v1.3.1, v1.4.0, v1.4.1) |
| Installer downloads | 9 |
| Stars / forks | 0 / 0 |
| Announcement | posted to LinkedIn on 2026-08-24 |
| Media / blog coverage | none |

This is the application's weakest field and it would be dishonest to
present it otherwise. What has changed since the first draft is that the
answer is no longer "nothing at all": there are published releases a
reviewer can open, real download numbers, and a public announcement.

Note that **download counts now understate usage**: the app auto-updates,
so anyone already on 1.3.1 receives 1.4.1 through the updater rather than
the releases page. The 9 figure is first-time installs only.

**Timing is a judgement call.** Submitting now is defensible — the hard
eligibility bar ("already released in the form to be signed") is met.
Waiting a week or two after the announcement, and re-checking the numbers
before submitting, gives the reviewer a stronger picture at no cost beyond
the delay. The rest of this document is ready either way.

### 2. `Project Name*` — RESOLVED (2026-08-23)

The form's hint is "A Google search for this name should clearly identify
your project." The project originally carried a generic, descriptive name
that failed that test outright: it returned hundreds of unrelated app-store
listings and would never have surfaced this repository.

It was renamed to **Mihrab** before applying — the niche in a mosque wall
that marks the direction of prayer, which matches both what the app does and
its dome mark. It is effectively unused as software, so a search for
"Mihrab app" lands here.

The rename was done deliberately BEFORE any signed identity existed:
changing `appId` after certificates are issued, and after users have
installed under the old identity, is far more disruptive than doing it now.

### 3. `Download URL` requires SignPath attribution *on the page*

The field's hint: "This page must mention that the project uses the SignPath
Foundation for code signing."

`code-signing.md` currently files the published code-signing policy as a
post-approval deliverable. Per the live form it is at least partly a
**pre-submission** one — the download page has to carry the attribution.
Ready-to-paste text is in the last section below.

Chicken-and-egg caveat: publishing "this project uses SignPath Foundation
for code signing" before approval states something that is not yet true.
Add that section when you submit, not before, and be ready to remove it if
the application is declined.

---

## Field-by-field draft

### Project Name\*
```
Mihrab
```
See caveat 2 above.

### Repository URL\*
```
https://github.com/nizar-94/mihrab
```

### Homepage URL\*
```
https://github.com/nizar-94/mihrab
```
No dedicated site; the form explicitly permits the repository page.

### Download URL
```
https://github.com/nizar-94/mihrab/releases
```
Only valid once a release is actually published **and** the SignPath
attribution is present (caveat 3).

### Privacy Policy URL
Leave blank. The field is "required if the software collects user data" —
this app collects none: fully offline, no accounts, no telemetry, no network
calls except the GitHub update check. Stated explicitly in the description
below so the blank field reads as deliberate rather than missed.

### Wikipedia URL
Leave blank.

### Tagline\*
```
An offline Windows tray app that shows Quran verses as scheduled desktop reminders.
```

### Description\*
```
Mihrab is a Windows system-tray application that shows Quran verses, prayer
times, morning and evening adhkar, and reminders for the recommended fasts,
as desktop notifications on a schedule the user configures.

It runs offline. Prayer times are calculated on the user's own machine from
their coordinates using the adhan library; the Quran text, the adhkar and a
database of city coordinates are bundled with the application. There are no
accounts, no servers and no telemetry. The application makes exactly two
kinds of network request: a version check against its own GitHub Releases
feed, and — only if the user chooses a Quran translation — a one-off
download of that translation.

The project is licensed GPL-3.0-or-later. It bundles third-party data, all
of it under open licences and all documented in the repository's NOTICE
file: Quran text from the Tanzil Project (CC-BY 3.0), the Amiri Quran font
(SIL OFL 1.1), city coordinates from GeoNames (CC-BY 4.0), the adhan prayer
time library (MIT), and a morning/evening adhkar dataset (MIT). Quran
translations are deliberately NOT bundled — Tanzil provide them for
non-commercial use only, which is not an open-source licence, so they are
downloaded by the user to their own machine instead and never redistributed
by this project.

The artifact requiring signature is a single NSIS installer executable
produced by electron-builder and published to GitHub Releases by a GitHub
Actions workflow.
```

The bundled-asset disclosure is deliberate — eligibility requires no
non-open-source components, and CC-BY / OFL are open but not GPL, so naming
them up front is better than having a reviewer discover them.

### Reputation\*
```
This is a young project — first published in August 2026 — so I would
rather give you an accurate picture than an inflated one.

Current signals:
- Three published releases with installers, the latest being v1.4.1
- Installer downloads to date: 9. This understates usage, because the
  application auto-updates: existing users receive new versions through
  the updater rather than the releases page.
- Announced publicly on LinkedIn in August 2026
- No media coverage or third-party write-ups yet

What can be verified independently: the repository is public with its full
history, every release is built from a documented GitHub Actions workflow
that gates publication on a passing test suite of 348 tests, and the
project ships with contributor licensing, third-party attribution, and
manual verification procedures for the features that cannot be
automatically tested.

Repository: https://github.com/nizar-94/mihrab
```

Refresh the download figure immediately before submitting.

### Maintainer Type
```
Individual
```

### Build System
```
GitHub Actions
```
Matches `.github/workflows/release.yml`, which is the Trusted Build System
that would later submit signing requests.

### First Name\* / Last Name\*
```
Nizar
Hawawreh
```

### Email\*
Your own address — this creates the SignPath account and receives
application notifications.

### Company Name
Leave blank.

### Primary Discovery Channel\*
Your call.

### Consent checkboxes
Three appear, one of them optional:

- **Required** — Code of Conduct agreement, including acknowledgement that
  certificates are issued in SignPath Foundation's name and may be revoked.
- **Required** — consent to store and process personal data.
- **Optional** — marketing communications. Decline unless you want them.

---

## Pre-submission checklist

- [x] **Published release exists** — three of them, with installers.
      Satisfies the hard eligibility bar "must already be released in the
      form that should be signed".
- [x] **Reproducible CI build** — `.github/workflows/release.yml` builds
      from a clean checkout on a pushed `v*` tag, gated on the test suite.
      This is the Trusted Build System SignPath would sign from.
- [x] **A searchable project name** — renamed to Mihrab, see caveat 2.
- [x] **Code-signing policy published** on the download page (README).
- [x] **LICENSE at the repo root**, GPL-3.0-or-later.
- [x] **Functionality documented** in README.
- [x] **Installer metadata verified** — see below.
- [ ] **Confirm GitHub MFA is enabled** on the account that will own the
      SignPath GitHub App installation. Required by SignPath's security
      baseline, and only you can verify it.
- [ ] **Refresh the `Reputation` figure** with the download count on the
      day you submit.
- [ ] **Submit the form** — reCAPTCHA and account creation make this a
      human-only step.

### Installer metadata — verified 2026-08-23

Eligibility item: signed binaries must carry proper metadata. Checked
against a local `npm run dist` build of 1.0.0:

| Field | `Mihrab-Setup-1.0.0.exe` | `Mihrab.exe` |
|-------|------------------------------|------------------|
| ProductName | Mihrab | Mihrab |
| ProductVersion | 1.0.0 | 1.0.0.0 |
| CompanyName | Nizar Hawawreh | Nizar Hawawreh |
| LegalCopyright | Copyright © Nizar Hawawreh | Copyright © Nizar Hawawreh |
| Authenticode status | NotSigned (expected) | NotSigned (expected) |

Consistent and correctly populated. Nothing to fix here before applying.

---

## Roles declaration

SignPath expects author / reviewer / approver to be stated rather than
assumed. For a sole-maintainer project:

```
Author:   Nizar Hawawreh (nizar-94) — sole committer
Reviewer: Nizar Hawawreh (nizar-94) — all external contributions arrive as
          pull requests and are reviewed before merge; a CLA check gates
          them (.github/workflows/cla.yml)
Approver: Nizar Hawawreh (nizar-94) — sole approver of signing requests
```

---

## Code-signing policy — PUBLISHED (2026-08-24)

Live in `README.md` under "Code signing policy", satisfying caveat 3
before submission.

It is worded as an application **in progress**, not as an existing
relationship — claiming SignPath already signs this project while the
application is pending would be untrue, and a reviewer reading the download
page is precisely the person who would notice. Rewrite it to the present
tense on approval:

```markdown
## Code signing policy

Free code signing for this project is provided by [SignPath.io](https://signpath.io),
with a certificate issued by the [SignPath Foundation](https://signpath.org).

- **Roles** — Author, reviewer and approver: Nizar Hawawreh ([@nizar-94](https://github.com/nizar-94)).
- **Privacy policy** — This program does not transfer any information about
  its users to any third party. It runs fully offline; the only network
  request it makes is a version check against this repository's GitHub
  Releases feed.
```

The privacy-policy sentence is required by SignPath's terms ("any data
collection must be disclosed with an installed privacy policy and an
opt-out"). This app collects nothing, so a plain statement of that satisfies
it — but keep the wording accurate if telemetry is ever added.
