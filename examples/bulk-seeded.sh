#!/usr/bin/env bash
# Colour every project in a folder, reproducibly.
#
# --seed makes --random deterministic, so running this twice gives the same
# colours. That is what lets --check be meaningful later.

set -euo pipefail

ROOT="${1:-$HOME/Documents/projects}"
SEED="${2:-42}"

echo "Preview:"
npx hue-shift --root "$ROOT" --random --seed "$SEED" --dry

echo
read -r -p "Apply to every project above? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Nothing written."; exit 0; }

npx hue-shift --root "$ROOT" --random --seed "$SEED"

echo
echo "Each project now has its own colour in .vscode/settings.json."
echo "Re-run with --check to confirm nothing drifted:"
echo "  npx hue-shift --root \"$ROOT\" --random --seed $SEED --check"
