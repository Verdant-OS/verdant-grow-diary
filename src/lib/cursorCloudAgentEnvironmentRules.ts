export type CursorCloudAgentEnvironment = {
  install: string;
  start: string;
};

// Every contract line is matched as a whole trimmed line, never as a substring,
// so a comment or a changed condition cannot satisfy it.
const PIPEFAIL_LINE = "set -euo pipefail";
const BUN_BOOTSTRAP_CONDITION = "if ! command -v bun >/dev/null 2>&1; then";
const BUN_VERSION = "1.3.14";
const BUN_INSTALLER_LINE = `curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"`;
const NODE_RUNTIME_GUARD_CONDITION =
  "if ! /usr/local/bin/node -e 'const [M,m,p]=process.versions.node.split(\".\").map(Number); if (M<22||(M===22&&(m<22||(m===22&&p<1)))) process.exit(1)' >/dev/null 2>&1; then";
const NODE_RUNTIME_INSTALL_LINE =
  "curl -fsSL https://nodejs.org/dist/v22.22.2/node-v22.22.2-linux-x64.tar.xz | sudo tar -xJ -C /usr/local --strip-components=1";
const RIPGREP_GUARD_CONDITION = "if ! command -v rg >/dev/null 2>&1; then";
const RIPGREP_UPDATE_LINE = "sudo apt-get update";
const RIPGREP_INSTALL_LINE = "sudo apt-get install -y --no-install-recommends ripgrep";
const BUN_PATH_SYMLINK_LINE = 'sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun';
const BUNX_PATH_SYMLINK_LINE = 'sudo ln -sfn "$HOME/.bun/bin/bunx" /usr/local/bin/bunx';
const NODE_MODULES_GUARD_CONDITION = "if [ ! -d node_modules ]; then";
const BUN_FROZEN_INSTALL_LINE = "bun install --frozen-lockfile";
const PLAYWRIGHT_INSTALL_LINE = "bunx playwright install chromium";
const ANY_BUN_INSTALL = /\bbun\s+(?:install|i|add)\b/;

/**
 * The one accepted script, line for line. The checks below name the specific
 * defect; this final comparison rejects anything they do not enumerate, such
 * as a command that removes node_modules before the provisioned-dependency guard.
 */
export const CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES = Object.freeze([
  PIPEFAIL_LINE,
  NODE_RUNTIME_GUARD_CONDITION,
  NODE_RUNTIME_INSTALL_LINE,
  "fi",
  BUN_BOOTSTRAP_CONDITION,
  BUN_INSTALLER_LINE,
  BUN_PATH_SYMLINK_LINE,
  BUNX_PATH_SYMLINK_LINE,
  "fi",
  RIPGREP_GUARD_CONDITION,
  RIPGREP_UPDATE_LINE,
  RIPGREP_INSTALL_LINE,
  "fi",
  NODE_MODULES_GUARD_CONDITION,
  BUN_FROZEN_INSTALL_LINE,
  "fi",
  PLAYWRIGHT_INSTALL_LINE,
]);

const START_PATH_LINE = 'export PATH="/usr/local/bin:${HOME}/.bun/bin:${PATH}"';
const START_ALREADY_RUNNING_CONDITION =
  "if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then";
const START_DEV_SERVER_LINE = "exec bun run dev -- --host 127.0.0.1 --port 8080";

export const CURSOR_CLOUD_AGENT_CANONICAL_START_LINES = Object.freeze([
  PIPEFAIL_LINE,
  START_PATH_LINE,
  START_ALREADY_RUNNING_CONDITION,
  "exit 0",
  "fi",
  START_DEV_SERVER_LINE,
]);

type InstallScriptItem =
  { kind: "command"; line: string } | { kind: "if"; condition: string; body: string[] };

function toInstallLines(install: string): string[] {
  return install
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parses the flat `if <cond>; then … fi` shape the install script uses. Any other
 * control flow (nesting, else/elif, a stray fi, an unclosed block) is rejected
 * rather than interpreted, so the contract never guesses what bash would run.
 */
function parseInstallScriptItems(lines: readonly string[]): InstallScriptItem[] {
  const items: InstallScriptItem[] = [];
  let open: { condition: string; body: string[] } | null = null;
  for (const line of lines) {
    const isIf = /^if\b/.test(line);
    const isFi = line === "fi";
    const isOtherControl = /^(?:else|elif|then|fi|case|esac|while|until|for|do|done)\b/.test(line);
    if (isIf) {
      if (open || !line.endsWith("; then")) {
        throw new Error("cursor_cloud_agent_install_unsupported_control_flow");
      }
      open = { condition: line, body: [] };
    } else if (isFi) {
      if (!open) throw new Error("cursor_cloud_agent_install_unsupported_control_flow");
      items.push({ kind: "if", condition: open.condition, body: open.body });
      open = null;
    } else if (isOtherControl) {
      throw new Error("cursor_cloud_agent_install_unsupported_control_flow");
    } else if (open) {
      open.body.push(line);
    } else {
      items.push({ kind: "command", line });
    }
  }
  if (open) throw new Error("cursor_cloud_agent_install_unsupported_control_flow");
  return items;
}

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
    (parsed as CursorCloudAgentEnvironment).install.trim().length === 0 ||
    !("start" in parsed) ||
    typeof (parsed as CursorCloudAgentEnvironment).start !== "string" ||
    (parsed as CursorCloudAgentEnvironment).start.trim().length === 0
  ) {
    throw new Error("cursor_cloud_agent_environment_invalid_shape");
  }

  return parsed as CursorCloudAgentEnvironment;
}

