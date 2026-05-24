/**
 * Relative Cultivation Timeline — first read-only projection.
 *
 * Audit + render coverage for:
 *   - src/lib/relativeTimelineProjectionRules.ts
 *   - src/components/PlantRelativeTimelineSection.tsx
 *   - src/pages/PlantDetail.tsx (mount)
 *
 * Strictly read-only. No new schema, persistence, RPC, sensor ingestion,
 * alerts, action_queue execution, automation, device control, or
 * service_role. No reminders / calendar_events / notifications / email.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";

import {
  buildRelativeTimelineProjection,
  groupRelativeTimelineByStage,
  UNSTAGED_GROUP_KEY,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const RULES = read("src/lib/relativeTimelineProjectionRules.ts");
const COMPONENT = read("src/components/PlantRelativeTimelineSection.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLANT = "plant-1";
const OTHER_PLANT = "plant-2";
const PLANT_STARTED = "2026-04-01T00:00:00Z";
const STAGE_STARTED = "2026-04-15T00:00:00Z";

interface RawEntry {
  id: string;
  plant_id: string | null;
  entry_at: string | null;
  entry_type?: string;
  note?: string;
  photo_url?: string | null;
  details?: Record<string, unknown> | null;
}

function entry(over: Partial<RawEntry> & { id: string }): RawEntry {
  return {
    plant_id: PLANT,
    entry_at: "2026-04-10T08:00:00Z",
    entry_type: "note",
    note: "Logged a routine watering",
    photo_url: null,
    details: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Static guardrails
// ---------------------------------------------------------------------------

describe("relative timeline projection — static guardrails", () => {
  it("rules module is pure (no Supabase / RPC / writes)", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.rpc\(/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });

  it("does not introduce calendar_events / notifications / reminders / email", () => {
    for (const src of [RULES, COMPONENT]) {
      expect(src).not.toMatch(/calendar_events/);
      expect(src).not.toMatch(/\bnotifications\b/);
      expect(src).not.toMatch(/\breminders\b/);
      expect(src).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    }
  });

  it("does not import drag-and-drop libraries", () => {
    for (const src of [RULES, COMPONENT]) {
      expect(src).not.toMatch(
        /react-dnd|dnd-kit|fullcalendar|react-big-calendar|react-beautiful-dnd/i,
      );
    }
  });

  it("does not expose create / edit / delete / drag controls", () => {
    // No mutating button labels and no drag attrs in the timeline component.
    expect(COMPONENT).not.toMatch(/\bdraggable\b/);
    expect(COMPONENT).not.toMatch(/onDragStart|onDrop/);
    expect(COMPONENT).not.toMatch(/>\s*(Create|Add|Edit|Delete|Move)\s+(event|entry)/i);
  });

  it("does not contain automation / device control / Action Queue execution", () => {
    for (const src of [RULES, COMPONENT]) {
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
      );
    }
  });

  it("does not use forbidden marketing wording", () => {
    for (const src of [RULES, COMPONENT]) {
      expect(src.toLowerCase()).not.toContain("perfect");
      expect(src.toLowerCase()).not.toContain("completed");
      expect(src.toLowerCase()).not.toContain("guaranteed healthy");
    }
  });

  it("PlantDetail mounts the relative timeline section", () => {
    expect(PLANT_DETAIL).toContain("PlantRelativeTimelineSection");
    expect(PLANT_DETAIL).toMatch(
      /from\s+["']@\/components\/PlantRelativeTimelineSection["']/,
    );
  });

  it("component delegates projection logic to the pure rules module", () => {
    expect(COMPONENT).toContain("buildRelativeTimelineProjection");
  });
});

// ---------------------------------------------------------------------------
// Pure projection rules
// ---------------------------------------------------------------------------

describe("buildRelativeTimelineProjection — pure rules", () => {
  it("returns [] when plantId is missing", () => {
    expect(
      buildRelativeTimelineProjection({
        rawEntries: [entry({ id: "a" })],
        plantId: null,
        plantStartedAt: PLANT_STARTED,
      }),
    ).toEqual([]);
  });

  it("returns [] when there are no entries (no dummy events invented)", () => {
    expect(
      buildRelativeTimelineProjection({
        rawEntries: [],
        plantId: PLANT,
        plantStartedAt: PLANT_STARTED,
      }),
    ).toEqual([]);
    expect(
      buildRelativeTimelineProjection({
        rawEntries: null,
        plantId: PLANT,
        plantStartedAt: PLANT_STARTED,
      }),
    ).toEqual([]);
  });

  it("builds items from existing diary entries and includes plant day", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "e1", entry_at: "2026-04-05T08:00:00Z" }),
        entry({ id: "e2", entry_at: "2026-04-10T08:00:00Z" }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(items.length).toBe(2);
    expect(items[0].plantDay).toBe(4);
    expect(items[1].plantDay).toBe(9);
  });

  it("includes stage day when stageStartedAt is provided, otherwise null", () => {
    const withStage = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e1", entry_at: "2026-04-20T00:00:00Z" })],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
      stageStartedAt: STAGE_STARTED,
    });
    expect(withStage[0].stageDay).toBe(5);

    const withoutStage = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e1", entry_at: "2026-04-20T00:00:00Z" })],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(withoutStage[0].stageDay).toBeNull();
  });

  it("filters out entries that belong to other plants", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "mine", plant_id: PLANT }),
        entry({ id: "other", plant_id: OTHER_PLANT }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(items.map((i) => i.id)).toEqual(["mine"]);
  });

  it("handles invalid/missing dates safely without throwing", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "ok", entry_at: "2026-04-10T08:00:00Z" }),
        entry({ id: "broken", entry_at: "not-a-date" }),
        entry({ id: "null", entry_at: null }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    // None thrown; broken/null still render but with null plantDay & sort last.
    expect(items.length).toBe(3);
    const ok = items.find((i) => i.id === "ok")!;
    expect(ok.plantDay).toBe(9);
    const broken = items.find((i) => i.id === "broken")!;
    expect(broken.plantDay).toBeNull();
    // Items missing a parseable date sort after valid ones.
    expect(items[0].id).toBe("ok");
  });

  it("returns null plantDay when plantStartedAt is missing/invalid", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e1" })],
      plantId: PLANT,
      plantStartedAt: null,
    });
    expect(items[0].plantDay).toBeNull();
  });

  it("sorts deterministically: ascending by date, then eventType, then id", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "b", entry_at: "2026-04-10T08:00:00Z", entry_type: "note" }),
        entry({ id: "a", entry_at: "2026-04-10T08:00:00Z", entry_type: "note" }),
        entry({ id: "z", entry_at: "2026-04-05T08:00:00Z", entry_type: "watering" }),
        entry({ id: "c", entry_at: "2026-04-10T08:00:00Z", entry_type: "feeding" }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(items.map((i) => i.id)).toEqual(["z", "c", "a", "b"]);

    // Stable across permutations.
    const reversed = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "c", entry_at: "2026-04-10T08:00:00Z", entry_type: "feeding" }),
        entry({ id: "z", entry_at: "2026-04-05T08:00:00Z", entry_type: "watering" }),
        entry({ id: "a", entry_at: "2026-04-10T08:00:00Z", entry_type: "note" }),
        entry({ id: "b", entry_at: "2026-04-10T08:00:00Z", entry_type: "note" }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(reversed.map((i) => i.id)).toEqual(["z", "c", "a", "b"]);
  });

  it("classifies source: photo > sensor > note (without inventing data)", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "n", entry_at: "2026-04-02T00:00:00Z" }),
        entry({
          id: "s",
          entry_at: "2026-04-03T00:00:00Z",
          details: { sensorSnapshot: { at: "2026-04-03T00:00:00Z", temp: 24 } },
        }),
        entry({
          id: "p",
          entry_at: "2026-04-04T00:00:00Z",
          photo_url: "https://example.com/x.jpg",
        }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    const bySrc = Object.fromEntries(items.map((i) => [i.id, i.source]));
    expect(bySrc.n).toBe("note");
    expect(bySrc.s).toBe("sensor");
    expect(bySrc.p).toBe("photo");
  });

  it("attaches the relative stage preset (color token from rules) for known stages", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e" })],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
      currentStage: "veg",
    });
    expect(items[0].stagePreset?.key).toBe("vegetation");
    expect(items[0].stagePreset?.colorToken).toBe("stage-vegetation");
  });

  it("maps legacy 'flower' and unknown stages safely", () => {
    const f = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e" })],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
      currentStage: "flower",
    });
    expect(f[0].stagePreset?.key).toBe("flower");

    const unknown = buildRelativeTimelineProjection({
      rawEntries: [entry({ id: "e" })],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
      currentStage: "harvest",
    });
    expect(unknown[0].stagePreset).toBeNull();
  });

  it("never invents events: count out == valid scoped entries in", () => {
    const items: RelativeTimelineItem[] = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "e1" }),
        entry({ id: "e2" }),
        entry({ id: "other", plant_id: OTHER_PLANT }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
    });
    expect(items.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Stage grouping
// ---------------------------------------------------------------------------

describe("groupRelativeTimelineByStage — pure rules", () => {
  function preset(over: { key: string; label: string; colorToken: string; sortOrder: number }) {
    return {
      key: over.key,
      label: over.label,
      description: "",
      colorToken: over.colorToken,
      colorDirection: "",
      suggestedDurationDays: null,
      sortOrder: over.sortOrder,
    } as any;
  }
  function item(
    over: Partial<RelativeTimelineItem> & { id: string },
  ): RelativeTimelineItem {
    return {
      id: over.id,
      eventType: "note",
      title: "t",
      occurredAt: "2026-04-05T00:00:00Z",
      occurredAtLabel: "2026-04-05T00:00:00Z",
      plantDay: 0,
      stageDay: null,
      source: "note",
      stagePreset: null,
      plantId: PLANT,
      tentId: null,
      ...over,
    };
  }
  const VEG = preset({ key: "vegetation", label: "Vegetation", colorToken: "stage-vegetation", sortOrder: 30 });
  const FLOWER = preset({ key: "flower", label: "Flower", colorToken: "stage-flower", sortOrder: 40 });
  const SEEDLING = preset({ key: "seedling", label: "Seedling", colorToken: "stage-seedling", sortOrder: 10 });

  it("returns [] for empty input", () => {
    expect(groupRelativeTimelineByStage([])).toEqual([]);
  });

  it("groups items by stage preset and exposes the preset color token + count", () => {
    const groups = groupRelativeTimelineByStage([
      item({ id: "v1", stagePreset: VEG }),
      item({ id: "v2", stagePreset: VEG }),
      item({ id: "f1", stagePreset: FLOWER }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["vegetation", "flower"]);
    expect(groups[0].count).toBe(2);
    expect(groups[0].colorToken).toBe("stage-vegetation");
    expect(groups[1].count).toBe(1);
    expect(groups[1].colorToken).toBe("stage-flower");
  });

  it("places items with no resolved stage into the Unstaged group (sorted last)", () => {
    const groups = groupRelativeTimelineByStage([
      item({ id: "a", stagePreset: null }),
      item({ id: "b", stagePreset: SEEDLING }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["seedling", UNSTAGED_GROUP_KEY]);
    expect(groups[1].label).toBe("Unstaged");
    expect(groups[1].colorToken).toBeNull();
    expect(groups[1].count).toBe(1);
  });

  it("does not create empty stage groups by default", () => {
    const groups = groupRelativeTimelineByStage([
      item({ id: "a", stagePreset: FLOWER }),
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("flower");
  });

  it("preserves input order of items inside each group (deterministic)", () => {
    const groups = groupRelativeTimelineByStage([
      item({ id: "x", stagePreset: VEG }),
      item({ id: "y", stagePreset: VEG }),
      item({ id: "z", stagePreset: VEG }),
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["x", "y", "z"]);
  });

  it("orders groups by stage preset sortOrder ascending", () => {
    const groups = groupRelativeTimelineByStage([
      item({ id: "1", stagePreset: FLOWER }),
      item({ id: "2", stagePreset: SEEDLING }),
      item({ id: "3", stagePreset: VEG }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["seedling", "vegetation", "flower"]);
  });

  it("integrates with projection: per-entry stage wins, otherwise plant currentStage applies", () => {
    const items = buildRelativeTimelineProjection({
      rawEntries: [
        entry({ id: "perEntry", entry_at: "2026-04-05T00:00:00Z", plant_id: PLANT, ...({ stage: "flower" } as any) }),
        entry({ id: "fallback", entry_at: "2026-04-06T00:00:00Z" }),
      ],
      plantId: PLANT,
      plantStartedAt: PLANT_STARTED,
      currentStage: "veg",
    });
    const groups = groupRelativeTimelineByStage(items);
    expect(groups.map((g) => g.key)).toEqual(["vegetation", "flower"]);
    expect(groups[0].items[0].id).toBe("fallback");
    expect(groups[1].items[0].id).toBe("perEntry");
  });
});



vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: vi.fn(),
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
}));

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

const mockUse = usePlantRecentActivity as unknown as ReturnType<typeof vi.fn>;

describe("PlantRelativeTimelineSection — render", () => {
  it("renders the helper line about plant days", () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    expect(screen.getByTestId("relative-timeline-helper")).toHaveTextContent(
      /plant days/i,
    );
  });

  it("renders empty state when no events exist", () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    expect(screen.getByTestId("relative-timeline-empty")).toHaveTextContent(
      /first quick log, photo, or sensor snapshot/i,
    );
  });

  it("renders one row per scoped entry with plant day and source badge", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "e1", entry_at: "2026-04-05T08:00:00Z" }),
        entry({
          id: "e2",
          entry_at: "2026-04-10T08:00:00Z",
          photo_url: "https://x/y.jpg",
        }),
      ],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        currentStage="vegetation"
      />,
    );
    const items = screen.getAllByTestId("relative-timeline-item");
    expect(items.length).toBe(2);
    expect(items[0].getAttribute("data-plant-day")).toBe("4");
    expect(items[1].getAttribute("data-source")).toBe("photo");
    // Stage badge uses the rules color token.
    const stageBadges = screen.getAllByTestId("relative-timeline-stage-badge");
    expect(stageBadges[0].getAttribute("data-stage-color-token")).toBe(
      "stage-vegetation",
    );
  });

  it("does not render any create/edit/delete/drag controls", () => {
    mockUse.mockReturnValue({
      data: [entry({ id: "e1" })],
      isLoading: false,
    });
    const { container } = render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    // Filter chips are allowed (read-only radios). No mutating labels.
    const buttons = Array.from(container.querySelectorAll("button"));
    for (const b of buttons) {
      expect(b.getAttribute("role")).toBe("radio");
      expect(b.textContent ?? "").not.toMatch(/create|add|edit|delete|move|drag/i);
    }
    expect(container.querySelectorAll("[draggable]").length).toBe(0);
    expect(container.querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("renders grouped stage headers with badge, count, and item rows", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "fallback", entry_at: "2026-04-05T00:00:00Z" }),
        entry({
          id: "perEntry",
          entry_at: "2026-04-06T00:00:00Z",
          ...({ stage: "flower" } as any),
        }),
      ],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        currentStage="vegetation"
      />,
    );
    const groups = screen.getAllByTestId("relative-timeline-stage-group");
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute("data-stage-key")).toBe("vegetation");
    expect(groups[0].getAttribute("data-stage-color-token")).toBe("stage-vegetation");
    expect(groups[0].getAttribute("data-count")).toBe("1");
    expect(groups[1].getAttribute("data-stage-key")).toBe("flower");
    expect(groups[1].getAttribute("data-stage-color-token")).toBe("stage-flower");
    const counts = screen.getAllByTestId("relative-timeline-group-count");
    expect(counts[0]).toHaveTextContent(/1 event/);
    const groupBadges = screen.getAllByTestId("relative-timeline-group-stage-badge");
    expect(groupBadges[0]).toHaveTextContent("Vegetation");
    expect(groupBadges[1]).toHaveTextContent("Flower");
    // Item rows still render inside groups.
    expect(screen.getAllByTestId("relative-timeline-item").length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Filter chips — pure rules + render
// ---------------------------------------------------------------------------

import {
  RELATIVE_TIMELINE_FILTERS,
  filterRelativeTimelineItems,
  getRelativeTimelineFilterEmptyState,
  classifyRelativeTimelineFilter,
} from "@/lib/relativeTimelineProjectionRules";
import { fireEvent } from "@testing-library/react";

function tItem(
  over: Partial<RelativeTimelineItem> & { id: string },
): RelativeTimelineItem {
  return {
    id: over.id,
    eventType: "note",
    title: "t",
    occurredAt: "2026-04-05T00:00:00Z",
    occurredAtLabel: "2026-04-05T00:00:00Z",
    plantDay: 0,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: PLANT,
    tentId: null,
    ...over,
  };
}

describe("filterRelativeTimelineItems — pure rules", () => {
  const sample: RelativeTimelineItem[] = [
    tItem({ id: "n1", eventType: "note" }),
    tItem({ id: "obs", eventType: "observation" }),
    tItem({ id: "w", eventType: "watering" }),
    tItem({ id: "f", eventType: "feeding" }),
    tItem({ id: "ph", eventType: "photo", source: "photo" }),
    tItem({ id: "sym", eventType: "symptoms" }),
    tItem({ id: "pst", eventType: "pest_disease" }),
    tItem({ id: "tr", eventType: "training" }),
    tItem({ id: "def", eventType: "defoliation" }),
    tItem({ id: "sensor", eventType: "environment", source: "sensor" }),
    tItem({ id: "unk", eventType: "weirdstuff" }),
    tItem({ id: "null", eventType: "" }),
  ];

  it("All returns all items in original order", () => {
    const out = filterRelativeTimelineItems(sample, "all");
    expect(out.map((i) => i.id)).toEqual(sample.map((i) => i.id));
  });

  it("Photos returns photo-typed/photo-source items only", () => {
    expect(filterRelativeTimelineItems(sample, "photos").map((i) => i.id)).toEqual(["ph"]);
  });

  it("Watering returns watering items only", () => {
    expect(filterRelativeTimelineItems(sample, "watering").map((i) => i.id)).toEqual(["w"]);
  });

  it("Feeding returns feeding items only", () => {
    expect(filterRelativeTimelineItems(sample, "feeding").map((i) => i.id)).toEqual(["f"]);
  });

  it("Symptoms returns symptom/pest/diagnosis items", () => {
    expect(filterRelativeTimelineItems(sample, "symptoms").map((i) => i.id)).toEqual([
      "sym",
      "pst",
    ]);
  });

  it("Training returns training/defoliation items", () => {
    expect(filterRelativeTimelineItems(sample, "training").map((i) => i.id)).toEqual([
      "tr",
      "def",
    ]);
  });

  it("Notes returns note/observation/sensor/unknown safe fallback items", () => {
    expect(filterRelativeTimelineItems(sample, "notes").map((i) => i.id)).toEqual([
      "n1",
      "obs",
      "sensor",
      "unk",
      "null",
    ]);
  });

  it("classifies unknown/null event types safely as 'notes'", () => {
    expect(classifyRelativeTimelineFilter({ eventType: "", source: "note" })).toBe("notes");
    expect(classifyRelativeTimelineFilter(null as any)).toBe("notes");
    expect(classifyRelativeTimelineFilter(undefined as any)).toBe("notes");
    expect(
      classifyRelativeTimelineFilter({ eventType: "anything-new", source: "note" }),
    ).toBe("notes");
  });

  it("preserves input ordering after filtering", () => {
    const ordered: RelativeTimelineItem[] = [
      tItem({ id: "w1", eventType: "watering" }),
      tItem({ id: "w2", eventType: "watering" }),
      tItem({ id: "w3", eventType: "watering" }),
    ];
    expect(filterRelativeTimelineItems(ordered, "watering").map((i) => i.id)).toEqual([
      "w1",
      "w2",
      "w3",
    ]);
  });

  it("filters BEFORE grouping: group counts reflect only filtered items", () => {
    const VEG = {
      key: "vegetation",
      label: "Vegetation",
      description: "",
      colorToken: "stage-vegetation",
      colorDirection: "",
      suggestedDurationDays: null,
      sortOrder: 30,
    } as any;
    const FLOWER = {
      key: "flower",
      label: "Flower",
      description: "",
      colorToken: "stage-flower",
      colorDirection: "",
      suggestedDurationDays: null,
      sortOrder: 40,
    } as any;
    const items: RelativeTimelineItem[] = [
      tItem({ id: "vw", eventType: "watering", stagePreset: VEG }),
      tItem({ id: "vn", eventType: "note", stagePreset: VEG }),
      tItem({ id: "fw", eventType: "watering", stagePreset: FLOWER }),
      tItem({ id: "fn", eventType: "note", stagePreset: FLOWER }),
    ];
    const groups = groupRelativeTimelineByStage(
      filterRelativeTimelineItems(items, "watering"),
    );
    expect(groups.map((g) => `${g.key}:${g.count}`)).toEqual([
      "vegetation:1",
      "flower:1",
    ]);
  });

  it("does not create empty stage groups after filtering", () => {
    const VEG = {
      key: "vegetation",
      label: "Vegetation",
      description: "",
      colorToken: "stage-vegetation",
      colorDirection: "",
      suggestedDurationDays: null,
      sortOrder: 30,
    } as any;
    const FLOWER = {
      key: "flower",
      label: "Flower",
      description: "",
      colorToken: "stage-flower",
      colorDirection: "",
      suggestedDurationDays: null,
      sortOrder: 40,
    } as any;
    const items: RelativeTimelineItem[] = [
      tItem({ id: "vw", eventType: "watering", stagePreset: VEG }),
      tItem({ id: "fn", eventType: "note", stagePreset: FLOWER }),
    ];
    const groups = groupRelativeTimelineByStage(
      filterRelativeTimelineItems(items, "watering"),
    );
    expect(groups.map((g) => g.key)).toEqual(["vegetation"]);
  });

  it("getRelativeTimelineFilterEmptyState returns filter-specific copy", () => {
    const photos = getRelativeTimelineFilterEmptyState("photos");
    expect(photos.toLowerCase()).toContain("photo");
    const watering = getRelativeTimelineFilterEmptyState("watering");
    expect(watering.toLowerCase()).toContain("watering");
    expect(photos).not.toEqual(watering);
  });

  it("RELATIVE_TIMELINE_FILTERS exposes the required keys in order", () => {
    expect(RELATIVE_TIMELINE_FILTERS.map((f) => f.key)).toEqual([
      "all",
      "photos",
      "watering",
      "feeding",
      "symptoms",
      "training",
      "notes",
    ]);
  });
});

describe("PlantRelativeTimelineSection — filter chip render", () => {
  it("renders all filter chips with accessible labels and All selected by default", () => {
    mockUse.mockReturnValue({
      data: [entry({ id: "e1", entry_at: "2026-04-05T00:00:00Z" })],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    for (const f of RELATIVE_TIMELINE_FILTERS) {
      const chip = screen.getByTestId(`relative-timeline-filter-${f.key}`);
      expect(chip.getAttribute("aria-label")).toMatch(new RegExp(f.label, "i"));
    }
    const all = screen.getByTestId("relative-timeline-filter-all");
    expect(all.getAttribute("aria-checked")).toBe("true");
  });

  it("selecting a filter updates visible rows and group counts", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "w", entry_at: "2026-04-05T00:00:00Z", entry_type: "watering" }),
        entry({ id: "n", entry_at: "2026-04-06T00:00:00Z", entry_type: "note" }),
      ],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        currentStage="vegetation"
      />,
    );
    expect(screen.getAllByTestId("relative-timeline-item").length).toBe(2);
    fireEvent.click(screen.getByTestId("relative-timeline-filter-watering"));
    const rows = screen.getAllByTestId("relative-timeline-item");
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("data-item-id")).toBe("w");
    const groups = screen.getAllByTestId("relative-timeline-stage-group");
    expect(groups[0].getAttribute("data-count")).toBe("1");
  });

  it("renders filter-specific empty copy when filter has no matches", () => {
    mockUse.mockReturnValue({
      data: [entry({ id: "n", entry_at: "2026-04-05T00:00:00Z", entry_type: "note" })],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    fireEvent.click(screen.getByTestId("relative-timeline-filter-photos"));
    const empty = screen.getByTestId("relative-timeline-filter-empty");
    expect(empty.getAttribute("data-filter-key")).toBe("photos");
    expect(empty.textContent?.toLowerCase()).toContain("photo");
    expect(screen.queryAllByTestId("relative-timeline-stage-group").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Filter chip — static safety
// ---------------------------------------------------------------------------

describe("filter chip — static safety", () => {
  it("rules module filter additions stay free of writes / RPC / schema strings", () => {
    expect(RULES).not.toMatch(/calendar_events/);
    expect(RULES).not.toMatch(/action_queue/);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(RULES).not.toMatch(/\.rpc\(/);
  });

  it("component does not duplicate the filter mapping table", () => {
    expect(COMPONENT).toContain("RELATIVE_TIMELINE_FILTERS");
    expect(COMPONENT).not.toMatch(/const\s+\w*FILTERS\s*=\s*\[/);
    expect(COMPONENT).not.toMatch(/case\s+["']watering["']/);
    expect(COMPONENT).not.toMatch(/case\s+["']feeding["']/);
  });

  it("component does not add write / device / action_queue / service_role strings", () => {
    expect(COMPONENT).not.toMatch(/action_queue/);
    expect(COMPONENT).not.toMatch(/service_role/);
    expect(COMPONENT).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(COMPONENT).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
  });
});



// ---------------------------------------------------------------------------
// Summary strip — pure rules + render
// ---------------------------------------------------------------------------

import {
  summarizeRelativeTimelineItems,
  formatRelativeTimelineSummary,
} from "@/lib/relativeTimelineProjectionRules";

const NOW_MS = Date.parse("2026-05-01T12:00:00Z");

describe("summarizeRelativeTimelineItems — pure rules", () => {
  it("returns zero counts and null last activity for empty input", () => {
    const s = summarizeRelativeTimelineItems([], { now: NOW_MS });
    expect(s.total).toBe(0);
    expect(s.counts).toEqual({
      photos: 0,
      watering: 0,
      feeding: 0,
      symptoms: 0,
      training: 0,
      notes: 0,
    });
    expect(s.lastActivityAt).toBeNull();
    expect(s.lastActivityRelative).toBeNull();
    expect(summarizeRelativeTimelineItems(null as any).total).toBe(0);
  });

  it("counts totals across categories", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "ph", eventType: "photo", source: "photo" }),
      tItem({ id: "w1", eventType: "watering" }),
      tItem({ id: "w2", eventType: "watering" }),
      tItem({ id: "f1", eventType: "feeding" }),
      tItem({ id: "s1", eventType: "pest_disease" }),
      tItem({ id: "t1", eventType: "training" }),
      tItem({ id: "t2", eventType: "defoliation" }),
      tItem({ id: "n1", eventType: "note" }),
    ];
    const s = summarizeRelativeTimelineItems(items, { now: NOW_MS });
    expect(s.total).toBe(8);
    expect(s.counts).toEqual({
      photos: 1,
      watering: 2,
      feeding: 1,
      symptoms: 1,
      training: 2,
      notes: 1,
    });
  });

  it("classifies unknown / null event types as notes", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "u", eventType: "weirdstuff" }),
      tItem({ id: "z", eventType: "" }),
    ];
    const s = summarizeRelativeTimelineItems(items, { now: NOW_MS });
    expect(s.counts.notes).toBe(2);
    expect(s.total).toBe(2);
  });

  it("lastActivityAt picks the most recent valid date", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "a", occurredAt: "2026-04-10T00:00:00Z" }),
      tItem({ id: "b", occurredAt: "2026-04-29T00:00:00Z" }),
      tItem({ id: "c", occurredAt: "2026-04-20T00:00:00Z" }),
    ];
    const s = summarizeRelativeTimelineItems(items, { now: NOW_MS });
    expect(s.lastActivityAt).toBe("2026-04-29T00:00:00Z");
    expect(s.lastActivityRelative).toBe("2 days ago");
  });

  it("ignores invalid / missing dates for last activity", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "a", occurredAt: null }),
      tItem({ id: "b", occurredAt: "not-a-date" }),
    ];
    const s = summarizeRelativeTimelineItems(items, { now: NOW_MS });
    expect(s.lastActivityAt).toBeNull();
    expect(s.lastActivityRelative).toBeNull();
  });

  it("relative copy is deterministic with injected now (Today / Yesterday / N days)", () => {
    const mk = (iso: string) =>
      summarizeRelativeTimelineItems([tItem({ id: "x", occurredAt: iso })], {
        now: NOW_MS,
      }).lastActivityRelative;
    expect(mk("2026-05-01T08:00:00Z")).toBe("Today");
    expect(mk("2026-04-30T11:00:00Z")).toBe("Yesterday");
    expect(mk("2026-04-25T12:00:00Z")).toBe("6 days ago");
  });
});

describe("formatRelativeTimelineSummary — pure rules", () => {
  it("omits zero-count category chips when any non-zero category exists", () => {
    const s = summarizeRelativeTimelineItems(
      [tItem({ id: "w", eventType: "watering" })],
      { now: NOW_MS },
    );
    const f = formatRelativeTimelineSummary(s);
    const keys = f.chips.map((c) => c.key);
    expect(keys).toContain("total");
    expect(keys).toContain("watering");
    expect(keys).not.toContain("photos");
    expect(keys).not.toContain("feeding");
  });

  it("renders concise pluralized labels", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "ph1", eventType: "photo", source: "photo" }),
      tItem({ id: "ph2", eventType: "photo", source: "photo" }),
      tItem({ id: "w", eventType: "watering" }),
      tItem({ id: "s", eventType: "symptoms" }),
    ];
    const f = formatRelativeTimelineSummary(
      summarizeRelativeTimelineItems(items, { now: NOW_MS }),
    );
    const byKey = Object.fromEntries(f.chips.map((c) => [c.key, c.label]));
    expect(byKey.total).toBe("4 events");
    expect(byKey.photos).toBe("2 photos");
    expect(byKey.watering).toBe("1 watering");
    expect(byKey.symptoms).toBe("1 symptom");
  });

  it("renders Last activity copy when a valid date exists, otherwise null", () => {
    const withDate = formatRelativeTimelineSummary(
      summarizeRelativeTimelineItems(
        [tItem({ id: "x", occurredAt: "2026-04-29T00:00:00Z" })],
        { now: NOW_MS },
      ),
    );
    expect(withDate.lastActivity).toBe("Last activity: 2 days ago");
    const noDate = formatRelativeTimelineSummary(
      summarizeRelativeTimelineItems([tItem({ id: "x", occurredAt: null })], {
        now: NOW_MS,
      }),
    );
    expect(noDate.lastActivity).toBeNull();
  });
});

describe("PlantRelativeTimelineSection — summary strip render", () => {
  it("summary strip appears above filter chips and reflects FULL timeline", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "w", entry_at: "2026-04-05T00:00:00Z", entry_type: "watering" }),
        entry({ id: "f", entry_at: "2026-04-06T00:00:00Z", entry_type: "feeding" }),
        entry({ id: "n", entry_at: "2026-04-07T00:00:00Z", entry_type: "note" }),
      ],
      isLoading: false,
    });
    const { container } = render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    const summary = screen.getByTestId("relative-timeline-summary");
    const filters = screen.getByTestId("relative-timeline-filters");
    expect(summary.getAttribute("data-total")).toBe("3");
    // DOM order: summary before filters
    const all = Array.from(container.querySelectorAll("[data-testid]"));
    expect(all.indexOf(summary)).toBeLessThan(all.indexOf(filters));
    expect(screen.getByTestId("relative-timeline-summary-chip-total")).toHaveTextContent(
      "3 events",
    );
  });

  it("selecting a filter does not change full summary counts", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "w", entry_at: "2026-04-05T00:00:00Z", entry_type: "watering" }),
        entry({ id: "n", entry_at: "2026-04-06T00:00:00Z", entry_type: "note" }),
      ],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    const before = screen
      .getByTestId("relative-timeline-summary-chip-total")
      .textContent;
    fireEvent.click(screen.getByTestId("relative-timeline-filter-watering"));
    const after = screen
      .getByTestId("relative-timeline-summary-chip-total")
      .textContent;
    expect(after).toBe(before);
    expect(after).toContain("2 events");
  });

  it("empty timeline preserves the original empty state (no summary strip)", () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    expect(screen.getByTestId("relative-timeline-empty")).toBeTruthy();
    expect(screen.queryByTestId("relative-timeline-summary")).toBeNull();
  });
});

describe("summary strip — static safety", () => {
  it("rules summary additions stay free of writes / RPC / schema strings", () => {
    expect(RULES).not.toMatch(/calendar_events/);
    expect(RULES).not.toMatch(/action_queue/);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(RULES).not.toMatch(/\.rpc\(/);
  });

  it("component does not duplicate summary category mapping tables", () => {
    expect(COMPONENT).not.toMatch(/CATEGORY_SINGULAR/);
    expect(COMPONENT).not.toMatch(/CATEGORY_PLURAL/);
    expect(COMPONENT).not.toMatch(/const\s+\w*CATEGORY\w*\s*=\s*[\[{]/);
    expect(COMPONENT).toContain("formatRelativeTimelineSummary");
    expect(COMPONENT).toContain("summarizeRelativeTimelineItems");
  });

  it("component does not introduce write / action_queue / device strings", () => {
    expect(COMPONENT).not.toMatch(/action_queue/);
    expect(COMPONENT).not.toMatch(/service_role/);
    expect(COMPONENT).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// Per-stage-group summary — pure rules + render
// ---------------------------------------------------------------------------

import { formatRelativeTimelineGroupSummary } from "@/lib/relativeTimelineProjectionRules";

const G_NOW = Date.parse("2026-05-01T12:00:00Z");

describe("formatRelativeTimelineGroupSummary — pure rules", () => {
  it("returns empty labels for an empty group", () => {
    const g = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems([], { now: G_NOW }),
    );
    expect(g.totalLabel).toBeNull();
    expect(g.categoryLabels).toEqual([]);
    expect(g.lastActivityLabel).toBeNull();
    expect(g.compact).toBe("");
  });

  it("counts visible items and concise per-category labels", () => {
    const items: RelativeTimelineItem[] = [
      tItem({ id: "w", eventType: "watering", occurredAt: "2026-04-29T00:00:00Z" }),
      tItem({ id: "p1", eventType: "photo", source: "photo", occurredAt: "2026-04-28T00:00:00Z" }),
      tItem({ id: "p2", eventType: "photo", source: "photo", occurredAt: "2026-04-27T00:00:00Z" }),
    ];
    const g = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(items, { now: G_NOW }),
    );
    expect(g.totalLabel).toBe("3 items");
    expect(g.categoryLabels).toEqual(["2 photos", "1 watering"]);
    expect(g.lastActivityLabel).toBe("Last: 2 days ago");
    expect(g.compact).toBe("3 items · 2 photos · 1 watering · Last: 2 days ago");
  });

  it("hides zero-count categories", () => {
    const g = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(
        [tItem({ id: "n", eventType: "note", occurredAt: "2026-05-01T00:00:00Z" })],
        { now: G_NOW },
      ),
    );
    expect(g.categoryLabels).toEqual(["1 note"]);
    expect(g.compact).toBe("1 item · 1 note · Last: Today");
  });

  it("unknown/null event types count as notes", () => {
    const g = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(
        [
          tItem({ id: "u", eventType: "weirdstuff", occurredAt: null }),
          tItem({ id: "z", eventType: "" , occurredAt: null}),
        ],
        { now: G_NOW },
      ),
    );
    expect(g.categoryLabels).toEqual(["2 notes"]);
    expect(g.lastActivityLabel).toBeNull();
  });

  it("invalid/missing dates omit last-activity label", () => {
    const g = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(
        [tItem({ id: "a", occurredAt: null }), tItem({ id: "b", occurredAt: "nope" })],
        { now: G_NOW },
      ),
    );
    expect(g.lastActivityLabel).toBeNull();
    expect(g.compact).not.toMatch(/Last:/);
  });

  it("deterministic Today / Yesterday / N-days copy with injected now", () => {
    const mk = (iso: string) =>
      formatRelativeTimelineGroupSummary(
        summarizeRelativeTimelineItems([tItem({ id: "x", occurredAt: iso })], {
          now: G_NOW,
        }),
      ).lastActivityLabel;
    expect(mk("2026-05-01T08:00:00Z")).toBe("Last: Today");
    expect(mk("2026-04-30T11:00:00Z")).toBe("Last: Yesterday");
    expect(mk("2026-04-28T12:00:00Z")).toBe("Last: 3 days ago");
  });

  it("singular vs plural is concise (1 watering vs 2 waterings, 1 symptom vs 2 symptoms)", () => {
    const g1 = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(
        [
          tItem({ id: "w", eventType: "watering" }),
          tItem({ id: "s", eventType: "symptoms" }),
        ],
        { now: G_NOW },
      ),
    );
    expect(g1.categoryLabels).toEqual(["1 watering", "1 symptom"]);
    const g2 = formatRelativeTimelineGroupSummary(
      summarizeRelativeTimelineItems(
        [
          tItem({ id: "w1", eventType: "watering" }),
          tItem({ id: "w2", eventType: "watering" }),
          tItem({ id: "s1", eventType: "symptoms" }),
          tItem({ id: "s2", eventType: "pest_disease" }),
        ],
        { now: G_NOW },
      ),
    );
    expect(g2.categoryLabels).toEqual(["2 waterings", "2 symptoms"]);
  });
});

describe("PlantRelativeTimelineSection — per-group summary render", () => {
  it("renders a group summary near each stage header and respects the active filter", () => {
    mockUse.mockReturnValue({
      data: [
        entry({ id: "w", entry_at: "2026-04-05T00:00:00Z", entry_type: "watering" }),
        entry({ id: "n", entry_at: "2026-04-06T00:00:00Z", entry_type: "note" }),
      ],
      isLoading: false,
    });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
        currentStage="vegetation"
      />,
    );
    const summariesBefore = screen.getAllByTestId("relative-timeline-group-summary");
    expect(summariesBefore.length).toBe(1);
    expect(summariesBefore[0].textContent).toMatch(/2 items/);
    fireEvent.click(screen.getByTestId("relative-timeline-filter-watering"));
    const summariesAfter = screen.getAllByTestId("relative-timeline-group-summary");
    expect(summariesAfter.length).toBe(1);
    expect(summariesAfter[0].textContent).toMatch(/1 item\b/);
    expect(summariesAfter[0].textContent).toMatch(/1 watering/);
    // Top full-timeline summary unaffected.
    expect(
      screen.getByTestId("relative-timeline-summary-chip-total").textContent,
    ).toContain("2 events");
  });

  it("empty timeline still shows the original empty state, no group summaries", () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <PlantRelativeTimelineSection
        plantId={PLANT}
        plantStartedAt={PLANT_STARTED}
      />,
    );
    expect(screen.getByTestId("relative-timeline-empty")).toBeTruthy();
    expect(screen.queryAllByTestId("relative-timeline-group-summary").length).toBe(0);
  });
});

describe("group summary — static safety", () => {
  it("rules additions stay free of writes / RPC / schema strings", () => {
    expect(RULES).not.toMatch(/action_queue/);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(RULES).not.toMatch(/\.rpc\(/);
  });

  it("component does not duplicate category mapping tables", () => {
    expect(COMPONENT).not.toMatch(/CATEGORY_SINGULAR/);
    expect(COMPONENT).not.toMatch(/CATEGORY_PLURAL/);
    expect(COMPONENT).not.toMatch(/const\s+\w*CATEGORY\w*\s*=\s*[\[{]/);
    expect(COMPONENT).toContain("formatRelativeTimelineGroupSummary");
  });
});
