import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { indexNowSubmitEnabled, sitemapLocs } from "../../scripts/indexnow-submit.mjs";

const SCRIPT = resolve(process.cwd(), "scripts/indexnow-submit.mjs");

describe("indexnow submit", () => {
  it("does not submit unless INDEXNOW_SUBMIT=1", () => {
    expect(indexNowSubmitEnabled({})).toBe(false);
    expect(indexNowSubmitEnabled({ INDEXNOW_SUBMIT: "0" })).toBe(false);
    expect(indexNowSubmitEnabled({ INDEXNOW_SUBMIT: "1" })).toBe(true);

    const env = { ...process.env };
    delete env.INDEXNOW_SUBMIT;
    const stdout = execFileSync("node", [SCRIPT], {
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    expect(stdout).toContain("IndexNow submit skipped");
    expect(stdout).not.toContain("IndexNow 200");
  });

  it("parses sitemap loc values without a network call", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://verdantgrowdiary.com/</loc></url>
  <url><loc>  https://verdantgrowdiary.com/glossary  </loc></url>
  <url><loc></loc></url>
  <url><loc>https://verdantgrowdiary.com/docs/mcp-api</loc></url>
</urlset>`;
    expect(sitemapLocs(xml)).toEqual([
      "https://verdantgrowdiary.com/",
      "https://verdantgrowdiary.com/glossary",
      "https://verdantgrowdiary.com/docs/mcp-api",
    ]);
  });
});
