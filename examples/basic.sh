#!/usr/bin/env bash
# Colour the project you are standing in.
# The simplest useful invocation: no flags, one project, current directory.

set -euo pipefail

cd "${1:-.}"
echo "Colouring $(pwd)"

npx hue-shift --random

echo
echo "Reload the VS Code window to see it:"
echo "  Cmd+Shift+P  ->  Developer: Reload Window"
