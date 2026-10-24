/**
 * Contract tests for docs/release/vercel-config-removal-inventory-2026-10-10.md.
 *
 * The inventory is the checklist for a future, owner-approved Vercel cleanup.
 * These tests do not approve any row; they guard against silent drift in counts,
 * missing paths, and scorer-lock labels before follow-up production slices land.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isScorerPath } from "../../scripts/lib/scorerLockRules.mjs";

const ROOT = resolve(__dirname, "../..");
const INVENTORY_REL = "docs/release/vercel-config-removal-inventory-2026-10-10.md";
const INVENTORY = readFileSync(resolve(ROOT, INVENTORY_REL), "utf8");

type InventoryRow = {
  file: string;
  scorerLocked: "yes" | "no";
  section: "documentation" | "telemetry" | "hosting";
};

function sectionBody(headingPrefix: string): string {
  const lineStart = INVENTORY.indexOf(`\n## ${headingPrefix}`);
  expect(lineStart, `missing section starting with ${headingPrefix}`).toBeGreaterThanOrEqual(0);
  const lineEnd = INVENTORY.indexOf("\n", lineStart + 1);
  const bodyStart = lineEnd === -1 ? INVENTORY.length : lineEnd + 1;
  const next = INVENTORY.indexOf("\n## ", bodyStart);
  return INVENTORY.slice(bodyStart, next === -1 ? undefined : next);
}

function parseTableRows(section: InventoryRow["section"], body: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    expect(cells.length, `unexpected table shape: ${line}`).toBeGreaterThanOrEqual(7);
    const fileMatch = cells[1]?.match(/^`([^`]+)`$/);
    expect(fileMatch, `missing file path in row: ${line}`).not.toBeNull();
    const locked = cells[5];
    expect(locked === "yes" || locked === "no", `scorer-locked must be yes/no: ${line}`).toBe(
      true,
    );
    rows.push({
      file: fileMatch![1],
      scorerLocked: locked as "yes" | "no",
      section,
    });
  }
  return rows;
}

function summaryCount(label: RegExp): number {
  const match = INVENTORY.match(label);
  expect(match, `missing summary count for ${label}`).not.toBeNull();
  return Number(match![1]);
}

describe("vercel config removal inventory", () => {
  it("states inventory-only scope and pins section counts that sum to the total", () => {
    expect(INVENTORY).toMatch(/\*\*Status:\*\* inventory only\./);
    const documentation = summaryCount(
      /\| 1\. Documentation \(docs text only\) \| (\d+) \|/,
    );
    const telemetry = summaryCount(/\| 2\. Telemetry \| (\d+) \|/);
    const hosting = summaryCount(/\| 3\. Hosting and security \| (\d+) \|/);
    const total = summaryCount(/\| Total proposed cleanup \| (\d+) \|/);
    expect(documentation + telemetry + hosting).toBe(total);
    expect(total).toBe(60);
    expect(documentation).toBe(21);
    expect(telemetry).toBe(7);
    expect(hosting).toBe(32);
  });

  it("lists one inventory table row per counted item in each section", () => {
    const documentation = parseTableRows(
      "documentation",
      sectionBody("1. Documentation — docs text only"),
    );
    const telemetry = parseTableRows("telemetry", sectionBody("2. Telemetry"));
    const hosting = parseTableRows("hosting", sectionBody("3. Hosting and security"));
    expect(documentation).toHaveLength(21);
    expect(telemetry).toHaveLength(7);
    expect(hosting).toHaveLength(32);
  });

  it("references repository paths that exist at the inventory stamp", () => {
    const rows = [
      ...parseTableRows(
        "documentation",
        sectionBody("1. Documentation — docs text only"),
      ),
      ...parseTableRows("telemetry", sectionBody("2. Telemetry")),
      ...parseTableRows("hosting", sectionBody("3. Hosting and security")),
    ];
    const missing = rows
      .map((row) => row.file)
      .filter((file) => !existsSync(resolve(ROOT, file)));
    expect(missing, `inventory paths missing on disk: ${missing.join(", ")}`).toEqual([]);
  });

  it("marks scorer-locked rows only when the path is a scorer under loop-engineering rules", () => {
    const rows = [
      ...parseTableRows(
        "documentation",
        sectionBody("1. Documentation — docs text only"),
      ),
      ...parseTableRows("telemetry", sectionBody("2. Telemetry")),
      ...parseTableRows("hosting", sectionBody("3. Hosting and security")),
    ];
    const mismatches = rows
      .filter((row) => row.scorerLocked === "yes" && !isScorerPath(row.file))
      .map((row) => `${row.section}: ${row.file}`);
    expect(
      mismatches,
      `inventory says scorer-locked but isScorerPath is false: ${mismatches.join("; ")}`,
    ).toEqual([]);
  });

  it("records a measured deploy-tip SHA on the inventory stamp", () => {
    const match = INVENTORY.match(/\*\*Measured on deploy tip\*\* `([0-9a-f]{40})`\./);
    expect(match, "inventory must name the deploy tip SHA it was measured against").not.toBeNull();
  });
});
