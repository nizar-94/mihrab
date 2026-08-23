# SignPath Foundation — drafted application

Drafted answers for the SignPath Foundation free OSS code-signing
application, matched field-by-field against the **live** form as read on
2026-08-23.

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

### 1. `Reputation*` — currently nothing to put here

The form asks for "links or information showing that your project is widely
used or trusted. Examples include media coverage, blog posts, download
statistics, GitHub insights, or community discussions."

As of 2026-08-23 the project has:

| Signal | Value |
|--------|-------|
| Repo created | 2026-08-20 (3 days old) |
| Stars | 0 |
| Forks | 0 |
| Watchers / subscribers | 0 |
| Published releases | 0 (v1.0.0 exists only as an unpublished draft) |
| Download statistics | none — nothing has ever been downloadable |
| Media / blog coverage | none |

There is no honest way to fill this field in strongly right now. The draft
answer below states the position plainly rather than inflating it, which is
the right call — but understand that it is the application's weakest point.

**Recommendation:** publish v1.0.0, let the release page exist and
accumulate some real download count and a few stars, then submit. The
eligibility bar "must already be released in the form that should be signed"
points the same direction: SignPath wants a release page a reviewer can
open, and a reviewer who opens a page showing real downloads is being asked
a much easier question.

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
Mihrab is a Windows system-tray utility that displays a verse of the
Quran as a desktop notification on a schedule the user configures. It runs
entirely offline: the Quran text is bundled with the application, there are
no accounts, no servers, and no telemetry of any kind. The only network
request the app ever makes is to check GitHub Releases for a newer version.

The project is licensed GPL-3.0-or-later. It bundles two third-party assets,
both under open licences and both documented in the repository's NOTICE
file: the Quran text from the Tanzil Project (CC-BY 3.0) and the Amiri Quran
font (SIL OFL 1.1). No proprietary or closed-source component is included in
the artifact to be signed.

The artifact requiring signature is a single NSIS installer executable
produced by electron-builder and published to GitHub Releases.
```

The bundled-asset disclosure is deliberate — eligibility requires no
non-open-source components, and CC-BY / OFL are open but not GPL, so naming
them up front is better than having a reviewer discover them.

### Reputation\*
```
This is a new project, first published in August 2026, and it does not yet
have download statistics, media coverage, or a user community to point to.
I would rather state that plainly than overstate it.

What can be verified today: the repository is public with its full history,
the build is reproducible from a documented GitHub Actions workflow that
gates publication on a passing test suite, and the project ships with test
coverage, a contributor licensing policy, and full third-party attribution.

Repository: https://github.com/nizar-94/mihrab
```

Update this before submitting if there are real download numbers by then.

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

- [ ] Publish the v1.0.0 draft release (also unblocks the auto-update test)
- [ ] Confirm MFA is enabled on the GitHub account that will own the
      SignPath GitHub App installation — required, and only you can verify it
- [ ] Decide the naming question (caveat 2)
- [ ] Add the code-signing policy section below to `README.md`
- [ ] Refresh the `Reputation` answer with whatever real numbers exist
- [x] Installer metadata verified — see below
- [x] Reproducible CI build exists (`.github/workflows/release.yml`)
- [x] `LICENSE` present at repo root, GPL-3.0-or-later
- [x] Functionality documented in `README.md`

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

## Code-signing policy — ready to paste into `README.md`

Add on submission, per caveat 3. Adjust the roles line if the team changes.

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
