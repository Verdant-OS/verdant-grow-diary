/**
 * Dashboard operator-only guard — static safety scan.
 *
 * Slice 2 invariant: the grower Dashboard must never render operator-only
 * UI unconditionally. Components that target operator surfaces must either:
 *   (a) self-gate via useHasRole("operator") and return null otherwise, or
 *   (b) be wrapped in a guard that mounts them only for the granted state.
 *
 * Pure static-file scan — no schema, no Supabase, no UI render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

const OPERATOR_COMPONENTS = [
  {
    name: "ReleaseReadinessOperatorCard",
    sourcePath: "src/components/ReleaseReadinessOperatorCard.tsx",
  },
  {
    name: "OperatorModeCallout",
    sourcePath: "src/components/OperatorModeCallout.tsx",
  },
] as const;

describe("Dashboard · operator-only UI guard", () => {
  for (const comp of OPERATOR_COMPONENTS) {
    it(`Dashboard renders <${comp.name} /> only via a self-gated component`, () => {
      // Dashboard may reference the component, but it must not duplicate
      // role logic inline — the gating must live in the component source.
      const tag = new RegExp(`<${comp.name}\\b`);
      expect(DASHBOARD).toMatch(tag);
      const src = readFileSync(resolve(ROOT, comp.sourcePath), "utf8");
      // The component itself must check the operator role and return null
      // when not granted, so unauthorized viewers never see it.
      expect(src).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
      expect(src).toMatch(/status\s*!==\s*["']granted["']/);
      expect(src).toMatch(/return\s+null/);
    });
  }

  it("Dashboard does not render the /operator/release-readiness path inline", () => {
    // The path should be referenced only through the self-gated card.
    expect(DASHBOARD).not.toMatch(/to=\{?["']\/operator\/release-readiness["']/);
    expect(DASHBOARD).not.toMatch(/href=["']\/operator\/release-readiness["']/);
  });

  it("Dashboard does not render any /operator/* navigation links unconditionally", () => {
    expect(DASHBOARD).not.toMatch(/to=\{?["']\/operator\//);
    expect(DASHBOARD).not.toMatch(/href=["']\/operator\//);
  });

  it("Dashboard introduces no operator-only test ids inline", () => {
    expect(DASHBOARD).not.toMatch(/data-testid=["'][^"']*operator[^"']*["']/i);
  });
});
