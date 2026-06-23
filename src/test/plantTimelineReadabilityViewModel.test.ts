import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPlantTimelinePrintSummary,
  buildPlantTimelineReadabilitySummary,
  PLANT_TIMELINE_PRINT_SAFETY_NOTE,
} from "@/lib/plantTimelineReadabilityViewModel";

const BANNED =
  /\b(healthy|ideal|fix|urgent|auto|execute|control|actuate|relay|complete\s+action|emergency|critical)\b/i;

describe("buildPlantTimelineReadabilitySummary", () => {
  it("counts visible entries, groups, and evidence sections", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: 12,
      visibleEntries: 7,
      filterKey: "all",
      filterLabel: "All",
      groupCount: 3,
      totalSections: 7,
      sectionsWithEvidence: 4,
    });
    expect(s.isFiltered).toBe(false);
    expect(s.visibleEntries).toBe(7);
    expect(s.groupCount).toBe(3);
    expect(s.sectionsWithEvidence).toBe(4);
    expect(s.line).toContain("7 visible entries");
    expect(s.line).toContain("3 groups");
    expect(s.line).toContain("4/7 sections with evidence");
  });

  it("treats unknown/null filter key as not filtered ('all')", () => {
    const a = buildPlantTimelineReadabilitySummary({
      totalEntries: 1,
      visibleEntries: 1,
      filterKey: null,
      groupCount: 1,
    });
    expect(a.isFiltered).toBe(false);
    expect(a.filterCopy).toMatch(/No filter active/);
  });

  it("emits clearly-filtered copy with 'current view' language when filtered", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: 12,
      visibleEntries: 3,
      filterKey: "watering",
      filterLabel: "Watering",
      groupCount: 2,
      totalSections: 7,
      sectionsWithEvidence: 1,
    });
    expect(s.isFiltered).toBe(true);
    expect(s.filterCopy).toMatch(/Filter active: Watering/);
    expect(s.filterCopy).toMatch(/current view/);
    expect(s.filterCopy).not.toMatch(/all time/i);
  });

  it("zero-entry state is safe and uses singular 'entry'", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: 0,
      visibleEntries: 0,
      filterKey: "all",
      groupCount: 0,
    });
    expect(s.visibleEntries).toBe(0);
    expect(s.line).toContain("0 visible entries");
    expect(s.line).toContain("0 groups");
  });

  it("singular labels for 1 visible entry / 1 group", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: 1,
      visibleEntries: 1,
      filterKey: "all",
      groupCount: 1,
    });
    expect(s.line).toContain("1 visible entry");
    expect(s.line).toContain("1 group");
  });

  it("is null-safe on non-finite / negative inputs", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: -5,
      visibleEntries: Number.NaN as unknown as number,
      filterKey: "all",
      groupCount: Number.POSITIVE_INFINITY as unknown as number,
    });
    expect(s.visibleEntries).toBe(0);
    expect(s.totalEntries).toBe(0);
    expect(s.groupCount).toBe(0);
  });

  it("omits evidence-section part when no category sections are passed", () => {
    const s = buildPlantTimelineReadabilitySummary({
      totalEntries: 1,
      visibleEntries: 1,
      filterKey: "all",
      groupCount: 1,
    });
    expect(s.parts.some((p) => p.key === "evidence-sections")).toBe(false);
  });

  it("never uses banned diagnostic/aggressive/actionable wording", () => {
    const filtered = buildPlantTimelineReadabilitySummary({
      totalEntries: 5,
      visibleEntries: 2,
      filterKey: "feeding",
      filterLabel: "Feeding",
      groupCount: 1,
      totalSections: 7,
      sectionsWithEvidence: 1,
    });
    expect(filtered.line).not.toMatch(BANNED);
    expect(filtered.filterCopy).not.toMatch(BANNED);
  });
});

describe("buildPlantTimelinePrintSummary", () => {
  it("includes title, filter copy, visible count, groups, evidence, and safety note", () => {
    const p = buildPlantTimelinePrintSummary({
      totalEntries: 4,
      visibleEntries: 4,
      filterKey: "all",
      groupCount: 2,
      totalSections: 7,
      sectionsWithEvidence: 3,
      plantName: "Test Plant",
      tentName: "Tent A",
      growName: "Run 1",
    });
    const keys = p.lines.map((l) => l.key);
    expect(keys).toContain("title");
    expect(keys).toContain("context");
    expect(keys).toContain("filter");
    expect(keys).toContain("visible");
    expect(keys).toContain("groups");
    expect(keys).toContain("evidence-sections");
    expect(keys[keys.length - 1]).toBe("safety");
    expect(p.safetyNote).toBe(PLANT_TIMELINE_PRINT_SAFETY_NOTE);
    expect(p.safetyNote).toMatch(/does not automate decisions/);
  });

  it("omits context line when no display names are passed", () => {
    const p = buildPlantTimelinePrintSummary({
      totalEntries: 1,
      visibleEntries: 1,
      filterKey: "all",
      groupCount: 1,
    });
    expect(p.lines.some((l) => l.key === "context")).toBe(false);
  });

  it("strips UUID-like substrings and private-id tokens from display names", () => {
    const p = buildPlantTimelinePrintSummary({
      totalEntries: 1,
      visibleEntries: 1,
      filterKey: "all",
      groupCount: 1,
      plantName:
        "Real Name 11111111-2222-3333-4444-555555555555 user_id raw_payload",
      tentName: null,
      growName: null,
    });
    const ctx = p.lines.find((l) => l.key === "context");
    expect(ctx).toBeDefined();
    expect(ctx!.label).toMatch(/Real Name/);
    expect(ctx!.label).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(ctx!.label).not.toMatch(/user_id|raw_payload/i);
  });

  it("print output never contains raw private-ID/payload-like tokens", () => {
    const p = buildPlantTimelinePrintSummary({
      totalEntries: 9,
      visibleEntries: 5,
      filterKey: "training",
      filterLabel: "Training",
      groupCount: 2,
      totalSections: 7,
      sectionsWithEvidence: 2,
      plantName: "Plant",
    });
    const joined = p.lines.map((l) => l.label).join("\n");
    expect(joined).not.toMatch(
      /(user_id|tent_id|grow_id|plant_id|raw_payload|bridge_token|service_role|access_token)/i,
    );
    expect(joined).not.toMatch(BANNED);
  });
});

describe("static safety — plantTimelineReadabilityViewModel.ts", () => {
  const source = readFileSync(
    "src/lib/plantTimelineReadabilityViewModel.ts",
    "utf8",
  );

  it("contains no Supabase, AI, fetch, automation, write, or storage tokens", () => {
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/openai|anthropic|lovable-ai|gemini/i);
    expect(source).not.toMatch(/\bmodel\s*:/);
    expect(source).not.toMatch(/action_queue|alerts\b|service_role|bridge_token/);
    expect(source).not.toMatch(/actuator|autopilot|device_command|mqtt/);
    expect(source).not.toMatch(/localStorage|window\./);
  });

  it("never imports React, components, or hooks", () => {
    expect(source).not.toMatch(/from\s+["']react["']/);
    expect(source).not.toMatch(/from\s+["']@\/components/);
    expect(source).not.toMatch(/from\s+["']@\/hooks/);
  });
});
