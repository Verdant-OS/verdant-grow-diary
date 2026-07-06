// Runtime smoke test of the PRODUCTION build (vite preview on :4173).
// Verifies (1) no uncaught/init-order errors from the manualChunks split and
// (2) usePageSeo actually sets per-route <title> + self-canonical at runtime.
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:4180";
const ORIGIN = "https://verdantgrowdiary.com";

const ROUTES = [
  {
    path: "/welcome",
    expectTitle: /Grow Diary & Grow Room Tracking App/,
    canonical: `${ORIGIN}/welcome`,
  },
  {
    path: "/pricing",
    expectTitle: /Pricing — Free, Pro & Founder Lifetime/,
    canonical: `${ORIGIN}/pricing`,
  },
  {
    path: "/hardware-integrations",
    expectTitle: /Sensor & Hardware Integrations/,
    canonical: `${ORIGIN}/hardware-integrations`,
  },
  // /pheno-comparison intentionally keeps the sitewide default title + no canonical.
  { path: "/pheno-comparison", expectTitle: /Verdant Grow Diary/, canonical: null },
];

const browser = await chromium.launch();
let failed = 0;

for (const r of ROUTES) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE + r.path, { waitUntil: "networkidle" });
  // Let the mount effect (usePageSeo) run.
  await page.waitForTimeout(400);

  const title = await page.title();
  const canonical = await page
    .$eval('link[rel="canonical"]', (el) => el.getAttribute("href"))
    .catch(() => null);
  const h1 = await page.$eval("h1", (el) => el.textContent?.trim() ?? "").catch(() => null);
  const rootHtmlLen = await page.$eval("#root", (el) => el.innerHTML.length).catch(() => 0);

  const problems = [];
  if (errors.length) problems.push(...errors);
  if (!r.expectTitle.test(title)) problems.push(`title mismatch: got "${title}"`);
  if (r.canonical === null) {
    if (canonical !== null) problems.push(`expected NO canonical, got "${canonical}"`);
  } else if (canonical !== r.canonical) {
    problems.push(`canonical mismatch: got "${canonical}"`);
  }
  if (rootHtmlLen < 500)
    problems.push(`#root looks empty (html length ${rootHtmlLen}) — possible white screen`);

  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r.path}`);
  console.log(`   title:     ${title}`);
  console.log(`   canonical: ${canonical ?? "(none)"}`);
  console.log(`   h1:        ${h1 ?? "(none)"}`);
  console.log(`   #root len: ${rootHtmlLen}`);
  for (const p of problems) console.log(`   ✗ ${p}`);
  await page.close();
}

// SoftwareApplication JSON-LD (injected into index.html at build time from the
// pricing constants). Assert it is present and the offer prices match, so the
// structured data can never silently drift from src/constants/pricing.ts.
{
  const page = await browser.newPage();
  await page.goto(BASE + "/welcome", { waitUntil: "networkidle" });
  const blocks = await page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((e) => e.textContent || ""),
  );
  const app = blocks
    .map((t) => {
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .flatMap((d) => (d["@graph"] ? d["@graph"] : [d]))
    .find((n) => n["@type"] === "SoftwareApplication");

  const problems = [];
  if (!app) problems.push("no SoftwareApplication JSON-LD found");
  else {
    const prices = new Set((app.offers || []).map((o) => String(o.price)));
    for (const expected of ["0", "12", "99", "129"]) {
      if (!prices.has(expected))
        problems.push(`SoftwareApplication offers missing price ${expected}`);
    }
  }
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} SoftwareApplication JSON-LD`);
  if (app) console.log(`   offers:    ${(app.offers || []).map((o) => o.price).join(", ")}`);
  for (const p of problems) console.log(`   ✗ ${p}`);
  await page.close();
}

await browser.close();
console.log(`\n${failed === 0 ? "ALL CHECKS OK" : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
