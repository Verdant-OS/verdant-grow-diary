/**
 * Tests for sensor snapshot state badge surfaced in Timeline / DiaryEntryBadges.
 *
 * Coverage:
 * - growDiaryTimelineRules sensorSnapshotBadge helper
 * - DiaryEntryBadges rendering per state
 * - Legacy snapshots without state → no badge
 * - Existing event_type badges still render
 * - No raw IDs or provenance tokens leak into visible text/aria
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { sensorSnapshotBadge, toTimelineItem } from "@/lib/growDiaryTimelineRules";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import DiaryEntryBadges from "@/components/DiaryEntryBadges";

const NOW = 1_700_000_000_000;
const iso = (offset: number) => new Date(NOW + offset).toISOString();

function makeItem(over: Partial<ReturnType<typeof toTimelineItem>> = {}) {
  const base = {
    id: "e-1",
    title: "Observation",
    subtitle: "",
    timestamp: NOW,
    timestampLabel: iso(0),
    growId: "g1",
    plantId: "p1",
    tentId: "t1",
    stage: "veg",
    eventType: "observation",
    notePreview: "Looks good",
    hasPhoto: false,
    hasSensorSnapshot: true,
    sensorSnapshotState: null as string | null,
    tags: ["sensor-snapshot"],
    warnings: [],
    isUsefulForAiContext: true,
  };
  return { ...base, ...over };
}

describe("sensorSnapshotBadge pure helper", () => {
  it("live → label Live, variant positive", () => {
    const b = sensorSnapshotBadge("live");
    expect(b).toEqual({ label: "Live", variant: "positive" });
  });

  it("manual → label Manual, variant neutral", () => {
    const b = sensorSnapshotBadge("manual");
    expect(b).toEqual({ label: "Manual", variant: "neutral" });
  });

  it("stale → label Stale, variant warning", () => {
    const b = sensorSnapshotBadge("stale");
    expect(b).toEqual({ label: "Stale", variant: "warning" });
  });

  it("invalid → label Invalid, variant error", () => {
    const b = sensorSnapshotBadge("invalid");
    expect(b).toEqual({ label: "Invalid", variant: "error" });
  });

  it("null / undefined / empty → no badge", () => {
    expect(sensorSnapshotBadge(null)).toBeNull();
    expect(sensorSnapshotBadge(undefined)).toBeNull();
    expect(sensorSnapshotBadge("")).toBeNull();
  });

  it("unknown state → no badge", () => {
    expect(sensorSnapshotBadge("demo")).toBeNull();
    expect(sensorSnapshotBadge("unknown")).toBeNull();
    expect(sensorSnapshotBadge("Live")).toEqual({ label: "Live", variant: "positive" }); // helper trims+lowercases
    expect(sensorSnapshotBadge(" LIVE ")).toEqual({ label: "Live", variant: "positive" });
    expect(sensorSnapshotBadge("  STALE  ")).toEqual({ label: "Stale", variant: "warning" });
  });
});

describe("toTimelineItem exposes sensorSnapshotState from normalized entry", () => {
  it("carries state through normalization → timeline item", () => {
    const raw = {
      id: "e-snap",
      grow_id: "g1",
      entry_at: iso(0),
      entry_type: "observation",
      note: "snap",
      details: {
        sensor_snapshot: { at: iso(0), temp: 24, rh: 55, source: "live", state: "live" },
      },
    };
    const n = normalizeDiaryEntry(raw, {})!;
    expect(n.details.sensorSnapshot?.state).toBe("live");
    expect(n.details.sensorSnapshot?.source).toBe("live");
    const item = toTimelineItem(n);
    expect(item.sensorSnapshotState).toBe("live");
    expect(item.hasSensorSnapshot).toBe(true);
  });

  it("legacy snapshot without state yields sensorSnapshotState=null", () => {
    const raw = {
      id: "e-legacy",
      grow_id: "g1",
      entry_at: iso(0),
      entry_type: "observation",
      note: "legacy",
      details: {
        sensor_snapshot: { at: iso(0), temp: 24, rh: 55 },
      },
    };
    const n = normalizeDiaryEntry(raw, {})!;
    const item = toTimelineItem(n);
    expect(item.sensorSnapshotState).toBeNull();
  });
});

describe("DiaryEntryBadges renders sensor-state badges", () => {
  it("live → correct label + positive variant", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "live" })} />);
    const badge = screen.getByTestId("diary-entry-sensor-badge-positive");
    expect(badge).toHaveTextContent("Live");
  });

  it("manual → correct label + neutral variant", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "manual" })} />);
    const badge = screen.getByTestId("diary-entry-sensor-badge-neutral");
    expect(badge).toHaveTextContent("Manual");
  });

  it("stale → correct label + warning variant", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "stale" })} />);
    const badge = screen.getByTestId("diary-entry-sensor-badge-warning");
    expect(badge).toHaveTextContent("Stale");
  });

  it("invalid → correct label + error variant", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "invalid" })} />);
    const badge = screen.getByTestId("diary-entry-sensor-badge-error");
    expect(badge).toHaveTextContent("Invalid");
  });

  it("missing state / legacy snapshot → no sensor-state badge", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: null, tags: ["sensor-snapshot"] })} />);
    expect(screen.queryByTestId(/diary-entry-sensor-badge/)).not.toBeInTheDocument();
  });

  it("existing event_type badges still render alongside sensor badge", () => {
    render(
      <DiaryEntryBadges
        item={makeItem({
          sensorSnapshotState: "live",
          tags: ["sensor-snapshot", "watering"],
        })}
      />,
    );
    expect(screen.getByTestId("diary-entry-tag-watering")).toBeInTheDocument();
    expect(screen.getByTestId("diary-entry-sensor-badge-positive")).toBeInTheDocument();
  });
});

describe("static safety: no token/ID leakage in badge text or attributes", () => {
  it("badge text never contains raw IDs", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "live" })} />);
    const badges = screen.getByTestId("diary-entry-badges");
    expect(badges.textContent).not.toMatch(/g1|p1|t1|e-1/);
  });

  it("badge text never contains [session:] or [alert:] tokens", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "stale" })} />);
    const badges = screen.getByTestId("diary-entry-badges");
    expect(badges.textContent).not.toMatch(/\[session:|\[alert:/);
  });

  it("badge aria and title attributes do not leak internal source strings", () => {
    render(<DiaryEntryBadges item={makeItem({ sensorSnapshotState: "invalid" })} />);
    const badges = screen.getByTestId("diary-entry-badges");
    const html = badges.innerHTML;
    expect(html).not.toMatch(/source=|state=|pi_bridge|home_assistant/);
  });
});

describe("static safety scan on changed files", () => {
  it("growDiaryTimelineRules.ts has no service_role or forbidden automation wording", () => {
    const src = readFileSync("src/lib/growDiaryTimelineRules.ts", "utf8");
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/autopilot|auto-run|auto_approve/i);
  });

  it("DiaryEntryBadges.tsx has no queries, writes, or service_role", () => {
    const src = readFileSync("src/components/DiaryEntryBadges.tsx", "utf8");
    expect(src).not.toMatch(/supabase|service_role/);
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|select)\s*\(/);
  });
});
