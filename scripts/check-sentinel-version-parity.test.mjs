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

const COVERAGE_STARTUP_GATE = REQUIRED_STARTUP_GATE.replace(
  "files_read:\ncurrent_task:",
  "files_read:\nopen_handoffs_checked:\ncurrent_task:",
);

const CLAUDE_STATE_READ_INSTRUCTION =
  "**`docs/agents/CURRENT_STATE.md` is deliberately NOT imported — read it with a file " +
  "tool before you acknowledge.**";
const CLAUDE_STATE_READ_STEP =
  "1. Read `docs/agents/CURRENT_STATE.md`, then confirm all three context files were loaded.";

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

function canonicalConstitution(version, startupGate = REQUIRED_STARTUP_GATE) {
  return `# AGENTS.md\n\nSentinel-Version: ${version}\n\n${startupGate}\n`;
}

function writeGovernanceFile(
  root,
  path,
  version = "2026-08-01.1",
  startupGate = REQUIRED_STARTUP_GATE,
) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });

  if (path === "AGENTS.md") {
    writeFileSync(absolute, canonicalConstitution(version, startupGate), "utf8");
    return;
  }

  // CLAUDE.md imports two files and reads docs/agents/CURRENT_STATE.md on demand. The
  // checker pins both read imperatives verbatim, so the fixture must carry them exactly.
  // The trailing "See also" line is a deliberate incidental mention of the pathname: the
  // drop-the-instruction test relies on it to prove a leftover reference cannot satisfy
  // the check.
  const imports =
    path === "CLAUDE.md"
      ? "@AGENTS.md\n@docs/agents/roles/claude.md\n\n" +
        `${CLAUDE_STATE_READ_INSTRUCTION}\n\n${CLAUDE_STATE_READ_STEP}\n\n` +
        "See also docs/agents/CURRENT_STATE.md for operating state. The old import " +
        "(`@docs/agents/CURRENT_STATE.md`) was removed in #1094.\n\n"
      : "";
  const core =
    path === "GEMINI.md"
      ? `\n<!-- SENTINEL-CORE:BEGIN -->\n${canonicalConstitution(version, startupGate)}<!-- SENTINEL-CORE:END -->`
      : "";
  const gate = ROLE_FILES.includes(path) ? `\n\n${startupGate}` : "";

  writeFileSync(
    absolute,
    `${imports}# ${path}\n\nSentinel-Version: ${version}\n${core}${gate}\n`,
    "utf8",
  );
}

function makeFixture({
  version = "2026-08-01.1",
  startupGate = REQUIRED_STARTUP_GATE,
  handoffLog = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "verdant-sentinel-parity-"));
  fixtures.push(root);

  for (const path of GOVERNANCE_FILES) writeGovernanceFile(root, path, version, startupGate);

  const currentState = join(root, "docs", "agents", "CURRENT_STATE.md");
  mkdirSync(dirname(currentState), { recursive: true });
  writeFileSync(currentState, "# Current State\n", "utf8");
  if (handoffLog) {
    writeFileSync(join(root, "docs", "agents", "HANDOFF_LOG.md"), "# Handoff log\n", "utf8");
  }

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
  assert.match(result.stderr, /CLAUDE\.md: the first two lines must import/);
});

// CURRENT_STATE.md stopped being an @import on 2026-08-21 (~27,400 tokens on every turn).
// The written read instruction replaced it, and a sentence can be deleted without the
// obvious diff signature that removing an import line has — so it is guarded explicitly.
test("fails when both read imperatives are dropped even though an incidental mention of the pathname remains", () => {
  const root = makeFixture();
  // Remove the two pinned imperatives but keep the fixture's "See also
  // docs/agents/CURRENT_STATE.md" line: a bare-pathname check would stay green here,
  // which is exactly the hole this test pins shut.
  replace(root, "CLAUDE.md", CLAUDE_STATE_READ_INSTRUCTION, "Operating state is elsewhere.");
  replace(root, "CLAUDE.md", CLAUDE_STATE_READ_STEP, "1. Confirm context files were loaded.");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact pre-ack read instruction .* is missing/);
  assert.match(result.stderr, /exact startup step-1 read .* is missing/);
});

