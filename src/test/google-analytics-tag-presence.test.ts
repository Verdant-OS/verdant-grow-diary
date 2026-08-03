/**
 * Static test: confirms the Google tag script is declared in the TanStack
 * root route head (src/routes/__root.tsx) and uses the correct measurement ID.
 * Replaces the pre-migration index.html check.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT_ROUTE = fs.readFileSync(path.resolve(process.cwd(), "src/routes/__root.tsx"), "utf-8");

describe("Google Analytics tag presence in __root.tsx head", () => {
  it("declares the measurement ID", () => {
    expect(ROOT_ROUTE).toMatch(/["']G-MCXQ9GVS5H["']/);
  });

  it("contains the Google tag gtag.js script src", () => {
    expect(ROOT_ROUTE).toContain("https://www.googletagmanager.com/gtag/js?id=");
  });

  it("disables the raw-location initial page view", () => {
    expect(ROOT_ROUTE).toMatch(
      /gtag\(\s*["']config["']\s*,\s*[^)]*?\{\s*send_page_view:\s*false\s*\}\s*\)/,
    );
  });

  it("contains the dataLayer bootstrap", () => {
    expect(ROOT_ROUTE).toMatch(/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/);
  });

  it("contains the gtag function definition", () => {
    expect(ROOT_ROUTE).toMatch(/function gtag\(\)\s*\{\s*dataLayer\.push\(arguments\);?\s*\}/);
  });
});
