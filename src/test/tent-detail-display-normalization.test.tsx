/**
 * #15 / #18 / #21 — Display-normalization audit follow-ups for Tent
 * detail and Timeline memory surfaces.
 *
 * Pure presenter tests. No schema, RLS, RPC, auth, or write-path
 * coverage — these assert that the canonical formatters are being
 * applied at the user-facing boundary.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";
import { formatSensorValue } from "@/lib/sensorFormat";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

// ---------------------------------------------------------------------------
// #15 — Temperature unit consistency
// ---------------------------------------------------------------------------

describe("#15 Tent header + manual snapshot temperature unit consistency", () => {
  it("formatSensorValue('air_temp_c') renders °F to match the rest of the app", () => {
    // Stored °C is converted to °F at the presenter boundary. Header
    // chips and ManualSnapshotTimelineCard both go through this — they
    // cannot disagree.
    const out = formatSensorValue("air_temp_c", 25);
    expect(out).toMatch(/°F\b/);
    expect(out).not.toMatch(/°C\b/);
  });

  it("never returns both °F and °C on the same formatted value", () => {
    for (const v of [-10, 0, 18.5, 25, 32.123]) {
      const out = formatSensorValue("air_temp_c", v);
      const hasF = /°F/.test(out);
      const hasC = /°C/.test(out);
      expect(hasF && hasC).toBe(false);
      expect(hasF).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// #21 — Tent header VPD precision
// ---------------------------------------------------------------------------

describe("#21 Tent header VPD precision", () => {
  it("VPD formatter caps display at 2 decimals", () => {
    // Reproduces the 1.505 kPa case observed on Tent detail.
    expect(formatSensorValue("vpd_kpa", 1.505)).toBe("1.51 kPa");
    expect(formatSensorValue("vpd_kpa", 1.504)).toBe("1.50 kPa");
    expect(formatSensorValue("vpd_kpa", 1.5)).toBe("1.50 kPa");
    // No 3+ decimal leakage.
    for (const v of [1.505, 1.4321, 0.999, 2.7777]) {
      expect(formatSensorValue("vpd_kpa", v)).not.toMatch(/\.\d{3,}/);
    }
  });

  it("Tent header source uses formatSensorValue('vpd_kpa', ...)", async () => {
    // Static guardrail: TentDetail.tsx routes its header VPD chip through
    // the canonical sensor formatter (not raw .vpd, not toFixed(3)).
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../pages/TentDetail.tsx"),
      "utf8",
    );
    expect(src).toMatch(/formatSensorValue\(["']vpd_kpa["']/);
    // The pre-patch shape `value={snap.vpd}` (raw) must not return.
    expect(src).not.toMatch(/value=\{snap\.vpd\}/);
  });
});

// ---------------------------------------------------------------------------
// #18 — Timeline memory timestamps
// ---------------------------------------------------------------------------

function renderTimelineMemory() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TimelineMemorySection scope="tent" tentId={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("#18 Timeline memory raw-ISO timestamps", () => {
  it("formatSnapshotTimestamp strips microseconds and +00:00 offset", () => {
    const raw = "2026-06-01T19:56:22.859403+00:00";
    const out = formatSnapshotTimestamp(raw, "en-US");
    expect(out).not.toContain("+00:00");
    expect(out).not.toMatch(/T\d{2}:\d{2}/);
    expect(out).not.toMatch(/\.\d{3,}/);
    expect(out).toMatch(/2026/);
  });

  it("TimelineMemorySection.tsx routes diary + AI Doctor rows through formatSnapshotTimestamp", async () => {
    // Static guardrail: source must import the canonical timestamp
    // formatter and not render `{item.occurredAt}` as a bare string.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../components/TimelineMemorySection.tsx"),
      "utf8",
    );
    expect(src).toMatch(/formatSnapshotTimestamp/);
    // No raw `{item.occurredAt}` inside JSX text content.
    expect(src).not.toMatch(/>\{item\.occurredAt\}</);
    // Machine-readable datetime attribute preserved.
    expect(src).toMatch(/dateTime=\{item\.occurredAt\}/);
  });

  it("renders without crashing in the no-scope state (smoke)", () => {
    const { getByTestId } = renderTimelineMemory();
    expect(getByTestId("timeline-memory-no-scope")).toBeTruthy();
  });
});
