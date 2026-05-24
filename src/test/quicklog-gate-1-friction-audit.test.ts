/**
 * QuickLog Gate 1 friction audit — static contract test.
 *
 * Pins the inventory of QuickLog / Daily Check entry points and blocks
 * regressions that would re-introduce friction, fake state, or scope creep
 * (calendar/reminder/notification/email/RPC/automation) before the visual
 * Relative Cultivation Timeline UI is built.
 *
 * Source-only inspection. No persistence, no RPC, no ingestion, no
 * Action Queue execution. Read-only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const AUDIT_DOC_PATH = resolve(ROOT, "docs/quicklog-gate-1-friction-audit.md");

const ENTRY_POINT_FILES = [
  "src/components/DashboardDailyGrowCheckPanel.tsx",
  "src/pages/Plants.tsx",
  "src/components/PlantDailyGrowCheckConsistencyCard.tsx",
  "src/pages/PlantDetail.tsx",
  "src/components/PlantDailyGrowCheckHistoryCard.tsx",
  "src/pages/DailyCheck.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/GrowRoomMode.tsx",
  "src/components/MobileNav.tsx",
  "src/components/DailyGrowCheckStatusCard.tsx",
] as const;

describe("QuickLog Gate 1 friction audit — doc", () => {
  it("audit doc exists", () => {
    expect(existsSync(AUDIT_DOC_PATH)).toBe(true);
  });

  const DOC = existsSync(AUDIT_DOC_PATH) ? read("docs/quicklog-gate-1-friction-audit.md") : "";

  it("inventories all known QuickLog entry-point files", () => {
    for (const f of ENTRY_POINT_FILES) {
      expect(DOC).toContain(f);
    }
  });

  it("documents the Gate 1 verdict for downstream timeline work", () => {
    expect(DOC).toMatch(/QuickLog Gate 1 is ready/);
    expect(DOC).toMatch(/Relative Cultivation Timeline/);
  });

  it("does not use forbidden marketing wording", () => {
    expect(DOC).not.toMatch(/\bperfect\b/i);
    expect(DOC).not.toMatch(/\bcompleted\b/i);
    expect(DOC).not.toMatch(/guaranteed healthy/i);
  });
});

describe("QuickLog Gate 1 friction audit — entry-point source contract", () => {
  it("every audited entry-point file is present", () => {
    for (const f of ENTRY_POINT_FILES) {
      expect(existsSync(resolve(ROOT, f))).toBe(true);
    }
  });

  it("scoped quick-action surfaces emit method=note and method=sensor handoffs", () => {
    for (const f of [
      "src/components/DashboardDailyGrowCheckPanel.tsx",
      "src/pages/Plants.tsx",
      "src/components/PlantDailyGrowCheckConsistencyCard.tsx",
    ]) {
      const src = read(f);
      // Either rendered as data-method attribute or built via the
      // shared `method: "note" | "sensor"` route helper.
      expect(src).toMatch(/data-method="note"|method:\s*"note"/);
      expect(src).toMatch(/data-method="sensor"|method:\s*"sensor"/);
      expect(src).toMatch(/plantId/);
    }
  });

  it("Plant Detail / Plants links include from= source context", () => {
    expect(read("src/pages/PlantDetail.tsx")).toMatch(/from=plant-detail/);
    expect(read("src/components/PlantDailyGrowCheckConsistencyCard.tsx")).toMatch(/from=plant-detail/);
    expect(read("src/components/PlantDailyGrowCheckHistoryCard.tsx")).toMatch(/from=plant-detail/);
    expect(read("src/pages/Plants.tsx")).toMatch(/from=plants/);
  });

  it("no quick-action surface fakes a local checked state", () => {
    for (const f of [
      "src/components/DashboardDailyGrowCheckPanel.tsx",
      "src/pages/Plants.tsx",
      "src/components/PlantDailyGrowCheckConsistencyCard.tsx",
    ]) {
      const src = read(f);
      // No optimistic "I checked it" client state.
      expect(src).not.toMatch(/setChecked\s*\(/);
      expect(src).not.toMatch(/setHasCheckedToday\s*\(/);
      expect(src).not.toMatch(/fake[\s_-]?check/i);
    }
  });

  it("no entry-point file introduces calendar / reminder / notification / email creep", () => {
    for (const f of ENTRY_POINT_FILES) {
      const src = read(f);
      expect(src).not.toMatch(/\bcalendar_events\b/);
      expect(src).not.toMatch(/\breminders?_table\b/);
      expect(src).not.toMatch(/\bnotifications_table\b/);
      expect(src).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    }
  });

  it("no entry-point file introduces RPC / service_role / device control", () => {
    for (const f of ENTRY_POINT_FILES) {
      const src = read(f);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
      );
    }
  });

  it("entry-point files do not use forbidden wording", () => {
    for (const f of ENTRY_POINT_FILES) {
      const src = read(f);
      expect(src).not.toMatch(/\bperfect\b/i);
      expect(src).not.toMatch(/guaranteed healthy/i);
    }
  });
});
