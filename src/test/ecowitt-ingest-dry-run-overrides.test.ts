import { describe, it, expect, vi } from "vitest";
import {
  buildEcowittIngestDryRun,
  buildEcowittIngestDryRunExportFilesForTents,
  downloadEcowittIngestDryRunAllTents,
  ECOWITT_DRY_RUN_TENT_PLACEHOLDER,
  ecowittDryRunFilenameFor,
  isPlaceholderTentId,
} from "@/lib/ecowittIngestDryRun";
import { buildEcowittIngestDryRunFieldMap } from "@/lib/ecowittIngestDryRunFieldMap";
import {
  normalizeEcowittTentPayload,
  SUPPORTED_TENT_KEYS,
} from "@/lib/ecowittTentNormalizerRouter";
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

describe("EcoWitt ingest dry-run — overrides + sensor truth taxonomy", () => {
  it("override tent_id appears in payload", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), {
      tent_id: REAL_UUID,
      device_identity: "preview-device-A",
    });
    expect(r.dry_run_payload.tent_id).toBe(REAL_UUID);
    expect(r.dry_run_payload.metadata.device_identity).toBe("preview-device-A");
  });

  it("blank optional identity fields serialize as null", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), {
      tent_id: REAL_UUID,
      plant_id: "  ",
      device_identity: "",
      source_identity: undefined,
    });
    expect(r.dry_run_payload.plant_id).toBeNull();
    expect(r.dry_run_payload.metadata.device_identity).toBeNull();
    expect(r.dry_run_payload.source_identity).toBeNull();
  });

  it("placeholder tent_id surfaces warning by default", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"));
    expect(r.warnings).toContain("non_uuid_tent_id_preview_only");
    expect(r.can_send_later).toBe(true);
  });

  it("placeholder tent_id blocks when require_real_tent_id=true", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), {
      require_real_tent_id: true,
      device_identity: "x",
    });
    expect(r.blocked_reasons).toContain("non_uuid_tent_id_preview_only");
    expect(r.can_send_later).toBe(false);
  });

  it("real UUID tent_id does not trigger placeholder warning", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), {
      tent_id: REAL_UUID,
      device_identity: "device-1",
    });
    expect(r.warnings).not.toContain("non_uuid_tent_id_preview_only");
    expect(r.warnings).not.toContain("placeholder_device_identity");
  });

  it("missing device_identity surfaces warning", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), {
      tent_id: REAL_UUID,
    });
    expect(r.warnings).toContain("placeholder_device_identity");
  });

  it("missing required air_temp blocks send", () => {
    const base = snap("flower", "valid");
    const mutated = {
      ...base,
      metrics: { ...base.metrics, air_temp_f: null },
    };
    const r = buildEcowittIngestDryRun(mutated);
    expect(r.blocked_reasons).toContain("missing_required_metric:air_temp_f");
    expect(r.can_send_later).toBe(false);
  });

  it("missing required humidity blocks send", () => {
    const base = snap("flower", "valid");
    const mutated = {
      ...base,
      metrics: { ...base.metrics, humidity_pct: null },
    };
    const r = buildEcowittIngestDryRun(mutated);
    expect(r.blocked_reasons).toContain("missing_required_metric:humidity_pct");
    expect(r.can_send_later).toBe(false);
  });

  it("invalid source blocks with source_invalid", () => {
    const r = buildEcowittIngestDryRun(snap("seedling", "invalid"));
    expect(r.blocked_reasons.some((b) => b === "source_invalid")).toBe(true);
  });

  it("degraded source surfaces source_degraded warning and degraded_reason:* triggers", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "degraded"));
    expect(r.warnings).toContain("source_degraded");
    expect(r.warnings.some((w) => /^degraded_reason:/.test(w))).toBe(true);
  });

  it("isPlaceholderTentId helper", () => {
    expect(isPlaceholderTentId(null)).toBe(true);
    expect(isPlaceholderTentId("")).toBe(true);
    expect(isPlaceholderTentId(ECOWITT_DRY_RUN_TENT_PLACEHOLDER)).toBe(true);
    expect(isPlaceholderTentId("not-a-uuid")).toBe(true);
    expect(isPlaceholderTentId(REAL_UUID)).toBe(false);
  });
});

