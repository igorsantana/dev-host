#!/usr/bin/env bash
# Run bootstrap-wsl.sh on a remote host over SSH (from your Mac).
#
# Usage:
#   REMOTE=user@192.168.18.145 ./scripts/remote-bootstrap.sh
#
# Requires: SSH access to the machine (WSL sshd or Windows OpenSSH forwarding to WSL).

set -euo pipefail

REMOTE="${REMOTE:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$REMOTE" ]]; then
  echo "Set REMOTE=user@192.168.18.145" >&2
  exit 1
fi

echo "Running bootstrap on $REMOTE ..."
ssh -o ConnectTimeout=10 "$REMOTE" 'bash -s' < "$SCRIPT_DIR/bootstrap-wsl.sh"
