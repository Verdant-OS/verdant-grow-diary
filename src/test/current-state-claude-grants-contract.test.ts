/**
 * Contract test for Claude's standing grants in docs/agents/CURRENT_STATE.md
 * (Matthew's decision, 2026-10-20, recorded on VER-216).
 *
 * The bounded-merge grant is an active merge fence, not historical prose. This
 * pins each of its conditions and the owner-only list, so deleting or weakening
 * one (the admin-bypass ban, the exact-head rule, the review or thread checks,
 * the per-PR migration decision) turns validation red (Codex r4328584446, #2276).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE = readFileSync(resolve(process.cwd(), "docs/agents/CURRENT_STATE.md"), "utf8");

/** The grants block: from its heading bullet to the next top-level bullet. */
function grantsBlock(doc: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.startsWith("- **Claude's standing grants"));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("- "));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

/** One labelled grant inside the block, through its nested condition bullets. */
function grant(block: string, label: string): string {
  const lines = block.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  - **${label}`));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("  - "));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

const BLOCK = grantsBlock(STATE);
const BOUNDED_MERGE = grant(BLOCK, "Bounded merge.");
const OWNER_ONLY = grant(BLOCK, "Still Matthew's only:");

describe("CURRENT_STATE.md — Claude's standing grants", () => {
  it("records the grant block with its source decision", () => {
    expect(BLOCK).toContain("Matthew's decision, 2026-10-20");
    expect(BLOCK).toContain("VER-216");
  });

  it("limits bounded merge to the merge queue, squash, never the admin bypass", () => {
    expect(BOUNDED_MERGE).toContain("through the merge queue");
    expect(BOUNDED_MERGE).toContain("squash; never the admin bypass");
  });

  it("requires every condition to hold at one exact head SHA", () => {
    expect(BOUNDED_MERGE).toContain("only when all hold at one exact head SHA");
    for (const condition of [
      "35/35 required checks green",
      "a clean review or PASS from Codex (not the PR's author or repairer) or from Matthew",
      "no open blocking review threads",
      "no merge conflict",
      "Migration PRs still need Matthew's explicit per-PR decision",
    ]) {
      expect(BOUNDED_MERGE).toContain(condition);
    }
  });

  it("keeps the owner-only decisions with Matthew", () => {
    for (const decision of [
      "Publish and deploy",
      "production SQL or migration apply",
      "production data writes",
      "spend",
      "secrets",
      "auth, role or Action Queue changes",
    ]) {
      expect(OWNER_ONLY).toContain(decision);
    }
  });
});
