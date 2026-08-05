import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT_SOURCE = fileURLToPath(
  new URL("./check-sentinel-version-parity.mjs", import.meta.url),
);

const GOVERNANCE_FILES = [
  "AGENTS.md",
  "GEMINI.md",
  "CLAUDE.md",
  ".grok/rules/verdant-grok-role.md",
  "docs/agents/README.md",
  "docs/agents/HANDOFF_PROTOCOL.md",
  "docs/agents/roles/grok.md",
  "docs/agents/roles/claude.md",
  "docs/agents/roles/codex.md",
  "docs/agents/roles/security.md",
  "docs/agents/roles/gemini.md",
  "docs/agents/roles/council-chair.md",
];

const ROLE_FILES = GOVERNANCE_FILES.filter((path) => path.startsWith("docs/agents/roles/"));

const REQUIRED_STARTUP_GATE = `MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

\`\`\`text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
current_task:
scope:
out_of_scope:
conflicts_found:
data_access_status:
write_permission:
\`\`\`

If a required file is missing or conflicting, return:

\`\`\`text
STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE
\`\`\`

Do not continue until the context issue is resolved.`;

const fixtures = [];

function run(command, args, cwd, extraEnv = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function git(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
}

function canonicalConstitution(version) {
  return `# AGENTS.md\n\nSentinel-Version: ${version}\n\n${REQUIRED_STARTUP_GATE}\n`;
}

function writeGovernanceFile(root, path, version = "2026-08-01.1") {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });

  if (path === "AGENTS.md") {
    writeFileSync(absolute, canonicalConstitution(version), "utf8");
    return;
  }

  const imports =
    path === "CLAUDE.md"
      ? "@AGENTS.md\n@docs/agents/CURRENT_STATE.md\n@docs/agents/roles/claude.md\n\n"
      : "";
  const core =
    path === "GEMINI.md"
      ? `\n<!-- SENTINEL-CORE:BEGIN -->\n${canonicalConstitution(version)}<!-- SENTINEL-CORE:END -->`
      : "";
  const gate = ROLE_FILES.includes(path) ? `\n\n${REQUIRED_STARTUP_GATE}` : "";

  writeFileSync(
    absolute,
    `${imports}# ${path}\n\nSentinel-Version: ${version}\n${core}${gate}\n`,
    "utf8",
  );
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "verdant-sentinel-parity-"));
  fixtures.push(root);

  for (const path of GOVERNANCE_FILES) writeGovernanceFile(root, path);

  const currentState = join(root, "docs", "agents", "CURRENT_STATE.md");
  mkdirSync(dirname(currentState), { recursive: true });
  writeFileSync(currentState, "# Current State\n", "utf8");

  const archive = join(root, "docs", "archive", "legacy", "verdant-master-prompt-legacy.md");
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(
    archive,
    "> LEGACY — NOT ACTIVE AGENT INSTRUCTIONS\n>\n" +
      "> Preserved for historical reference only.\n" +
      "> Current instructions are defined by `/AGENTS.md`.\n",
    "utf8",
  );

  const scriptTarget = join(root, "scripts", "check-sentinel-version-parity.mjs");
  mkdirSync(dirname(scriptTarget), { recursive: true });
  copyFileSync(SCRIPT_SOURCE, scriptTarget);

  git(root, "init");
  git(root, "config", "user.email", "sentinel-test@verdant.invalid");
  git(root, "config", "user.name", "Verdant Sentinel Test");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", ".");
  git(root, "commit", "-m", "baseline governance");

  return root;
}

function runChecker(root) {
  return run(process.execPath, ["scripts/check-sentinel-version-parity.mjs"], root, {
    CI: "1",
    SENTINEL_BASE_SHA: "HEAD",
  });
}

function replace(root, path, find, replacement) {
  const absolute = join(root, path);
  const current = readFileSync(absolute, "utf8");
  assert.ok(current.includes(find), `${path} did not contain expected fixture text`);
  writeFileSync(absolute, current.replace(find, replacement), "utf8");
}

test.afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

test("passes when all governance versions agree and no rules drifted", () => {
  const root = makeFixture();
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-08-01\.1 across 12/);
});

test("fails when GEMINI.md has a different Sentinel-Version", () => {
  const root = makeFixture();
  replace(root, "GEMINI.md", "2026-08-01.1", "2026-08-01.9");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match AGENTS\.md/);
});

test("fails when Gemini's embedded universal constitution is removed", () => {
  const root = makeFixture();
  writeFileSync(
    join(root, "GEMINI.md"),
    "# GEMINI.md\n\nSentinel-Version: 2026-08-01.1\n\nSee AGENTS.md\n",
    "utf8",
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /embedded SENTINEL-CORE block is missing/);
});

test("fails when Gemini's embedded universal constitution drifts", () => {
  const root = makeFixture();
  replace(root, "GEMINI.md", "SENTINEL_ACK", "SENTINEL_ACK_DRIFTED");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /embedded SENTINEL-CORE differs from AGENTS\.md/);
});

test("fails when governance content changes without a version bump", () => {
  const root = makeFixture();
  const agentsPath = join(root, "AGENTS.md");
  writeFileSync(agentsPath, `${readFileSync(agentsPath, "utf8")}\nnew unversioned rule\n`, "utf8");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /content changed.*Sentinel-Version is still/s);
});

test("fails when a detailed role loses the exact startup gate", () => {
  const root = makeFixture();
  replace(root, "docs/agents/roles/security.md", "MANDATORY STARTUP GATE", "OPTIONAL STARTUP GATE");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /security\.md: exact mandatory SENTINEL_ACK/);
});

test("fails when Claude's automatic imports drift", () => {
  const root = makeFixture();
  replace(root, "CLAUDE.md", "@AGENTS.md", "@README.md");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLAUDE\.md: the first three lines must import/);
});

test("fails when the legacy archive loses its inactive header", () => {
  const root = makeFixture();
  replace(
    root,
    "docs/archive/legacy/verdant-master-prompt-legacy.md",
    "LEGACY — NOT ACTIVE AGENT INSTRUCTIONS",
    "Verdant Master Prompt",
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /required inactive-instructions header is missing/);
});

test("passes a coordinated rule update with one shared bumped version", () => {
  const root = makeFixture();

  for (const path of GOVERNANCE_FILES) {
    replace(root, path, "2026-08-01.1", "2026-08-01.2");
  }

  const agentsPath = join(root, "AGENTS.md");
  writeFileSync(agentsPath, `${readFileSync(agentsPath, "utf8")}\nnew versioned rule\n`, "utf8");
  const geminiPath = join(root, "GEMINI.md");
  const synchronizedGemini = readFileSync(geminiPath, "utf8").replace(
    /<!-- SENTINEL-CORE:BEGIN[^\n]*\n[\s\S]*?\n<!-- SENTINEL-CORE:END -->/,
    `<!-- SENTINEL-CORE:BEGIN -->\n${readFileSync(agentsPath, "utf8").trimEnd()}\n<!-- SENTINEL-CORE:END -->`,
  );
  writeFileSync(geminiPath, synchronizedGemini, "utf8");

  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-08-01\.2 across 12/);
});
