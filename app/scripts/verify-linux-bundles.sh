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
command -v diff >/dev/null 2>&1 || die "diff is required to compare bundled resource modes"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
source "$APP_DIR/scripts/verify-minisign-appimage.sh"
source_core="$APP_DIR/src-tauri/resources/agmsg-core"
[[ -d "$source_core" ]] \
  || die "source agmsg-core resource directory is missing; run bundle-core.sh first: $source_core"

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
  local key_hex key_id_raw decoded_signature

  encoded_key="$(jq -er '.plugins.updater.pubkey // empty' "$config")" \
    || die "updater public key is missing from $config"
  [[ -n "$encoded_key" ]] || die "updater public key is empty in $config"
  key_text="$(printf '%s' "$encoded_key" | base64 --decode 2>/dev/null)" \
    || die "updater public key is not valid base64"

  key_comment="$(sed -n '1p' <<<"$key_text")"
  key_body="$(sed -n '2p' <<<"$key_text")"
  extra_line="$(sed -n '3p' <<<"$key_text")"
  [[ "$key_body" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] \
    || die "updater public key has an invalid minisign body"

  # The comment is explicitly untrusted metadata. Keep it for diagnostics,
  # but never use it as an acceptance gate. The decoded body is the Minisign
  # public-key structure: Ed marker + 8-byte little-endian key id + 32-byte
  # public key.
  key_hex="$(printf '%s' "$key_body" | base64 --decode 2>/dev/null | od -An -tx1 -v | tr -d '[:space:]')" \
    || die "updater public key body is not valid base64"
  [[ "$key_hex" =~ ^[[:xdigit:]]{84}$ ]] \
    || die "updater public key body must decode to 42 bytes"
  [[ "${key_hex:0:4}" == "4564" ]] \
    || die "updater public key body has an invalid Ed25519 marker"
  key_id_raw="${key_hex:4:16}"
  [[ "$key_id_raw" =~ ^[[:xdigit:]]{16}$ ]] \
    || die "updater public key body is missing its 8-byte key id"

  echo "Minisign public-key comment: ${key_comment:-<empty>}"
  if [[ "$key_comment" == "untrusted comment: "* ]]; then
    echo "Minisign public-key comment prefix recognized"
  else
    echo "warning: non-standard Minisign public-key comment; ignoring untrusted comment"
  fi
  [[ -z "$extra_line" ]] || echo "warning: extra public-key comment lines are ignored"

  decoded_signature="$tmp_dir/appimage.minisig"
  echo "Verifying AppImage minisign signature with configured public key body id bytes $key_id_raw"
  if ! verify_minisign_appimage_signature "$appimage" "$signature" "$key_body" "$decoded_signature"; then
    die "AppImage minisign verification failed (invalid Base64, empty, foreign, or invalid signature)"
  fi
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

verify_core_tree_modes() {
  local root="$1"
  local label="$2"
  local core
  local source_manifest="$tmp_dir/${label}-source-core.manifest"
  local bundle_manifest="$tmp_dir/${label}-bundle-core.manifest"

  core="$(find "$root" -type d -name agmsg-core -print -quit)"
  [[ -n "$core" ]] || die "$label: agmsg-core resource directory is missing"

  # Helpers beginning with `_` are intentionally mode 0644 because they are
  # sourced. Compare every relative path, file type, and mode against the
  # source tree instead of assuming that every .sh is directly executable.
  find "$source_core" -mindepth 1 -printf '%P\t%y\t%m\n' \
    | LC_ALL=C sort >"$source_manifest"
  find "$core" -mindepth 1 -printf '%P\t%y\t%m\n' \
    | LC_ALL=C sort >"$bundle_manifest"
  if ! diff -u "$source_manifest" "$bundle_manifest"; then
    die "$label: agmsg-core paths/types/modes differ from source tree"
  fi
}

deb_root="$tmp_dir/deb"
mkdir -p "$deb_root"
dpkg-deb -x "${deb_files[0]}" "$deb_root"
verify_core_tree_modes "$deb_root" "deb"

appimage_root="$tmp_dir/appimage"
mkdir -p "$appimage_root"
if ! (cd "$appimage_root" && "$appimage" --appimage-extract >/dev/null); then
  command -v unsquashfs >/dev/null 2>&1 \
    || die "AppImage extraction failed and unsquashfs is unavailable"
  unsquashfs -d "$appimage_root/squashfs-root" "$appimage" >/dev/null
fi
[[ -d "$appimage_root/squashfs-root" ]] \
  || die "AppImage squashfs extraction did not produce squashfs-root"
verify_core_tree_modes "$appimage_root/squashfs-root" "AppImage"

echo "verify-linux-bundles: OK"
echo "  deb:       ${deb_files[0]}"
echo "  AppImage:  $appimage"
echo "  signature: $signature"
