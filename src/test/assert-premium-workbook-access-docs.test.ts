import { describe, it, expect } from "vitest";
import {
  scanText,
  scanPremiumWorkbookDoc,
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

describe("assert-premium-workbook-access-docs — happy paths", () => {
  it("passes when placeholder + fallback + do/don't copy all present", () => {
    expect(checkSpecRequiredCopy(FULL_SPEC)).toEqual([]);
    expect(scanText(FULL_SPEC)).toEqual([]);
    expect(scanPremiumWorkbookDoc(FULL_SPEC)).toEqual([]);
  });

  it("allows the {{PREMIUM_WORKBOOK_COPY_URL}} literal", () => {
    expect(scanText("Copy: {{PREMIUM_WORKBOOK_COPY_URL}}")).toEqual([]);
  });

  it("flags missing fallback text", () => {
    const text = FULL_SPEC.replace(REQUIRED_FALLBACK_TEXT, "");
    expect(checkSpecRequiredCopy(text)).toContain("fallback-text");
  });

  it("flags missing server-side safety copy", () => {
    const text = FULL_SPEC.replace(REQUIRED_SERVER_SIDE_COPY, "");
    expect(checkSpecRequiredCopy(text)).toContain("server-side-safety-copy");
  });

  it("declares all required forbidden URL and token rule names", () => {
    const urls = FORBIDDEN_URL_PATTERNS.map((p: { name: string }) => p.name);
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
    const tokens = FORBIDDEN_TOKEN_PATTERNS.map((p: { name: string }) => p.name);
    expect(tokens).toEqual(
      expect.arrayContaining(["X-Amz-Signature", "access_token=", "token=", "signature=", "expires="]),
    );
  });
});

describe("assert-premium-workbook-access-docs — negative cases (must FAIL)", () => {
  // Wrap each negative payload in the premium-workbook context so the
  // scoped scanner fires. The scoped scanner extends scanText() with the
  // typo and bare-service_role checks.
  const wrap = (bad: string) =>
    `# Premium workbook spec\n\n{{PREMIUM_WORKBOOK_COPY_URL}}\n\n${bad}\n`;

  it("fails on misspelled placeholder PREMIMUM_WORKBOOK_COPY_URL", () => {
    const text = `# Premium workbook spec\n\n{{PREMIMUM_WORKBOOK_COPY_URL}}\n`;
    const v = scanPremiumWorkbookDoc(text);
    expect(
      v.some((x: { rule: string }) => x.rule.includes("typo-placeholder")),
    ).toBe(true);
  });

  it("fails on bare service_role mention in premium-workbook context", () => {
    const v = scanPremiumWorkbookDoc(wrap("Use the service_role key to fetch the workbook."));
    expect(v.some((x: { rule: string }) => x.rule.includes("bare-service_role"))).toBe(true);
  });

  it("fails on access_token= marker", () => {
    const v = scanPremiumWorkbookDoc(wrap("link?access_token=hunter2"));
    expect(v.some((x: { rule: string }) => x.rule === "forbidden-token/access_token=")).toBe(true);
  });

  it("fails on private bucket path", () => {
    const v = scanPremiumWorkbookDoc(wrap("see private/release-workbooks/template.xlsx"));
    expect(v.some((x: { rule: string }) => x.rule.includes("private-bucket-path"))).toBe(true);
  });

  it("fails on premium bucket path", () => {
    const v = scanPremiumWorkbookDoc(wrap("see premium/release-workbooks/template.xlsx"));
    expect(v.some((x: { rule: string }) => x.rule.includes("private-bucket-path"))).toBe(true);
  });

  it("fails on real Google Sheets URL", () => {
    const v = scanPremiumWorkbookDoc(wrap("https://docs.google.com/spreadsheets/d/example"));
    expect(v.some((x: { rule: string }) => x.rule === "forbidden-url/docs.google.com")).toBe(true);
  });

  it("fails on Bearer token literal", () => {
    const v = scanPremiumWorkbookDoc(wrap("Authorization: Bearer abc.def.ghijklmnopqr"));
    expect(v.some((x: { rule: string }) => x.rule.includes("bearer-token-literal"))).toBe(true);
  });

  it("fails on literal entitlement secret assignment", () => {
    const v = scanPremiumWorkbookDoc(wrap(`workbook_secret="abc123xyz"`));
    expect(v.some((x: { rule: string }) => x.rule.includes("entitlement-secret-literal"))).toBe(true);
  });

  it("flags drive.google.com URLs", () => {
    const v = scanText("https://drive.google.com/file/d/xyz/view");
    expect(v.some((x: { rule: string }) => x.rule === "forbidden-url/drive.google.com")).toBe(true);
  });
});
