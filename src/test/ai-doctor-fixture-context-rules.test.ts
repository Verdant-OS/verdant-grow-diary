import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compileDoctorContextFromDiaryFixture,
  collectContextStrings,
  __testing,
  type DiaryFixture,
} from "@/lib/aiDoctorFixtureContextRules";

const FIXTURE_PATH = resolve(
  __dirname,
  "../../fixtures/diary/2026-06-13-multi-tent-baseline.json",
);

function loadFixture(): DiaryFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as DiaryFixture;
}

describe("aiDoctorFixtureContextRules", () => {
  const fixture = loadFixture();
  const ctx = compileDoctorContextFromDiaryFixture(fixture);

  it("includes diary id, logged_at, and window metadata", () => {
    expect(ctx.diary.id).toBe(fixture.id);
    expect(ctx.diary.logged_at).toBe(fixture.logged_at);
    expect(ctx.diary.window.reading_count).toBe(57);
    expect(Date.parse(ctx.diary.window.start)).toBeLessThan(
      Date.parse(ctx.diary.window.end),
    );
  });

  it("preserves provenance and emits a non-live source warning", () => {
    expect(ctx.provenance.source).toBe("csv");
    expect(ctx.provenance.is_live).toBe(false);
    expect(ctx.provenance.source_warning.toLowerCase()).toContain(
      "not live telemetry",
    );
    expect(ctx.provenance.source_warning).toContain("CSV");
  });

  it("buckets invalid/unknown soil-probe values away from usable readings", () => {
    expect(ctx.soil_probes).not.toBeNull();
    expect(ctx.soil_probes!.flagged).toBe(true);
    expect(ctx.soil_probes!.bucket).toBe("invalid_or_unknown");
    expect(ctx.soil_probes!.status.toLowerCase()).not.toMatch(
      /healthy|nominal|good/,
    );
  });

  it("compiles tent context deterministically and keeps numeric averages intact", () => {
    const tents = ctx.tents.map((t) => t.tent);
    expect(tents).toEqual([...tents].sort());
    expect(tents).toContain("flower");
    expect(tents).toContain("seedling");
    expect(tents).toContain("vegetation");
    const flower = ctx.tents.find((t) => t.tent === "flower")!;
    expect(flower.averages.vpd_kpa).toBeCloseTo(1.61, 2);
    expect(flower.recent_peak?.vpd_kpa).toBeCloseTo(2.09, 2);
  });

  it("emits suggested actions as approval-required, device-control-off, context-only", () => {
    expect(ctx.suggested_actions_context_only.length).toBeGreaterThan(0);
    for (const a of ctx.suggested_actions_context_only) {
      expect(a.approval_required).toBe(true);
      expect(a.device_control).toBe(false);
      expect(a.context_only).toBe(true);
    }
  });

  it("compiled context contains no device-command-shaped output", () => {
    const strings = collectContextStrings(ctx);
    for (const s of strings) {
      expect(
        __testing.containsDeviceCommand(s),
        `device-command-shaped phrase in compiled context: ${s}`,
      ).toBe(false);
    }
  });

  it("propagates missing-information and do-not guidance from the fixture", () => {
    expect(ctx.missing_information.length).toBeGreaterThan(0);
    expect(ctx.do_not.length).toBeGreaterThan(0);
    expect(
      ctx.do_not.some((x) => /nutrient|irrigation|defoliation|equipment/i.test(x)),
    ).toBe(true);
  });

  it("repeated compilation is deterministic (stable JSON)", () => {
    const a = compileDoctorContextFromDiaryFixture(fixture);
    const b = compileDoctorContextFromDiaryFixture(fixture);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuses unknown source labels (sensor-truth guard)", () => {
    const bad = { ...fixture, source: "totally-made-up" } as DiaryFixture;
    expect(() => compileDoctorContextFromDiaryFixture(bad)).toThrow(
      /unknown source/i,
    );
  });

  it("refuses imported fixtures flagged is_live=true", () => {
    const bad = { ...fixture, is_live: true } as DiaryFixture;
    expect(() => compileDoctorContextFromDiaryFixture(bad)).toThrow(
      /is_live/i,
    );
  });

  it("drops suggested items that fail safety gating (approval / device-control / device-command)", () => {
    const tampered: DiaryFixture = {
      ...fixture,
      suggested_action_queue_items: [
        {
          id: "auto-fan-on",
          title: "Turn on fan immediately",
          approval_required: true,
          device_control: false,
          checklist: ["Turn on intake fan"],
        },
        {
          id: "missing-approval",
          title: "Check humidity",
          approval_required: false as unknown as true,
          device_control: false,
          checklist: ["Look at sensor"],
        },
        {
          id: "device-control-on",
          title: "Inspect tent",
          approval_required: true,
          device_control: true as unknown as false,
          checklist: ["Inspect physically"],
        },
        {
          id: "ok-item",
          title: "Photo seedlings",
          approval_required: true,
          device_control: false,
          checklist: ["Capture canopy photos"],
        },
      ],
    };
    const out = compileDoctorContextFromDiaryFixture(tampered);
    const ids = out.suggested_actions_context_only.map((a) => a.id);
    expect(ids).toEqual(["ok-item"]);
  });

  it("output stays compact (small enough for prompt use)", () => {
    const size = JSON.stringify(ctx).length;
    expect(size).toBeLessThan(4000);
  });

  it("is null-safe against missing optional sections", () => {
    const minimal: DiaryFixture = {
      id: "x",
      logged_at: "2026-06-13",
      source: "csv",
      is_live: false,
      window: { start: "2026-06-04T00:00:00Z", end: "2026-06-13T00:00:00Z", reading_count: 1 },
      tents: {},
    };
    const out = compileDoctorContextFromDiaryFixture(minimal);
    expect(out.tents).toEqual([]);
    expect(out.soil_probes).toBeNull();
    expect(out.missing_information).toEqual([]);
    expect(out.do_not).toEqual([]);
    expect(out.suggested_actions_context_only).toEqual([]);
    expect(out.follow_ups).toEqual({ in_24_hours: null, in_3_days: null });
  });
});
