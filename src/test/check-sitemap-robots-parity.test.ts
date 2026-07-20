import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/check-sitemap-robots-parity.mjs");

function runIn(dir: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function scaffold(sitemap: string, robots: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sitemap-robots-"));
  mkdirSync(join(dir, "public"), { recursive: true });
  writeFileSync(join(dir, "public/sitemap.xml"), sitemap);
  writeFileSync(join(dir, "public/robots.txt"), robots);
  return dir;
}

const wrapUrls = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths.map((p) => `  <url><loc>https://example.com${p}</loc></url>`).join("\n") +
  `\n</urlset>`;

describe("check-sitemap-robots-parity", () => {
  it("passes when every sitemap URL is allowed for every agent group", () => {
    const dir = scaffold(
      wrapUrls(["/", "/welcome", "/cultivars"]),
      "User-agent: Googlebot\nAllow: /\nDisallow: /auth\n\nUser-agent: *\nAllow: /\nDisallow: /auth\n",
    );
    const res = runIn(dir);
    expect(res.stderr + res.stdout).toContain("OK");
    expect(res.code).toBe(0);
  });

  it("fails when a sitemap URL is Disallow-ed for a named agent", () => {
    const dir = scaffold(
      wrapUrls(["/", "/auth/callback"]),
      "User-agent: Googlebot\nDisallow: /auth\n\nUser-agent: *\nAllow: /\n",
    );
    const res = runIn(dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("/auth/callback");
    expect(res.stderr).toContain("Googlebot");
  });

  it("respects longest-match Allow overriding a broader Disallow", () => {
    const dir = scaffold(
      wrapUrls(["/cultivars/blue-dream"]),
      "User-agent: *\nDisallow: /cultivars\nAllow: /cultivars/blue-dream\n",
    );
    expect(runIn(dir).code).toBe(0);
  });

  it("fails on empty sitemap", () => {
    const dir = scaffold(wrapUrls([]), "User-agent: *\nAllow: /\n");
    expect(runIn(dir).code).toBe(1);
  });

  it("verifies the checked-in project files pass", () => {
    const res = runIn(process.cwd());
    expect(res.stderr + res.stdout).toContain("OK");
    expect(res.code).toBe(0);
    // Silence unused warning for helper
    void cpSync;
  });
});
