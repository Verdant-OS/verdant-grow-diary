/**
 * Static safety scan for the Ingest Inspector surface.
 *
 * The inspector is strictly read-only. No writes, no automation,
 * no device control, no alert/Action Queue references, no
 * service_role, no functions.invoke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const FILES = [
  "src/pages/IngestInspector.tsx",
  "src/hooks/useIngestInspectorReadings.ts",
  "src/lib/ingestInspectorRules.ts",
];

describe("ingest inspector — static safety", () => {
  for (const path of FILES) {
    const src = read(path);

    it(`${path}: no DB writes`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${path}: no edge function invocation`, () => {
      expect(src).not.toMatch(/functions\.invoke/);
    });

    it(`${path}: no service_role or secret leakage`, () => {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    });

    it(`${path}: no alerts / action_queue / automation / device control writes`, () => {
      expect(src).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
      expect(src).not.toMatch(/from\(\s*["']action_queue["']\s*\)/);
      expect(src).not.toMatch(/turnOn|turnOff|setpoint|deviceCommand/i);
    });
  }

  it("uses observation time for the recent window, with ts only as a legacy fallback", () => {
    const hook = read("src/hooks/useIngestInspectorReadings.ts");
    expect(hook).toContain(
      "captured_at.gte.${sinceIso},and(captured_at.is.null,ts.gte.${sinceIso})",
    );
    expect(hook).toContain('.order("captured_at", { ascending: false, nullsFirst: false })');
    expect(hook).toContain('.order("ts", { ascending: false })');
  });

  it("labels the surface as recent sensor observations, not recent webhook activity", () => {
    const page = read("src/pages/IngestInspector.tsx");
    expect(page).toContain("Recent sensor observations");
    expect(page).toContain("No recent sensor observations.");
    expect(page).not.toContain("recent sensor webhook readings");
  });

  it("App.tsx wires the /ingest-inspector route", () => {
    const app = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
    expect(app).toMatch(/\/ingest-inspector/);
    expect(app).toMatch(/IngestInspector/);
  });
});