test("fails when the imperatives survive only inside a fenced example and a blockquote", () => {
  const root = makeFixture();
  // Codex's reproduced bypass: replace both operative imperatives with contradictory
  // prose while their exact wording is retained in non-operative contexts — one inside
  // an "obsolete example" fence, one as a blockquoted historical copy. A full-text
  // includes() stays green here; the operative-prose check must not.
  replace(root, "CLAUDE.md", CLAUDE_STATE_READ_INSTRUCTION, "Operating state is optional now.");
  replace(
    root,
    "CLAUDE.md",
    CLAUDE_STATE_READ_STEP,
    "1. Skip straight to acknowledging.\n\n" +
      "Obsolete example, do not follow:\n\n" +
      "\u0060\u0060\u0060text\n" +
      `${CLAUDE_STATE_READ_INSTRUCTION}\n` +
      "\u0060\u0060\u0060\n\n" +
      `> ${CLAUDE_STATE_READ_STEP}`,
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact pre-ack read instruction .* is missing/);
  assert.match(result.stderr, /exact startup step-1 read .* is missing/);
});

test("fails when the imperatives survive only inside a tilde fence and an HTML comment", () => {
  const root = makeFixture();
  // Same bypass class as the backtick-fence test, via the other CommonMark fence
  // delimiter and an HTML comment — both non-operative contexts the parser must strip.
  replace(root, "CLAUDE.md", CLAUDE_STATE_READ_INSTRUCTION, "Operating state is optional now.");
  replace(
    root,
    "CLAUDE.md",
    CLAUDE_STATE_READ_STEP,
    "1. Skip straight to acknowledging.\n\n" +
      "~~~text\n" +
      `${CLAUDE_STATE_READ_INSTRUCTION}\n` +
      "~~~\n\n" +
      `<!-- ${CLAUDE_STATE_READ_STEP} -->`,
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact pre-ack read instruction .* is missing/);
  assert.match(result.stderr, /exact startup step-1 read .* is missing/);
});

test("fails when a pin survives inside a comment left behind by delimiter recombination", () => {
  const root = makeFixture();
  // CodeQL's incomplete-sanitization pattern, pointed at this gate: one strip pass over
  // "<!<!-- x -->-- pin -->" removes the inner comment and leaves "<!-- pin -->" intact,
  // so a single-pass parser counts the pin as operative. The fixpoint loop must not.
  replace(root, "CLAUDE.md", CLAUDE_STATE_READ_STEP, "1. Skip straight to acknowledging.");
  replace(
    root,
    "CLAUDE.md",
    "See also docs/agents/CURRENT_STATE.md for operating state.",
    `See also docs/agents/CURRENT_STATE.md for operating state.\n\n<!<!-- x -->-- ${CLAUDE_STATE_READ_STEP} -->`,
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact startup step-1 read .* is missing/);
});

test("passes when the read instruction is merely re-wrapped across different lines", () => {
  const root = makeFixture();
  // Whitespace-normalized comparison: a prose re-wrap must not read as a violation.
  replace(
    root,
    "CLAUDE.md",
    CLAUDE_STATE_READ_INSTRUCTION,
    CLAUDE_STATE_READ_INSTRUCTION.replace(" read it with a file ", "\nread it with a file\n"),
  );
  // Commit the re-wrap so the BUMP gate sees no drift — this test isolates the
  // whitespace-normalized pin comparison, not the content-change rule.
  git(root, "add", ".");
  git(root, "commit", "-m", "re-wrap the read instruction");

  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
});

