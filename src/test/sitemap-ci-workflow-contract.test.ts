import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const standalone = readFileSync(
  resolve(ROOT, ".github/workflows/sitemap-robots-parity.yml"),
  "utf8",
);
const seoParity = readFileSync(
  resolve(ROOT, ".github/workflows/seo-parity-and-head-fidelity.yml"),
  "utf8",
);

describe("sitemap CI workflow contract", () => {
  it("exposes write, generated-file check, and composite crawl-contract scripts", () => {
    expect(packageJson.scripts["generate:sitemap"]).toBe("bun scripts/generate-sitemap.ts");
    expect(packageJson.scripts["check:sitemap"]).toBe(
      "bun scripts/generate-sitemap.ts --check",
    );
    expect(packageJson.scripts["check:sitemap-robots"]).toContain("bun run check:sitemap");
    expect(packageJson.scripts["check:sitemap-robots"]).toContain(
      "bun run check:sitemap-robots:parity",
    );
  });

  it("runs the composite crawl contract inside the required CI test job", () => {
    const testJob = ci.slice(ci.indexOf("\n  test:"), ci.indexOf("\n  legal-seo:"));
    expect(testJob).toContain("name: Generated sitemap + robots crawl contract");
    expect(testJob).toContain("run: bun run check:sitemap-robots");
  });

  it("runs standalone parity on every PR without narrow path filters", () => {
    expect(standalone).toContain("pull_request:");
    expect(standalone).not.toMatch(/^\s+paths:/m);
    expect(standalone).toContain("run: bun run check:sitemap-robots");
  });

  it.each([
    ["sitemap parity", standalone],
    ["SEO parity", seoParity],
  ])("runs the %s workflow on both maintained branches", (_label, workflow) => {
    expect(workflow).toContain("branches: [main, verdant-grow-diary]");
  });
});
