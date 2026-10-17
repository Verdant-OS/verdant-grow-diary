#!/usr/bin/env bash
# Idempotent Cloud Agent dependency bootstrap.
# bun.lock pins tarballs on a private Lovable npm mirror that returns 403
# outside that sandbox, so packages are installed from package-lock.json
# against the public npm registry. Bun is installed for `bun run` scripts.
set -euo pipefail

cd "$(dirname "$0")/.."

# /exec-daemon/node can be older than lint-staged's engine. Prefer the
# newest user-level Node when one is installed.
if [[ -d "${HOME}/.nvm/versions/node" ]]; then
  nvm_node="$(find "${HOME}/.nvm/versions/node" -maxdepth 3 \( -type f -o -type l \) -name node | sort -V | tail -1)"
  if [[ -n "${nvm_node}" ]]; then
    export PATH="$(dirname "${nvm_node}"):${PATH}"
  fi
fi

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi

if [[ -x "${HOME}/.bun/bin/bun" ]]; then
  sudo ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun
fi
if [[ -x "${HOME}/.bun/bin/bunx" ]]; then
  sudo ln -sf "${HOME}/.bun/bin/bunx" /usr/local/bin/bunx
fi

tmp_npmrc="$(mktemp)"
printf 'registry=https://registry.npmjs.org/\n' > "${tmp_npmrc}"
npm_config_userconfig="${tmp_npmrc}" npm install --no-audit --no-fund
rm -f "${tmp_npmrc}"

# npm rewrites package-lock resolved URLs. Keep the committed lock.
git checkout -- package-lock.json

# Chromium plus OS libraries for mocked Playwright.
npx playwright install --with-deps chromium
