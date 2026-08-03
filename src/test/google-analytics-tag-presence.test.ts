/**
 * Static test: confirms the Google tag script exists in the root route
 * and uses the correct measurement ID.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT_ROUTE = fs.readFileSync(path.resolve(process.cwd(), "src/routes/__root.tsx"), "utf-8");

describe("Google Analytics tag presence in the root route", () => {
  it("contains the Google tag gtag.js script", () => {
    expect(ROOT_ROUTE).toContain(
      "https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}",
    );
  });

  it("disables the raw-location initial page view", () => {
    expect(ROOT_ROUTE).toMatch(
      /gtag\("config","\$\{GA_MEASUREMENT_ID\}",\{send_page_view:false\}\)/,
    );
  });

  it("contains the dataLayer bootstrap", () => {
    expect(ROOT_ROUTE).toContain("window.dataLayer=window.dataLayer||[]");
  });

  it("contains the gtag function definition", () => {
    expect(ROOT_ROUTE).toContain("function gtag(){dataLayer.push(arguments);}");
  });
});
