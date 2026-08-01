#!/usr/bin/env bash
# Cursor Cloud / agent dependency bootstrap for Verdant.
# Idempotent: safe to re-run on warm snapshots. Tolerates boot-time git index.lock races.
set -euo pipefail

printf '>>> [install] start\n'

has_playwright_chromium() {
  ls "${HOME}/.cache/ms-playwright"/chromium-* >/dev/null 2>&1 \
    || ls /opt/pw-browsers/chromium-* >/dev/null 2>&1
}

ensure_playwright_chromium() {
  if has_playwright_chromium; then
    printf '>>> playwright chromium cache present; skipping browser install\n'
    return 0
  fi
  if npx --yes playwright install chromium; then
    return 0
  fi
  printf 'WARN: playwright chromium install failed (non-fatal)\n' >&2
  return 0
}

restore_package_lock() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if [[ -f .git/index.lock ]]; then
      if pgrep -x git >/dev/null 2>&1; then
        printf 'WARN: waiting for concurrent git (index.lock) attempt %s\n' "${attempt}" >&2
        sleep "${attempt}"
        continue
      fi
      printf 'WARN: removing stale .git/index.lock\n' >&2
      rm -f .git/index.lock
    fi
    if git checkout -- package-lock.json; then
      return 0
    fi
    sleep "${attempt}"
  done
  printf 'WARN: could not restore package-lock.json; leaving working tree as-is\n' >&2
  return 0
}

node_modules_healthy() {
  [[ -d node_modules ]] || return 1
  # Prefer a real runtime dep over an empty/partial tree.
  [[ -d node_modules/vite ]] || [[ -d node_modules/react ]] || return 1
  return 0
}

if node_modules_healthy; then
  printf '>>> node_modules present; skipping npm reinstall\n'
  ensure_playwright_chromium
  printf '<<< [install] complete (skipped reinstall)\n'
  exit 0
fi

printf 'registry=https://registry.npmjs.org/\n' > .npmrc.tmp
# Disable husky prepare hooks during bootstrap to shrink git surface at boot.
HUSKY=0 npm_config_userconfig="${PWD}/.npmrc.tmp" npm install --no-audit --no-fund
rm -f .npmrc.tmp

# npm public-registry override rewrites resolved URLs; restore committed lockfile.
restore_package_lock

ensure_playwright_chromium

printf '<<< [install] complete\n'
