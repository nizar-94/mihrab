# Code signing for Muslim App

Status as of writing: **the Windows build is not code-signed.** This
document explains why that matters for this specific project, what shipping
unsigned actually costs, and a concrete, no-budget path to fixing it via the
SignPath Foundation's free open-source code signing program.

This document is a plan, not a completed integration — nothing here has been
applied for yet. Treat the eligibility and process details below as
"verified against SignPath's own docs as of August 2026," not as a
guarantee: application outcomes depend on a human review decision at
SignPath's end, and program terms can change.

> **Re-verified 2026-08-23** against the live site and the live application
> form. Corrections from that pass are folded in below and flagged
> `[corrected 2026-08-23]`. Drafted answers for every field on the real
> form are in [`signpath-application.md`](./signpath-application.md), along
> with two weak spots in this project's application that are worth reading
> before submitting.

## Why this matters for this project specifically

Muslim App is a free, offline, no-telemetry tray app. The entire pitch to a
prospective user is "trust me enough to run this on your machine." An
installer with no code signature undermines exactly that pitch at the worst
possible moment — the first thing a new user sees after downloading it is
Windows telling them the publisher is unknown.

## What happens if it ships unsigned

- Windows SmartScreen shows a full-screen **"Windows protected your PC" /
  Microsoft Defender SmartScreen prevented an unrecognized app from
  starting"** warning, requiring the user to click "More info" and then "Run
  anyway" to proceed. Many users will not push past that, reasonably —
  that's the warning doing its job for genuinely unknown software.
- Some antivirus / EDR products flag unsigned, freshly-downloaded executables
  more aggressively than signed ones, independent of SmartScreen.
