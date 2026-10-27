import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  indexNowSubmitEnabled,
  sitemapLocs,
  submitIndexNow,
} from "../../scripts/indexnow-submit.mjs";

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

  it("starts with the node shebang", () => {
    const firstLine = readFileSync(SCRIPT, "utf8").split("\n")[0];
    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it("posts when the mocked fetch succeeds and throws when it does not", async () => {
    const sitemapXml =
      "<urlset><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/b</loc></url></urlset>";
    const options = { sitemapXml, key: "test-key-not-production" };
    let seenKey = "";
    const okFetch = async (_url: string, init: { body: string }) => {
      seenKey = JSON.parse(init.body).key;
      return { ok: true, status: 200, text: async () => "" };
    };
    const ok = await submitIndexNow({ INDEXNOW_SUBMIT: "1" }, okFetch, options);
    expect(seenKey).toBe("test-key-not-production");
    expect(ok).toEqual({ submitted: true, count: 2 });

    const failFetch = async () => ({ ok: false, status: 422, text: async () => "rejected" });
    await expect(submitIndexNow({ INDEXNOW_SUBMIT: "1" }, failFetch, options)).rejects.toThrow(
      "IndexNow submit failed: 422",
    );
  });
});
