import { describe, it, expect, vi } from "vitest";
import {
  buildEcowittIngestDryRunMetricsCsv,
  csvEscape,
  downloadEcowittIngestDryRunMetricsCsv,
  ecowittDryRunMetricsCsvFilename,
  ECOWITT_DRY_RUN_CSV_HEADERS,
} from "@/lib/ecowittIngestDryRunCsv";
import { buildEcowittDryRunStatusExplanation } from "@/lib/ecowittIngestDryRunStatus";
import { buildEcowittIngestDryRun } from "@/lib/ecowittIngestDryRun";
import { normalizeEcowittTentPayload } from "@/lib/ecowittTentNormalizerRouter";
import { loadEcowittEvidenceSample } from "@/lib/ecowittLocalEvidence";

const NOW = new Date("2026-06-16T12:00:00.000Z");
const REAL_UUID = "11111111-2222-4333-8444-555555555555";

function snap(
  tentKey: "flower" | "seedling" | "vegetation",
  sampleKey: Parameters<typeof loadEcowittEvidenceSample>[0],
) {
  const loaded = loadEcowittEvidenceSample(sampleKey, { now: NOW });
  return normalizeEcowittTentPayload(loaded.sample.payload, tentKey, {
    now: NOW,
    captured_at_ms: loaded.captured_at_ms,
  });
}

describe("EcoWitt dry-run CSV export", () => {
  it("csvEscape handles commas, quotes, and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(42)).toBe("42");
  });

  it("includes deterministic headers", () => {
    const csv = buildEcowittIngestDryRunMetricsCsv(snap("flower", "valid"), {
      tent_id: REAL_UUID,
      device_identity: "device-1",
    });
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe(ECOWITT_DRY_RUN_CSV_HEADERS.join(","));
  });

  it("includes not_sent and read_only columns set true on every row", () => {
    const csv = buildEcowittIngestDryRunMetricsCsv(snap("flower", "valid"));
    const lines = csv.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      // last two cols
      expect(cells[cells.length - 2]).toBe("true");
      expect(cells[cells.length - 1]).toBe("true");
    }
  });

  it("includes required metric status (air_temp_f, humidity_pct)", () => {
    const csv = buildEcowittIngestDryRunMetricsCsv(snap("flower", "valid"));
    expect(csv).toMatch(/\bair_temp_f\b/);
    expect(csv).toMatch(/\bhumidity_pct\b/);
    // The `required` column is 'true' for these
    const lines = csv.split("\n");
    const air = lines.find((l) => l.startsWith("air_temp_f,"))!;
    expect(air.split(",")[4]).toBe("true");
  });

  it("includes blocked/warning status column", () => {
    const base = snap("flower", "valid");
    const mutated = { ...base, metrics: { ...base.metrics, air_temp_f: null } };
    const csv = buildEcowittIngestDryRunMetricsCsv(mutated);
    const lines = csv.split("\n");
    const air = lines.find((l) => l.startsWith("air_temp_f,"))!;
    expect(air).toMatch(/blocking/);
  });

  it("filename is deterministic per snapshot", () => {
    const a = ecowittDryRunMetricsCsvFilename(snap("flower", "valid"));
    const b = ecowittDryRunMetricsCsvFilename(snap("flower", "valid"));
    expect(a).toBe(b);
    expect(a).toMatch(/^ecowitt-dry-run-metrics-.*\.csv$/);
  });

  it("download triggers client-side download only (no fetch)", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted");
    });

    downloadEcowittIngestDryRunMetricsCsv(snap("flower", "valid"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("EcoWitt dry-run status explanation", () => {
  it("shows blockers when can_send_later=false", () => {
    const s = snap("seedling", "invalid");
    const dry = buildEcowittIngestDryRun(s);
    const exp = buildEcowittDryRunStatusExplanation(s, dry);
    expect(exp.state).toBe("blocked");
    expect(exp.can_send_later).toBe(false);
    expect(exp.blockers.length).toBeGreaterThan(0);
    expect(exp.pass_reasons.length).toBe(0);
    for (const b of exp.blockers) {
      expect(b.explanation.length).toBeGreaterThan(0);
    }
  });

  it("shows pass reasons when can_send_later=true", () => {
    const s = snap("flower", "valid");
    const dry = buildEcowittIngestDryRun(s, {
      tent_id: REAL_UUID,
      device_identity: "device-1",
    });
    const exp = buildEcowittDryRunStatusExplanation(s, dry);
    expect(exp.state).toBe("pass");
    expect(exp.can_send_later).toBe(true);
    expect(exp.blockers.length).toBe(0);
    const triggers = exp.pass_reasons.map((p) => p.trigger);
    expect(triggers).toContain("required_metric_present:air_temp_f");
    expect(triggers).toContain("required_metric_present:humidity_pct");
    expect(triggers).toContain("source_not_invalid");
    expect(triggers).toContain("snapshot_not_stale");
    expect(triggers).toContain("no_invalid_reasons");
    expect(triggers).toContain("no_blocking_identity_rule");
  });

  it("is deterministic given identical inputs", () => {
    const s = snap("flower", "valid");
    const dry = buildEcowittIngestDryRun(s);
    expect(JSON.stringify(buildEcowittDryRunStatusExplanation(s, dry))).toBe(
      JSON.stringify(buildEcowittDryRunStatusExplanation(s, dry)),
    );
  });
});