/**
 * Validates the Cursor Cloud Agent bootstrap install script contract.
 * Fails closed when Bun is not provisioned before the frozen lockfile step, or
 * when the frozen install can run with node_modules already provisioned.
 */
export function assertCursorCloudAgentInstallScript(install: string): void {
  const lines = toInstallLines(install);
  if (lines[0] !== PIPEFAIL_LINE) {
    throw new Error("cursor_cloud_agent_install_missing_pipefail");
  }

  if (/\bnpx\s+/.test(install)) {
    throw new Error("cursor_cloud_agent_install_uses_npx");
  }

  // A comment can carry contract text without running it (for example
  // `if true; then # if [ ! -d node_modules ]; then`). The script needs none.
  if (lines.some((line) => line.startsWith("#") || /\s#/.test(line))) {
    throw new Error("cursor_cloud_agent_install_has_comment");
  }

  const bootstrapIndex = lines.indexOf(BUN_BOOTSTRAP_CONDITION);
  const frozenIndex = lines.indexOf(BUN_FROZEN_INSTALL_LINE);
  const playwrightIndex = lines.indexOf(PLAYWRIGHT_INSTALL_LINE);

  if (bootstrapIndex < 0) {
    throw new Error("cursor_cloud_agent_install_missing_bun_bootstrap");
  }
  if (!lines.includes(BUN_INSTALLER_LINE)) {
    throw new Error("cursor_cloud_agent_install_bun_not_pinned");
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

  const symlinkIndex = lines.indexOf(BUN_PATH_SYMLINK_LINE);
  const bunxSymlinkIndex = lines.indexOf(BUNX_PATH_SYMLINK_LINE);
  if (symlinkIndex < 0 || bunxSymlinkIndex < 0) {
    throw new Error("cursor_cloud_agent_install_missing_bun_path_symlinks");
  }
  if (Math.max(symlinkIndex, bunxSymlinkIndex) >= frozenIndex) {
    throw new Error("cursor_cloud_agent_install_symlinks_after_frozen_lockfile");
  }

  const items = parseInstallScriptItems(lines);

  // The symlinks point at $HOME/.bun/bin, which exists only when this script ran
  // the Bun installer. A Bun found elsewhere (for example /usr/local/bin) must be
  // left alone, so both links live only inside the bootstrap block, after the
  // installer.
  const bootstrapBlocks = items.filter(
    (item): item is Extract<InstallScriptItem, { kind: "if" }> =>
      item.kind === "if" && item.condition === BUN_BOOTSTRAP_CONDITION,
  );
  const bootstrapBody = bootstrapBlocks.length === 1 ? bootstrapBlocks[0].body : null;
  const symlinkLines = [BUN_PATH_SYMLINK_LINE, BUNX_PATH_SYMLINK_LINE];
  if (
    !bootstrapBody ||
    bootstrapBody[0] !== BUN_INSTALLER_LINE ||
    symlinkLines.some(
      (link) =>
        bootstrapBody.indexOf(link) < 1 || lines.filter((line) => line === link).length !== 1,
    )
  ) {
    throw new Error("cursor_cloud_agent_install_symlinks_outside_bun_bootstrap");
  }

  // Pre-provisioned dependencies are used as-is (AGENTS.md, Cursor Cloud notes):
  // the frozen install runs only inside an exact `node_modules` absence guard,
  // and no other dependency install runs anywhere, so a registry or network
  // failure cannot abort an otherwise usable build under set -e.
  const guardIndex = items.findIndex(
    (item) =>
      item.kind === "if" &&
      item.condition === NODE_MODULES_GUARD_CONDITION &&
      item.body.length === 1 &&
      item.body[0] === BUN_FROZEN_INSTALL_LINE,
  );
  const installLineCount = lines.filter((line) => ANY_BUN_INSTALL.test(line)).length;
  if (guardIndex < 0 || installLineCount !== 1) {
    throw new Error("cursor_cloud_agent_install_frozen_lockfile_not_guarded");
  }

  const playwrightItemIndex = items.findIndex(
    (item) => item.kind === "command" && item.line === PLAYWRIGHT_INSTALL_LINE,
  );
  if (playwrightItemIndex <= guardIndex) {
    throw new Error("cursor_cloud_agent_install_playwright_before_dependencies");
  }

  if (
    lines.length !== CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES.length ||
    lines.some((line, i) => line !== CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES[i])
  ) {
    throw new Error("cursor_cloud_agent_install_not_canonical");
  }
}

/**
 * Validates the dev-server start command. A listener already on 127.0.0.1:8080
 * is left running; otherwise Vite starts on that host and port.
 */
export function assertCursorCloudAgentStartScript(start: string): void {
  const lines = toInstallLines(start);
  if (lines[0] !== PIPEFAIL_LINE) {
    throw new Error("cursor_cloud_agent_start_missing_pipefail");
  }
  if (
    lines.length !== CURSOR_CLOUD_AGENT_CANONICAL_START_LINES.length ||
    lines.some((line, index) => line !== CURSOR_CLOUD_AGENT_CANONICAL_START_LINES[index])
  ) {
    throw new Error("cursor_cloud_agent_start_not_canonical");
  }
}
