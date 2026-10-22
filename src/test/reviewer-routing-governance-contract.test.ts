/**
 * Regression fence for Matthew-approved reviewer routing (#2328).
 *
 * The change retires Blue Dream / Critical Mass from future assignment and routes
 * through OWNERSHIP.md §4.3 instead. A silent revert in governance prose would send
 * work to the wrong reviewers without touching application code — these assertions
 * read the live files and pin the resolved policy text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");

function readRepo(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const ROUTING_SURFACES = [
  "AGENTS.md",
  "docs/agents/OWNERSHIP.md",
  "docs/agents/roles/claude.md",
  "docs/agents/roles/codex.md",
  "docs/agents/roles/grok.md",
  ".agents/skills/verdant-exact-sha-review/SKILL.md",
] as const;

const RETIRED_ROUTING = /Blue Dream and Critical Mass are retired from future routing/i;

/** Pre-#2328 merge gate wording that named fixed persona seats for every PR. */
const LEGACY_MERGE_SEAT_LIST = /Blue Dream,?\s*(Durban Poison,?\s*)?Critical Mass or Codex gives/i;

/** Pre-#2328 Chemdawg assignment by file path only. */
const LEGACY_FILE_PATH_ASSIGNMENT = /picks the reviewer by file path/i;

/** Pre-#2328 connector scope for persona auto-assignment. */
const LEGACY_AUTO_ASSIGNMENT_CONNECTOR = /auto-assignment for Blue Dream and Critical Mass/i;

describe("reviewer routing governance contract (#2328)", () => {
  it("requires retirement language on every active routing surface", () => {
    for (const path of ROUTING_SURFACES) {
      const text = readRepo(path);
      expect(text, `${path} must retire Blue Dream / Critical Mass for future routing`).toMatch(
        RETIRED_ROUTING,
      );
    }
  });

  it("routes independent acceptance through OWNERSHIP.md §4.3 in AGENTS.md", () => {
    const agents = readRepo("AGENTS.md");
    expect(agents).toMatch(/Independent acceptance routing:/);
    expect(agents).toMatch(/docs\/agents\/OWNERSHIP\.md/);
    expect(agents).toMatch(/§4\.3/);
    expect(agents).toMatch(/eligible independent[\s\S]{0,40}reviewer session/);
  });

  it("records §4.3 ledger rules in OWNERSHIP.md", () => {
    const ownership = readRepo("docs/agents/OWNERSHIP.md");
    expect(ownership).toMatch(/### 4\.3 Available reviewer routing and request ledger/);
    expect(ownership).toMatch(/One current request per PR\/full head/);
    expect(ownership).toMatch(/silent for 60 minutes/);
    expect(ownership).toMatch(/Blue Dream and Critical Mass receive no future requests/);
    expect(ownership).toMatch(
      /Non-contributing Claude\/Grok review sessions may accept Codex-authored work/,
    );
  });

  it("forbids legacy persona-only merge and assignment wording on routing surfaces", () => {
    for (const path of ROUTING_SURFACES) {
      const text = readRepo(path);
      expect(text, `${path} must not restore legacy merge-seat list`).not.toMatch(
        LEGACY_MERGE_SEAT_LIST,
      );
      expect(text, `${path} must not restore file-path-only assignment`).not.toMatch(
        LEGACY_FILE_PATH_ASSIGNMENT,
      );
      expect(text, `${path} must not restore Blue Dream auto-assignment connector`).not.toMatch(
        LEGACY_AUTO_ASSIGNMENT_CONNECTOR,
      );
    }
  });

  it("keeps the exact-sha review skill aligned with session-based routing", () => {
    const skill = readRepo(".agents/skills/verdant-exact-sha-review/SKILL.md");
    expect(skill).toMatch(/Actually available eligible session under OWNERSHIP\.md §4\.3/);
    expect(skill).toMatch(/One current request per PR\/full head/);
    expect(skill).toMatch(/silent for 60 minutes/);
  });
});
