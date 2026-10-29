#!/usr/bin/env bash
# CI guard: fail the build when a project's colours drifted.
#
# Use when you pin colours with a seed and want a pull request that edits
# .vscode/settings.json by hand to be caught.

set -euo pipefail

ROOT="${1:-$HOME/Documents/projects}"
SEED="${2:-42}"

echo "Checking colours under $ROOT (seed $SEED)"
echo

if npx hue-shift-cli --root "$ROOT" --random --seed "$SEED" --check; then
  echo
  echo "All projects match the pinned palette."
else
  echo
  echo "Drift detected. Either restore the palette:"
  echo "  npx hue-shift-cli --root \"$ROOT\" --random --seed $SEED"
  echo "or accept the new colours and update the seed."
  exit 1
fi
