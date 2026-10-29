#!/usr/bin/env bash
# Monorepo: colour each package, but keep the repo root neutral.
#
# The root gets a colour too, so you can tell "the repo" from "a package
# inside the repo" when you have both windows open.

set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

echo "Root: $(pwd)"
npx hue-shift . --color slate --parts title

echo "Packages:"
for pkg in packages/*/ apps/*/; do
  [ -d "$pkg" ] || continue
  echo "  $pkg"
  npx hue-shift "$pkg" --random --seed 7 --parts title,status
done

echo
echo "Root stays grey, every package gets its own hue."
