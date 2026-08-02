#!/usr/bin/env bash
# Compare the regular files and execution bits of an agmsg-core resource tree.

verify_core_tree_modes() {
  local source_core="$1"
  local root="$2"
  local label="$3"
  local manifest_dir="$4"
  local core
  local source_manifest="$manifest_dir/${label}-source-files.manifest"
  local bundle_manifest="$manifest_dir/${label}-bundle-files.manifest"
  local relative_path mode exec_bits expected actual
  declare -A bundle_entries=()

  if [[ ! -d "$source_core" ]]; then
    echo "verify-core-tree-modes: source agmsg-core is missing; run scripts/bundle-core.sh first: $source_core" >&2
    return 1
  fi
  core="$(find "$root" -type d -name agmsg-core -print -quit)"
  if [[ -z "$core" ]]; then
    echo "verify-core-tree-modes: $label agmsg-core resource directory is missing" >&2
    return 1
  fi
  for required in install.sh uninstall.sh; do
    if [[ ! -f "$source_core/$required" ]]; then
      echo "verify-core-tree-modes: source agmsg-core/$required is missing" >&2
      return 1
    fi
    if [[ ! -f "$core/$required" ]]; then
      echo "verify-core-tree-modes: $label agmsg-core/$required is missing" >&2
      return 1
    fi
  done

  # Git records which files are executable. This comparison checks whether
  # packaging preserved those source execution bits; it does not make every
  # .sh executable, because helpers beginning with `_` are intentionally
  # sourced. Compare all regular files, including executable non-.sh files.
  mkdir -p "$manifest_dir"
  find "$source_core" -type f -printf '%P\t%m\n' \
    | LC_ALL=C sort >"$source_manifest"
  find "$core" -type f -printf '%P\t%m\n' \
    | LC_ALL=C sort >"$bundle_manifest"

  while IFS=$'\t' read -r relative_path mode; do
    [[ -n "$relative_path" ]] || continue
    exec_bits="$(printf '%03o' "$((8#$mode & 0111))")"
    bundle_entries["$relative_path"]="$exec_bits"
  done <"$bundle_manifest"

  # The source set is authoritative: every source regular file must exist in
  # the package with the same owner/group/other execution bits. Extra files
  # that Tauri adds in the packaged resource tree are intentionally allowed.
  while IFS=$'\t' read -r relative_path mode; do
    [[ -n "$relative_path" ]] || continue
    if [[ -z ${bundle_entries["$relative_path"]+present} ]]; then
      echo "verify-core-tree-modes: $label agmsg-core file missing after packaging: $relative_path" >&2
      return 1
    fi
    expected="$(printf '%03o' "$((8#$mode & 0111))")"
    actual="${bundle_entries["$relative_path"]}"
    if [[ "$actual" != "$expected" ]]; then
      echo "verify-core-tree-modes: $label execution bits changed at $relative_path (source $expected, bundle $actual)" >&2
      return 1
    fi
  done <"$source_manifest"
}
