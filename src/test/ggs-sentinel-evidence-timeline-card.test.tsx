/**
 * Render tests for GgsSentinelEvidenceTimelineCard.
 * Confirms checks, freshness warning, metric rows, next-step guidance.
 * Confirms raw_payload is never rendered.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GgsSentinelEvidenceTimelineCard } from "@/components/GgsSentinelEvidenceTimelineCard";
import { buildGgsSentinelEvidenceViewModel } from "@/lib/ggsSentinelEvidenceViewModel";
import {
  evaluateGgsSentinelReadiness,
  type GgsSentinelInputRow,
  type GgsSentinelSnapshot,
} from "@/lib/ggsSentinelSmokeRunner";

const NOW = new Date("2026-06-17T18:30:00Z");
const offset = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function row(
  metric: string,
  value: number,
  capturedAt: string,
  opts: Partial<GgsSentinelInputRow> = {},
): GgsSentinelInputRow {
  return {
    metric,
    value,
    source: "live",
    captured_at: capturedAt,
    raw_payload: {
      source_app: "spider_farmer_ggs",
      sensor_id: "PRIVATE-GGS-1",
      payload: { secret: "do-not-render" },
    },
    ...opts,
  };
}

const SNAP: GgsSentinelSnapshot = {
  captured_at: "2026-06-17T18:29:00Z",
  source: "live",
  soil_moisture: 40,
  soil_temp: 22,
  soil_ec: 0.9,
};

function buildVM(staleSoilTemp = false) {
  const fresh = offset(60_000);
  const stale = offset(16 * 60_000);
  const ev = evaluateGgsSentinelReadiness({
    rows: [
      row("soil_moisture_pct", 40, fresh),
      row("ec", 1, fresh),
      row("soil_temp_c", 22, staleSoilTemp ? stale : fresh),
    ],
    snapshot: SNAP,
    now: NOW,
  });
  return buildGgsSentinelEvidenceViewModel({ evaluation: ev })!;
}

describe("GgsSentinelEvidenceTimelineCard", () => {
  it("renders title, verdict, derived/read-only label, and check list", () => {
    const vm = buildVM(false);
    render(<GgsSentinelEvidenceTimelineCard viewModel={vm} />);
    expect(screen.getByText("GGS Sentinel evidence")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-sentinel-evidence-verdict").textContent).toBe("PASS");
    expect(screen.getByText(/Derived · read-only/i)).toBeInTheDocument();
    expect(screen.getByTestId("ggs-sentinel-evidence-check-list")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-sentinel-evidence-metric-list")).toBeInTheDocument();
  });

  it("renders captured age for each metric row", () => {
    const vm = buildVM(false);
    render(<GgsSentinelEvidenceTimelineCard viewModel={vm} />);
    for (const m of vm.metrics) {
      expect(screen.getByTestId(`ggs-sentinel-evidence-metric-${m.metric}`)).toBeInTheDocument();
    }
  });

  it("shows the freshness warning block when a metric is stale", () => {
    const vm = buildVM(true);
    render(<GgsSentinelEvidenceTimelineCard viewModel={vm} />);
    expect(screen.getByTestId("ggs-sentinel-evidence-freshness-warning")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-sentinel-evidence-next-steps")).toBeInTheDocument();
  });

  it("never renders raw_payload private fields", () => {
    const vm = buildVM(true);
    const { container } = render(<GgsSentinelEvidenceTimelineCard viewModel={vm} />);
    const html = container.innerHTML;
    expect(html).not.toContain("PRIVATE-GGS-1");
    expect(html).not.toContain("do-not-render");
    expect(html).not.toContain("\"payload\"");
  });
});
