export type CursorCloudAgentEnvironment = {
  install: string;
};

const BUN_BOOTSTRAP_MARKER = "command -v bun";
const BUN_INSTALLER_MARKER = "curl -fsSL https://bun.sh/install | bash";
const NODE_MODULES_GUARD_MARKER = "if [ ! -d node_modules ]; then";
const BLOCK_END_MARKER = "\nfi";
const BUN_FROZEN_INSTALL_MARKER = "bun install --frozen-lockfile";
const PLAYWRIGHT_INSTALL_MARKER = "bunx playwright install chromium";
const BUN_PATH_SYMLINK_MARKER = 'sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun';
const BUNX_PATH_SYMLINK_MARKER = 'sudo ln -sfn "$HOME/.bun/bin/bunx" /usr/local/bin/bunx';

export function parseCursorCloudAgentEnvironment(raw: string): CursorCloudAgentEnvironment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("cursor_cloud_agent_environment_invalid_json");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("install" in parsed) ||
    typeof (parsed as CursorCloudAgentEnvironment).install !== "string" ||
    (parsed as CursorCloudAgentEnvironment).install.trim().length === 0
  ) {
    throw new Error("cursor_cloud_agent_environment_invalid_shape");
  }

  return parsed as CursorCloudAgentEnvironment;
}

/**
 * Validates the Cursor Cloud Agent bootstrap install script contract.
 * Fails closed when Bun is not provisioned before the frozen lockfile step.
 */
export function assertCursorCloudAgentInstallScript(install: string): void {
  if (!install.includes("set -euo pipefail")) {
    throw new Error("cursor_cloud_agent_install_missing_pipefail");
  }

  if (/\bnpx\s+/.test(install)) {
    throw new Error("cursor_cloud_agent_install_uses_npx");
  }

  const bootstrapIndex = install.indexOf(BUN_BOOTSTRAP_MARKER);
  const frozenIndex = install.indexOf(BUN_FROZEN_INSTALL_MARKER);
  const playwrightIndex = install.indexOf(PLAYWRIGHT_INSTALL_MARKER);

  if (bootstrapIndex < 0) {
    throw new Error("cursor_cloud_agent_install_missing_bun_bootstrap");
  }
  if (frozenIndex < 0) {
    throw new Error("cursor_cloud_agent_install_missing_frozen_lockfile");
  }
  if (playwrightIndex < 0) {
    throw new Error("cursor_cloud_agent_install_missing_playwright");
  }

  if (bootstrapIndex >= frozenIndex) {
    throw new Error("cursor_cloud_agent_install_bun_bootstrap_after_frozen_lockfile");
  }

  if (!install.includes(BUN_PATH_SYMLINK_MARKER) || !install.includes(BUNX_PATH_SYMLINK_MARKER)) {
    throw new Error("cursor_cloud_agent_install_missing_bun_path_symlinks");
  }

  const symlinkIndex = install.indexOf(BUN_PATH_SYMLINK_MARKER);
  if (symlinkIndex >= frozenIndex) {
    throw new Error("cursor_cloud_agent_install_symlinks_after_frozen_lockfile");
  }

  // The symlinks point at $HOME/.bun/bin, which exists only when this script ran
  // the Bun installer. A Bun found elsewhere (for example /usr/local/bin) must be
  // left alone, so both links belong inside the bootstrap block, after the
  // installer and before the block's closing `fi`.
  const installerIndex = install.indexOf(BUN_INSTALLER_MARKER);
  const bootstrapEndIndex = install.indexOf(BLOCK_END_MARKER, bootstrapIndex);
  const bunxSymlinkIndex = install.indexOf(BUNX_PATH_SYMLINK_MARKER);
  if (
    installerIndex < bootstrapIndex ||
    bootstrapEndIndex < 0 ||
    Math.min(symlinkIndex, bunxSymlinkIndex) < installerIndex ||
    Math.max(symlinkIndex, bunxSymlinkIndex) > bootstrapEndIndex
  ) {
    throw new Error("cursor_cloud_agent_install_symlinks_outside_bun_bootstrap");
  }

  // Pre-provisioned dependencies are used as-is (AGENTS.md, Cursor Cloud notes):
  // the frozen install runs only when node_modules is absent, so a registry or
  // network failure cannot abort an otherwise usable build under set -e.
  const guardIndex = install.indexOf(NODE_MODULES_GUARD_MARKER);
  const guardEndIndex = guardIndex < 0 ? -1 : install.indexOf(BLOCK_END_MARKER, guardIndex);
  if (guardIndex < 0 || guardIndex > frozenIndex || guardEndIndex < frozenIndex) {
    throw new Error("cursor_cloud_agent_install_frozen_lockfile_not_guarded");
  }

  if (playwrightIndex <= frozenIndex) {
    throw new Error("cursor_cloud_agent_install_playwright_before_dependencies");
  }
}