- **The reputation problem does not improve with age or downloads, the way
  it would for a signed publisher identity.** SmartScreen builds reputation
  against a code-signing identity (the certificate's publisher) and, to a
  much weaker/less reliable extent, a specific unsigned file hash. Every new
  release of an unsigned app is a *new* file hash, so it starts back at zero
  reputation every single time — the warning doesn't fade out release over
  release the way it would if reputation accrued to a stable signed
  identity. In effect, staying unsigned means every future release pays this
  same trust tax indefinitely, not just the first one.
- This isn't unique to this project — it's exactly the trade-off that makes
  free code-signing programs for open source exist in the first place.

## The fix: SignPath Foundation

[SignPath Foundation](https://signpath.org/) is a nonprofit that provides
free OV (Organization Validation) code signing certificates to qualifying
open-source projects, via the commercial [SignPath.io](https://signpath.io)
platform's infrastructure. Instead of you holding a certificate/private key,
your CI pipeline submits build artifacts to SignPath's platform, which signs
them server-side and returns the signed binary — no private key ever touches
your machine or CI runner.

This is genuinely free (no cost found in any of SignPath's own program
pages), but it is not "free and instant" — it's an application reviewed by a
person, with real eligibility bars, and it comes with real trade-offs (see
[Limitations](#honest-limitations) below).

### Eligibility checklist

Compiled from SignPath Foundation's own conditions page
([signpath.org/terms](https://signpath.org/terms)) and the OSS
program page ([signpath.io/solutions/open-source-community](https://signpath.io/solutions/open-source-community)).
Work through these *before* applying:

1. **OSI-approved open-source licence, no commercial dual-licensing.**
   Muslim App is GPL-3.0-or-later — this qualifies. (Note: the project's
   `CLA.md`/`CONTRIBUTING.md` intentionally preserve the *option* to
   dual-license in future; as long as the project has not actually started
   selling a separate commercial licence, it should still meet this bar. If
   dual-licensing is ever activated for real, eligibility would need to be
   re-checked with SignPath at that time.)
2. **No proprietary or non-open-source components** bundled into what gets
   signed (aside from allowed exceptions like GPL's "System Libraries"
   carve-out). Muslim App bundles the Tanzil Quran text (CC-BY 3.0) and the
   Amiri Quran font (OFL-1.1) — both are themselves open licences, documented
   in `NOTICE`, which should be fine, but call this out explicitly in the
   application since they're not GPL.
3. **No malware or potentially unwanted program (PUP) behaviour** — not
   applicable here, but note it because their review process will check.
4. **Actively maintained**, and **already released in the form to be
   signed** — i.e. don't apply before there's at least one real,
   installable Windows build artifact to point at.
5. **The project's functionality is documented** on its download page /
   README (already true — see the repo `README.md`).
6. **The team that controls signing is the same team that controls
   development** — i.e. you, as the repo owner, and nobody else's code gets
   signed through this credential. Simple for a sole-author project.
7. **Security baseline for Foundation-issued certificates**: multi-factor
   authentication enabled on both SignPath and the source repository
   (GitHub) accounts involved; no "hacking tool" functionality; no
   undisclosed system-configuration changes; any data collection must be
   disclosed with an installed privacy policy and an opt-out; an
   uninstall path must exist. Muslim App is offline/no-telemetry, so most of
   this should be a non-issue, but MFA on your GitHub account is something
   to actively confirm/enable before applying.
8. **Defined project roles** (author / reviewer / approver) — for a
   single-maintainer project this can reasonably just be "Nizar Hawawreh,
   all three roles," but SignPath's application appears to expect this to be
   stated rather than assumed.
9. **A code-signing policy published on the project's homepage**, crediting
   SignPath.io/SignPath Foundation, and naming the team roles and the
   privacy-policy position. **[corrected 2026-08-23]** This document
   previously called it a purely post-approval deliverable. It is not: the
   live form's `Download URL` field states that the linked page "must
   mention that the project uses the SignPath Foundation for code signing,"
   which makes the attribution at least partly a *pre-submission*
   requirement. Ready-to-paste text is in `signpath-application.md`.
10. **Signed binaries must carry proper metadata** (product name, version,
    etc. set consistently). **Verified 2026-08-23** against a local
    `npm run dist` build — ProductName, ProductVersion, CompanyName and
    LegalCopyright are all populated and consistent across the installer and
    the app executable. Nothing to fix. Table in
    `signpath-application.md`.
11. **[corrected 2026-08-23] A `Reputation` answer is a required field** —
    "links or information showing that your project is widely used or
    trusted... media coverage, blog posts, download statistics, GitHub
    insights, or community discussions." This document did not previously
    mention it. It is currently this project's weakest point: as of
    2026-08-23 the repo is days old with zero stars, zero forks and zero
    published releases, so there is nothing substantive to put in the
    field. See `signpath-application.md` for the full picture and the
    recommendation to publish and gain some traction before submitting.
12. **[corrected 2026-08-23] The form's `Project Name` hint** — "A Google
    search for this name should clearly identify your project" — is not
    satisfied by "Muslim App", which is far too generic to surface this
    repository. Flagged as a naming decision, not resolved here.

### Application process (as currently documented)

1. Prepare the repo (see next section) so there's something concrete to
   point the application at: a real Windows build artifact, a public GitHub
   repo, the LICENSE at the root (already present).
2. Submit an application at SignPath's open-source application form.
   **[corrected 2026-08-23]** The canonical URL is now
   <https://signpath.org/apply> — the site dropped the `.html` extensions,
   so the `apply.html` / `terms.html` URLs this document originally cited
   survive only as redirects.
3. **[corrected 2026-08-23]** The form is a HubSpot embed protected by
   reCAPTCHA Enterprise, and submitting it creates a SignPath user account
   under your name and email, with a Code of Conduct acceptance and a
   personal-data consent checkbox. It is a human-only step — no agent or
   script can or should complete it for you.
4. Fields on the live form, in order: Project Name, Repository URL, Homepage
   URL, Download URL, Privacy Policy URL, Wikipedia URL (optional), Tagline,
   Description, Reputation, Maintainer Type, Build System, First Name, Last
   Name, Email, Company Name, Primary Discovery Channel, plus the consent
   checkboxes. Drafted answers for every one of them:
   [`signpath-application.md`](./signpath-application.md).
5. SignPath Foundation reviews the application against the eligibility
   criteria above. Processing time is not fixed/published — treat it as
   "days to weeks," and expect follow-up questions are possible.
6. If approved: install the SignPath GitHub App on the repository, set up
   the "Trusted Build System — GitHub.com" link between your SignPath
   organization/project and this repo, and wire the
   `signpath/github-action-submit-signing-request` action into the release
   workflow (build the installer as an artifact -> upload it via
   `actions/upload-artifact` -> submit it for signing -> download the signed
   result). Full mechanics: [docs.signpath.io/trusted-build-systems/github](https://docs.signpath.io/trusted-build-systems/github).
7. If rejected or deferred: SignPath's review is a judgement call on their
   end, not a mechanical pass/fail — there is no guarantee of approval, and
   this document should not be read as promising one.

## What to prepare in the repo before applying

SignPath's own review leans on being able to see (a) a real release
artifact and (b) how it's built, so before applying:

- [x] **DONE** — `electron-builder` produces a real NSIS installer
      (`Muslim App-Setup-<version>.exe`), verified by installing and running
      it. Config in `electron-builder.yml`.
- [x] **DONE** — `.github/workflows/release.yml` builds that installer from a
      clean checkout on a pushed `v*` tag, gated on the test suite passing.
      This is the "Trusted Build System" SignPath would sign from later, and
      doubles as evidence of a reproducible, documented build process during
      the application review.
- [ ] **Cut an actual release** so there is a published artifact to point the
      application at. SignPath requires the project to be "already released in
      the form to be signed" — a workflow that *could* build an installer is
      not the same as a Release page a reviewer can open.
      **[corrected 2026-08-23]** Sharper than it first looks: the `v1.0.0`
      tag was pushed, the Release workflow ran green, and there is *still*
      nothing a reviewer can open. electron-builder's GitHub publisher
      defaults to `releaseType: "draft"`
      (`node_modules/electron-publish/out/gitHubPublisher.js:40`), so the
      installer and `latest.yml` are attached to an unpublished draft.
      Publishing that draft is a manual step in the GitHub UI, and until it
      happens neither SignPath's reviewers nor electron-updater's GitHub
      provider can see the release at all.
- [ ] **Publish a code-signing policy section on the download page**
      (`README.md`) crediting SignPath Foundation — see eligibility item 9.
      Add it at submission time, not before: until the application is
      approved the statement would not be true.
- [ ] **Strengthen the `Reputation` answer** — see eligibility item 11.
- [ ] Make sure the build is deterministic enough that "this workflow, run
      on this commit, produces this artifact" is a claim you can stand
      behind — SignPath is fundamentally vouching for "this binary really
      came from this open-source repo," and an ad hoc/manual local build
      process undermines that story even if nothing is technically wrong
      with it.
- [x] **DONE 2026-08-23** — installer metadata (ProductName / ProductVersion /
      CompanyName / LegalCopyright) verified consistent on a real build; see
      eligibility item 10.
- [ ] Confirm GitHub MFA is enabled on the account that will own the
      SignPath GitHub App installation.
- [ ] Have `LICENSE` (already present) and a clear "how to get this app"
      path in `README.md` (already present) — both are basic checklist
      items reviewers reportedly look for.

## Honest limitations

- **The publisher identity shown to users will read "SignPath Foundation,"
  not "Nizar Hawawreh."** SmartScreen and the Windows installer's UAC prompt
  display the certificate's subject name, which under this program is the
  Foundation's OV certificate, not a personally-issued one. This still
  eliminates the "Unknown Publisher" warning and is a legitimate,
  verifiable identity — but it's SignPath Foundation vouching for the
  binary's provenance, not a certificate personally tied to the author's
  name.
- **This creates a dependency on a third party.** If SignPath Foundation
  changes its terms, pauses the program, revokes access, or shuts down, the
  project loses signing capability and would need an alternative (paid
  certificate, or reverting to unsigned). SignPath Foundation's own terms
  explicitly reserve the right to pause or terminate access without prior
  notice for policy violations.
- **The project must stay open source under a qualifying licence to keep
  this.** If the project ever moves to a proprietary or incompatible
  dual-licensing model for the signed artifact itself, it would no longer
  qualify — this is a real constraint on future licensing flexibility for
  the *signed build specifically*, separate from (though related to) the
  CLA discussion in `CONTRIBUTING.md`.
- **Approval is not guaranteed and timing is not guaranteed.** Nothing here
  should be treated as "this will definitely work" — it's the best
  available free option found, reviewed against SignPath's current public
  documentation, but the outcome depends on their review.
- **Azure Trusted Signing was considered and ruled out**: now rebranded
  "Azure Artifact Signing," at ~$9.99/month it's affordable, and per
  Microsoft's own docs it does not provide instant SmartScreen trust either
  (reputation still builds up over time, same as an OV cert) — but more
  fundamentally, its individual-developer tier is restricted to applicants
  in the USA and Canada, which does not fit the author's situation.

## Sources consulted (August 2026)

- [signpath.org](https://signpath.org/) — SignPath Foundation homepage
- [signpath.org/terms](https://signpath.org/terms) — Foundation's
  conditions for open-source projects (full eligibility list)
- [signpath.io/solutions/open-source-community](https://signpath.io/solutions/open-source-community) —
  SignPath.io's description of the open-source program
- [docs.signpath.io/trusted-build-systems/github](https://docs.signpath.io/trusted-build-systems/github) —
  GitHub Actions / Trusted Build System integration steps
- [github.com/SignPath/github-action-submit-signing-request](https://github.com/SignPath/github-action-submit-signing-request) —
  the signing-request GitHub Action
- Third-party write-up of a real application walkthrough (useful for what
  the form actually asks, not authoritative for terms):
  [zenn.dev/shm_7ec/articles/signpath-oss-code-signing](https://zenn.dev/shm_7ec/articles/signpath-oss-code-signing?locale=en)
- Background on Azure Artifact Signing (formerly Trusted Signing)'s
  individual-developer geographic restriction and pricing, confirmed
  directly: [Microsoft Learn — code signing options for Windows apps](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
  (as of April 2026: "~$9.99/month... Individual developers are currently
  limited to the USA and Canada")

Re-verify the eligibility and application-URL details directly against
`signpath.org` before actually applying — this document reflects a
point-in-time check, not a live feed of SignPath's policies.
