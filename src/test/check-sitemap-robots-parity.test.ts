import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/check-sitemap-robots-parity.mjs");
const ORIGIN = "https://verdantgrowdiary.com";
const SITEMAP_DIRECTIVE = `Sitemap: ${ORIGIN}/sitemap.xml`;

function runIn(dir: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}

function scaffold(sitemap: string, robots: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sitemap-robots-"));
  mkdirSync(join(dir, "public"), { recursive: true });
  writeFileSync(join(dir, "public/sitemap.xml"), sitemap);
  writeFileSync(join(dir, "public/robots.txt"), robots);
  return dir;
}

const wrapUrls = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n") +
  `\n</urlset>`;

const projectUrl = (path: string) => `${ORIGIN}${path}`;
const allowedRobots = `User-agent: Googlebot\nAllow: /\nDisallow: /auth\n\nUser-agent: *\nAllow: /\nDisallow: /auth\n\n${SITEMAP_DIRECTIVE}\n`;

describe("check-sitemap-robots-parity", () => {
  it("passes when every canonical sitemap URL is allowed for every agent group", () => {
    const dir = scaffold(
      wrapUrls([projectUrl("/"), projectUrl("/welcome"), projectUrl("/cultivars")]),
      allowedRobots,
    );
    const result = runIn(dir);
    expect(result.stderr + result.stdout).toContain("OK");
    expect(result.code).toBe(0);
  });

  it("fails when a sitemap URL is Disallow-ed for a named agent", () => {
    const dir = scaffold(
      wrapUrls([projectUrl("/"), projectUrl("/auth/callback")]),
      `User-agent: Googlebot\nDisallow: /auth\n\nUser-agent: *\nAllow: /\n\n${SITEMAP_DIRECTIVE}\n`,
    );
    const result = runIn(dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("/auth/callback");
    expect(result.stderr).toContain("Googlebot");
  });

  it("respects longest-match Allow overriding a broader Disallow", () => {
    const dir = scaffold(
      wrapUrls([projectUrl("/cultivars/blue-dream")]),
      `User-agent: *\nDisallow: /cultivars\nAllow: /cultivars/blue-dream\n\n${SITEMAP_DIRECTIVE}\n`,
    );
    expect(runIn(dir).code).toBe(0);
  });

  it.each([
    ["duplicate", [projectUrl("/welcome"), projectUrl("/welcome")], "duplicate sitemap URL"],
    ["foreign origin", ["https://example.com/welcome"], "foreign origin"],
    ["query string", [`${projectUrl("/welcome")}?from=sitemap`], "query strings"],
    ["fragment", [`${projectUrl("/welcome")}#intro`], "fragments"],
    ["placeholder", [projectUrl("/cultivars/:slug")], "dynamic route placeholder"],
    ["legacy alias", [projectUrl("/strains/oreoz")], "legacy /strains alias"],
  ])("fails on %s sitemap entries", (_label, urls, expectedMessage) => {
    const result = runIn(scaffold(wrapUrls(urls), allowedRobots));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });

  it.each([
    ["missing", "User-agent: *\nAllow: /\n", "found: none"],
    [
      "duplicate",
      `User-agent: *\nAllow: /\n\n${SITEMAP_DIRECTIVE}\n${SITEMAP_DIRECTIVE}\n`,
      "exactly one",
    ],
    [
      "wrong origin",
      "User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n",
      "https://example.com/sitemap.xml",
    ],
  ])("fails when the robots Sitemap directive is %s", (_label, robots, expectedMessage) => {
    const result = runIn(scaffold(wrapUrls([projectUrl("/")]), robots));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });

  it("fails without a wildcard robots group", () => {
    const robots = `User-agent: Googlebot\nAllow: /\n\n${SITEMAP_DIRECTIVE}\n`;
    const result = runIn(scaffold(wrapUrls([projectUrl("/")]), robots));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("wildcard User-agent");
  });

  it("fails on an empty sitemap", () => {
    const result = runIn(scaffold(wrapUrls([]), allowedRobots));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("zero <loc>");
  });

  it("verifies the checked-in project files pass", () => {
    const result = runIn(process.cwd());
    expect(result.stderr + result.stdout).toContain("OK");
    expect(result.code).toBe(0);
  });
});
