/**
 * checkoutReturnTo — unit tests for the safe returnTo sanitizer.
 */
import { describe, it, expect } from "vitest";
import {
  buildCheckoutReturnNavigationState,
  classifyCheckoutReturnSurface,
  readCheckoutReturnNavigationSurface,
  sanitizeCheckoutReturnTo,
  resolveCheckoutReturnTo,
  isPhenoTrackerReturnTo,
  shouldCreateCheckoutReturnCompletionMarker,
} from "@/lib/checkoutReturnTo";

describe("sanitizeCheckoutReturnTo", () => {
  it("allows the gated Pheno Tracker workflow routes", () => {
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/new")).toBe("/pheno-hunts/new");
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/demo-id/workspace")).toBe(
      "/pheno-hunts/demo-id/workspace",
    );
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/demo-id/keepers")).toBe(
      "/pheno-hunts/demo-id/keepers",
    );
  });

  it("allows other same-origin absolute app paths", () => {
    expect(sanitizeCheckoutReturnTo("/dashboard")).toBe("/dashboard");
    expect(sanitizeCheckoutReturnTo("/grows/abc?tab=timeline")).toBe("/grows/abc?tab=timeline");
    expect(sanitizeCheckoutReturnTo("/plants/plant-123?tentId=tent-1#plant-ai-doctor-review")).toBe(
      "/plants/plant-123?tentId=tent-1#plant-ai-doctor-review",
    );
  });

  it("returns null for missing / empty / non-string values", () => {
    expect(sanitizeCheckoutReturnTo(null)).toBeNull();
    expect(sanitizeCheckoutReturnTo(undefined)).toBeNull();
    expect(sanitizeCheckoutReturnTo("")).toBeNull();
    // @ts-expect-error runtime guard
    expect(sanitizeCheckoutReturnTo(42)).toBeNull();
  });

  it("rejects fully qualified external URLs", () => {
    expect(sanitizeCheckoutReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeCheckoutReturnTo("http://evil.com/pheno-hunts/new")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeCheckoutReturnTo("//evil.com")).toBeNull();
    expect(sanitizeCheckoutReturnTo("//evil.com/pheno-hunts/new")).toBeNull();
  });

  it("rejects dangerous schemes", () => {
    expect(sanitizeCheckoutReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeCheckoutReturnTo("JAVAscript:alert(1)")).toBeNull();
    expect(sanitizeCheckoutReturnTo("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeCheckoutReturnTo("vbscript:msgbox")).toBeNull();
    expect(sanitizeCheckoutReturnTo("file:///etc/passwd")).toBeNull();
  });

  it("rejects backslash-smuggled paths", () => {
    expect(sanitizeCheckoutReturnTo("/\\evil.com")).toBeNull();
    expect(sanitizeCheckoutReturnTo("/\\/evil.com")).toBeNull();
  });

  it("rejects encoded protocol tricks", () => {
    expect(sanitizeCheckoutReturnTo("/%2F%2Fevil.com")).toBeNull();
    // Malformed percent-encoding.
    expect(sanitizeCheckoutReturnTo("/%E0%A4%A")).toBeNull();
  });

  it("rejects control characters / newline smuggling", () => {
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/new\n")).toBeNull();
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/new\r\nSet-Cookie: x")).toBeNull();
    expect(sanitizeCheckoutReturnTo("/pheno-hunts/\u0000new")).toBeNull();
  });

  it("rejects bare hostname / no leading slash", () => {
    expect(sanitizeCheckoutReturnTo("evil.com")).toBeNull();
    expect(sanitizeCheckoutReturnTo("pheno-hunts/new")).toBeNull();
  });
});

