# Activating CLA enforcement (manual steps for the repo owner)

The workflow at [`.github/workflows/cla.yml`](../.github/workflows/cla.yml)
is committed but **inert** — it will not run any check against pull requests
until the steps below are completed. This is intentional: the file can sit
in the repo indefinitely without affecting contributors, and gets switched
on only when you're ready.

It uses [`contributor-assistant/github-action`](https://github.com/contributor-assistant/github-action)
(v2.6.1), a self-hosted-in-your-repo CLA bot: it comments on new PRs asking
first-time contributors to post a fixed confirmation phrase, records that as
a signature in a JSON file in this repo, and blocks the PR's status check
until they do.

**Note on this action's maintenance status** (checked August 2026): the
upstream repository was archived on 2026-03-23 — the maintainer says they no
longer have bandwidth to maintain it, but existing releases (including
v2.6.1, which this workflow pins) remain functional, and forking for
continued development was explicitly invited. This is still the most
current, widely-adopted option of its kind, but it means there's no
guarantee of future updates or security patches from upstream. Worth
re-checking for a maintained fork or successor before this becomes
business-critical infrastructure. Source: the archive banner on
https://github.com/contributor-assistant/github-action.

## Steps to activate

1. **Create a GitHub Personal Access Token (PAT).**
   - GitHub -> Settings (your account, not the repo) -> Developer settings ->
     Personal access tokens -> Fine-grained tokens (or classic, with `repo`
     scope) -> Generate new token.
   - Scope it to the `nizar-94/muslim-app` repository, with read/write
     access to contents, issues, and pull requests (this is what lets the
     bot write the signature file and comment on PRs from forks).
   - This token is only needed because the default `GITHUB_TOKEN` that
     Actions provides automatically doesn't have enough permission to write
     back to the repo when triggered by a fork's pull request.

2. **Add the PAT as a repository secret.**
   - Repo -> Settings -> Secrets and variables -> Actions -> Secrets tab ->
     New repository secret.
   - Name: `CLA_PAT` (matches what `cla.yml` expects).
   - Value: the token from step 1.

3. **Turn the workflow on.**
   - Repo -> Settings -> Secrets and variables -> Actions -> Variables tab ->
     New repository variable.
   - Name: `CLA_ENFORCEMENT_ENABLED`
   - Value: `true`
   - Until this variable is set (or if it's set to anything other than
     `true`), the job in `cla.yml` is skipped entirely — this is the "off
     switch."

4. **(Recommended) Require the CLA check before merging.**
   - Repo -> Settings -> Branches -> add/edit a branch protection rule for
     `main` -> enable "Require status checks to pass before merging" -> add
     the `CLA Assistant` check once it has run at least once (GitHub only
     lists checks that have executed on the repo before).
   - Without this, the bot will still comment and flag unsigned PRs, but a
     maintainer could still merge past it manually. With it, GitHub blocks
     the merge button until the check passes.

5. **Confirm the target branch (`main`) is not otherwise locked down** in a
   way that would stop the Action from committing the signature file to it
   (e.g. required linear history plus no bot exceptions). If branch
   protection on `main` is strict, consider pointing `branch:` in `cla.yml`
   at a dedicated `cla-signatures` branch instead and adjust the workflow
   accordingly — not required for a small project, but worth knowing if
   protection rules get stricter later.

6. **Sanity check.** Open a throwaway PR from a second GitHub account (or ask
   a friend), confirm the bot comments asking for the CLA phrase, post the
   phrase, and confirm the check turns green and `signatures/version1/cla.json`
   gets a new entry committed to the repo.

## Rolling it back

Set `CLA_ENFORCEMENT_ENABLED` to anything other than `true` (or delete the
variable). The workflow file can stay in the repo; it simply won't run.
