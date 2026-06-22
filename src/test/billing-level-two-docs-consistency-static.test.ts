import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOCS_DIR = join(process.cwd(), "docs");

function loadLevelTwoDocs(): Array<{ name: string; content: string }> {
  const files = readdirSync(DOCS_DIR).filter(
    (f) => f.startsWith("billing-level-two") && f.endsWith(".md"),
  );
  return files.map((name) => ({
    name,
    content: readFileSync(join(DOCS_DIR, name), "utf8"),
  }));
}

describe("billing level two docs consistency", () => {
  const docs = loadLevelTwoDocs();
  const combined = docs.map((d) => d.content).join("\n");

  it("loads at least the expected runbook/checklist docs", () => {
    const names = docs.map((d) => d.name);
    for (const required of [
      "billing-level-two-launch-gate.md",
      "billing-level-two-migration-apply-order.md",
      "billing-level-two-sandbox-migration-operator-runbook.md",
      "billing-level-two-sandbox-verification-runbook.md",
      "billing-level-two-sandbox-operator-checklist.md",
      "billing-level-two-supabase-sql-verification-checklist.md",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("has no unresolved 'filename to verify in repo' placeholders", () => {
    for (const doc of docs) {
      expect(
        /filename to verify in repo/i.test(doc.content),
        `${doc.name} contains unresolved placeholder`,
      ).toBe(false);
    }
  });

  it("any 'no migration file found' list item names the dependency group it refers to", () => {
    for (const doc of docs) {
      const lines = doc.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Only enforce on actual list items, not inline prose / backticked references.
        if (!/^\s*-\s.*no migration file found/i.test(line)) continue;
        const window = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
        expect(
          /\d+\.\s+\S+/.test(window) || /harness/i.test(window),
          `${doc.name}:${i + 1} 'no migration file found' list item lacks an identifiable dependency group`,
        ).toBe(true);
      }
    }
  });

  it("collectively mentions every required dependency group", () => {
    const requiredGroups = [
      /billing\s+subscription[^\n]*foundation/i,
      /paddle[_ ]events/i,
      /paddle[_ ]event[_ ]processing/i,
      /billing[_ ]customer[_ ]links/i,
      /subscription\s+updater\s+rpc/i,
      /subscription\s+updater\s+audit/i,
      /retention\s+purge/i,
      /entitlement\s+resolution\s+operator\s+audit/i,
    ];
    for (const re of requiredGroups) {
      expect(re.test(combined), `missing dependency group: ${re}`).toBe(true);
    }
  });

  it("collectively includes all three operator routes", () => {
    for (const route of [
      "/operator/paddle-processing",
      "/operator/billing-subscription-updates",
      "/operator/billing-entitlement-resolution",
    ]) {
      expect(combined).toContain(route);
    }
  });

  it("collectively declares sandbox-only and does not approve live mode", () => {
    expect(/sandbox[- ]only/i.test(combined)).toBe(true);
    expect(/does not approve live mode/i.test(combined)).toBe(true);
  });

  it("collectively blocks Founder allocation and checkout-success grants", () => {
    expect(/founder allocation/i.test(combined)).toBe(true);
    expect(/checkout[- ]success/i.test(combined)).toBe(true);
  });

  it("collectively blocks raw provider IDs and Paddle payload JSON in operator UI", () => {
    expect(/raw provider ids/i.test(combined)).toBe(true);
    expect(/paddle payload json/i.test(combined)).toBe(true);
  });

  it("collectively blocks grow-room / device automation", () => {
    expect(/grow[- ]room[\/ ]device automation|device automation/i.test(combined)).toBe(true);
  });
});
