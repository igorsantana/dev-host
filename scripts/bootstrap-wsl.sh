#!/usr/bin/env bash
# Bootstrap the development workspace inside WSL (Ubuntu on Windows).
#
# Run on the Windows PC (WSL terminal):
#   curl -fsSL https://raw.githubusercontent.com/igorsantana/dev-host/feat/sync-projects-script/scripts/bootstrap-wsl.sh | bash
# Or from a dev-host checkout:
#   bash scripts/bootstrap-wsl.sh
#
# Env overrides:
#   DEVELOPMENT_ROOT=~/development
#   DEV_HOST_BRANCH=main

set -euo pipefail

DEVELOPMENT_ROOT="${DEVELOPMENT_ROOT:-$HOME/development}"
DEV_HOST_REPO="${DEV_HOST_REPO:-https://github.com/igorsantana/dev-host.git}"
DEV_HOST_BRANCH="${DEV_HOST_BRANCH:-main}"
HOST_DIR="$DEVELOPMENT_ROOT/dev-host"

log() { printf '\n==> %s\n' "$*"; }
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need git
need node
need npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node 20+ required (found $(node -v))" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Warning: docker not found — Finance News / Personal Planner need Docker Desktop (WSL integration enabled)." >&2
else
  if ! docker info >/dev/null 2>&1; then
    echo "Warning: docker present but daemon not reachable — start Docker Desktop on Windows." >&2
  fi
fi

mkdir -p "$DEVELOPMENT_ROOT"

if [[ ! -d "$HOST_DIR/.git" ]]; then
  log "Clone dev-host"
  git clone --branch "$DEV_HOST_BRANCH" "$DEV_HOST_REPO" "$HOST_DIR"
else
  log "Update dev-host"
  git -C "$HOST_DIR" fetch origin
  git -C "$HOST_DIR" checkout "$DEV_HOST_BRANCH"
  git -C "$HOST_DIR" pull --ff-only origin "$DEV_HOST_BRANCH"
fi

log "Install dev-host dependencies"
npm install --prefix "$HOST_DIR"

log "Sync all configured projects from GitHub"
npm run sync --prefix "$HOST_DIR"

if [[ -d "$DEVELOPMENT_ROOT/cyberdeck-ui" ]]; then
  log "Build @cyberdeck/ui"
  npm install --prefix "$DEVELOPMENT_ROOT/cyberdeck-ui"
  npm run build --prefix "$DEVELOPMENT_ROOT/cyberdeck-ui"
fi

log "Done"
cat <<EOF

Workspace: $DEVELOPMENT_ROOT

Next steps (in WSL):
  1. Copy .env files (not in git) into Projeto/ and vinyl-catalog/ as needed.
  2. Start the dashboard:
       cd $HOST_DIR && npm run dev
  3. Open from Windows browser:
       http://localhost:4040

Use the dev-host UI to Start each project (Docker projects need Docker Desktop).

EOF
