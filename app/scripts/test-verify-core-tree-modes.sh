#!/usr/bin/env bash
# Exercise agmsg-core resource path and execution-bit preservation checks.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source_core="$APP_DIR/src-tauri/resources/agmsg-core"
source "$SCRIPT_DIR/verify-core-tree-modes.sh"

[[ -d "$source_core" ]] || {
  echo "test-verify-core-tree-modes: run scripts/bundle-core.sh first" >&2
  exit 1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

nonexec_file="$(find "$source_core" -type f -name '_*.sh' ! -perm /0111 -print -quit)"
[[ -n "$nonexec_file" ]] || {
  echo "test-verify-core-tree-modes: fixture needs a non-executable sourced helper" >&2
  exit 1
}
[[ ! -x "$nonexec_file" ]] || {
  echo "test-verify-core-tree-modes: selected helper is unexpectedly executable" >&2
  exit 1
}
nonexec_relative="${nonexec_file#"$source_core"/}"

exec_file="$(find "$source_core" -type f -perm /0111 -not -name install.sh -not -name uninstall.sh -print -quit)"
[[ -n "$exec_file" ]] || {
  echo "test-verify-core-tree-modes: fixture needs an executable regular file" >&2
  exit 1
}
exec_relative="${exec_file#"$source_core"/}"

make_fixture() {
  local label="$1"
  local root="$tmp_dir/$label/root"
  mkdir -p "$root"
  cp -a "$source_core" "$root/agmsg-core"
  printf '%s\n' "$root"
}

verify_success() {
  local label="$1"
  local root="$2"
  if ! verify_core_tree_modes "$source_core" "$root" "$label" "$tmp_dir/manifests"; then
    echo "$label: expected success" >&2
    exit 1
  fi
  printf '%s: success\n' "$label"
}

verify_failure() {
  local label="$1"
  local root="$2"
  if verify_core_tree_modes "$source_core" "$root" "$label" "$tmp_dir/manifests"; then
    echo "$label: expected failure" >&2
    exit 1
  fi
  printf '%s: rejected\n' "$label"
}

exact_root="$(make_fixture exact)"
verify_success exact "$exact_root"

extra_root="$(make_fixture extra)"
printf '%s\n' 'Tauri-added fixture entry' >"$extra_root/agmsg-core/tauri-added-file"
verify_success extra-entry "$extra_root"

nonexec_to_exec_root="$(make_fixture nonexec-to-exec)"
chmod +x "$nonexec_to_exec_root/agmsg-core/$nonexec_relative"
verify_failure nonexec-to-exec "$nonexec_to_exec_root"

exec_to_nonexec_root="$(make_fixture exec-to-nonexec)"
chmod a-x "$exec_to_nonexec_root/agmsg-core/$exec_relative"
verify_failure exec-to-nonexec "$exec_to_nonexec_root"

write_mode_root="$(make_fixture write-mode-change)"
chmod 666 "$write_mode_root/agmsg-core/$nonexec_relative"
verify_failure write-mode-change "$write_mode_root"

missing_root="$(make_fixture missing)"
mv "$missing_root/agmsg-core/$nonexec_relative" \
  "$missing_root/agmsg-core/$nonexec_relative.missing"
verify_failure missing-file "$missing_root"

printf 'test-verify-core-tree-modes: OK (%s source regular files)\n' \
  "$(find "$source_core" -type f | wc -l)"
