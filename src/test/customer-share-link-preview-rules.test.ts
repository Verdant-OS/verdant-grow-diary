/**
 * Customer share-link preview — pure rules tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildCustomerShareAbsoluteUrl,
  buildCustomerSharePreview,
  CUSTOMER_SHARE_LINK_BASE_PATH,
  CUSTOMER_SHARE_LINK_PREVIEW_DISCLAIMER,
  CUSTOMER_SHARE_LINK_PUBLIC_ONLY_COPY,
  normalizeShareIdInput,
} from "@/lib/customerShareLinkPreviewRules";

describe("normalizeShareIdInput", () => {
  it("trims whitespace and keeps safe chars", () => {
    expect(normalizeShareIdInput("  share-abc_123 ")).toBe("share-abc_123");
  });

  it("strips path separators, hash, and query chars", () => {
    expect(normalizeShareIdInput("ab/cd\\ef?g#h")).toBe("abcdefgh");
  });

  it("strips internal whitespace and control chars", () => {
    expect(normalizeShareIdInput("ab\t cd\nef")).toBe("abcdef");
    expect(normalizeShareIdInput("ab\u0000cd")).toBe("abcd");
  });

  it("returns null for empty/whitespace-only input", () => {
    expect(normalizeShareIdInput("")).toBeNull();
    expect(normalizeShareIdInput("   ")).toBeNull();
    expect(normalizeShareIdInput(null)).toBeNull();
    expect(normalizeShareIdInput(undefined)).toBeNull();
  });

  it("caps length at 128 characters", () => {
    const long = "a".repeat(200);
    const norm = normalizeShareIdInput(long);
    expect(norm).not.toBeNull();
    expect((norm ?? "").length).toBe(128);
  });
});

describe("buildCustomerSharePreview", () => {
  it("builds a relative /customer/:id path for a valid shareId", () => {
    const p = buildCustomerSharePreview("share-abc");
    expect(p.canOpen).toBe(true);
    expect(p.shareId).toBe("share-abc");
    expect(p.path).toBe(`${CUSTOMER_SHARE_LINK_BASE_PATH}/share-abc`);
  });

  it("disables canOpen and yields null path for empty input", () => {
    const p = buildCustomerSharePreview("");
    expect(p.canOpen).toBe(false);
    expect(p.shareId).toBeNull();
    expect(p.path).toBeNull();
  });

  it("URL-encodes characters that survived normalization", () => {
    const p = buildCustomerSharePreview("abc%def");
    expect(p.path).toBe(`${CUSTOMER_SHARE_LINK_BASE_PATH}/abc%25def`);
  });
});

describe("buildCustomerShareAbsoluteUrl", () => {
  it("combines origin + customer path", () => {
    expect(buildCustomerShareAbsoluteUrl("share-abc", "https://example.com")).toBe(
      "https://example.com/customer/share-abc",
    );
  });

  it("strips a trailing slash on origin", () => {
    expect(
      buildCustomerShareAbsoluteUrl("share-abc", "https://example.com/"),
    ).toBe("https://example.com/customer/share-abc");
  });

  it("returns null when shareId or origin is missing", () => {
    expect(buildCustomerShareAbsoluteUrl("", "https://example.com")).toBeNull();
    expect(buildCustomerShareAbsoluteUrl("share-abc", "")).toBeNull();
    expect(buildCustomerShareAbsoluteUrl("share-abc", null)).toBeNull();
  });
});

describe("share-link preview copy constants", () => {
  it("includes the required disclaimers", () => {
    expect(CUSTOMER_SHARE_LINK_PREVIEW_DISCLAIMER).toMatch(
      /share-token publishing backend not yet available/i,
    );
    expect(CUSTOMER_SHARE_LINK_PUBLIC_ONLY_COPY).toMatch(
      /only explicitly customer-facing content/i,
    );
  });
});
