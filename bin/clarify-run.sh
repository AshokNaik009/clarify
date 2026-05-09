#!/usr/bin/env bash
# clarify-run — wrapper that ensures the plugin's node_modules exist
# before invoking a TypeScript script. Honors $CLAUDE_PLUGIN_ROOT (set by
# Claude Code at runtime when this plugin is installed); falls back to the
# directory two levels up from this script for local development.
#
# Usage:
#   bin/clarify-run.sh <script-name>.ts [args...]
#
# Example (from a SKILL.md):
#   ${CLAUDE_PLUGIN_ROOT:-.}/bin/clarify-run.sh interview-record.ts --q "x" --a "y"

set -euo pipefail

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  DIR="$CLAUDE_PLUGIN_ROOT"
else
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [ ! -d "$DIR/node_modules" ]; then
  echo "[clarify] First run — installing node deps in $DIR (one-time, ~20s)..." >&2
  (cd "$DIR" && npm install --silent --no-audit --no-fund) >&2
fi

if [ "$#" -lt 1 ]; then
  echo "[clarify-run] usage: clarify-run.sh <script-name>.ts [args...]" >&2
  exit 64
fi

SCRIPT="$1"
shift

exec npx --yes tsx "$DIR/scripts/$SCRIPT" "$@"
