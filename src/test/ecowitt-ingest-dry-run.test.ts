import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildEcowittIngestDryRun,
  downloadEcowittIngestDryRun,
  ecowittDryRunFilenameFor,
  ecowittDryRunToJson,
  ECOWITT_DRY_RUN_NOTICE,
  ECOWITT_DRY_RUN_TENT_PLACEHOLDER,
} from "@/lib/ecowittIngestDryRun";
import { normalizeEcowittTentPayload } from "@/lib/ecowittTentNormalizerRouter";
import { loadEcowittEvidenceSample } from "@/lib/ecowittLocalEvidence";

const NOW = new Date("2026-06-16T12:00:00.000Z");

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

describe("EcoWitt ingest dry-run", () => {
  it("valid Flower snapshot → can_send_later true, payload marked not_sent + read_only", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"));
    expect(r.can_send_later).toBe(true);
    expect(r.blocked_reasons).toEqual([]);
    expect(r.read_only).toBe(true);
    expect(r.not_sent).toBe(true);
    expect(r.dry_run_payload.read_only).toBe(true);
    expect(r.dry_run_payload.not_sent).toBe(true);
    expect(r.dry_run_payload.metadata.read_only_preview).toBe(true);
    expect(r.dry_run_payload.metadata.not_sent).toBe(true);
    expect(r.dry_run_payload.tent_id).toBe(ECOWITT_DRY_RUN_TENT_PLACEHOLDER);
    expect(r.dry_run_payload.provider).toBe("ecowitt");
  });

  it("invalid snapshot → can_send_later false with blocked reasons", () => {
    const r = buildEcowittIngestDryRun(snap("seedling", "invalid"));
    expect(r.can_send_later).toBe(false);
    expect(r.blocked_reasons.length).toBeGreaterThan(0);
    expect(r.blocked_reasons.some((b) => /invalid|missing_required/.test(b))).toBe(true);
  });

  it("degraded snapshot surfaces warnings", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "degraded"));
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("is_stale=true blocks send and warns", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"), { is_stale: true });
    expect(r.can_send_later).toBe(false);
    expect(r.blocked_reasons).toContain("stale_evidence");
    expect(r.warnings.some((w) => /stale/.test(w))).toBe(true);
  });

  it("payload excludes raw payload and private fields", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"));
    const json = ecowittDryRunToJson(r).toLowerCase();
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
      "authorization",
      "idempotency",
      "service_role",
      "bridge_token",
    ]) {
      expect(json.includes(banned)).toBe(false);
    }
  });

  it("filenames are deterministic per tent", () => {
    expect(ecowittDryRunFilenameFor("flower")).toBe(
      "verdant-ecowitt-flower-tent-ingest-dry-run.json",
    );
    expect(ecowittDryRunFilenameFor("seedling")).toBe(
      "verdant-ecowitt-seedling-tent-ingest-dry-run.json",
    );
    expect(ecowittDryRunFilenameFor("vegetation")).toBe(
      "verdant-ecowitt-vegetation-tent-ingest-dry-run.json",
    );
  });

  it("is deterministic with the same snapshot input", () => {
    const s = snap("flower", "valid");
    const a = buildEcowittIngestDryRun(s);
    const b = buildEcowittIngestDryRun(s);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("notice copy is the canonical dry-run notice", () => {
    expect(ECOWITT_DRY_RUN_NOTICE).toBe("Dry run only. Nothing has been sent.");
  });

  afterEach(() => vi.restoreAllMocks());

  it("download triggers a client-side download only (no network)", () => {
    const r = buildEcowittIngestDryRun(snap("flower", "valid"));
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
      throw new Error("network call attempted during dry-run export");
    });

    downloadEcowittIngestDryRun("flower", r);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
