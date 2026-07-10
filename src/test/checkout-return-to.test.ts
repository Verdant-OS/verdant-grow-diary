/**
 * checkoutReturnTo — unit tests for the safe returnTo sanitizer.
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeCheckoutReturnTo,
  resolveCheckoutReturnTo,
  isPhenoTrackerReturnTo,
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
    expect(sanitizeCheckoutReturnTo("/grows/abc?tab=timeline")).toBe(
      "/grows/abc?tab=timeline",
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
    expect(isPhenoTrackerReturnTo("/pheno-hunts/new")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/workspace")).toBe(true);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/keepers")).toBe(true);
  });

  it("does not match unrelated or public routes", () => {
    expect(isPhenoTrackerReturnTo("/pheno-comparison")).toBe(false);
    expect(isPhenoTrackerReturnTo("/pheno-hunts/abc/compare")).toBe(false);
    expect(isPhenoTrackerReturnTo("/dashboard")).toBe(false);
    expect(isPhenoTrackerReturnTo(null)).toBe(false);
  });
});
