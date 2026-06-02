/**
 * Tests for Timeline UI wiring with the normalized diary timeline rules.
 *
 * - Presenter rendering tests against DiaryEntryBadges using crafted
 *   timeline items built from the pure rule helper.
 * - Static contract tests for src/pages/Timeline.tsx wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import DiaryEntryBadges from "@/components/DiaryEntryBadges";
import { buildGrowDiaryTimeline } from "@/lib/growDiaryTimelineRules";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const BADGES = readFileSync(
  resolve(ROOT, "src/components/DiaryEntryBadges.tsx"),
  "utf8",
);

const NOW = 1_700_000_000_000;
const iso = (offset: number) => new Date(NOW + offset).toISOString();

const rawSet = [
  {
    id: "w1",
    grow_id: "g1",
    entry_at: iso(-1 * 3600_000),
    entry_type: "watering",
    note: "Watered.",
    details: { ph: 6.2, watering_amount_ml: 500 },
  },
  {
    id: "f1",
    grow_id: "g1",
    entry_at: iso(-2 * 3600_000),
    entry_type: "feeding",
    note: "Fed.",
    details: { ec: 1.4, nutrients: [{ name: "CalMag" }] },
  },
  {
    id: "t1",
    grow_id: "g1",
    entry_at: iso(-3 * 3600_000),
    entry_type: "training",
    note: "Topped.",
    details: { training_actions: ["topping"] },
  },
  {
    id: "p1",
    grow_id: "g1",
    entry_at: iso(-4 * 3600_000),
    entry_type: "photo",
    note: "Looks good",
    photo_url: "https://example.com/p.jpg",
    details: {
      sensor_snapshot: { at: iso(-4 * 3600_000), temp: 24, rh: 55 },
    },
  },
  {
    id: "bad",
    grow_id: "g1",
    entry_at: iso(-5 * 3600_000),
    entry_type: "watering",
    note: "Broken row",
    details: "{not-json",
  },
];

describe("DiaryEntryBadges presenter", () => {
  it("renders watering/feeding/training labels for normalized entries", () => {
    const items = buildGrowDiaryTimeline({
      rawEntries: rawSet,
      filter: { includeInvalid: true },
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));

    const { rerender } = render(<DiaryEntryBadges item={byId["w1"]} />);
    expect(screen.getByTestId("diary-entry-tag-watering")).toBeInTheDocument();

    rerender(<DiaryEntryBadges item={byId["f1"]} />);
    expect(screen.getByTestId("diary-entry-tag-feeding")).toBeInTheDocument();

    rerender(<DiaryEntryBadges item={byId["t1"]} />);
    expect(screen.getByTestId("diary-entry-tag-training")).toBeInTheDocument();
  });

  it("renders photo and sensor-snapshot tags", () => {
    const items = buildGrowDiaryTimeline({
      rawEntries: rawSet,
      filter: { includeInvalid: true },
    });
    const photo = items.find((i) => i.id === "p1")!;
    render(<DiaryEntryBadges item={photo} />);
    expect(screen.getByTestId("diary-entry-tag-photo")).toBeInTheDocument();
    expect(
      screen.getByTestId("diary-entry-tag-sensor-snapshot"),
    ).toBeInTheDocument();
  });

  it("shows Limited data warning for malformed entries", () => {
    const items = buildGrowDiaryTimeline({
      rawEntries: rawSet,
      filter: { includeInvalid: true },
    });
    const bad = items.find((i) => i.id === "bad")!;
    render(<DiaryEntryBadges item={bad} />);
    const w = screen.getByTestId("diary-entry-warning");
    expect(w).toBeInTheDocument();
    expect(w).toHaveTextContent(/limited data/i);
  });

  it("normalized timeline preserves newest-first ordering", () => {
    const items = buildGrowDiaryTimeline({
      rawEntries: rawSet,
      filter: { includeInvalid: true },
    });
    for (let i = 1; i < items.length; i += 1) {
      expect((items[i - 1].timestamp ?? -Infinity) >=
        (items[i].timestamp ?? -Infinity)).toBe(true);
    }
    expect(items[0].id).toBe("w1");
  });

  it("renders nothing when there are no tags and no warnings", () => {
    const { container } = render(
      <DiaryEntryBadges
        item={{
          id: "x",
          title: "Note",
          subtitle: "",
          timestamp: NOW,
          timestampLabel: iso(0),
          growId: null,
          plantId: null,
          tentId: null,
          stage: null,
          eventType: "note",
          notePreview: "",
          hasPhoto: false,
          hasSensorSnapshot: false,
          sensorSnapshotState: null,
          tags: [],
          warnings: [],
          isUsefulForAiContext: true,
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("Timeline page wiring of normalized diary rules", () => {
  it("imports the timeline rule helper and presenter", () => {
    expect(TIMELINE).toMatch(/from\s+["']@\/lib\/growDiaryTimelineRules["']/);
    expect(TIMELINE).toMatch(
      /from\s+["']@\/components\/DiaryEntryBadges["']/,
    );
    expect(TIMELINE).toMatch(/buildGrowDiaryTimeline\s*\(/);
    expect(TIMELINE).toMatch(/<DiaryEntryBadges\b/);
  });

  it("includes invalid entries so malformed rows surface as warnings", () => {
    expect(TIMELINE).toMatch(/includeInvalid:\s*true/);
  });

  it("preserves empty diary state copy", () => {
    expect(TIMELINE).toMatch(/No entries yet/);
  });

  it("does not introduce service_role or device-control surfaces", () => {
    expect(TIMELINE).not.toMatch(/service_role/);
    expect(TIMELINE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
  });

  it("Timeline does not change QuickLog writes", () => {
    expect(TIMELINE).not.toMatch(/from\s+["']@\/components\/QuickLog["']/);
  });
});

describe("DiaryEntryBadges source contract", () => {
  it("is presenter-only — no queries, writes, or rule logic", () => {
    expect(BADGES).not.toMatch(/supabase|service_role/);
    expect(BADGES).not.toMatch(/\.(insert|update|delete|upsert|select)\s*\(/);
    expect(BADGES).not.toMatch(/buildGrowDiaryTimeline\s*\(/);
    expect(BADGES).not.toMatch(/normalizeDiaryEntry\s*\(/);
  });
});
