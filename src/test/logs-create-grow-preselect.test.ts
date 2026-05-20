/**
 * Static tests verifying /logs?growId=... preselects the grow context
 * for new log creation by syncing the URL growId into the grows store
 * (which QuickLog reads as its default).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const QUICKLOG = readFileSync(resolve(ROOT, "src/components/QuickLog.tsx"), "utf8");
const EDIT = readFileSync(resolve(ROOT, "src/components/EntryEditDialog.tsx"), "utf8");

describe("Logs — preselect grow on create from /logs?growId=…", () => {
  it("Timeline pulls setActiveGrowId from the grows store", () => {
    expect(TIMELINE).toMatch(/setActiveGrowId\s*\}\s*=\s*useGrows\(\)/);
  });

  it("syncs URL growId into the active grow store when valid", () => {
    expect(TIMELINE).toMatch(/grows\.some\(\s*\(g\)\s*=>\s*g\.id\s*===\s*urlGrowId\s*\)/);
    expect(TIMELINE).toMatch(/setActiveGrowId\(urlGrowId\)/);
  });

  it("falls back safely when growId is absent or unavailable (no setActive call)", () => {
    // guarded by both `if (!urlGrowId) return;` and the grows.some() membership check
    expect(TIMELINE).toMatch(/if\s*\(!urlGrowId\)\s*return;/);
  });

  it("QuickLog defaults its grow dropdown to the active grow from the store", () => {
    expect(QUICKLOG).toMatch(/useGrows\(\)/);
    expect(QUICKLOG).toMatch(/value=\{activeGrowId\s*\?\?\s*""\}/);
  });

  it("QuickLog enumerates only RLS-loaded grows from the store", () => {
    expect(QUICKLOG).toMatch(/grows\.map\(\(g\)\s*=>\s*<SelectItem/);
  });

  it("Edit dialog does not consume URL growId / activeGrow for grow assignment", () => {
    expect(EDIT).not.toMatch(/grow_id/);
    expect(EDIT).not.toMatch(/useGrows|activeGrow/);
    expect(EDIT).not.toMatch(/searchParams|growId/);
  });

  it("does not introduce ai-coach, device-control, or service_role surface", () => {
    expect(TIMELINE).not.toMatch(/ai-coach|ai_coach/);
    expect(TIMELINE).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});
