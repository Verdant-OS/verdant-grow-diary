#!/usr/bin/env bash
# Start the Vite dev server on IPv4 port 8080. Safe to run again.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -d "${HOME}/.nvm/versions/node" ]]; then
  nvm_node="$(find "${HOME}/.nvm/versions/node" -maxdepth 3 \( -type f -o -type l \) -name node | sort -V | tail -1)"
  if [[ -n "${nvm_node}" ]]; then
    export PATH="$(dirname "${nvm_node}"):${PATH}"
  fi
fi

if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi

exec bun run dev -- --host 127.0.0.1 --port 8080
