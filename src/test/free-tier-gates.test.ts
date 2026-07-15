/**
 * freeTierGates — pure unit tests + static wiring contracts.
 *
 * The pricing page's plan differentiators (Free: 1 active grow, single
 * tent; Pro: unlimited/multi-tent) were defined in capabilities but never
 * read. These tests pin the gate rules — including the fail-open posture
 * that protects paying growers from resolver hiccups — and the two
 * creation-seam wire-ups.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateGrowCreationGate,
  evaluateTentCreationGate,
  sensorHistoryWindowStartIso,
  FREE_GROW_LIMIT_BLOCKED_COPY,
  FREE_TENT_LIMIT_BLOCKED_COPY,
  FREE_TIER_UPGRADE_PATH,
} from "@/lib/entitlements/freeTierGates";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { Capabilities } from "@/lib/entitlements/types";

const PRO = PLAN_CATALOG.pro_monthly;

describe("evaluateGrowCreationGate", () => {
  it("free with 0 active grows → allowed", () => {
    const r = evaluateGrowCreationGate(FREE_CAPABILITIES, 0);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(1);
  });

  it("free with 1 active grow → blocked with honest copy", () => {
    const r = evaluateGrowCreationGate(FREE_CAPABILITIES, 1);
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(1);
    expect(r.blockedCopy).toBe(FREE_GROW_LIMIT_BLOCKED_COPY);
  });

  it("free already OVER the limit → still blocked for NEW, never negative", () => {
    const r = evaluateGrowCreationGate(FREE_CAPABILITIES, 3);
    expect(r.allowed).toBe(false);
  });

  it("pro/founder (maxActiveGrows null) → always allowed", () => {
    expect(evaluateGrowCreationGate(PRO, 0).allowed).toBe(true);
    expect(evaluateGrowCreationGate(PRO, 50).allowed).toBe(true);
    expect(evaluateGrowCreationGate(PLAN_CATALOG.founder_lifetime, 50).allowed).toBe(true);
  });

  it("FAILS OPEN while entitlements are loading (null/undefined caps)", () => {
    expect(evaluateGrowCreationGate(null, 99).allowed).toBe(true);
    expect(evaluateGrowCreationGate(undefined, 99).allowed).toBe(true);
  });

  it("fails open on a nonsensical limit rather than locking a grower out", () => {
    const weird = { ...FREE_CAPABILITIES, maxActiveGrows: Number.NaN } as Capabilities;
    expect(evaluateGrowCreationGate(weird, 99).allowed).toBe(true);
  });
});

describe("evaluateTentCreationGate", () => {
  it("free (multiTent=false) with 0 tents → allowed, limit 1", () => {
    const r = evaluateTentCreationGate(FREE_CAPABILITIES, 0);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(1);
  });

  it("free with 1 tent → blocked with honest copy", () => {
    const r = evaluateTentCreationGate(FREE_CAPABILITIES, 1);
    expect(r.allowed).toBe(false);
    expect(r.blockedCopy).toBe(FREE_TENT_LIMIT_BLOCKED_COPY);
  });

  it("multiTent plans → always allowed", () => {
    expect(evaluateTentCreationGate(PRO, 10).allowed).toBe(true);
  });

  it("fails open while entitlements are loading", () => {
    expect(evaluateTentCreationGate(null, 10).allowed).toBe(true);
  });
});

describe("sensorHistoryWindowStartIso", () => {
  const NOW = new Date("2026-07-15T12:00:00.000Z");

  it("free (90 days) → ISO exactly 90 days back", () => {
    expect(sensorHistoryWindowStartIso(FREE_CAPABILITIES, NOW)).toBe(
      "2026-04-16T12:00:00.000Z",
    );
  });

  it("pro (null) → unbounded", () => {
    expect(sensorHistoryWindowStartIso(PRO, NOW)).toBeNull();
  });

  it("loading/unknown caps → unbounded (fail open)", () => {
    expect(sensorHistoryWindowStartIso(null, NOW)).toBeNull();
  });
});

describe("blocked copy honesty", () => {
  it("names the real limits and points at the real upgrade path", () => {
    expect(FREE_GROW_LIMIT_BLOCKED_COPY).toContain("1 active grow");
    expect(FREE_TENT_LIMIT_BLOCKED_COPY).toContain("single tent");
    expect(FREE_TIER_UPGRADE_PATH).toBe("/pricing");
    // Never scare copy, never fake urgency.
    for (const copy of [FREE_GROW_LIMIT_BLOCKED_COPY, FREE_TENT_LIMIT_BLOCKED_COPY]) {
      expect(copy.toLowerCase()).not.toMatch(/only today|last chance|expires/);
    }
  });
});

describe("static wiring — the gates are actually read at the creation seams", () => {
  const ROOT = resolve(__dirname, "../..");
  const GROWS = readFileSync(resolve(ROOT, "src/pages/Grows.tsx"), "utf8");
  const TENT_DIALOG = readFileSync(
    resolve(ROOT, "src/components/CreateTentDialog.tsx"),
    "utf8",
  );

  it("Grows.tsx evaluates the grow gate, guards create(), and gates the CTA", () => {
    expect(GROWS).toMatch(/evaluateGrowCreationGate\(/);
    expect(GROWS).toMatch(/if \(!growGate\.allowed\)/);
    expect(GROWS).toMatch(/disabled=\{!growGate\.allowed\}/);
    expect(GROWS).toMatch(/grow-create-gate-notice/);
  });

  it("CreateTentDialog evaluates the tent gate, guards submit(), and gates the CTA", () => {
    expect(TENT_DIALOG).toMatch(/evaluateTentCreationGate\(/);
    expect(TENT_DIALOG).toMatch(/if \(!tentGate\.allowed\)/);
    expect(TENT_DIALOG).toMatch(/disabled=\{busy \|\| !tentGate\.allowed\}/);
    expect(TENT_DIALOG).toMatch(/tent-create-gate-notice/);
  });

  it("both seams fail open on loading entitlements", () => {
    expect(GROWS).toMatch(/entLoading \? null : entitlement\.capabilities/);
    expect(TENT_DIALOG).toMatch(/entLoading \? null : entitlement\.capabilities/);
  });

  it("the gate module itself stays pure — no React, Supabase, or clock reads", () => {
    const MODULE = readFileSync(
      resolve(ROOT, "src/lib/entitlements/freeTierGates.ts"),
      "utf8",
    );
    expect(MODULE).not.toMatch(/from "react"|supabase|fetch\(|Date\.now\(\)|new Date\(\)/);
    expect(MODULE).not.toMatch(/service_role/);
  });
});
