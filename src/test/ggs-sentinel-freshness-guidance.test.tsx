import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { GgsSentinelSmokeRunnerPanel } from "@/components/GgsSentinelSmokeRunnerPanel";
import { runGgsSentinelSmoke, SPIDER_FARMER_GGS_AGING_MS, type SentinelSensorRow } from "@/lib/ggsSentinelSmokeRunner";
import {
  FRESHNESS_EXPLANATORY_NOTE,
  buildGgsSentinelSmokeRunnerPanelViewModel,
} from "@/lib/ggsSentinelSmokeRunnerViewModel";
import { SPIDER_FARMER_GGS_PROVIDER, SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const fresh = (offsetSec = 60) => new Date(NOW.getTime() - offsetSec * 1000).toISOString();
const aging = () => new Date(NOW.getTime() - (SPIDER_FARMER_GGS_AGING_MS + 60_000)).toISOString();
const stale = () => new Date(NOW.getTime() - (SPIDER_FARMER_GGS_STALE_MS + 60_000)).toISOString();

function row(overrides: Partial<SentinelSensorRow> & Pick<SentinelSensorRow, "metric" | "value">): SentinelSensorRow {
  return {
    source: SPIDER_FARMER_GGS_PROVIDER,
    quality: "live",
    captured_at: fresh(),
    ...overrides,
  };
}

function renderWithVerdict(rows: SentinelSensorRow[]) {
  const verdict = runGgsSentinelSmoke({ rows, now: NOW });
  const vm = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
  return render(<GgsSentinelSmokeRunnerPanel viewModel={vm} />);
}

describe("GgsSentinelSmokeRunnerPanel — explanatory note", () => {
  it("renders the freshness explanatory note exactly once with the verbatim copy", () => {
    const { container } = renderWithVerdict([]);
    const notes = container.querySelectorAll('[data-testid="ggs-sentinel-freshness-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe(FRESHNESS_EXPLANATORY_NOTE);
  });

  it("notes explicitly that guidance does not change Sentinel result priority", () => {
    const { getByTestId } = renderWithVerdict([]);
    const note = getByTestId("ggs-sentinel-freshness-note");
    expect(note.textContent).toContain("does not change Sentinel result priority");
    expect(note.textContent).toContain("explains why each metric is fresh, aging, stale, or missing");
  });
});

describe("GgsSentinelSmokeRunnerPanel — missing vs stale visual distinction", () => {
  it("missing and stale metrics render with distinct status labels, tones, and aria-labels", () => {
    const { getByTestId } = renderWithVerdict([
      // soil_temp_c absent -> Missing
      row({ metric: "soil_ec", value: 1.8, captured_at: stale() }),
    ]);
    const missingRow = getByTestId("ggs-sentinel-freshness-row-soil_temp_c");
    const staleRow = getByTestId("ggs-sentinel-freshness-row-soil_ec");

    expect(missingRow.getAttribute("data-state")).toBe("missing");
    expect(missingRow.getAttribute("data-tone")).toBe("muted");
    expect(staleRow.getAttribute("data-state")).toBe("stale");
    expect(staleRow.getAttribute("data-tone")).toBe("destructive");

    const missingStatus = within(missingRow).getByTestId("ggs-sentinel-status-soil_temp_c");
    const staleStatus = within(staleRow).getByTestId("ggs-sentinel-status-soil_ec");
    expect(missingStatus.textContent).toBe("Missing");
    expect(staleStatus.textContent).toBe("Stale");
    expect(missingStatus.getAttribute("aria-label")).toBe("Status: Missing");
    expect(staleStatus.getAttribute("aria-label")).toBe("Status: Stale");

    expect(missingStatus.className).not.toBe(staleStatus.className);
  });

  it("missing metric shows 'No row found' age text and stale shows '<n>m ago'", () => {
    const { getByTestId } = renderWithVerdict([
      row({ metric: "soil_ec", value: 1.8, captured_at: stale() }),
    ]);
    expect(getByTestId("ggs-sentinel-age-soil_temp_c").textContent).toBe("No row found");
    expect(getByTestId("ggs-sentinel-age-soil_ec").textContent).toMatch(/\d+m ago/);
  });
});

describe("GgsSentinelSmokeRunnerPanel — compact one-line-per-metric layout", () => {
  it("renders exactly one row per required metric", () => {
    const { container } = renderWithVerdict([]);
    const rows = container.querySelectorAll('[data-testid^="ggs-sentinel-freshness-row-"]');
    expect(rows).toHaveLength(2);
  });

  it("each row shows label + status + age + next-action", () => {
    const { getByTestId } = renderWithVerdict([
      row({ metric: "soil_temp_c", value: 22, captured_at: fresh(45) }),
      row({ metric: "soil_ec", value: 1.8, captured_at: fresh(60) }),
    ]);
    for (const metric of ["soil_temp_c", "soil_ec"] as const) {
      const r = getByTestId(`ggs-sentinel-freshness-row-${metric}`);
      expect(within(r).getByTestId(`ggs-sentinel-status-${metric}`)).toBeInTheDocument();
      expect(within(r).getByTestId(`ggs-sentinel-age-${metric}`)).toBeInTheDocument();
      expect(within(r).getByTestId(`ggs-sentinel-next-${metric}`)).toBeInTheDocument();
    }
  });

  it("does not render nested cards inside the freshness rows (mobile-friendly compact layout)", () => {
    const { getByTestId } = renderWithVerdict([
      row({ metric: "soil_temp_c", value: 22 }),
      row({ metric: "soil_ec", value: 1.8 }),
    ]);
    for (const metric of ["soil_temp_c", "soil_ec"] as const) {
      const r = getByTestId(`ggs-sentinel-freshness-row-${metric}`);
      expect(r.querySelectorAll("[data-slot='card']").length).toBe(0);
    }
  });
});

describe("GgsSentinelSmokeRunnerPanel — verdict pill", () => {
  it("renders PASS pill with the primary tone when sentinel is ready", () => {
    const { getByTestId } = renderWithVerdict([
      row({ metric: "soil_temp_c", value: 22 }),
      row({ metric: "soil_ec", value: 1.8 }),
    ]);
    const pill = getByTestId("ggs-sentinel-verdict-pill");
    expect(pill.className).toMatch(/text-primary/);
    expect(pill.textContent).toMatch(/Live/);
  });

  it("renders BLOCKED pill with the destructive tone when no rows are present", () => {
    const { getByTestId, container } = renderWithVerdict([]);
    const pill = getByTestId("ggs-sentinel-verdict-pill");
    expect(pill.className).toMatch(/text-destructive/);
    expect(pill.textContent).toMatch(/no GGS rows/i);
    expect(container.querySelector('[data-verdict-state="BLOCKED_NO_GGS_ROWS"]')).not.toBeNull();
  });
});

describe("GgsSentinelSmokeRunnerPanel — fresh_but_aging does not flip verdict to BLOCKED", () => {
  it("aging metric still renders PASS pill; aging row is visually distinct from stale", () => {
    const { getByTestId } = renderWithVerdict([
      row({ metric: "soil_temp_c", value: 22, captured_at: aging() }),
      row({ metric: "soil_ec", value: 1.8 }),
    ]);
    const pill = getByTestId("ggs-sentinel-verdict-pill");
    expect(pill.className).toMatch(/text-primary/);
    const agingRow = getByTestId("ggs-sentinel-freshness-row-soil_temp_c");
    expect(agingRow.getAttribute("data-state")).toBe("fresh_but_aging");
    expect(agingRow.getAttribute("data-tone")).toBe("warning");
  });
});

describe("GgsSentinelSmokeRunnerPanel — safety", () => {
  it("never renders any string that looks like raw_payload", () => {
    const { container } = renderWithVerdict([
      row({ metric: "soil_temp_c", value: 22 }),
      row({ metric: "soil_ec", value: 1.8 }),
    ]);
    expect(container.innerHTML).not.toMatch(/raw_payload/i);
    expect(container.innerHTML).not.toMatch(/payload/i);
  });
});
