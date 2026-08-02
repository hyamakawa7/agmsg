# Releasing agmsg

agmsg's version lives in one place: the [`VERSION`](VERSION) file at the
repo root. The two files that also carry the version string — `package.json`
(npm) and `.claude-plugin/plugin.json` (Claude Code plugin marketplace) — are
derived from it via [`scripts/release/sync-version.sh`](scripts/release/sync-version.sh).

The npm package `agmsg` is published directly from this repo via npm's
Trusted Publisher (OIDC) binding — there is no `NPM_TOKEN` to leak.
(Earlier releases came from a separate `fujibee/agmsg-npm` bootstrapper
repo; that repo is now archived — see "History" below.)

## Cutting a release

One command does everything:

```bash
scripts/release/cut-release.sh 1.0.4   # semver, no leading "v"
```

It bumps `VERSION`, syncs the derived files, regenerates `CHANGELOG.md` from
Conventional Commits (via [git-cliff](https://git-cliff.org)), opens a
`release: <version>` PR, auto-merges it once the required checks pass, then tags
the merged commit and pushes the tag.

**Why a PR and not a direct push:** `main` is a protected branch with required
status checks, so the release commit must land through a PR — a direct push is
rejected. Tags aren't protected, so the tag push is direct.

**Prerequisite:** install git-cliff once — `brew install git-cliff` (or
`cargo install git-cliff`, or grab a binary from the
[releases](https://github.com/orhun/git-cliff/releases)). The changelog format
is configured in [`cliff.toml`](cliff.toml).

The tag push fires [`.github/workflows/release.yml`](.github/workflows/release.yml),
which:

1. Verifies the tag matches `VERSION` and that derived files are in sync
   (`sync-version.sh --check`).
2. Waits for a reviewer to approve the `production` environment.
3. Runs `npm publish --access public --provenance`.
4. Generates the release notes for the tag with git-cliff and creates a
   GitHub Release from them.

## Desktop app: Linux artifacts and updater metadata

The desktop app has a separate `app-vX.Y.Z` release flow in
`.github/workflows/app-release.yml`. Its Linux job runs on the pinned
`ubuntu-22.04` image (glibc compatibility for distributed binaries) and asks
Tauri for exactly `deb,appimage` bundles. Before uploading artifacts, run:

```bash
cd app
scripts/verify-linux-bundles.sh src-tauri/target/release/bundle
```

The check must find one `.deb`, one executable `.AppImage`, and the matching
`.AppImage.sig`, and no RPM. It also checks the Debian runtime dependencies and
the executable bits of the bundled `agmsg-core` scripts in both formats.

### Linux release validation (manual)

The bundle script covers deterministic archive checks. Before publishing a
desktop release, complete these checks on the built `.deb` and `.AppImage`
executables as well:

1. **Updater acceptance (plan 5(e)).** Point a test build at the candidate
   `latest.json` and confirm that an AppImage accepts the `linux-x86_64` entry
   containing the matching AppImage URL and `.AppImage.sig` contents. Confirm
   that a `.deb` does not run an updater check and instead follows the release
   page installation path. If an endpoint-backed check is not practical for a
   release, record the first-release manual verification in the release notes.
2. **Terminal copy/paste (plan 5(f)).** In each shipped format, verify all three
   Linux terminal paths: right-click Copy, PRIMARY-selection middle-click
   paste, and `Ctrl+Shift+C`/`Ctrl+Shift+V`. These checks preserve the Option B
   decision to omit the inert native Edit submenu.
3. **Runtime WebKit (plan 5(g)).** While each format is running, use `ldd`
   (or `/proc/<pid>/maps`) to record which `libwebkit2gtk` is loaded. An
   AppImage's bundled-versus-system WebKit behavior affects how the select
   limitation depends on the host environment.

Linux updater behavior is a product policy: only an AppImage self-updates. A
Debian package could technically be replaced through `pkexec`, a GUI sudo
prompt, or `dpkg -i`, but this project does not adopt a self-replacement flow
that escalates privileges. Tell `.deb` users to download and install the newer
package from the release page instead. macOS and Windows updater behavior is
unchanged.

The `linux-x86_64` entry in the hand-authored `latest.json` must pair the
AppImage URL with the exact contents of its v2 signature file (not a URL to the
signature file):

```json
{
  "version": "0.4.0",
  "notes": "...",
  "pub_date": "2026-08-02T00:00:00Z",
  "platforms": {
    "linux-x86_64": {
      "url": "https://github.com/fujibee/agmsg/releases/download/app-latest/agmsg_0.4.0_amd64.AppImage",
      "signature": "<contents of agmsg_0.4.0_amd64.AppImage.sig>"
    }
  }
}
```

When updating the fixed `app-latest` release, upload the Linux `.deb`, the
AppImage, its `.AppImage.sig`, and this `latest.json` together. Keep the
`linux-x86_64` URL and signature from the same build; a signature copied from a
different AppImage makes the updater reject the artifact.

The explicit `sqlite3` entry in `app/src-tauri/tauri.conf.json` is intentional.
The app's Rust `rusqlite` dependency uses the bundled SQLite library, while the
`agmsg-core` resource invokes the system `sqlite3` command from its install
script (`app/src-tauri/resources/agmsg-core/install.sh`, the missing-command
check around lines 209–212). Do not remove that Debian dependency unless the
resource's runtime requirement and the package's `Depends` field are both
revalidated.

### Manual steps (if you'd rather not use the script)

```bash
# On an up-to-date main, on a release branch:
git switch -c release/v1.0.4
echo 1.0.4 > VERSION
./scripts/release/sync-version.sh
git-cliff --tag v1.0.4 -o CHANGELOG.md
git add VERSION package.json .claude-plugin/plugin.json CHANGELOG.md
git commit -m "release: 1.0.4"
git push -u origin release/v1.0.4
gh pr create --fill && gh pr merge --squash --auto --delete-branch
# After it merges:
git switch main && git pull --ff-only
git tag v1.0.4 && git push origin v1.0.4
```

## Manual fallback (CI unavailable)

```bash
# (after the release commit is on main via PR)
npm publish --access public --provenance
git-cliff --latest --strip header -o RELEASE_NOTES.md
gh release create "v$(cat VERSION)" --title "v$(cat VERSION)" --notes-file RELEASE_NOTES.md
```

## Supply-chain guards

The pipeline layers four defenses against silent drift and malicious publish:

- **npm Trusted Publisher (OIDC).** npmjs.com only accepts a publish from a
  GitHub Actions run that proves (via OIDC) it was triggered from this repo,
  this workflow file, and the `production` environment. There is no long-lived
  `NPM_TOKEN` to steal. Package settings on npmjs.com are also set to
  *require 2FA and disallow tokens*, so the only publish path is this workflow.
- **`production` environment with required reviewer.** A pushed tag pauses at
  the publish step until a maintainer approves the deployment. A compromised
  tag-push alone cannot ship to npm.
- **`--provenance` attestation.** Every published tarball is signed by GitHub
  and linked back to this workflow run. A tarball without provenance — or with
  provenance pointing elsewhere — is distinguishable on npmjs.com.
- **`verify-versions.yml`.** Runs `sync-version.sh --check` on every push and
  PR to `main`. A hand-edit of `package.json` or `plugin.json` without a
  `VERSION` bump fails CI before merge.

## Repository secrets required by the workflow

None — auth to npm is via OIDC.

The Trusted Publisher binding on npmjs.com keys off three things that all
must match:

| Field | Value |
| --- | --- |
| Repository | `fujibee/agmsg` |
| Workflow filename | `release.yml` |
| Environment | `production` |

If any of these is renamed, update the npm Trusted Publisher settings in
lockstep.

## Version constraints

`VERSION` must be semver (`MAJOR.MINOR.PATCH[-prerelease]`). `sync-version.sh`
rejects anything else, including a leading `v`. The tag is always
`v$(cat VERSION)`.

## History

The npm `agmsg` package was originally published from a separate repo,
[`fujibee/agmsg-npm`](https://github.com/fujibee/agmsg-npm), during the
name-registration sprint (issue #80). That repo only contained a thin
JavaScript bootstrapper that downloaded and ran `setup.sh` from this repo.
Keeping it separate added a cross-repo sync surface and bought nothing,
so it was folded back here. The bootstrapper now lives at [`bin/agmsg.js`](bin/agmsg.js).
