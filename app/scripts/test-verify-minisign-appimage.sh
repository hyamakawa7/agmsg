#!/usr/bin/env bash
# Exercise the Tauri updater signature encoding used by verify-linux-bundles.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/fixtures/minisign-appimage"
source "$SCRIPT_DIR/verify-minisign-appimage.sh"

command -v minisign >/dev/null 2>&1 || {
  echo "test-verify-minisign-appimage: minisign is required" >&2
  exit 1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

appimage="$tmp_dir/fixture.AppImage"
tampered_appimage="$tmp_dir/fixture-tampered.AppImage"
printf '%s' 'test' >"$appimage"
printf '%s' 'tampered' >"$tampered_appimage"

run_case() {
  local label="$1"
  local candidate_appimage="$2"
  local signature="$3"
  local public_key="$4"
  local expected_status="$5"
  local decoded_signature="$tmp_dir/$label.minisig"
  local key_body status

  key_body="$(sed -n '2p' "$public_key")"
  if verify_minisign_appimage_signature \
    "$candidate_appimage" "$signature" "$key_body" "$decoded_signature"; then
    status=0
  else
    status=$?
  fi

  if (( expected_status == 0 && status != 0 )); then
    echo "$label: expected success, got exit $status" >&2
    exit 1
  fi
  if (( expected_status != 0 && status == 0 )); then
    echo "$label: expected failure, got success" >&2
    exit 1
  fi
  if (( status == 0 )); then
    printf '%s: success\n' "$label"
  else
    printf '%s: rejected\n' "$label"
  fi
}

run_case valid \
  "$appimage" "$FIXTURE_DIR/valid.AppImage.sig" \
  "$FIXTURE_DIR/trusted.pub" 0
run_case foreign-key \
  "$appimage" "$FIXTURE_DIR/valid.AppImage.sig" \
  "$FIXTURE_DIR/foreign.pub" 1
run_case tampered \
  "$tampered_appimage" "$FIXTURE_DIR/valid.AppImage.sig" \
  "$FIXTURE_DIR/trusted.pub" 1
run_case invalid-base64 \
  "$appimage" "$FIXTURE_DIR/invalid-base64.AppImage.sig" \
  "$FIXTURE_DIR/trusted.pub" 1

echo 'test-verify-minisign-appimage: OK'
