import { describe, expect, it } from "vitest";
// @ts-expect-error - .mjs script has no types
import { resolveBaseline } from "../../scripts/verify-published-migration-integrity.mjs";

/**
 * Pins the precedence order documented in the script header:
 *   1. --baseline flag  2. VERDANT_MIGRATION_BASELINE_REF
 *   3. origin/$GITHUB_BASE_REF on pull_request events  4. fallback
 *
 * Regressions here would silently change which ref the CI gate compares
 * against, which is a money-migration integrity risk.
 */
describe("resolveBaseline", () => {
  it("prefers the explicit --baseline flag over everything else", () => {
    const r = resolveBaseline({
      explicit: "origin/feature-x",
      env: {
        VERDANT_MIGRATION_BASELINE_REF: "origin/env-ref",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "main",
      },
    });
    expect(r).toEqual({ ref: "origin/feature-x", source: "flag" });
  });

  it("uses VERDANT_MIGRATION_BASELINE_REF when the flag is absent", () => {
    const r = resolveBaseline({
      env: {
        VERDANT_MIGRATION_BASELINE_REF: "origin/env-ref",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "main",
      },
    });
    expect(r.ref).toBe("origin/env-ref");
    expect(r.source).toBe("env:VERDANT_MIGRATION_BASELINE_REF");
  });

  it("ignores VERDANT_MIGRATION_BASELINE_REF when it is whitespace-only", () => {
    const r = resolveBaseline({
      env: {
        VERDANT_MIGRATION_BASELINE_REF: "   ",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "verdant-grow-diary",
      },
    });
    expect(r).toEqual({
      ref: "origin/verdant-grow-diary",
      source: "github:pull_request(GITHUB_BASE_REF=verdant-grow-diary)",
    });
  });

  it("auto-detects origin/$GITHUB_BASE_REF on pull_request events", () => {
    const r = resolveBaseline({
      env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "main" },
    });
    expect(r.ref).toBe("origin/main");
    expect(r.source).toContain("github:pull_request");
  });

  it("auto-detects on pull_request_target too", () => {
    const r = resolveBaseline({
      env: {
        GITHUB_EVENT_NAME: "pull_request_target",
        GITHUB_BASE_REF: "release",
      },
    });
    expect(r.ref).toBe("origin/release");
    expect(r.source).toContain("pull_request_target");
  });

  it("falls back when GITHUB_EVENT_NAME is push (not a PR)", () => {
    const r = resolveBaseline({
      env: { GITHUB_EVENT_NAME: "push", GITHUB_BASE_REF: "main" },
    });
    expect(r).toEqual({ ref: "origin/verdant-grow-diary", source: "fallback" });
  });

  it("falls back when GITHUB_BASE_REF is empty on a PR event", () => {
    const r = resolveBaseline({
      env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "" },
    });
    expect(r.source).toBe("fallback");
    expect(r.ref).toBe("origin/verdant-grow-diary");
  });

  it("falls back when nothing is set", () => {
    const r = resolveBaseline({ env: {} });
    expect(r).toEqual({ ref: "origin/verdant-grow-diary", source: "fallback" });
  });

  it("trims whitespace around GITHUB_BASE_REF", () => {
    const r = resolveBaseline({
      env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "  main  " },
    });
    expect(r.ref).toBe("origin/main");
  });
});
