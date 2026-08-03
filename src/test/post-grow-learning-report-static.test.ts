import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAllRouteModuleSources } from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APP = readAllRouteModuleSources();
const PAGE = read("src/pages/PostGrowLearningReport.tsx");
const CARDS = read("src/components/PostGrowLearningReportCards.tsx");
const HOOK = read("src/hooks/usePostGrowLearningReportData.ts");
const GROW_DETAIL = read("src/pages/GrowDetail.tsx");
const RULES = read("src/lib/postGrowLearningReportRules.ts");

describe("Post-Grow Learning Report route wiring", () => {
  it("mounts the on-demand report route", () => {
    expect(APP).toContain("PostGrowLearningReport");
    expect(APP).toContain("/reports/post-grow/:growId");
  });

  it("links only completed/archive-stage grows from GrowDetail", () => {
    expect(GROW_DETAIL).toContain("showPostGrowReport");
    expect(GROW_DETAIL).toContain("postGrowLearningReportPath");
    expect(GROW_DETAIL).toMatch(/grow\.is_archived\s*\|\|\s*grow\.stage === "harvest"/);
    expect(GROW_DETAIL).toContain('grow.stage === "drying"');
  });
});

describe("Post-Grow Learning Report sections", () => {
  it("renders the required Phase 1 sections", () => {
    for (const testId of [
      "post-grow-executive-summary",
      "post-grow-environment-stability",
      "post-grow-post-harvest",
      "post-grow-action-effectiveness",
      "post-grow-lessons",
      "post-grow-photo-grid",
      "post-grow-completeness-badge",
      "post-grow-export-actions",
    ]) {
      expect(CARDS + PAGE).toContain(testId);
    }
  });

  it("keeps mobile-first responsive layout classes", () => {
    expect(PAGE).toContain("grid grid-cols-1");
    expect(CARDS).toContain("grid grid-cols-1 sm:grid-cols-3");
    expect(CARDS).toContain("grid grid-cols-2 sm:grid-cols-3");
    expect(PAGE).toContain(
      "flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between",
    );
    expect(PAGE).toContain('className="mb-0 min-w-0 flex-1"');
    expect(PAGE).not.toContain("sm:flex-row sm:items-start sm:justify-between");
    expect(CARDS).toContain(
      "flex w-full min-w-0 flex-col items-stretch gap-1 xl:w-auto xl:items-end",
    );
  });
});

describe("Post-Grow Learning Report Action Queue handoff", () => {
  it("offers a Review action for a newly created approval-required lesson", () => {
    expect(PAGE).toContain("actionDetailPath");
    expect(PAGE).toContain('label: "Review"');
    expect(PAGE).toMatch(/onClick:\s*\(\)\s*=>\s*navigate\(actionDetailPath\(actionId\)\)/);
  });
});

describe("Post-Grow Learning Report safety", () => {
  it("does not add schema, RLS, Edge, RPC, AI, or device-control surfaces", () => {
    const all = [APP, PAGE, CARDS, HOOK, RULES, GROW_DETAIL].join("\n");
    const targetDeviceAssignments = Array.from(
      all.matchAll(/target_device:\s*([^,;\n}]+)/g),
      (match) => match[1].trim(),
    );
    // "create/alter policy" targets RLS SQL specifically — the bare token
    // "policy" now legitimately appears in file routes via the public legal
    // routes (/privacy-policy alias, PrivacyPolicy/RefundPolicy pages).
    expect(all).not.toMatch(
      /create table|alter table|create policy|alter policy|drop policy|service_role|functions\.invoke|ai_doctor|openai/i,
    );
    expect(targetDeviceAssignments.length).toBeGreaterThan(0);
    expect(targetDeviceAssignments.every((value) => value.startsWith("null"))).toBe(true);
    expect(all).not.toMatch(/relay\.|actuator|dispatchCommand|device_control/i);
  });

  it("creates apply-lesson actions as pending approval only", () => {
    expect(RULES).toContain('status: "pending_approval"');
    expect(RULES).toContain('source: "manual"');
    expect(RULES).toContain("Grower approval required");
  });

  it("keeps report data adapter narrow and uses raw lineage only for classification", () => {
    expect(HOOK).toContain('from("grows")');
    expect(HOOK).toContain('from("diary_entries")');
    expect(HOOK).toContain('from("sensor_readings")');
    expect(HOOK).toContain('from("action_queue")');
    expect(HOOK).toContain('.select("id,metric,value,ts,captured_at,source,raw_payload")');
    expect(HOOK).toContain('.order("captured_at", { ascending: true, nullsFirst: false })');
    expect(HOOK).toContain('.order("ts", { ascending: true })');
    expect(HOOK).toContain('.order("id", { ascending: true })');
    expect(RULES).toContain("withoutDiagnosticSensorRows");
    expect(PAGE + CARDS).not.toMatch(/raw_payload|bridge_tokens/i);
    expect(HOOK).not.toMatch(/bridge_tokens/i);
  });
});
