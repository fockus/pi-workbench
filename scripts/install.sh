#!/bin/sh
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
target="${HOME:?HOME must be set}/.pi/agent"
if [ -e "$target" ] || [ -L "$target" ]; then
  printf 'Refusing installation: %s already exists. Use a fresh account or a separate HOME.\n' "$target" >&2
  exit 1
fi

command -v node >/dev/null
command -v npm >/dev/null
command -v patch >/dev/null

cd "$repo"
npm ci --ignore-scripts
node -e 'const p = require("./node_modules/@earendil-works/pi-coding-agent/package.json"); if (p.version !== "1.5.0") throw new Error("Expected Pi 1.5.0");'
cd "$repo/agent/npm"
# SDK загружает Pi; lock расширений намеренно не содержит его peer dependencies.
npm ci --ignore-scripts --legacy-peer-deps
node "$repo/agent/panel-visibility/install.mjs" apply
cd "$repo/agent/npm/node_modules/pi-inspect"
patch --dry-run --batch --forward -p1 -i "$repo/patches/inspect.patch"
patch --batch --forward -p1 -i "$repo/patches/inspect.patch"

mkdir -p "$(dirname -- "$target")"
mkdir "$target"
if ! cp -R "$repo/agent/." "$target/"; then
  printf 'Copy failed; incomplete installation remains at %s. Inspect it before removing it.\n' "$target" >&2
  exit 1
fi
printf 'Installed to %s\nRun: %s/scripts/pi\n' "$target" "$repo"
