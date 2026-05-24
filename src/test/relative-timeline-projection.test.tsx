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
// Render coverage
// ---------------------------------------------------------------------------

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
    // No buttons in the rendered timeline section.
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.querySelectorAll("[draggable]").length).toBe(0);
    expect(container.querySelectorAll("input, textarea, select").length).toBe(0);
  });
});
