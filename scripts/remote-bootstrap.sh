#!/usr/bin/env bash
# Run bootstrap-wsl.sh on a remote host over SSH (from your Mac).
#
# Usage:
#   ./scripts/remote-bootstrap.sh
#   REMOTE=wsl-pc ./scripts/remote-bootstrap.sh
#
# Requires: SSH access to the machine (WSL sshd or Windows OpenSSH forwarding to WSL).

set -euo pipefail

REMOTE="${REMOTE:-wsl-pc}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running bootstrap on $REMOTE ..."
ssh -o ConnectTimeout=10 "$REMOTE" 'bash -s' < "$SCRIPT_DIR/bootstrap-wsl.sh"
