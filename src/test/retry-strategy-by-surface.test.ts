/**
 * Pins the canonical retry strategy map so create-dialog does not drift
 * into bridge-style full jitter, and bridge helpers stay available for ingest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CREATE_BINDING_RETRY_COOLDOWN_MS,
  CREATE_BINDING_RETRY_STRATEGY,
} from "@/lib/createDialogRetryRules";
import { fullJitterBackoffMs } from "@/lib/ecowittLiveSoilIngestRules";

const ROOT = resolve(__dirname, "../..");
const POLICY = readFileSync(resolve(ROOT, "docs/product/retry-strategy-by-surface.md"), "utf8");
const CREATE_RETRY = readFileSync(resolve(ROOT, "src/lib/createDialogRetryRules.ts"), "utf8");
const BRIDGE_DOC = readFileSync(resolve(ROOT, "docs/bridge-client-retry-guidance.md"), "utf8");

describe("retry strategy by surface", () => {
  it("create-dialog uses fixed cooldown + in-flight (not full jitter)", () => {
    expect(CREATE_BINDING_RETRY_STRATEGY).toBe("fixed_cooldown_in_flight");
    expect(CREATE_BINDING_RETRY_COOLDOWN_MS).toBe(1500);
    expect(CREATE_RETRY).toMatch(/fixed_cooldown_in_flight/);
    expect(CREATE_RETRY).not.toMatch(/fullJitterBackoffMs|2 \*\* attempt|2\*\*attempt/);
    expect(POLICY).toMatch(/Fixed 1\.5s cooldown/);
    expect(POLICY).toMatch(/Create-dialog Retry/);
  });

  it("sensor bridge policy and helper use full jitter exponential", () => {
    expect(POLICY).toMatch(/Sensor bridge ingest/);
    expect(POLICY).toMatch(/Full jitter exponential/i);
    expect(BRIDGE_DOC).toMatch(/Full Jitter exponential backoff/i);
    // Deterministic with injected random: attempt 0 → [0, base)
    const d = fullJitterBackoffMs(0, { baseMs: 500, capMs: 15_000, random: () => 0.5 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(500);
  });

  it("policy documents React Query and AI Doctor as non-bridge strategies", () => {
    expect(POLICY).toMatch(/React Query/);
    expect(POLICY).toMatch(/AI Doctor/);
    expect(POLICY).toMatch(/human one-shot|human one/i);
  });
});
