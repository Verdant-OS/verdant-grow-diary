/**
 * Contract test for docs/agents/loop-engineering.md and the verdant-loop-habits skill.
 *
 * Pins the loop-eligibility gate (the four conditions and the never-loop list), the
 * scorer-lock mechanism description, and the habits amendment rules so a later edit
 * cannot quietly make loops eligible for production verification or let the habits
 * process touch the checks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/agents/loop-engineering.md");
const SKILL_PATH = resolve(process.cwd(), ".claude/skills/verdant-loop-habits/SKILL.md");

const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
const SKILL = existsSync(SKILL_PATH) ? readFileSync(SKILL_PATH, "utf8") : "";

describe("docs/agents/loop-engineering.md — contract", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it("carries no Sentinel-Version stamp, so editing it needs no twelve-file bump", () => {
    // The governance files open with `**Sentinel-Version: YYYY-MM-DD.N**`; prose that
    // says the page carries none is allowed, a stamp line is not.
    expect(DOC).not.toMatch(/^\*\*Sentinel-Version: /m);
  });

  it("states the four eligibility conditions", () => {
    for (const heading of ["Repeated", "Budgeted", "Scorable", "Runnable"]) {
      expect(DOC).toContain(`**${heading}.**`);
    }
  });

  it("names the surfaces a loop may never run against, inside the never-loop list itself", () => {
    // Pin the list, not the words: each protected surface must sit in the bullet list that
    // follows the "Never loop against these" lead, so a rewrite that moves a surface out of
    // the list (or softens the lead to "may") fails here rather than passing on word presence.
    const leadIndex = DOC.indexOf("**Never loop against these**");
    expect(leadIndex).toBeGreaterThan(-1);
    const afterLead = DOC.slice(leadIndex);
    const listEnd = afterLead.search(/\n\n[^-\s]/);
    const neverList = afterLead.slice(0, listEnd === -1 ? undefined : listEnd);
    expect(neverList).toMatch(/whatever the score says/);
    for (const term of [
      "production-only verification",
      "`supabase/migrations`",
      "RLS",
      "Edge Functions",
      "Action Queue",
      "device control",
      "lockfile",
      "`Sentinel-Version` governance files",
      "`docs/agents/CURRENT_STATE.md`",
      "Publish",
      "AI Doctor provider or model selection",
      "billing and entitlement rules",
    ]) {
      expect(neverList, `never-loop list is missing: ${term}`).toContain(term);
    }
    expect(neverList).not.toMatch(/\bmay loop\b/i);
  });

  it("keeps the score honest: NOT_MEASURED is never a passing score", () => {
    expect(DOC).toMatch(/NOT_MEASURED/);
    expect(DOC).toMatch(/one feature per loop/i);
  });

  it("describes the scorer lock, its unlock command, and its limits", () => {
    expect(DOC).toContain("scripts/scorer-lock.mjs");
    expect(DOC).toContain("--unlock");
    expect(DOC).toContain("--reason");
    expect(DOC).toMatch(/tripwire/i);
    expect(DOC).toMatch(/not a security boundary/i);
  });

  it("covers both Playwright lanes and says unlocks expire, bind to the branch, and are checked whole", () => {
    expect(DOC).toContain("`e2e-local/`");
    expect(DOC).toMatch(/24 hours/);
    expect(DOC).toMatch(/bound to the branch/i);
    expect(DOC).toMatch(/enforces that whole contract/);
    expect(DOC).toMatch(/declaration time (no later than|not after) now/);
    expect(DOC).toContain("nested `package.json`");
    expect(DOC).toMatch(/hook input's `cwd`/);
  });

  it("says the report covers deleted, renamed and retyped checks, not only edits", () => {
    expect(DOC).toMatch(/deleted, renamed or retyped/i);
    expect(DOC).toContain("`diff-money-migration-prefixes.mjs`");
    expect(DOC).toContain("`required-money-migrations.mjs`");
    expect(DOC).toContain("`playwright*.config.*`");
    expect(DOC).toContain("`scripts/vitest-controlled/`");
    expect(DOC).toContain("`scripts/run-vitest-batches.mjs`");
    expect(DOC).toContain("`.github/workflows/`");
    expect(DOC).toContain("`.github/actions/`");
    expect(DOC).toContain("`scripts/lib/`");
    expect(DOC).toContain("`scripts/config/`");
    expect(DOC).toContain("`*.config.*` modules under `scripts/`");
    expect(DOC).toContain("`scripts/ci/`");
    expect(DOC).toContain("release-receipt derivation");
    expect(DOC).toContain("`scripts/releases/`");
    expect(DOC).toMatch(/widening an allowlist/);
  });

  it("counts the Python testbench and pgTAP suites as scorers and anchors the hook to the project dir", () => {
    expect(DOC).toContain("`supabase/tests/`");
    expect(DOC).toContain("`test_*.py`");
    expect(DOC).toContain("`*.Tests.ps1`");
    expect(DOC).toContain("$CLAUDE_PROJECT_DIR");
  });

  it("names the gate-script prefixes CI invokes and the merge-base default for --report", () => {
    for (const prefix of [
      "`validate-`",
      "`audit-`",
      "`scan-`",
      "`-harness`",
      "`-harnesses`",
      "`-gate`",
      "`-db-security`",
      "`run-`",
    ]) {
      expect(DOC).toContain(prefix);
    }
    expect(DOC).toContain("`*_test.ts`");
    expect(DOC).toMatch(/judge verb as a hyphen-delimited token/);
    expect(DOC).toMatch(/merge-base with (the deploy branch|verdant-grow-diary)/);
  });

  it("says a strict report refuses without a deploy-branch ref, and that the lock's control files are scorers", () => {
    expect(DOC).toMatch(/--strict.*(refuses|exit 1)/);
    // The strict report reads the git-ignored unlock file, so it is a local gate; the page
    // must not advertise it as a CI verdict, and the deferred CI item must name what such a
    // job would need instead.
    expect(DOC).toMatch(/local pre-push gate/);
    expect(DOC).toMatch(/reviewable input/);
    expect(DOC).not.toMatch(/the command is ready for it/);
    expect(DOC).toContain(
      "`scripts/scorer-lock.mjs`, `scripts/lib/scorerLockRules.mjs` and `.claude/settings.json`, are scorers too",
    );
  });

  it("forbids the habits process from editing checks", () => {
    expect(DOC).toMatch(/habit[^.]*never[^.]*(check|test|scorer)/i);
  });

  it("points at the habits skill and the handoff log as the results file", () => {
    expect(DOC).toContain(".claude/skills/verdant-loop-habits/SKILL.md");
    expect(DOC).toContain("docs/agents/HANDOFF_LOG.md");
  });

  it("records the open PRs it must not collide with", () => {
    expect(DOC).toContain("#1865");
    expect(DOC).toContain("#1774");
  });
});

describe(".claude/skills/verdant-loop-habits/SKILL.md — contract", () => {
  it("exists with frontmatter name and description", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    expect(SKILL).toMatch(/^---\nname: verdant-loop-habits\ndescription: /);
  });

  it("every habit entry carries evidence and a status", () => {
    const entries = SKILL.split(/\n### H\d+/).slice(1);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of entries) {
      expect(entry).toMatch(/\*\*Evidence:\*\*/);
      expect(entry).toMatch(/\*\*Status:\*\* (active|retired)/);
      expect(entry).toMatch(/\*\*Label:\*\* (established fact|inference|source claim)/);
    }
  });

  it("states the amendment rules, including that habits never edit checks", () => {
    expect(SKILL).toContain("## Amending this list");
    expect(SKILL).toMatch(/never[^.]*(edit|change|weaken)[^.]*(check|test|scorer)/i);
    expect(SKILL).toContain("docs/agents/HANDOFF_LOG.md");
  });
});