describe("resolveCheckoutReturnTo", () => {
  it("returns the sanitized path when valid", () => {
    expect(resolveCheckoutReturnTo("/pheno-hunts/new", "/")).toBe("/pheno-hunts/new");
  });

  it("returns the fallback when invalid", () => {
    expect(resolveCheckoutReturnTo("https://evil.com", "/")).toBe("/");
    expect(resolveCheckoutReturnTo(null, "/dashboard")).toBe("/dashboard");
    expect(resolveCheckoutReturnTo("//evil.com", "/")).toBe("/");
  });
});

describe("isPhenoTrackerReturnTo", () => {
  it("matches the gated Pheno Tracker workflow routes", () => {
    expect(isPhenoTrackerReturnTo("/pheno-hunts")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/new")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/new?growId=private-id")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/workspace")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/workspace?tab=overview#top")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/keepers")).toBe(true);
  });

  it("does not match unrelated or public routes", () => {
    expect(isPhenoTrackerReturnTo("/pheno-comparison")).toBe(false);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/compare")).toBe(false);
    expect(isPhenoTrackerReturnTo("/dashboard")).toBe(false);
    expect(isPhenoTrackerReturnTo(null)).toBe(false);
  });
});

describe("classifyCheckoutReturnSurface", () => {
  it("classifies AI Doctor, Pheno, and other safe destinations without returning identifiers", () => {
    expect(
      classifyCheckoutReturnSurface(
        "/plants/private-plant-id?tentId=private-tent-id#plant-ai-doctor-review",
      ),
    ).toBe("ai_doctor");
    expect(classifyCheckoutReturnSurface("/pheno-hunts")).toBe("pheno");
    expect(classifyCheckoutReturnSurface("/pheno-hunts/private-id/workspace")).toBe("pheno");
    expect(classifyCheckoutReturnSurface("/pheno-hunts/new?growId=private-id")).toBe("pheno");
    expect(classifyCheckoutReturnSurface("/dashboard?grow=private-id")).toBe("other");
  });

  it("fails closed for missing or unsafe destinations", () => {
    expect(classifyCheckoutReturnSurface(null)).toBeNull();
    expect(classifyCheckoutReturnSurface("https://evil.example/steal")).toBeNull();
    expect(classifyCheckoutReturnSurface("//evil.example/steal")).toBeNull();
  });

  it("does not mistake a lookalike plant hash for the AI Doctor return", () => {
    expect(classifyCheckoutReturnSurface("/plants/p1#plant-ai-doctor-review-copy")).toBe("other");
    expect(classifyCheckoutReturnSurface("/grows/g1#plant-ai-doctor-review")).toBe("other");
  });
});

describe("checkout return navigation state", () => {
  it("defers Pheno completion until its independently-owned gate exposes readiness", () => {
    expect(shouldCreateCheckoutReturnCompletionMarker("ai_doctor")).toBe(true);
    expect(shouldCreateCheckoutReturnCompletionMarker("other")).toBe(true);
    expect(shouldCreateCheckoutReturnCompletionMarker("pheno")).toBe(false);
    expect(shouldCreateCheckoutReturnCompletionMarker(null)).toBe(false);
  });

  it("round-trips only the closed destination surface", () => {
    const state = buildCheckoutReturnNavigationState("ai_doctor");
    expect(state).toEqual({ verdantCheckoutReturnSurface: "ai_doctor" });
    expect(readCheckoutReturnNavigationSurface(state)).toBe("ai_doctor");
    expect(JSON.stringify(state)).not.toMatch(/plant|tent|grow|session|path|query|hash/i);
  });

  it("rejects missing, malformed, and unrecognized router state", () => {
    expect(readCheckoutReturnNavigationSurface(null)).toBeNull();
    expect(readCheckoutReturnNavigationSurface([])).toBeNull();
    expect(
      readCheckoutReturnNavigationSurface({ verdantCheckoutReturnSurface: "blocked" }),
    ).toBeNull();
    expect(
      readCheckoutReturnNavigationSurface({
        verdantCheckoutReturnSurface: "/plants/private-id",
      }),
    ).toBeNull();
  });
});
