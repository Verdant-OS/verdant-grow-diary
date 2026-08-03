/**
 * Static test: confirms the Google tag script exists in index.html
 * and uses the correct measurement ID.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const INDEX_HTML = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");

describe("Google Analytics tag presence in index.html", () => {
  it("contains the Google tag gtag.js script", () => {
    expect(INDEX_HTML).toContain("https://www.googletagmanager.com/gtag/js?id=G-MCXQ9GVS5H");
  });

  it("disables the raw-location initial page view", () => {
    // Formatting-agnostic: prettier reflows quotes/whitespace in index.html.
    expect(INDEX_HTML).toMatch(
      /gtag\(\s*["']config["']\s*,\s*["']G-MCXQ9GVS5H["']\s*,\s*\{\s*send_page_view:\s*false\s*\}\s*\)/,
    );
  });

  it("contains the dataLayer bootstrap", () => {
    expect(INDEX_HTML).toContain("window.dataLayer = window.dataLayer || []");
  });

  it("contains the gtag function definition", () => {
    expect(INDEX_HTML).toMatch(/function gtag\(\)\s*\{\s*dataLayer\.push\(arguments\);?\s*\}/);
  });
});
