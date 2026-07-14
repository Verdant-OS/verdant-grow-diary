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
 *   BASE_URL   default http://127.0.0.1:8080   (use 127.0.0.1, NOT localhost —
 *              Vite binds IPv4 and `localhost` can resolve to ::1 and hang)
 *   CHROMIUM   optional explicit executablePath; otherwise the driver probes
 *              /opt/pw-browsers (the container ships chromium-1194 & -1228,
 *              which may not match Playwright's pinned revision) and finally
 *              falls back to Playwright's own bundled download.
 */
import { chromium } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8080";
const path = process.argv[2] || "/";
const outfile = process.argv[3] || "screenshot.png";
const target = new URL(path, BASE_URL).toString();

/** Find a usable Chromium binary in /opt/pw-browsers if the pinned one is absent. */
function probeChromium() {
  if (process.env.CHROMIUM && existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const bin = `${root}/${d}/chrome-linux/chrome`;
    if (existsSync(bin)) return bin;
  }
  return undefined; // let Playwright use its own bundle
}

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