describe("EcoWitt ingest dry-run — canonical field map", () => {
  it("shows required air temp and humidity as mapped when present", () => {
    const map = buildEcowittIngestDryRunFieldMap(snap("flower", "valid"));
    const air = map.find((r) => r.ingest_key === "air_temp_f")!;
    const rh = map.find((r) => r.ingest_key === "humidity_pct")!;
    expect(air.status).toBe("mapped");
    expect(air.required).toBe(true);
    expect(rh.status).toBe("mapped");
    expect(rh.required).toBe(true);
  });

  it("shows missing required metrics as missing_required", () => {
    const base = snap("flower", "valid");
    const mutated = {
      ...base,
      metrics: { ...base.metrics, air_temp_f: null, humidity_pct: null },
    };
    const map = buildEcowittIngestDryRunFieldMap(mutated);
    expect(map.find((r) => r.ingest_key === "air_temp_f")!.status).toBe(
      "missing_required",
    );
    expect(map.find((r) => r.ingest_key === "humidity_pct")!.status).toBe(
      "missing_required",
    );
  });

  it("shows optional metrics missing as missing_optional", () => {
    const base = snap("flower", "valid");
    const mutated = {
      ...base,
      metrics: { ...base.metrics, soil_temp_f: null },
    };
    const map = buildEcowittIngestDryRunFieldMap(mutated);
    expect(map.find((r) => r.ingest_key === "soil_temp_f")!.status).toBe(
      "missing_optional",
    );
  });

  it("is deterministic given the same snapshot", () => {
    const s = snap("flower", "valid");
    expect(JSON.stringify(buildEcowittIngestDryRunFieldMap(s))).toBe(
      JSON.stringify(buildEcowittIngestDryRunFieldMap(s)),
    );
  });
});

describe("EcoWitt ingest dry-run — all-tent export", () => {
  function inputs() {
    return SUPPORTED_TENT_KEYS.map((k) => ({
      tentKey: k,
      snapshot: snap(k, "valid"),
      options: { device_identity: "device-1" },
    }));
  }

  it("returns one deterministic descriptor per tent", () => {
    const files = buildEcowittIngestDryRunExportFilesForTents(inputs());
    expect(files.length).toBe(SUPPORTED_TENT_KEYS.length);
    expect(files.map((f) => f.tentKey)).toEqual([...SUPPORTED_TENT_KEYS]);
  });

  it("filenames are stable per tent", () => {
    const files = buildEcowittIngestDryRunExportFilesForTents(inputs());
    for (const f of files) {
      expect(f.filename).toBe(ecowittDryRunFilenameFor(f.tentKey));
    }
  });

  it("all payloads include not_sent and read_only", () => {
    const files = buildEcowittIngestDryRunExportFilesForTents(inputs());
    for (const f of files) {
      expect(f.payload.not_sent).toBe(true);
      expect(f.payload.read_only).toBe(true);
      expect(f.payload.metadata.not_sent).toBe(true);
      expect(f.payload.metadata.read_only_preview).toBe(true);
    }
  });

  it("export is deterministic", () => {
    const a = buildEcowittIngestDryRunExportFilesForTents(inputs());
    const b = buildEcowittIngestDryRunExportFilesForTents(inputs());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate selected dry-run state when exporting", () => {
    const list = inputs();
    const beforeSnap = JSON.stringify(list[0].snapshot);
    buildEcowittIngestDryRunExportFilesForTents(list);
    expect(JSON.stringify(list[0].snapshot)).toBe(beforeSnap);
  });

  it("downloadEcowittIngestDryRunAllTents triggers per-tent client downloads only", () => {
    const files = buildEcowittIngestDryRunExportFilesForTents(inputs());
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted");
    });

    downloadEcowittIngestDryRunAllTents(files);

    expect(createObjectURL).toHaveBeenCalledTimes(files.length);
    expect(clickSpy).toHaveBeenCalledTimes(files.length);
    expect(revokeObjectURL).toHaveBeenCalledTimes(files.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
