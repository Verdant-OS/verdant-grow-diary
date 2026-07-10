#!/usr/bin/env node
/**
 * Local session-state generator for the Pheno Tracker paid-user smoke.
 *
 * For each role (Free / Pro / Founder / Canceled) that has both an email
 * and password env var, drives the real /auth UI in a headless Chromium
 * and writes a Playwright storageState file under e2e/.auth/.
 *
 * SAFETY:
 *   - Local only. Never commit generated files (see e2e/.gitignore).
 *   - No service_role. No token injection. No Supabase admin API calls.
 *   - Never prints email, password, cookies, session tokens, or file
 *     contents. Only PRESENT / SKIPPED / OK / FAIL indicators.
 *   - Roles with missing credentials are skipped cleanly.
 *   - Exit 0 if all attempted roles succeed (or none were attempted).
 *   - Exit 1 if any attempted role fails to sign in.
 */
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";
const OUT_DIR = path.resolve("e2e/.auth");

const ROLES = [
  { key: "free",     emailEnv: "E2E_PHENO_FREE_EMAIL",     passEnv: "E2E_PHENO_FREE_PASSWORD",     out: "pheno-free.json" },
  { key: "pro",      emailEnv: "E2E_PHENO_PRO_EMAIL",      passEnv: "E2E_PHENO_PRO_PASSWORD",      out: "pheno-pro.json" },
  { key: "founder",  emailEnv: "E2E_PHENO_FOUNDER_EMAIL",  passEnv: "E2E_PHENO_FOUNDER_PASSWORD",  out: "pheno-founder.json" },
  { key: "canceled", emailEnv: "E2E_PHENO_CANCELED_EMAIL", passEnv: "E2E_PHENO_CANCELED_PASSWORD", out: "pheno-canceled.json" },
];

function has(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const attempted = ROLES.filter((r) => has(r.emailEnv) && has(r.passEnv));
  const skipped = ROLES.filter((r) => !(has(r.emailEnv) && has(r.passEnv)));

  console.log("Pheno paid-smoke session generator");
  console.log("----------------------------------");
  for (const r of skipped) console.log(`  SKIPPED ${r.key.padEnd(9)} (credentials not set)`);
  if (attempted.length === 0) {
    console.log("\nNo role credentials present — nothing to generate. SKIPPED cleanly.");
    return 0;
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    try { playwright = await import("@playwright/test"); } catch (e) {
      console.error("FAIL: playwright is not installed in this environment.");
      return 1;
    }
  }
  const { chromium } = playwright;

  let anyFail = false;
  for (const r of attempted) {
    const email = process.env[r.emailEnv];
    const password = process.env[r.passEnv];
    const outPath = path.join(OUT_DIR, r.out);
    const sessionSnapshotPath = path.join(OUT_DIR, r.out.replace(/\.json$/, ".session-storage.json"));
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${BASE_URL.replace(/\/$/, "")}/auth`, { waitUntil: "domcontentloaded" });
      await page.locator("#signin-email").fill(email);
      await page.locator("#signin-password").fill(password);
      await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
      // Wait for redirect away from /auth. Do not print the URL (may echo email in query).
      const start = Date.now();
      while (Date.now() - start < 20_000 && page.url().includes("/auth")) {
        await page.waitForTimeout(250);
      }
      if (page.url().includes("/auth")) {
        console.log(`  FAIL    ${r.key.padEnd(9)} (login did not complete)`);
        anyFail = true;
      } else {
        await context.storageState({ path: outPath });
        // Also snapshot sessionStorage (the app stores the Supabase session there).
        const origin = new URL(page.url()).origin;
        const entries = await page.evaluate(() => JSON.stringify(window.sessionStorage));
        fs.writeFileSync(
          sessionSnapshotPath,
          JSON.stringify({ origin, entries: JSON.parse(entries) }),
        );
        console.log(`  OK      ${r.key.padEnd(9)} -> e2e/.auth/${r.out}`);
      }
    } catch (e) {
      console.log(`  FAIL    ${r.key.padEnd(9)} (unexpected error)`);
      // First line of the error only — locator/launch failures carry no
      // secrets; never print URLs or credentials here.
      console.log(`          ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`);
      anyFail = true;
    } finally {
      await browser.close();
    }
  }
  return anyFail ? 1 : 0;
}

main().then((c) => process.exit(c)).catch(() => process.exit(1));
