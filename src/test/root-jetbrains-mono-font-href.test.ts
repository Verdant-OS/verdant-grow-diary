/**
 * JetBrains Mono is the family named by `--font-mono`. The root document must
 * request weights 400, 500, and 600 from Google Fonts, ahead of `display=swap`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KNOWN_THIRD_PARTY_ORIGINS,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

const rootSource = readFileSync(resolve(__dirname, "../routes/__root.tsx"), "utf8");
const fontHrefMatch = rootSource.match(/const FONT_HREF =\s*"([^"]+)"/);
const FONT_HREF = fontHrefMatch?.[1] ?? "";

describe("root FONT_HREF loads JetBrains Mono", () => {
  it("requests JetBrains Mono at weights 400, 500, and 600 before display=swap", () => {
    expect(FONT_HREF).toContain("family=JetBrains+Mono:wght@400;500;600");
    expect(FONT_HREF.indexOf("family=JetBrains+Mono:wght@400;500;600")).toBeGreaterThan(
      FONT_HREF.indexOf("family=Space+Grotesk"),
    );
    expect(FONT_HREF.indexOf("family=JetBrains+Mono:wght@400;500;600")).toBeLessThan(
      FONT_HREF.indexOf("&display=swap"),
    );
    expect(FONT_HREF.endsWith("&display=swap")).toBe(true);
  });

  it("keeps the report-only CSP open for the Google Fonts hosts", () => {
    expect(KNOWN_THIRD_PARTY_ORIGINS.googleFonts).toEqual([
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]);
    const policy = buildContentSecurityPolicyReportOnly();
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(policy).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });
});
