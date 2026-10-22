/**
 * #2268 (QA on production ebaf1b6a, 2/2): after manual readings of 80°F/50% RH
 * then 85°F/45% RH, the Dashboard showed 1.75 then 2.26 kPa while the /tents
 * list showed "— kPa". The list now reads the same VPD the Dashboard's Tonight
 * card derives (VER-189), via tentsListCanonicalVpd, from the same stored rows
 * and the same diary-inclusive snapshot (Codex P2 on #2303). A VPD from another
 * capture keeps its own source and age (Codex P1 on #2303).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";

// The Dashboard snapshot the page passes to each card (one read per tent at
// page level, Codex P2 at 0c19a9e0); tests set it per case.
const hook = { state: { status: "idle", snapshot: EMPTY_SNAPSHOT } as SnapshotState };

import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";
import { tentsListCanonicalVpd, tentsListDiarySnapshotRows } from "@/lib/tentsListVpdRules";
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";

const NOW = new Date("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const row = (metric: string, value: number, ts: string, source = "manual") => ({
  metric,
  value,
  ts,
  captured_at: ts,
  tent_id: "tent-1",
  source,
});
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const STORED_OLD = row("vpd_kpa", 1.3, at(24));
const FIRST = [row("temperature_c", (80 - 32) / 1.8, at(2)), row("humidity_pct", 50, at(2))];
const SECOND = [row("temperature_c", (85 - 32) / 1.8, at(1)), row("humidity_pct", 45, at(1))];

function renderStrip(rows: ReturnType<typeof row>[]) {
  render(
    <TentEnvironmentSnapshotStrip
      tentId="tent-1"
      tonightSnapshot={hook.state}
      stage="flower"
      sensorRows={rows}
      sensorStatus="success"
      now={NOW.getTime()}
      temperatureUnit="fahrenheit"
      manualCards={[]}
      manualStatus="success"
    />,
  );
  return screen.getByTestId("tents-list-metric-tent-1-vpd");
}

function renderEmptyStrip() {
  render(
    <TentEnvironmentSnapshotStrip
      tentId="tent-1"
      tonightSnapshot={hook.state}
      stage="flower"
      sensorRows={[]}
      sensorStatus="success"
      now={NOW.getTime()}
      temperatureUnit="fahrenheit"
      manualCards={[]}
      manualStatus="success"
    />,
  );
}

function dashboardVpd(
  rows: ReturnType<typeof row>[],
  snapshot: { status: "idle" | "ok"; snapshot: SensorSnapshot | null } = {
    status: "idle",
    snapshot: null,
  },
) {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot,
    now: NOW,
  }).find((metric) => metric.key === "vpd");
}

beforeEach(() => {
  hook.state = { status: "idle", snapshot: EMPTY_SNAPSHOT };
});
afterEach(cleanup);

describe("Tents list VPD matches the Dashboard (#2268)", () => {
  it("shows 1.75 kPa for 80°F/50% instead of — or the stored 1.30", () => {
    const vpd = renderStrip([STORED_OLD, ...FIRST]);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).not.toHaveTextContent("—");
    expect(vpd).not.toHaveTextContent("1.30");
  });

  it("then shows 2.26 kPa after a newer 85°F/45% reading", () => {
    const vpd = renderStrip([STORED_OLD, ...FIRST, ...SECOND]);
    expect(vpd).toHaveTextContent("2.26");
  });

  it("uses exactly the Dashboard Tonight value for both captures", () => {
    for (const rows of [
      [STORED_OLD, ...FIRST],
      [STORED_OLD, ...FIRST, ...SECOND],
    ]) {
      const tonight = dashboardVpd(rows);
      expect(tonight?.state).toBe("value");
      expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())?.kpa).toBe(tonight?.value);
    }
  });

  it("keeps a stored VPD that is the newest capture", () => {
    const vpd = renderStrip([...FIRST, row("vpd_kpa", 1.62, at(0.5))]);
    expect(vpd).toHaveTextContent("1.62");
  });

  it("prints no raw ISO timestamp anywhere in the strip", () => {
    renderStrip([STORED_OLD, ...FIRST, ...SECOND]);
    expect(screen.getByTestId("tents-list-sensor-last-updated-tent-1").textContent).not.toMatch(
      RAW_ISO,
    );
    expect(document.body.textContent).not.toMatch(RAW_ISO);
  });

  it("takes the Dashboard snapshot from the page, which reads every tent once (Codex P2 at 0c19a9e0)", () => {
    const strip = readFileSync(
      resolve(__dirname, "../components/TentEnvironmentSnapshotStrip.tsx"),
      "utf8",
    );
    const page = readFileSync(resolve(__dirname, "../pages/Tents.tsx"), "utf8");
    // No per-card hook call: the strip only renders what the page hands it.
    expect(strip).not.toMatch(/useLatestSensorSnapshot\(/);
    expect(strip).toMatch(/tonightSnapshot = IDLE_SNAPSHOT/);
    // One page-level read, keyed by tent, passed to each card.
    expect(page.match(/useLatestSensorSnapshotsByTent\(/g)).toHaveLength(1);
    expect(page).toMatch(/tonightSnapshot=\{tonightSnapshotsByTent\[t\.id\]\}/);
  });

  it("uses a newer Quick Log diary capture, as the Dashboard does (Codex P2)", () => {
    // Stored rows: a stale live pair three hours old. Diary: 80°F/50% half an hour ago.
    const stored = [
      row("temperature_c", 24, at(3), "live"),
      row("humidity_pct", 60, at(3), "live"),
    ];
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      diary_evidence_ref: { id: "quick-log-entry-1", entry_at: "2026-10-22T02:00:00.000Z" },
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    const tonight = dashboardVpd(stored, { status: "ok", snapshot: diary });
    expect(tonight?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip(stored);
    expect(vpd).toHaveTextContent("1.75");
    // Its own capture, labelled as such: manual, half an hour old, not the stale live pair's.
    expect(vpd).toHaveAttribute("data-status", "ok");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Manual/);
  });

  it("never grades an older manual VPD with a newer live capture's freshness (Codex P1)", () => {
    // Newest capture: fresh live CO2 only. The VPD comes from a manual pair 3 hours earlier.
    const rows = [
      ...FIRST.map((r) => ({ ...r, ts: at(3), captured_at: at(3) })),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    const vpd = renderStrip(rows);
    expect(vpd).toHaveTextContent("1.75");
    const label = screen.getByTestId("tents-list-metric-status-tent-1-vpd").textContent ?? "";
    expect(label).toMatch(/Manual/);
    expect(label).toMatch(/3h/);
    expect(label).not.toMatch(/Live/i);
  });

  it("grades a same-instant VPD from another source with its own provenance (Codex P1 at be0fe2f5)", () => {
    // Stored rows: a fresh live CO2-only reading. Diary: 80°F/50% at exactly the same instant.
    const t = at(0.05);
    const stored = [row("co2_ppm", 800, t, "live")];
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      diary_evidence_ref: { id: "quick-log-entry-2", entry_at: "2026-10-22T02:00:00.000Z" },
      ts: t,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd(stored, { status: "ok", snapshot: diary })?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip(stored);
    expect(vpd).toHaveTextContent("1.75");
    // A shared timestamp is not a shared capture: the manual VPD keeps its own label.
    const label = screen.getByTestId("tents-list-metric-status-tent-1-vpd").textContent ?? "";
    expect(label).toMatch(/Manual/);
    expect(label).not.toMatch(/Live/i);
  });

  it("keeps a live VPD beside an unrelated diary entry with impossible RH at the same instant (Codex P1 at fa8edcff)", () => {
    const t = at(0.05);
    const stored = [
      row("vpd_kpa", 1.2, t, "live"),
      row("temperature_c", 24, t, "live"),
      row("humidity_pct", 55, t, "live"),
    ];
    const diary = (id?: string): SensorSnapshot => ({
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: t,
      temp: 24,
      rh: 150,
      tent_id: "tent-1",
      ...(id ? { diary_evidence_ref: { id, entry_at: t } } : {}),
    });
    // A different record (its own diary entry): the live VPD stands.
    hook.state = { status: "ok", snapshot: diary("diary-entry-1") };
    let vpd = renderStrip(stored);
    expect(vpd).toHaveTextContent("1.20");
    expect(vpd).toHaveAttribute("data-status", "ok");
    cleanup();
    // Without the entry id the record is unknown: withheld, never shown as ok.
    hook.state = { status: "ok", snapshot: diary() };
    vpd = renderStrip(stored);
    expect(vpd).not.toHaveAttribute("data-status", "ok");
  });

  it("grades a calculated VPD from a diary entry by the entry, not a same-instant live cohort (Codex P1 at fa8edcff)", () => {
    // Live CO2-only cohort and a diary entry with 80°F/50% at the same instant.
    const t = at(0.05);
    hook.state = {
      status: "ok",
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "manual",
        ts: t,
        temp: (80 - 32) / 1.8,
        rh: 50,
        tent_id: "tent-1",
        diary_evidence_ref: { id: "diary-entry-9", entry_at: t },
      },
    };
    renderStrip([row("co2_ppm", 800, t, "live")]);
    const label = screen.getByTestId("tents-list-metric-status-tent-1-vpd").textContent ?? "";
    expect(label).toMatch(/Manual/);
    expect(label).not.toMatch(/Live/i);
  });

  it("shows the Dashboard's resolved capture when the raw readings read failed (Codex P2 at fa8edcff)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    const renderFailed = (state: SnapshotState) =>
      render(
        <TentEnvironmentSnapshotStrip
          tentId="tent-1"
          tonightSnapshot={state}
          stage="flower"
          sensorRows={[]}
          sensorStatus="error"
          now={NOW.getTime()}
          temperatureUnit="fahrenheit"
          manualCards={[]}
          manualStatus="success"
        />,
      );
    renderFailed({ status: "ok", snapshot: diary });
    expect(screen.getByTestId("tents-list-metric-tent-1-vpd")).toHaveTextContent("1.75");
    expect(screen.queryByTestId("tents-list-sensor-unavailable-tent-1")).toBeNull();
    cleanup();
    // Both reads failed: still unavailable.
    renderFailed({ status: "unavailable", snapshot: EMPTY_SNAPSHOT });
    expect(screen.getByTestId("tents-list-sensor-unavailable-tent-1")).toBeInTheDocument();
  });

  it("grades a generic diary-blob VPD as historical, never a healthy Manual value (Codex P1 at 4bd3fae7)", () => {
    const blob = (source: "diary" | "manual"): SensorSnapshot => ({
      ...EMPTY_SNAPSHOT,
      source,
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    });
    // Beside a newer live CO2-only cohort: the VPD is graded on its own capture.
    hook.state = { status: "ok", snapshot: blob("diary") };
    let vpd = renderStrip([row("co2_ppm", 800, at(0.05), "live")]);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).toHaveAttribute("data-status", "degraded");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(
      /Historical/,
    );
    cleanup();
    // Alone: the projected rows keep the diary source, so nothing reads ok.
    hook.state = { status: "ok", snapshot: blob("diary") };
    vpd = renderStrip([]);
    expect(vpd).not.toHaveAttribute("data-status", "ok");
    cleanup();
    // The same values from a manual envelope stay healthy Manual evidence.
    hook.state = { status: "ok", snapshot: blob("manual") };
    vpd = renderStrip([]);
    expect(vpd).toHaveAttribute("data-status", "ok");
  });

  it("backs a failed raw read with a successful sensor snapshot, keeping its own source (Codex P2 at 4bd3fae7)", () => {
    const t = at(0.05);
    const live: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: t,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
      metric_refs: {
        temp: { id: "row-temp", captured_at: t, source: "live" },
        rh: { id: "row-rh", captured_at: t, source: "live" },
      },
    };
    render(
      <TentEnvironmentSnapshotStrip
        tentId="tent-1"
        tonightSnapshot={{ status: "ok", snapshot: live }}
        stage="flower"
        sensorRows={[]}
        sensorStatus="error"
        now={NOW.getTime()}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    expect(screen.queryByTestId("tents-list-sensor-unavailable-tent-1")).toBeNull();
    const vpd = screen.getByTestId("tents-list-metric-tent-1-vpd");
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).toHaveAttribute("data-status", "ok");
    expect(screen.getByTestId("tents-list-sensor-source-tent-1")).toHaveTextContent(/Live/);
  });

  it("keeps a degraded sibling's rejection through the snapshot fallback (Codex P1 at 0994ea2a)", () => {
    const t = at(0.05);
    // The raw-row path withholds this capture: the RH beside the VPD is degraded.
    const raw = [
      row("vpd_kpa", 1.2, t, "live"),
      row("temperature_c", 24, t, "live"),
      { ...row("humidity_pct", 55, t, "live"), quality: "degraded" },
    ];
    const rawVpd = renderStrip(raw);
    expect(rawVpd).not.toHaveAttribute("data-status", "ok");
    const rawText = rawVpd.textContent;
    const rawStatus = rawVpd.getAttribute("data-status");
    cleanup();
    // The same capture as a snapshot (the degraded RH dropped by the evidence
    // filter but carried as a rejected sibling), with the raw read failed.
    const snap: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: t,
      temp: 24,
      vpd: 1.2,
      tent_id: "tent-1",
      metric_refs: {
        temp: { id: "row-temp", captured_at: t, source: "live" },
        vpd: { id: "row-vpd", captured_at: t, source: "live" },
      },
      rejected_quality_rows: [
        { metric: "humidity_pct", value: 55, captured_at: t, source: "live", quality: "degraded" },
      ],
    };
    render(
      <TentEnvironmentSnapshotStrip
        tentId="tent-1"
        tonightSnapshot={{ status: "ok", snapshot: snap }}
        stage="flower"
        sensorRows={[]}
        sensorStatus="error"
        now={NOW.getTime()}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    const vpd = screen.getByTestId("tents-list-metric-tent-1-vpd");
    // The fallback renders exactly what the raw-row path renders.
    expect(vpd).toHaveAttribute("data-status", rawStatus ?? "");
    expect(vpd.textContent).toBe(rawText);
  });

  it("marks an older live VPD stale even beside a fresh live capture (Codex P1)", () => {
    const rows = [
      row("temperature_c", (80 - 32) / 1.8, at(2), "live"),
      row("humidity_pct", 50, at(2), "live"),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "stale");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Stale/);
  });

  it("marks an older out-of-range manual VPD invalid, never current (Codex P1 at 69de43db)", () => {
    // Newest capture: fresh live CO2 only. The stored VPD an hour earlier is 4.0 kPa,
    // outside the shared realistic range (0.2–3.0), so it must read Invalid.
    const rows = [row("vpd_kpa", 4.0, at(1)), row("co2_ppm", 800, at(0.05), "live")];
    expect(dashboardVpd(rows)?.value).toBe(4.0);
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Invalid/);
  });

  it("never grades a recent CSV canonical VPD healthy beside a newer live capture (Codex P1 at d6ef3a20)", () => {
    // Newest capture: fresh live CO2 only. The VPD comes from a CSV pair 6 minutes
    // earlier: well inside the live staleness window, yet historical context only.
    const rows = [
      ...FIRST.map((r) => ({ ...r, ts: at(0.1), captured_at: at(0.1), source: "csv" })),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    expect(dashboardVpd(rows)?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip(rows);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).not.toHaveAttribute("data-status", "ok");
    expect(vpd).toHaveAttribute("data-status", "degraded");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(
      /Historical/,
    );
  });

  it("degrades a VPD Tonight derives from a same-capture CSV pair (Codex P1 at 3d1e5800)", () => {
    // Newest capture is the CSV pair itself: the canonical VPD shares its timestamp.
    const rows = FIRST.map((r) => ({ ...r, ts: at(0.1), captured_at: at(0.1), source: "csv" }));
    expect(dashboardVpd(rows)?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip(rows);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).toHaveAttribute("data-status", "degraded");
    expect(vpd).not.toHaveAttribute("data-chip", "ok");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(
      /Historical/,
    );
  });

  it("withholds a cross-capture VPD whose capture holds stuck RH 1% (Codex P1 at 4bd3fae7)", () => {
    const badAt = at(0.2);
    const rows = [
      row("temperature_c", 24, badAt, "live"),
      row("humidity_pct", 1, badAt, "live"),
      row("vpd_kpa", 1.2, badAt, "live"),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    expect(dashboardVpd(rows)).toMatchObject({ state: "value", value: 1.2 });
    expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())).toMatchObject({ rejected: true });
    const vpd = renderStrip(rows);
    expect(vpd.textContent ?? "").not.toContain("1.2");
    expect(vpd).not.toHaveAttribute("data-status", "ok");
  });

  it("withholds a cross-capture VPD whose capture has an impossible RH (Codex P1 at 3d1e5800)", () => {
    const badAt = at(0.2);
    const rows = [
      row("temperature_c", 24, badAt, "live"),
      row("humidity_pct", 150, badAt, "live"),
      row("vpd_kpa", 1.2, badAt, "live"),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    // Tonight itself still selects the direct VPD; the list must not.
    expect(dashboardVpd(rows)).toMatchObject({ state: "value", value: 1.2 });
    expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())).toMatchObject({ rejected: true });
    const vpd = renderStrip(rows);
    expect(vpd.textContent ?? "").not.toContain("1.2");
    expect(vpd).not.toHaveAttribute("data-status", "ok");
  });

  it("withholds the cohort's own stored VPD when its capture is rejected (Codex P1 at 108e3eab)", () => {
    // The rejected capture is the strip's latest cohort: no canonical override
    // can stand in, and the raw stored VPD must not read ok either.
    const at0 = at(0.1);
    const rows = [
      row("temperature_c", 24, at0, "live"),
      row("humidity_pct", 150, at0, "live"),
      row("vpd_kpa", 1.2, at0, "live"),
    ];
    expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())).toMatchObject({ rejected: true });
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Invalid/);
  });

  it("withholds the cohort's own stored VPD when a plausible sibling is quality-flagged", () => {
    const at0 = at(0.1);
    const rows = [
      { ...row("temperature_c", 24, at0, "live"), quality: "degraded" },
      row("humidity_pct", 55, at0, "live"),
      row("vpd_kpa", 1.2, at0, "live"),
    ];
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(vpd).not.toHaveAttribute("data-status", "ok");
  });

  it("withholds a cross-capture VPD whose plausible sibling is quality-flagged", () => {
    const badAt = at(0.2);
    const rows = [
      { ...row("temperature_c", 24, badAt, "live"), quality: "degraded" },
      row("vpd_kpa", 1.2, badAt, "live"),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())).toMatchObject({ rejected: true });
    expect(renderStrip(rows).textContent ?? "").not.toContain("1.2");
  });

  it("shows the Dashboard's diary-only VPD when the tent has no stored rows (Codex P2 at 69de43db)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      diary_evidence_ref: { id: "env-check-entry-1", entry_at: "2026-10-22T02:00:00.000Z" },
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip([]);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).toHaveAttribute("data-status", "ok");
    // Same capture as the strip's cohort, so the strip's source badge grades it: manual.
    expect(screen.getByTestId("tents-list-sensor-source-tent-1")).toHaveTextContent(/Manual/);
    expect(screen.queryByTestId("tents-list-sensor-empty-tent-1")).toBeNull();
  });

  it("marks a diary-only direct VPD outside the shared range invalid (Codex P1 at 85ec1e78)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      vpd: 4.0,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.value).toBe(4.0);
    const vpd = renderStrip([]);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Invalid/);
  });

  it("keeps each projected metric's own source from a mixed-source snapshot (Codex P1 at 0994ea2a)", () => {
    const ts = at(0.1);
    const mixed: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      ts,
      temp: 25,
      rh: 55,
      vpd: 1.2,
      tent_id: "tent-1",
      metric_refs: {
        temp: { id: "row-t", captured_at: ts, source: "manual" },
        vpd: { id: "row-v", captured_at: ts, source: "csv" },
      },
    };
    const rows = tentsListDiarySnapshotRows(
      { status: "ok", snapshot: mixed },
      "tent-1",
      NOW.getTime(),
    );
    const sourceOf = (metric: string) => rows.find((r) => r.metric === metric)?.source;
    expect(sourceOf("temperature_c")).toBe("manual");
    // The CSV VPD never becomes a Manual row...
    expect(sourceOf("vpd_kpa")).toBe("csv");
    // ...and a metric with no ref falls back to unverified, never healthy Manual.
    expect(sourceOf("humidity_pct")).toBe("unverified");
  });

  it("shows nothing for a diary capture stamped in the future (Codex P1 at 85ec1e78)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(-2),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).not.toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toEqual([]);
    renderEmptyStrip();
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it("uses Tonight's one-minute future skew, not the five-minute classifier (Codex P1 at 0c19a9e0)", () => {
    const ts = new Date(NOW.getTime() + 2 * 60_000).toISOString();
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    // The shared classifier still accepts a capture two minutes ahead...
    expect(classifySnapshotTimestamp(ts, NOW.getTime())).toBe("ok");
    // ...and the Dashboard withholds it, so the list must too.
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).not.toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toEqual([]);
    hook.state = { status: "ok", snapshot: diary };
    renderEmptyStrip();
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it("still shows a diary capture within Tonight's skew", () => {
    const ts = new Date(NOW.getTime() + 30_000).toISOString();
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toHaveLength(2);
  });

  it.each([
    ["loading", "tents-list-sensor-loading-tent-1", /Loading sensor data/],
    ["unavailable", "tents-list-sensor-unavailable-tent-1", /Sensor data unavailable/],
  ] as const)(
    "keeps the %s state visible instead of claiming no sensor data (Codex P2 at 85ec1e78)",
    (status, testId, copy) => {
      hook.state = { status, snapshot: EMPTY_SNAPSHOT };
      renderEmptyStrip();
      expect(screen.getByTestId(testId)).toHaveTextContent(copy);
      expect(screen.queryByTestId("tents-list-sensor-empty-tent-1")).toBeNull();
    },
  );

  it("still says no sensor data when there are no rows and no diary capture", () => {
    render(
      <TentEnvironmentSnapshotStrip
        tentId="tent-1"
        tonightSnapshot={hook.state}
        stage="flower"
        sensorRows={[]}
        sensorStatus="success"
        now={NOW.getTime()}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it.each(["invalid", "stale", "degraded"])(
    "calculates no VPD from a temperature flagged %s",
    (quality) => {
      const vpd = renderStrip([{ ...FIRST[0], quality }, FIRST[1]] as ReturnType<typeof row>[]);
      expect(vpd).toHaveAttribute("data-status", "unknown");
      expect(vpd).not.toHaveTextContent("1.75");
    },
  );
});
