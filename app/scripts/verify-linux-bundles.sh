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
BUNDLE_DIR="$(cd -- "$BUNDLE_DIR" && pwd -P)"
command -v dpkg-deb >/dev/null 2>&1 || die "dpkg-deb is required"
command -v jq >/dev/null 2>&1 || die "jq is required to read the updater public key"
command -v minisign >/dev/null 2>&1 || die "minisign is required to verify the AppImage signature"

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
[[ -s "$signature" ]] || die "AppImage signature is empty: $signature"

# No unrequested bundle format should be silently emitted by a future CLI.
# Tauri 2.11.3 may emit a `.deb.sig`; accept it for validation, while the
# workflow upload list deliberately publishes only the `.deb` and AppImage
# updater artifacts.
while IFS= read -r artifact; do
  case "$artifact" in
    "$BUNDLE_DIR"/deb/*.deb|"$BUNDLE_DIR"/deb/*.deb.sig|"$BUNDLE_DIR"/appimage/*.AppImage|"$BUNDLE_DIR"/appimage/*.AppImage.sig) ;;
    *) die "unexpected bundle artifact: $artifact" ;;
  esac
done < <(find "$BUNDLE_DIR" -mindepth 2 -maxdepth 2 -type f -print)

verify_appimage_signature() {
  local config="$APP_DIR/src-tauri/tauri.conf.json"
  local encoded_key key_text key_comment key_body extra_line
  local key_id_comment key_id_normalized key_hex key_id_raw key_id_derived i

  encoded_key="$(jq -er '.plugins.updater.pubkey // empty' "$config")" \
    || die "updater public key is missing from $config"
  [[ -n "$encoded_key" ]] || die "updater public key is empty in $config"
  key_text="$(printf '%s' "$encoded_key" | base64 --decode 2>/dev/null)" \
    || die "updater public key is not valid base64"

  key_comment="$(sed -n '1p' <<<"$key_text")"
  key_body="$(sed -n '2p' <<<"$key_text")"
  extra_line="$(sed -n '3p' <<<"$key_text")"
  [[ "$key_comment" == "untrusted comment: minisign public key: "* ]] \
    || die "updater public key has an invalid minisign comment"
  [[ "$key_body" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] \
    || die "updater public key has an invalid minisign body"
  [[ -z "$extra_line" ]] || die "updater public key has unexpected extra lines"

  # A Minisign public key decodes to the two-byte Ed25519 marker, an
  # eight-byte little-endian key id, and the 32-byte public key. The comment
  # in this config omits a leading zero in the id, so normalize it before
  # comparing against the id carried by the key body.
  key_hex="$(printf '%s' "$key_body" | base64 --decode 2>/dev/null | od -An -tx1 -v | tr -d '[:space:]')" \
    || die "updater public key body is not valid base64"
  [[ "$key_hex" =~ ^[[:xdigit:]]{84}$ ]] \
    || die "updater public key body must decode to 42 bytes"
  [[ "${key_hex:0:4}" == "4564" ]] \
    || die "updater public key body has an invalid Ed25519 marker"
  key_id_raw="${key_hex:4:16}"
  key_id_derived=""
  for ((i=${#key_id_raw}-2; i>=0; i-=2)); do
    key_id_derived+="${key_id_raw:i:2}"
  done
  key_id_derived="${key_id_derived^^}"
  key_id_comment="${key_comment##*: }"
  [[ "$key_id_comment" =~ ^[[:xdigit:]]{1,16}$ ]] \
    || die "updater public key has an invalid key id: $key_id_comment"
  key_id_normalized="$(printf '%016s' "$key_id_comment" | tr ' ' '0')"
  key_id_normalized="${key_id_normalized^^}"
  [[ "$key_id_normalized" == "$key_id_derived" ]] \
    || die "updater public key comment id $key_id_comment does not match key body id $key_id_derived"

  echo "Verifying AppImage minisign signature with configured key $key_id_normalized"
  minisign -Vm "$appimage" -x "$signature" -P "$key_body" >/dev/null 2>&1 \
    || die "AppImage minisign verification failed (empty, foreign, or invalid signature)"
}

verify_appimage_signature

depends="$(dpkg-deb -f "${deb_files[0]}" Depends)"
echo "Debian Depends: $depends"
grep -Eq '(^|,|[[:space:]])sqlite3([[:space:](<>=]|,|$)' <<<"$depends" \
  || die "Debian Depends does not include sqlite3"
# Tauri normally adds the runtime GTK/WebKit dependencies from its Linux
# bundler. Keep this assertion so a toolchain change cannot ship a package
# that only fails on a clean machine; add explicit deb.depends entries if it
# ever trips.
grep -Eiq 'libwebkit2gtk' <<<"$depends" \
  || die "Debian Depends is missing a libwebkit2gtk runtime dependency"
grep -Eiq 'libgtk-3' <<<"$depends" \
  || die "Debian Depends is missing a libgtk-3 runtime dependency"

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
