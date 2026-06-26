import { describe, it, expect } from "vitest";
import {
  scanText,
  checkSpecRequiredCopy,
  REQUIRED_FALLBACK_TEXT,
  REQUIRED_SERVER_SIDE_COPY,
  FORBIDDEN_URL_PATTERNS,
  FORBIDDEN_TOKEN_PATTERNS,
} from "../../scripts/assert-premium-workbook-access-docs.mjs";

const FULL_SPEC = `
{{PREMIUM_WORKBOOK_COPY_URL}}

> ${REQUIRED_FALLBACK_TEXT}

> ${REQUIRED_SERVER_SIDE_COPY}

public docs must not expose real workbook URLs in public docs.
Do not render the workbook link in unauthenticated UI.
Premium entitlement verification is required before showing the link.
`;

describe("assert-premium-workbook-access-docs", () => {
  it("passes when placeholder + fallback + do/don't copy all present", () => {
    expect(checkSpecRequiredCopy(FULL_SPEC)).toEqual([]);
    expect(scanText(FULL_SPEC)).toEqual([]);
  });

  it("flags missing fallback text", () => {
    const text = FULL_SPEC.replace(REQUIRED_FALLBACK_TEXT, "");
    expect(checkSpecRequiredCopy(text)).toContain("fallback-text");
  });

  it("flags missing server-side safety copy", () => {
    const text = FULL_SPEC.replace(REQUIRED_SERVER_SIDE_COPY, "");
    expect(checkSpecRequiredCopy(text)).toContain("server-side-safety-copy");
  });

  it("flags docs.google.com URLs", () => {
    const v = scanText("see https://docs.google.com/spreadsheets/d/abc/edit");
    expect(v.some((x) => x.rule === "forbidden-url/docs.google.com")).toBe(true);
  });

  it("flags drive.google.com URLs", () => {
    const v = scanText("https://drive.google.com/file/d/xyz/view");
    expect(v.some((x) => x.rule === "forbidden-url/drive.google.com")).toBe(true);
  });

  it("flags access_token= markers", () => {
    const v = scanText("link?access_token=hunter2");
    expect(v.some((x) => x.rule === "forbidden-token/access_token=")).toBe(true);
  });

  it("allows the {{PREMIUM_WORKBOOK_COPY_URL}} literal", () => {
    expect(scanText("Copy: {{PREMIUM_WORKBOOK_COPY_URL}}")).toEqual([]);
  });

  it("declares all required forbidden URL and token rule names", () => {
    const urls = FORBIDDEN_URL_PATTERNS.map((p) => p.name);
    expect(urls).toEqual(
      expect.arrayContaining([
        "docs.google.com",
        "drive.google.com",
        "dropbox.com",
        "notion.so",
        "notion.site",
        "sheets.googleapis.com",
        "storage.googleapis.com",
        "supabase.co/storage",
      ]),
    );
    const tokens = FORBIDDEN_TOKEN_PATTERNS.map((p) => p.name);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "X-Amz-Signature",
        "access_token=",
        "token=",
        "signature=",
        "expires=",
      ]),
    );
  });
});
