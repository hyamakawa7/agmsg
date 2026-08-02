#!/usr/bin/env bash
# Verify a Tauri updater signature stored as Base64 in an AppImage .sig file.
#
# Tauri writes the four-line minisign signature as one Base64 string. The
# minisign CLI accepts the decoded four-line representation, so callers pass
# a path inside their existing temporary directory for the decoded file.

verify_minisign_appimage_signature() {
  local appimage="$1"
  local signature="$2"
  local key_body="$3"
  local decoded_signature="$4"
  local signature_base64 reencoded_signature

  if ! signature_base64="$(<"$signature")"; then
    return 1
  fi
  [[ "$signature_base64" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || return 1
  (( ${#signature_base64} % 4 == 0 )) || return 1

  if ! printf '%s' "$signature_base64" | base64 --decode >"$decoded_signature" 2>/dev/null; then
    return 1
  fi
  [[ -s "$decoded_signature" ]] || return 1

  if ! reencoded_signature="$(base64 --wrap=0 "$decoded_signature")"; then
    return 1
  fi
  [[ "$reencoded_signature" == "$signature_base64" ]] || return 1

  minisign -Vm "$appimage" -x "$decoded_signature" -P "$key_body" >/dev/null 2>&1
}
