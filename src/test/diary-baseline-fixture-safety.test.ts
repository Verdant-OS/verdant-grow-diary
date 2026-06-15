import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_PATH = resolve(
  __dirname,
  "../../fixtures/diary/2026-06-13-multi-tent-baseline.json",
);
const DOC_PATH = resolve(
  __dirname,
  "../../docs/diary/2026-06-13-multi-tent-baseline.md",
);

const ALLOWED_NON_LIVE_SOURCES = new Set([
  "csv",
  "manual",
  "demo",
  "stale",
  "invalid",
  "import",
]);

const DEVICE_COMMAND_PATTERNS = [
  /\bturn[_\s-]?on\b/i,
  /\bturn[_\s-]?off\b/i,
  /\bactuat/i,
  /\bdose\b/i,
  /\bpump[_\s-]?(on|off|start|stop)/i,
  /\bfan[_\s-]?(on|off|set)/i,
  /\bset[_\s-]?(temp|humidity|rh|light)/i,
  /\bexec(ute)?[_\s-]?(command|device)/i,
  /\bmqtt[_\s-]?publish\b/i,
  /\bhttp[_\s-]?post[_\s-]?device\b/i,
];

function loadFixture(): Record<string, unknown> {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  expect(parsed && typeof parsed === "object").toBe(true);
  return parsed as Record<string, unknown>;
}

function collectStrings(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (typeof node === "string") {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, acc);
    return acc;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectStrings(value, acc);
    }
  }
  return acc;
}

describe("diary baseline fixture safety", () => {
  const fixture = loadFixture();

  it("declares a non-live, allowed source label", () => {
    const source = fixture.source;
    expect(typeof source).toBe("string");
    expect(source).not.toBe("live");
    expect(ALLOWED_NON_LIVE_SOURCES.has(String(source))).toBe(true);
    expect(fixture.is_live).toBe(false);
  });

  it("never sets source=live or is_live=true on any nested node", () => {
    function walk(node: unknown) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      if ("source" in obj) expect(obj.source).not.toBe("live");
      if ("is_live" in obj) expect(obj.is_live).not.toBe(true);
      if ("data_label" in obj) expect(obj.data_label).not.toBe("live");
      Object.values(obj).forEach(walk);
    }
    walk(fixture);
  });

  it("keeps soil-probe zero/missing values flagged, never healthy", () => {
    const soil = fixture.soil_probes as Record<string, unknown> | undefined;
    expect(soil).toBeDefined();
    const status = String(soil?.status ?? "");
    expect(status).not.toMatch(/healthy|ok|nominal|good/i);
    expect(status).toMatch(/invalid|unknown|partial|blocked|stale/i);
    const notes = String(soil?.notes ?? "").toLowerCase();
    expect(notes).toContain("not");
    expect(notes.includes("healthy") || notes.includes("invalid")).toBe(true);
  });

  it("marks every suggested Action Queue item as approval-required and non-device-control", () => {
    const items = fixture.suggested_action_queue_items;
    expect(Array.isArray(items)).toBe(true);
    expect((items as unknown[]).length).toBeGreaterThan(0);
    for (const item of items as Array<Record<string, unknown>>) {
      expect(item.approval_required).toBe(true);
      expect(item.device_control).toBe(false);
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
    }
  });

  it("contains no executable device commands anywhere in the fixture", () => {
    const strings = collectStrings(fixture);
    for (const s of strings) {
      for (const pattern of DEVICE_COMMAND_PATTERNS) {
        expect(
          pattern.test(s),
          `device-command-like phrase matched ${pattern} in: ${s}`,
        ).toBe(false);
      }
    }
  });

  it("safety block asserts documentation-only posture", () => {
    const safety = fixture.safety as Record<string, unknown> | undefined;
    expect(safety).toBeDefined();
    expect(safety?.verdict).toBe("documentation_only");
    for (const key of [
      "no_db_writes",
      "no_schema_changes",
      "no_rls_changes",
      "no_edge_function_changes",
      "no_alerts_written",
      "no_action_queue_writes",
      "no_ai_calls",
      "no_device_control",
    ]) {
      expect(safety?.[key], `safety.${key} must be true`).toBe(true);
    }
    expect(safety?.data_label).toBe("csv");
  });

  it("markdown diary aligns with fixture date and title", () => {
    const md = readFileSync(DOC_PATH, "utf-8");
    expect(md).toContain("Multi-tent environment baseline");
    expect(md).toContain(String(fixture.logged_at));
    expect(md).toContain("fixtures/diary/2026-06-13-multi-tent-baseline.json");
    // Should not present imported history as live telemetry
    expect(md.toLowerCase()).toContain("not live telemetry");
  });

  it("window metadata is well-formed and deterministic", () => {
    const w = fixture.window as Record<string, unknown>;
    expect(typeof w.start).toBe("string");
    expect(typeof w.end).toBe("string");
    const start = Date.parse(String(w.start));
    const end = Date.parse(String(w.end));
    expect(Number.isFinite(start)).toBe(true);
    expect(Number.isFinite(end)).toBe(true);
    expect(end).toBeGreaterThan(start);
    expect(typeof w.reading_count).toBe("number");
    expect(w.reading_count).toBe(57);
  });
});
