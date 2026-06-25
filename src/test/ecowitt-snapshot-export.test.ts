import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildEcowittSnapshotExport,
  downloadEcowittSnapshotExport,
  ecowittExportFilenameFor,
  ecowittSnapshotExportToJson,
} from "@/lib/ecowittSnapshotExport";
import { normalizeEcowittTentPayload } from "@/lib/ecowittTentNormalizerRouter";
import { loadEcowittEvidenceSample } from "@/lib/ecowittLocalEvidence";

const NOW = new Date("2026-06-16T12:00:00.000Z");

function snap(tentKey: "flower" | "seedling" | "vegetation", sampleKey: Parameters<typeof loadEcowittEvidenceSample>[0]) {
  const loaded = loadEcowittEvidenceSample(sampleKey, { now: NOW });
  return normalizeEcowittTentPayload(loaded.sample.payload, tentKey, {
    now: NOW,
    captured_at_ms: loaded.captured_at_ms,
  });
}

describe("EcoWitt snapshot export", () => {
  it("filenames are deterministic per tent", () => {
    expect(ecowittExportFilenameFor("flower")).toBe("verdant-ecowitt-flower-tent-snapshot.json");
    expect(ecowittExportFilenameFor("seedling")).toBe("verdant-ecowitt-seedling-tent-snapshot.json");
    expect(ecowittExportFilenameFor("vegetation")).toBe("verdant-ecowitt-vegetation-tent-snapshot.json");
  });

  it.each(["flower", "seedling", "vegetation"] as const)(
    "exports current %s snapshot as redacted JSON with read_only=true",
    (tentKey) => {
      const s = snap(tentKey, "valid");
      const payload = buildEcowittSnapshotExport(s, {
        evidence_source_label: "sample",
        now: NOW,
      });
      expect(payload.read_only).toBe(true);
      expect(payload.provider).toBe("ecowitt");
      expect(payload.exported_at).toBe(NOW.toISOString());
      expect(payload.tent_label).toBe(s.tent_label);
      expect(payload.channel_map).toBeTruthy();
      expect(payload).not.toHaveProperty("raw_payload");
    },
  );

  it("export JSON excludes raw private fields", () => {
    const s = snap("flower", "valid");
    const payload = buildEcowittSnapshotExport(s, {
      evidence_source_label: "sample",
      now: NOW,
    });
    const json = ecowittSnapshotExportToJson(payload).toLowerCase();
    for (const banned of [
      "passkey",
      "token",
      "password",
      "station",
      "secret",
      "private_ip",
      "remote_ip",
      "client_ip",
      '"mac"',
      "raw_payload",
    ]) {
      expect(json.includes(banned)).toBe(false);
    }
  });

  it("is deterministic when now is injected", () => {
    const s = snap("flower", "valid");
    const a = buildEcowittSnapshotExport(s, { evidence_source_label: "sample", now: NOW });
    const b = buildEcowittSnapshotExport(s, { evidence_source_label: "sample", now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("download triggers a client-side download only (no network)", () => {
    const s = snap("flower", "valid");
    const payload = buildEcowittSnapshotExport(s, {
      evidence_source_label: "sample",
      now: NOW,
    });

    // jsdom doesn't implement URL.createObjectURL by default — stub it.
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;


    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted during export");
    });

    downloadEcowittSnapshotExport("flower", payload);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
