import { describe, it, expect } from "vitest";
import { buildEcowittEvidenceHistoryViewModel } from "@/lib/ecowittEvidenceHistoryViewModel";
import { buildEcowittEvidenceHistory } from "@/lib/ecowittEvidenceHistory";

const NOW = new Date("2026-06-16T12:00:00.000Z");

describe("EcoWitt evidence history view model", () => {
  it("builds rows for Flower / Seedling / Vegetation from bundled samples", () => {
    for (const tentKey of ["flower", "seedling", "vegetation"] as const) {
      const vm = buildEcowittEvidenceHistoryViewModel({ tentKey, now: NOW });
      expect(vm.tent_key).toBe(tentKey);
      expect(vm.rows.length).toBeGreaterThan(0);
      for (const r of vm.rows) {
        expect(r.tent_key).toBe(tentKey);
        expect(["LIVE", "DEGRADED", "INVALID"]).toContain(r.source_label);
      }
    }
  });

  it("sorts newest-first deterministically", () => {
    const vm = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    const ts = vm.rows.map((r) => Date.parse(r.captured_at));
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i]);
    }
  });

  it("stale badge only appears for stale samples", () => {
    const vm = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    const stale = vm.rows.filter((r) => r.is_stale).map((r) => r.sample_key).sort();
    expect(stale).toEqual(["degraded", "just-stale"]);
    const justFresh = vm.rows.find((r) => r.sample_key === "just-fresh")!;
    expect(justFresh.is_stale).toBe(false);
  });

  it("degraded / invalid reason counts surface on rows", () => {
    const vm = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    const invalid = vm.rows.find((r) => r.sample_key === "invalid")!;
    expect(invalid.invalid_reason_count).toBeGreaterThan(0);
    const degraded = vm.rows.find((r) => r.sample_key === "degraded")!;
    expect(degraded.degraded_reason_count).toBeGreaterThan(0);
  });

  it("identical inputs produce identical view model output", () => {
    const a = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    const b = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("Lung Room is never used as a tent source", () => {
    const vm = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    for (const r of vm.rows) {
      expect(r.tent_label.toLowerCase()).not.toContain("lung");
    }
    // Router safety: unknown tent key produces an invalid snapshot.
    const lung = buildEcowittEvidenceHistory({
      // @ts-expect-error — intentionally unsupported
      tentKey: "lung",
      now: NOW,
    });
    expect(lung.length).toBe(0);
  });

  it("never renders private fields anywhere in the view model JSON", () => {
    const vm = buildEcowittEvidenceHistoryViewModel({ tentKey: "flower", now: NOW });
    const json = JSON.stringify(vm).toLowerCase();
    for (const banned of [
      "passkey",
      '"mac"',
      "token",
      "password",
      "station",
      "private_ip",
      "remote_ip",
      "client_ip",
      "secret",
    ]) {
      expect(json.includes(banned)).toBe(false);
    }
  });
});
