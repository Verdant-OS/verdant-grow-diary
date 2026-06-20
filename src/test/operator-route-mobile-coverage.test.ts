// Guardrail: every operator/internal route in APP_ROUTES must be listed in
// the mobile Playwright protected-route coverage so newly added operator
// pages cannot silently skip mobile auth-gate verification.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const SPEC_PATH = path.resolve(__dirname, "../../e2e/auth-route-protection-mobile.spec.ts");
const spec = fs.readFileSync(SPEC_PATH, "utf8");

function extractStringArray(src: string, name: string): string[] {
  const re = new RegExp(`const\\s+${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`, "m");
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const protectedListed = new Set(extractStringArray(spec, "PROTECTED_MOBILE_ROUTES"));
const publicListed = new Set(extractStringArray(spec, "PUBLIC_MOBILE_ROUTES"));

const operatorInternal = APP_ROUTES.filter(
  (r) => r.access === "operator" || r.access === "internal",
).map((r) => r.path);
const publicManifest = APP_ROUTES.filter(
  (r) => r.access === "public" && !["/auth", "/reset-password", "/billing/:plan", "*"].includes(r.path),
).map((r) => r.path);

describe("Mobile route-protection coverage guardrail", () => {
  it("PROTECTED_MOBILE_ROUTES contains every operator + internal route", () => {
    const missing = operatorInternal.filter((p) => !protectedListed.has(p));
    expect(missing, `Missing mobile coverage for: ${missing.join(", ")}`).toEqual([]);
  });

  it("PUBLIC_MOBILE_ROUTES covers manifest public routes (excluding /auth, /reset-password, /billing/:plan, *)", () => {
    const missing = publicManifest.filter((p) => !publicListed.has(p));
    expect(missing, `Missing public mobile coverage for: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not list operator routes in the public bucket (no cross-contamination)", () => {
    const overlap = operatorInternal.filter((p) => publicListed.has(p));
    expect(overlap).toEqual([]);
  });

  it("spec stays mocked/non-destructive — no service_role / pull_request_target / fake-live wording", () => {
    expect(spec).not.toMatch(/service_role/i);
    expect(spec).not.toMatch(/pull_request_target/);
    expect(spec).not.toMatch(/\bfake[- ]?live\b/i);
  });
});
