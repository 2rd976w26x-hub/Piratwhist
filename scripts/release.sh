#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage:
  scripts/release.sh check
  scripts/release.sh bump v0.2.xx

Commands:
  check   Validate that all masterprompt-required version updates are in place.
  bump    Update the version across required UI/docs files (v0.2.xx format).
USAGE
}

if [[ "${1:-}" == "" ]]; then
  usage
  exit 1
fi

COMMAND="$1"
NEW_VERSION="${2:-}"

REQUIRED_FILES=(
  "README.md"
  "piratwhist.html"
  "online.html"
  "online_play.html"
  "online_lobby.html"
  "online_room.html"
  "online_bidding.html"
  "online_result.html"
  "online_debug.html"
  "online_game.html"
  "online_round.html"
  "rules.html"
  "score.html"
  "guide.html"
  "cards_gallery.html"
  "piratwhist.js"
  "online.js"
  "online_room.js"
  "online_lobby.js"
  "guide_overlay.js"
  "guide_scenes.js"
  "cards_gallery.js"
  "guide_mode.css"
  "piratwhist.css"
  "online.css"
  "online_pages.css"
)

CURRENT_VERSION="$(rg -o -m 1 "v0\\.2\\.[0-9]+" README.md || true)"

if [[ -z "$CURRENT_VERSION" ]]; then
  echo "ERROR: Could not find current version in README.md (expected v0.2.xx)." >&2
  exit 1
fi

if [[ ! "$CURRENT_VERSION" =~ ^v0\.2\.[0-9]+$ ]]; then
  echo "ERROR: README.md version '$CURRENT_VERSION' does not match v0.2.xx." >&2
  exit 1
fi

check_required_files() {
  local missing=0
  for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "ERROR: Required file missing: $file"
      missing=1
      continue
    fi
    if ! rg -q "$CURRENT_VERSION" "$file"; then
      echo "ERROR: Version $CURRENT_VERSION not found in $file"
      missing=1
    fi
  done
  return "$missing"
}

check_mismatched_versions() {
  local mismatched=0
  while IFS= read -r match; do
    local found_version
    found_version="$(echo "$match" | sed -E 's/.*(v0\.2\.[0-9]+).*/\1/')"
    if [[ "$found_version" != "$CURRENT_VERSION" ]]; then
      echo "ERROR: Mismatched version detected ($found_version) in $match"
      mismatched=1
    fi
  done < <(rg -n "v0\\.2\\.[0-9]+" .)
  return "$mismatched"
}

check_zip_versions() {
  local zip_error=0
  local zip_count=0
  while IFS= read -r zipfile; do
    zip_count=$((zip_count + 1))
    if ! echo "$zipfile" | rg -q "$CURRENT_VERSION"; then
      echo "ERROR: ZIP filename does not include current version ($CURRENT_VERSION): $zipfile"
      zip_error=1
    fi
  done < <(find . -maxdepth 1 -type f -name "*.zip" -print)

  if [[ "$zip_count" -gt 1 ]]; then
    echo "ERROR: More than one ZIP file found in repo root (expected max 1 per version)."
    zip_error=1
  fi
  return "$zip_error"
}

case "$COMMAND" in
  check)
    echo "Checking release consistency for $CURRENT_VERSION..."
    errors=0
    if ! check_required_files; then
      errors=1
    fi
    if ! check_mismatched_versions; then
      errors=1
    fi
    if ! check_zip_versions; then
      errors=1
    fi

    if [[ "$errors" -eq 1 ]]; then
      echo "Release check failed. Please resolve the issues above."
      exit 1
    fi

    echo "Release check passed. All masterprompt version rules are satisfied."
    ;;
  bump)
    if [[ -z "$NEW_VERSION" ]]; then
      echo "ERROR: Missing version. Usage: scripts/release.sh bump v0.2.xx" >&2
      exit 1
    fi
    if [[ ! "$NEW_VERSION" =~ ^v0\.2\.[0-9]+$ ]]; then
      echo "ERROR: Version '$NEW_VERSION' does not match v0.2.xx." >&2
      exit 1
    fi

    echo "Updating version from $CURRENT_VERSION to $NEW_VERSION..."
    for file in "${REQUIRED_FILES[@]}"; do
      if [[ -f "$file" ]]; then
        perl -pi -e "s/\\Q$CURRENT_VERSION\\E/$NEW_VERSION/g" "$file"
      fi
    done
    echo "Version updated in required files. Run scripts/release.sh check to verify."
    ;;
  *)
    usage
    exit 1
    ;;
esac
