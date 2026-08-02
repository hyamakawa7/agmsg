#!/usr/bin/env bash
# Verify the Linux artifacts produced by `tauri build --bundles deb,appimage`.
#
# This covers the checks that are deterministic in CI: exactly the requested
# bundle formats, an AppImage updater signature, Debian dependencies, and the
# executable bits/resources preserved through both archive formats. GUI smoke
# tests, updater endpoint acceptance, copy/paste paths, and runtime WebKit
# inspection remain release-validation steps because they need a desktop
# session and a running binary.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="${1:-$APP_DIR/src-tauri/target/release/bundle}"

die() {
  echo "verify-linux-bundles: $*" >&2
  exit 1
}

[[ -d "$BUNDLE_DIR" ]] || die "bundle directory not found: $BUNDLE_DIR"
command -v dpkg-deb >/dev/null 2>&1 || die "dpkg-deb is required"

shopt -s nullglob
deb_files=("$BUNDLE_DIR"/deb/*.deb)
appimage_files=("$BUNDLE_DIR"/appimage/*.AppImage)
signature_files=("$BUNDLE_DIR"/appimage/*.AppImage.sig)
rpm_files=("$BUNDLE_DIR"/rpm/*)

(( ${#deb_files[@]} == 1 )) || die "expected exactly one .deb, found ${#deb_files[@]}"
(( ${#appimage_files[@]} == 1 )) || die "expected exactly one AppImage, found ${#appimage_files[@]}"
(( ${#signature_files[@]} == 1 )) || die "expected exactly one .AppImage.sig, found ${#signature_files[@]}"
(( ${#rpm_files[@]} == 0 )) || die "unexpected RPM artifacts found under $BUNDLE_DIR"

appimage="${appimage_files[0]}"
signature="${signature_files[0]}"
[[ "$signature" == "$appimage.sig" ]] || die "signature does not match AppImage: $signature"
[[ -x "$appimage" ]] || die "AppImage is not executable: $appimage"

# No unrequested bundle format should be silently emitted by a future CLI.
while IFS= read -r artifact; do
  case "$artifact" in
    "$BUNDLE_DIR"/deb/*.deb|"$BUNDLE_DIR"/appimage/*.AppImage|"$BUNDLE_DIR"/appimage/*.AppImage.sig) ;;
    *) die "unexpected bundle artifact: $artifact" ;;
  esac
done < <(find "$BUNDLE_DIR" -mindepth 2 -maxdepth 2 -type f -print)

depends="$(dpkg-deb -f "${deb_files[0]}" Depends)"
echo "Debian Depends: $depends"
grep -Eq '(^|,|[[:space:]])sqlite3([[:space:](<>=]|,|$)' <<<"$depends" \
  || die "Debian Depends does not include sqlite3"
# Tauri normally adds the runtime GTK/WebKit dependencies from its Linux
# bundler. Keep this assertion so a toolchain change cannot ship a package
# that only fails on a clean machine; add explicit deb.depends entries if it
# ever trips.
grep -Eiq 'webkit2gtk|libwebkit|libgtk-3' <<<"$depends" \
  || die "Debian Depends is missing a WebKitGTK/GTK runtime dependency"

verify_core_scripts() {
  local root="$1"
  local label="$2"
  local core
  core="$(find "$root" -type d -name agmsg-core -print -quit)"
  [[ -n "$core" ]] || die "$label: agmsg-core resource directory is missing"
  [[ -f "$core/install.sh" ]] || die "$label: agmsg-core/install.sh is missing"
  [[ -f "$core/uninstall.sh" ]] || die "$label: agmsg-core/uninstall.sh is missing"

  while IFS= read -r script; do
    [[ -x "$script" ]] || die "$label: script is not executable: $script"
  done < <(find "$core" -type f \( -name 'install.sh' -o -name 'uninstall.sh' -o -path '*/scripts/*.sh' \) -print)
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

deb_root="$tmp_dir/deb"
mkdir -p "$deb_root"
dpkg-deb -x "${deb_files[0]}" "$deb_root"
verify_core_scripts "$deb_root" "deb"

appimage_root="$tmp_dir/appimage"
mkdir -p "$appimage_root"
if ! (cd "$appimage_root" && "$appimage" --appimage-extract >/dev/null); then
  command -v unsquashfs >/dev/null 2>&1 \
    || die "AppImage extraction failed and unsquashfs is unavailable"
  unsquashfs -d "$appimage_root/squashfs-root" "$appimage" >/dev/null
fi
[[ -d "$appimage_root/squashfs-root" ]] \
  || die "AppImage squashfs extraction did not produce squashfs-root"
verify_core_scripts "$appimage_root/squashfs-root" "AppImage"

echo "verify-linux-bundles: OK"
echo "  deb:       ${deb_files[0]}"
echo "  AppImage:  $appimage"
echo "  signature: $signature"
