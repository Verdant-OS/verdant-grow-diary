#!/usr/bin/env node
/**
 * Local Lighthouse CI runner for pre-publish checks (Windows-friendly).
 *
 * Usage:
 *   bun run lighthouse           # full sitemap audit
 *   bun run lighthouse -- --home # home page only (fast smoke)
 *
 * Requires @lhci/cli (added as devDependency). Reads lighthouserc.cjs.
 * Exits non-zero on assertion failure (e.g. LCP > 2.5s).
 *
 * This script never dispatches CI — it runs Lighthouse locally against the
 * published URLs in public/sitemap.xml. Safe to run before `publish`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const homeOnly = process.argv.includes("--home");

const configPath = resolve(process.cwd(), "lighthouserc.cjs");
if (!existsSync(configPath)) {
  console.error("lighthouserc.cjs not found at repo root.");
  process.exit(1);
}

const args = ["autorun", `--config=${configPath}`];
if (homeOnly) {
  args.push("--collect.url=https://verdantgrowdiary.com/");
}

console.log(`[lighthouse] running: lhci ${args.join(" ")}`);
const result = spawnSync("bunx", ["--bun", "lhci", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.error(`[lighthouse] failed with exit code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("[lighthouse] all assertions passed");
