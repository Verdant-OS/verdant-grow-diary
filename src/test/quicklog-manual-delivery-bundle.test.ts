import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadManualDeliverySql } from "../../scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs";
import { prepareManualDeliveryBundle } from "../../scripts/prepare-quicklog-manual-delivery-bundle.mjs";
import {
  buildManualDeliveryBundle,
  MANUAL_DELIVERY_FILES,
  MANUAL_DELIVERY_ORDER,
} from "../../scripts/lib/quicklogManualDeliveryOrder.mjs";

const candidateSha = "a".repeat(40);
const sources = loadManualDeliverySql();

describe("pinned manual delivery bundle", () => {
  it("contains all three guarded scripts in order, with reproducible hashes", () => {
    const bundle = buildManualDeliveryBundle({ candidateSha, sources });
    expect(bundle.manifest.order).toEqual(MANUAL_DELIVERY_ORDER);
    expect(bundle.manifest.candidate_sha).toBe(candidateSha);
    expect(bundle.manifest.production_authorization).toBe(false);
    expect(bundle.manifest.requires_protected_delivery).toBe(true);
    expect(bundle.steps.map((step) => step.file)).toEqual(MANUAL_DELIVERY_FILES.map((p) => p.file));
    for (const step of bundle.steps) {
      expect(createHash("sha256").update(step.sql).digest("hex")).toBe(step.guarded_sha256);
      expect(step.sql).toContain("pg_catalog.pg_try_advisory_xact_lock(20260929, 183000)");
      expect(Object.isFrozen(step)).toBe(true);
    }
    expect(Object.isFrozen(bundle.steps)).toBe(true);
    expect(Object.isFrozen(bundle.manifest.steps)).toBe(true);
    expect(buildManualDeliveryBundle({ candidateSha, sources })).toEqual(bundle);
  });

  it.each([
    undefined,
    null,
    {},
    { candidateSha, sources: null },
    { candidateSha, sources: [] },
    { candidateSha: "unknown", sources },
    { candidateSha: "A".repeat(40), sources },
  ])("rejects malformed input %j", (input) => {
    expect(() => buildManualDeliveryBundle(input)).toThrow("delivery_bundle_input_rejected");
  });

  it("rejects reverse order and an altered last migration before any output is written", () => {
    for (const invalid of [
      [...sources].reverse(),
      [sources[0], sources[1], `${sources[2]}-- changed\n`],
    ]) {
      const mkdir = vi.fn();
      const write = vi.fn();
      let readIndex = 0;
      const git = vi.fn((args: string[]) =>
        args[0] === "rev-parse" ? candidateSha : invalid[readIndex++],
      );
      expect(() =>
        prepareManualDeliveryBundle({ candidateSha, outputDir: "proof", git, mkdir, write }),
      ).toThrow("migration_fingerprint_mismatch");
      expect(mkdir).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("refuses a different checkout without reading migration content or writing files", () => {
    const git = vi.fn(() => "b".repeat(40));
    const write = vi.fn();
    expect(() =>
      prepareManualDeliveryBundle({ candidateSha, outputDir: "proof", git, write }),
    ).toThrow("delivery_bundle_checkout_mismatch");
    expect(git).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes only the three scripts and matching manifest from committed source", () => {
    let readIndex = 0;
    const git = vi.fn((args: string[]) =>
      args[0] === "rev-parse" ? candidateSha : sources[readIndex++],
    );
    const mkdir = vi.fn();
    const write = vi.fn();
    const manifest = prepareManualDeliveryBundle({
      candidateSha,
      outputDir: "proof",
      git,
      mkdir,
      write,
    });
    expect(git.mock.calls.slice(1).map(([args]) => args)).toEqual(
      MANUAL_DELIVERY_FILES.map(({ file }) => ["show", `HEAD:supabase/migrations/${file}`]),
    );
    expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: false });
    expect(write).toHaveBeenCalledTimes(4);
    expect(JSON.parse(write.mock.calls[3][1])).toEqual(manifest);
    for (const call of write.mock.calls) expect(call[2]).toEqual({ encoding: "utf8", flag: "wx" });
  });
});
