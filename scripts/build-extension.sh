#!/usr/bin/env bash
# Builds the Petty extension into dist/ (unpacked folder + store-ready zip).
# Thin wrapper around `npm run build` for people who prefer a shell entry point.
#
# Usage: scripts/build-extension.sh [--skip-install]
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed. Install Node.js 22+ from https://nodejs.org/" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "[ERROR] Node.js 22+ is required (found $(node --version))." >&2
  exit 1
fi

if [ "${1:-}" != "--skip-install" ] && [ ! -d node_modules ]; then
  echo "[NPM] Installing dependencies..."
  npm ci --no-audit --no-fund
fi

npm run build
