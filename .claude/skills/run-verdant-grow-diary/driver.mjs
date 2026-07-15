#!/usr/bin/env node
/**
 * driver.mjs — headless browser driver for verdant-grow-diary (a Vite + React
 * SPA on port 8080). Agent handle for "screenshot the app / drive a flow".
 *
 * The app has no off-the-shelf `chromium-cli`, so this thin Playwright wrapper
 * IS the driver. It launches headless Chromium, navigates, waits for the SPA
 * to settle, screenshots, and prints the resolved title + URL (so you can see
 * the unauthenticated `/` → `/auth` redirect).
 *
 * Prereqs: the dev server must already be running on the target origin
 * (`bun run dev -- --host 127.0.0.1 --port 8080`). This driver never starts it.
 *
 * Usage (from the project root):
 *   node .claude/skills/run-verdant-grow-diary/driver.mjs [path] [outfile]
 *   node .claude/skills/run-verdant-grow-diary/driver.mjs /auth auth.png
 *
 * Env:
 *   BASE_URL   default http://127.0.0.1:8080   (target 127.0.0.1, NOT
 *              localhost — the recommended dev command binds IPv4 explicitly,
 *              and `localhost` can resolve to ::1, which that bind won't serve)
 *   CHROMIUM   optional explicit executablePath; otherwise the driver probes
 *              /opt/pw-browsers (the container ships chromium-1194 & -1228,
 *              which may not match Playwright's pinned revision) and finally
 *              falls back to Playwright's own bundled download.
 *
 * `probeChromium` is exported and dependency-injected so it can be unit-tested
 * without launching a browser; importing this module never launches anything
 * (the run block is guarded by a main-module check).
 */
import { existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Resolve a Chromium executable, in precedence order:
 *   1. env.CHROMIUM, when it points at an existing file;
 *   2. the newest `chromium-<rev>` directory (never `*headless*`) under
 *      env.PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers) that contains
 *      chrome-linux/chrome — revisions sorted descending, so selection is
 *      deterministic;
 *   3. undefined — let Playwright use its own bundled browser.
 *
 * `env` and `fsLike` are injectable for tests; production callers pass nothing.
 */
export function probeChromium(env = process.env, fsLike = { existsSync, readdirSync }) {
  if (env.CHROMIUM && fsLike.existsSync(env.CHROMIUM)) return env.CHROMIUM;
  const root = env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fsLike.existsSync(root)) return undefined;
  let entries;
  try {
    entries = fsLike.readdirSync(root);
  } catch {
    return undefined; // unreadable root → bundled fallback
  }
  const dirs = entries
    .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const bin = `${root}/${d}/chrome-linux/chrome`;
    if (fsLike.existsSync(bin)) return bin;
  }
  return undefined;
}

async function run() {
  const { chromium } = await import("@playwright/test");
  const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8080";
  const path = process.argv[2] || "/";
  const outfile = process.argv[3] || "screenshot.png";
  const target = new URL(path, BASE_URL).toString();

  const executablePath = probeChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const resp = await page.goto(target, { waitUntil: "networkidle", timeout: 30_000 });
    // SPA renders after the JS bundle boots; give React a beat past networkidle.
    await page.waitForTimeout(500);
    await page.screenshot({ path: outfile, fullPage: false });
    console.log(
      JSON.stringify(
        {
          requested: target,
          finalUrl: page.url(),
          httpStatus: resp?.status() ?? null,
          title: await page.title(),
          screenshot: outfile,
          chromium: executablePath ?? "playwright-bundled",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

// Only launch when executed directly (node driver.mjs …); importing the module
// (e.g. from the vitest covering probeChromium) must never start a browser.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