// Re-importing it would silently undo the token saving, so the ordered-prefix assertion
// has to reject a three-line header as firmly as it rejects a wrong one.
test("fails when CURRENT_STATE.md is re-added as an automatic import", () => {
  const root = makeFixture();
  replace(
    root,
    "CLAUDE.md",
    "@AGENTS.md\n@docs/agents/roles/claude.md",
    "@AGENTS.md\n@docs/agents/CURRENT_STATE.md\n@docs/agents/roles/claude.md",
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLAUDE\.md: the first two lines must import/);
});

test("fails when CURRENT_STATE.md is imported inline in prose", () => {
  const root = makeFixture();
  // Claude Code resolves @-imports inline in a sentence, not only on standalone lines,
  // and the fixture's backticked mention proves a code-span reference stays legal.
  replace(
    root,
    "CLAUDE.md",
    "See also docs/agents/CURRENT_STATE.md for operating state.",
    "See @docs/agents/CURRENT_STATE.md for operating state.",
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not be imported automatically/);
});

test("fails when CURRENT_STATE.md is appended as a third import after the required prefix", () => {
  const root = makeFixture();
  // The two required lines stay first, so startsWith still holds — only the explicit
  // reject-anywhere rule can catch this placement.
  replace(
    root,
    "CLAUDE.md",
    "@AGENTS.md\n@docs/agents/roles/claude.md",
    "@AGENTS.md\n@docs/agents/roles/claude.md\n@docs/agents/CURRENT_STATE.md",
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not be imported automatically/);
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

test("keeps the exact legacy startup gate valid through 2026-09-28.1", () => {
  const root = makeFixture({ version: "2026-09-28.1" });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.1 across 12/);
});

test("accepts shipped 2026-09-28.2 with its legacy ACK and no handoff log", () => {
  const root = makeFixture({ version: "2026-09-28.2" });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.2 across 12/);
});

test("accepts the exact coverage startup gate at 2026-09-28.3", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.3 across 12/);
});

test("accepts CRLF copies of the coverage gate without relaxing its field order", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  for (const path of GOVERNANCE_FILES) {
    const absolute = join(root, path);
    writeFileSync(absolute, readFileSync(absolute, "utf8").replace(/\n/g, "\r\n"), "utf8");
  }
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
});

test("requires coverage for revision 10 instead of comparing revision strings", () => {
  const root = makeFixture({ version: "2026-09-28.10", handoffLog: true });
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /AGENTS\.md: exact mandatory SENTINEL_ACK/);
});

test("keeps the coverage gate required on a later Sentinel date", () => {
  const root = makeFixture({
    version: "2026-10-01.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
});

test("rejects a detailed role that omits the coverage field at 2026-09-28.3", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  replace(root, "docs/agents/roles/security.md", "open_handoffs_checked:\n", "");
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /security\.md: exact mandatory SENTINEL_ACK/);
});

test("rejects a coverage field placed after current_task instead of files_read", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  replace(
    root,
    "docs/agents/roles/security.md",
    "files_read:\nopen_handoffs_checked:\ncurrent_task:",
    "files_read:\ncurrent_task:\nopen_handoffs_checked:",
  );
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /security\.md: exact mandatory SENTINEL_ACK/);
});

test("rejects the coverage version when its handoff log is missing", () => {
  const root = makeFixture({ version: "2026-09-28.3", startupGate: COVERAGE_STARTUP_GATE });
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /HANDOFF_LOG\.md: missing/);
});

test("passes a coordinated upgrade from the legacy gate to the coverage gate", () => {
  const root = makeFixture({ version: "2026-09-28.1" });
  for (const path of GOVERNANCE_FILES) {
    writeGovernanceFile(root, path, "2026-09-28.3", COVERAGE_STARTUP_GATE);
  }
  writeFileSync(join(root, "docs", "agents", "HANDOFF_LOG.md"), "# Handoff log\n", "utf8");
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.3 across 12/);
});
