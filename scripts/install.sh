#!/bin/sh
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
target="${HOME:?HOME must be set}/.pi/agent"
case $#:${1:-} in
  0:) prepare=0 ;;
  1:--prepare) prepare=1 ;;
  *) printf 'Usage: sh scripts/install.sh [--prepare]\n' >&2; exit 1 ;;
esac
if [ "$prepare" = 0 ] && { [ -e "$target" ] || [ -L "$target" ]; }; then
  printf 'Refusing installation: %s already exists. Use a fresh account or a separate HOME.\n' "$target" >&2
  exit 1
fi

command -v node >/dev/null
command -v npm >/dev/null
command -v patch >/dev/null
command -v git >/dev/null

cd "$repo"
npm ci --ignore-scripts
cd "$repo/agent/npm"
# SDK загружает Pi; lock расширений намеренно не содержит его peer dependencies.
npm ci --ignore-scripts --legacy-peer-deps
node "$repo/agent/panel-visibility/install.mjs" apply
cd "$repo/agent/npm/node_modules/pi-inspect"
patch --dry-run --batch --forward -p1 -i "$repo/patches/inspect.patch"
patch --batch --forward -p1 -i "$repo/patches/inspect.patch"

cd "$repo"
for plugin_patch in patches/npm/*.patch; do
  [ -f "$plugin_patch" ] || continue
  PI_CODING_AGENT_DIR="$repo/agent" node scripts/apply-npm-patch.mjs "$plugin_patch" --write
done
node scripts/capture-npm-patch.mjs --record-baseline

if [ "$prepare" = 1 ]; then
  printf 'Prepared Workbench in %s; no changes to %s\n' "$repo" "$target"
  exit 0
fi

mkdir -p "$(dirname -- "$target")"
mkdir "$target"
if ! cp -R "$repo/agent/." "$target/"; then
  printf 'Copy failed; incomplete installation remains at %s. Inspect it before removing it.\n' "$target" >&2
  exit 1
fi
printf 'Installed to %s\nRun: %s/scripts/pi\n' "$target" "$repo"
