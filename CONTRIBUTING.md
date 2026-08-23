# Contributing to Mihrab

Thanks for considering a contribution. This document covers how to get a dev
environment running, what's expected of a pull request, and — importantly —
the Contributor License Agreement (CLA) every external contributor needs to
sign before their code can be merged.

## Development setup

```bash
git clone https://github.com/nizar-94/mihrab.git
cd mihrab
npm install
npm run dev    # runs the app in development mode
npm test       # runs the test suite (vitest)
```

### Known gotcha: Electron binary not downloaded

On some setups, `npm install` does not actually fetch the Electron binary
(only the `electron` npm wrapper package). If `npm run dev` fails to launch
with an error about a missing Electron executable, run:

```bash
node node_modules/electron/install.js
```

This has been hit on fresh clones during development and will likely bite
other fresh clones too. Try it first if `npm run dev` errors out immediately
after `npm install`.

## Testing expectations

- The test suite runs on [Vitest](https://vitest.dev/): `npm test` (single
  run) or `npm run test:watch` (watch mode).
- New behaviour — scheduling logic, verse selection, settings persistence,
  etc. — should come with test coverage. Pure logic (e.g. the scheduler's
  decision function) is expected to be unit-tested; UI/Electron wiring is
  more of a judgement call, but don't leave clearly testable logic untested.
- Run `npm test` locally before opening a pull request. There is currently no
  CI workflow enforcing this automatically (see `.github/workflows/`), so a
  passing local run is the bar for now.
- If you touch bundled third-party assets (Quran text, fonts, sounds), update
  [`NOTICE`](./NOTICE) accordingly — see how existing entries are documented
  there for the level of detail expected (source, licence, whether it was
  modified).

## Code and licensing

Mihrab is licensed under **GPL-3.0-or-later** (see [`LICENSE`](./LICENSE)).
Your contributions will be released under that same licence as part of the
Project.

## The Contributor License Agreement (CLA)

**Before any pull request from an external contributor can be merged, you
need to sign the [Contributor License Agreement](./CLA.md).**

### Why this project has a CLA — honestly

Right now, Nizar Hawawreh is the sole author and sole copyright holder of
this codebase. That means he can currently change the licence, dual-license
it, or offer a commercial version of it, entirely at his own discretion —
because he owns 100% of the copyright.

The moment someone else's code is merged without a CLA in place, that stops
being true: the contributor becomes a co-copyright-holder over their own
lines, and relicensing the project (fully or in part) would require getting
that person's — and every subsequent contributor's — explicit permission.
For a project with more than a handful of contributors, tracking everyone
down retroactively is usually impractical, which in effect locks the licence
in place forever, even if there were ever a good reason to change it later
(for example, a dual-licensed or commercial offering to fund the project).

The CLA exists to keep that option open, deliberately, before it's too late
to set up. It is **not** about taking anything away from you: you keep full
copyright over your own contribution (see `CLA.md` section 2), and the
Project itself stays GPL-3.0-or-later — the CLA only grants the Project
Owner an additional, non-exclusive licence to also use your contribution
under other terms in future, alongside the GPL. This is a well-established,
unglamorous pattern used by many open-source projects (individually and
under foundations); it's not unique to this project, and it isn't a
trick.

If that trade-off isn't something you're comfortable with, that's a
completely reasonable position — just know it means your PR likely won't be
merged, since not requiring the CLA for some contributions and not others
would defeat its purpose.

### How to sign it

1. Read [`CLA.md`](./CLA.md).
2. Open your pull request as normal.
3. An automated check will comment on the PR asking you to confirm you've
   read and agree to the CLA, by posting a specific phrase as a PR comment
   (the check will tell you exactly what to post). This records your
   agreement against your GitHub username and only needs to be done once —
   future PRs from the same account are recognised automatically.
4. If you're contributing on behalf of an employer or another organisation
   (rather than as an individual), or would rather not use the PR-comment
   flow, say so in the PR or open an issue first and a manual arrangement
   (e.g. a signed document by email) can be worked out instead.

If you're opening your first pull request and this all seems like a lot: it
is genuinely just two things — read `CLA.md`, then post the confirmation
comment the bot asks for. It normally takes under a minute.

## Pull request expectations

- Keep PRs focused — one logical change per PR is easier to review than a
  bundle of unrelated fixes.
- Describe *what* changed and *why*, not just a restatement of the diff.
- If your change touches licensing-sensitive material (bundled fonts, Quran
  text, or other third-party assets), call that out explicitly in the PR
  description so it gets extra scrutiny.
- Be patient — this is currently a one-person-maintained project outside of
  contributions, so review turnaround may not be immediate.

## Reporting bugs / requesting features

Please use [GitHub Issues](https://github.com/nizar-94/mihrab/issues).
There's no fixed template yet — a clear description of what you expected vs.
what happened (for bugs), or the problem you're trying to solve (for
features), is enough to start a conversation.
