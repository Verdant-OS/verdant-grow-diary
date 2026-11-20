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
  "docs/agents/roles/gemini.md",
  "docs/agents/roles/canopy.md",
  "docs/agents/roles/graft.md",
  "docs/agents/roles/root-cause.md",
  "docs/agents/roles/trellis.md",
  "docs/agents/roles/verdante.md",
  "docs/agents/roles/chemdawg.md",
  "docs/agents/roles/golden-toad.md",
  "docs/agents/roles/harvest.md",
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

const COVERAGE_STARTUP_GATE = `MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

\`\`\`text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
open_handoffs_checked:
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

const CLAUDE_STATE_READ_INSTRUCTION =
  "**`docs/agents/CURRENT_STATE.md` is deliberately NOT imported — read its \"Start here\" " +
  "section with a file tool before you acknowledge.**";
const CLAUDE_STATE_READ_STEP =
  "1. Read the \"Start here\" section of `docs/agents/CURRENT_STATE.md`, then confirm all three context files were loaded.";

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
  assert.match(result.stdout, /Sentinel-Version OK — 2026-08-01\.1 across 18/);
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
  replace(root, "docs/agents/roles/grok.md", "MANDATORY STARTUP GATE", "OPTIONAL STARTUP GATE");

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /grok\.md: exact mandatory SENTINEL_ACK/);
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
    CLAUDE_STATE_READ_INSTRUCTION.replace(" section with a file ", "\nsection with a file\n"),
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
  assert.match(result.stdout, /Sentinel-Version OK — 2026-08-01\.2 across 18/);
});

test("keeps the exact legacy startup gate valid through 2026-09-28.1", () => {
  const root = makeFixture({ version: "2026-09-28.1" });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.1 across 18/);
});

test("accepts shipped 2026-09-28.2 with its legacy ACK and no handoff log", () => {
  const root = makeFixture({ version: "2026-09-28.2" });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.2 across 18/);
});

test("accepts the exact coverage startup gate at 2026-09-28.3", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.3 across 18/);
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
  replace(root, "docs/agents/roles/grok.md", "open_handoffs_checked:\n", "");
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /grok\.md: exact mandatory SENTINEL_ACK/);
});

test("rejects a coverage field placed after current_task instead of files_read", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  replace(
    root,
    "docs/agents/roles/grok.md",
    "files_read:\nopen_handoffs_checked:\ncurrent_task:",
    "files_read:\ncurrent_task:\nopen_handoffs_checked:",
  );
  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /grok\.md: exact mandatory SENTINEL_ACK/);
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
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.3 across 18/);
});

test("rejects a coordinated downgrade that removes coverage and its handoff log", () => {
  const root = makeFixture({
    version: "2026-09-28.3",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  for (const path of GOVERNANCE_FILES) {
    writeGovernanceFile(root, path, "2026-09-28.2", REQUIRED_STARTUP_GATE);
  }
  rmSync(join(root, "docs", "agents", "HANDOFF_LOG.md"));

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Sentinel-Version downgrade/);
});

test("rejects a same-date numeric revision downgrade even when rules are unchanged", () => {
  const root = makeFixture({
    version: "2026-09-28.10",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  for (const path of GOVERNANCE_FILES) {
    writeGovernanceFile(root, path, "2026-09-28.3", COVERAGE_STARTUP_GATE);
  }

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Sentinel-Version downgrade/);
});

test("rejects a Sentinel date downgrade with a higher revision number", () => {
  const root = makeFixture({
    version: "2026-10-01.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  for (const path of GOVERNANCE_FILES) {
    writeGovernanceFile(root, path, "2026-09-28.10", COVERAGE_STARTUP_GATE);
  }

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Sentinel-Version downgrade/);
});

const SHARED_POINTERS = [
  "Sentinel block (read, do not restate): docs/agents/SENTINEL_BLOCK.md",
  "Start page (do not restate): docs/agents/START_HERE.md",
];

const SENTINEL_BLOCK_PINS = [
  "Independent acceptance routing: select an **actually available, eligible independent\nreviewer session** for the complete scope under `docs/agents/OWNERSHIP.md` \u00a74.3.\n**Blue Dream and Critical Mass are retired from future routing**; preserve historical\nreceipts. **Codex** remains eligible on work Codex neither authored nor repaired.\nA **non-contributing Claude or Grok review session** may give independent acceptance,\nincluding for Codex-authored work; **Durban Poison** remains eligible when available.\nExclude every author and repairer even after a task transfer. A shared GitHub identity\nalone does not establish independence: record session, role, contributor exclusions,\nfull 40-character head SHA, complete scope, evidence and verdict.\nThe merge gate still requires **35/35 required checks** and an independent\n**PASS at the exact head SHA**, with no P1 or P2; seats are named only in the roster. **Graft** retains only its existing\nOWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,\nprotected or mixed scopes still need an eligible outside reviewer. Required CI and\nsupplemental evidence, protected-file gates, holds, merge queue and founder-only\nproduction controls remain. Codex uses normal pushes only: no force-push, merge,\nPublish, SQL apply or production Supabase writes. Drafts remain draft.\nCheck the existing request and receipt before pinging; keep one current review request\nper PR/full head with owner, permalink and requested/running/blocked/verdict/superseded\nstate. Transfer an unavailable reviewer once to an eligible fallback; otherwise record\nBLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence\nare not PASS. Preserve a still-valid independent review without a duplicate request.\n\nHosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep\nE2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the\ndisposable test account owns the fixture grow and its selected tent/plant;\ntag every saved grow record `[smoke <timestamp>]`. Never write customer data or\nuse the KEEP account. Stop a write if identity, ownership or tagging cannot\nbe verified; report that exact safety gap rather than proposing another host.\nLocal/CI fixtures validate code, not production. Repository integration follows\nthe explicit merge gate in AGENTS.md; it is not production acceptance. No\nPublish, production APPLY, real charge, role/auth change, device control or\nAction Queue operation is authorized here. Existing owner locks remain.\nSee docs/production-only-verification-runbook.md.",
  "Independent acceptance routing: the Coordinator selects an actually available Reviewer seat (A, B, C, or D) for the complete scope under `docs/agents/OWNERSHIP.md` \u00a74.3.\n**Critical Mass is retired from future routing**; preserve historical receipts. Reviewer C, Reviewer D, and QA are active. Holders are named only in the roster.\nExclude every author and repairer even after a task transfer. A shared GitHub identity\nalone does not establish independence: record session, role, contributor exclusions,\nfull 40-character head SHA, complete scope, evidence and verdict.\nThe Merge Steward's gate still requires **35/35 required checks** and an independent\n**PASS at the exact head SHA**, with no P1 or P2. **Graft** retains only its existing\nOWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,\nprotected or mixed scopes still need an eligible outside reviewer. Required CI and\nsupplemental evidence, protected-file gates, holds, merge queue and founder-only\nproduction controls remain. Builder and Fixer seats use normal pushes only: no force-push, merge,\nPublish, SQL apply or production Supabase writes. Drafts remain draft.\nThe Merge Steward has no authority over the PR #1971 hold, which stays with the Coordinator.\nCheck the existing request and receipt before pinging; keep one current review request\nper PR/full head with owner, permalink and requested/running/blocked/verdict/superseded\nstate. Transfer an unavailable reviewer once to an eligible fallback; otherwise record\nBLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence\nare not PASS. Preserve a still-valid independent review without a duplicate request.\n\nHosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep\nE2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the\ndisposable test account owns the fixture grow and its selected tent/plant;\ntag every saved grow record `[smoke <timestamp>]`. Never write customer data or\nuse the KEEP account. Stop a write if identity, ownership or tagging cannot\nbe verified; report that exact safety gap rather than proposing another host.\nLocal/CI fixtures validate code, not production. Repository integration follows\nthe explicit merge gate in AGENTS.md; it is not production acceptance. No\nPublish, production APPLY, real charge, role/auth change, device control or\nAction Queue operation is authorized here. Existing owner locks remain.\nSee docs/production-only-verification-runbook.md.",
  "Independent acceptance routing: the Coordinator selects an actually available Reviewer seat (A, B, C, or D) for the complete scope under `docs/agents/OWNERSHIP.md` \u00a74.3.\n**Critical Mass is retired from future routing**; preserve historical receipts. Reviewer C, Reviewer D, and QA are active. Holders are named only in the roster.\nExclude every author and repairer even after a task transfer. A shared GitHub identity\nalone does not establish independence: record session, role, contributor exclusions,\nfull 40-character head SHA, complete scope, evidence and verdict.\nThe Merge Steward's gate still requires **35/35 required checks** and an independent\n**PASS at the exact head SHA**, with no P1 or P2. **Graft** retains only its existing\nOWNERSHIP.md low-risk allowlist on work Graft neither authored nor repaired; governance,\nprotected or mixed scopes still need an eligible outside reviewer. Required CI and\nsupplemental evidence, protected-file gates, holds, merge queue and founder-only\nproduction controls remain. Builder and Fixer seats use normal pushes only: no force-push, merge,\nPublish, SQL apply or production Supabase writes. Drafts remain draft.\nThe Merge Steward has no authority over the PR #1971 hold.\nCheck the existing request and receipt before pinging; keep one current review request\nper PR/full head with owner, permalink and requested/running/blocked/verdict/superseded\nstate. Transfer an unavailable reviewer once to an eligible fallback; otherwise record\nBLOCKED. A new head invalidates the old verdict; pending, acknowledgments and silence\nare not PASS. Preserve a still-valid independent review without a duplicate request.",
];

function writeSharedBlockFixture(root, version) {
  const pointers = `${SHARED_POINTERS.join("\n")}\n`;
  for (const path of GOVERNANCE_FILES) {
    const absolute = join(root, path);
    if (path === "AGENTS.md") {
      writeFileSync(absolute, readFileSync(absolute, "utf8") + pointers, "utf8");
    }
  }
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  const geminiPath = join(root, "GEMINI.md");
  writeFileSync(
    geminiPath,
    readFileSync(geminiPath, "utf8").replace(
      /<!-- SENTINEL-CORE:BEGIN[^\n]*\n[\s\S]*?\n<!-- SENTINEL-CORE:END -->/,
      `<!-- SENTINEL-CORE:BEGIN -->\n${agents.trimEnd()}\n<!-- SENTINEL-CORE:END -->`,
    ),
    "utf8",
  );
  for (const path of GOVERNANCE_FILES) {
    if (path === "AGENTS.md") continue;
    const absolute = join(root, path);
    writeFileSync(absolute, readFileSync(absolute, "utf8") + pointers, "utf8");
  }
  writeFileSync(join(root, "docs", "agents", "START_HERE.md"), "# Start\n", "utf8");
  writeFileSync(
    join(root, "docs", "agents", "SENTINEL_BLOCK.md"),
    `Sentinel-Version: ${version}\n${SENTINEL_BLOCK_PINS.join("\n")}\n`,
    "utf8",
  );
}

test("requires the shared sentinel block at 2026-11-20.1", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  const result = runChecker(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SENTINEL_BLOCK\.md: missing/);
});

test("rejects a shared sentinel block that drops a moved sentence", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  writeSharedBlockFixture(root, "2026-11-20.1");
  const blockPath = join(root, "docs", "agents", "SENTINEL_BLOCK.md");
  writeFileSync(
    blockPath,
    readFileSync(blockPath, "utf8").replace("Drafts remain draft.", ""),
    "utf8",
  );
  const result = runChecker(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /moved copy is missing from operative prose/);
});

test("accepts 2026-11-20.1 when every governance file points at the shared block", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  writeSharedBlockFixture(root, "2026-11-20.2");
  for (const path of GOVERNANCE_FILES) {
    replace(root, path, "2026-11-20.1", "2026-11-20.2");
  }
  const result = runChecker(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-11-20\.2 across 18/);
});


test("rejects moved copies that survive only inside a comment", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  writeSharedBlockFixture(root, "2026-11-20.2");
  for (const path of GOVERNANCE_FILES) {
    replace(root, path, "2026-11-20.1", "2026-11-20.2");
  }
  const blockPath = join(root, "docs", "agents", "SENTINEL_BLOCK.md");
  const body = readFileSync(blockPath, "utf8").replace(/^Sentinel-Version:.*\n/, "");
  writeFileSync(blockPath, `Sentinel-Version: 2026-11-20.2\n<!--\n${body}\n-->\n`, "utf8");
  const result = runChecker(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /moved copy is missing from operative prose/);
});

test("rejects a shared-block edit that does not bump the version", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  writeSharedBlockFixture(root, "2026-11-20.1");
  git(root, "add", ".");
  git(root, "commit", "-m", "add shared block");
  const blockPath = join(root, "docs", "agents", "SENTINEL_BLOCK.md");
  writeFileSync(blockPath, readFileSync(blockPath, "utf8") + "\nextra rule\n", "utf8");
  const result = runChecker(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SENTINEL_BLOCK\.md: content changed/);
});

test("accepts a shared-block edit once the version is bumped", () => {
  const root = makeFixture({
    version: "2026-11-20.1",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  writeSharedBlockFixture(root, "2026-11-20.1");
  git(root, "add", ".");
  git(root, "commit", "-m", "add shared block");
  const blockPath = join(root, "docs", "agents", "SENTINEL_BLOCK.md");
  writeFileSync(
    blockPath,
    readFileSync(blockPath, "utf8").replace("2026-11-20.1", "2026-11-20.2") + "\nextra rule\n",
    "utf8",
  );
  for (const path of GOVERNANCE_FILES) {
    replace(root, path, "2026-11-20.1", "2026-11-20.2");
  }
  const result = runChecker(root);
  assert.equal(result.status, 0, result.stderr);
});

test("allows a same-date revision upgrade from 9 to 10", () => {
  const root = makeFixture({
    version: "2026-09-28.9",
    startupGate: COVERAGE_STARTUP_GATE,
    handoffLog: true,
  });
  for (const path of GOVERNANCE_FILES) {
    writeGovernanceFile(root, path, "2026-09-28.10", COVERAGE_STARTUP_GATE);
  }

  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel-Version OK — 2026-09-28\.10 across 18/);
});
