/**
 * Static guardrails for the pi-ingest tent-owner lookup contract.
 * Docs + static repo scans only — no lookup implementation, no Edge
 * Function, no Supabase imports, no service_role.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(ROOT, "docs/pi-ingest-tent-owner-lookup-contract.md");
const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

describe("pi-ingest tent-owner lookup — contract doc", () => {
  it("doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it.each([
    ["mentions tent_id", /`?tent_id`?/],
    ["mentions tentOwnerUserId", /`?tentOwnerUserId`?/],
    ["mentions evaluateBridgeAuthorization", /evaluateBridgeAuthorization/],
    [
      "server-side only",
      /server-side[\s\S]{0,80}(only|Edge\s+Function)/i,
    ],
    [
      "no browser/client bundle",
      /MUST\s+NOT\s+run[\s\S]{0,200}browser\/client\s+bundles?/i,
    ],
    [
      "no React component lookup",
      /MUST\s+NOT\s+run[\s\S]{0,200}React\s+components?/i,
    ],
    [
      "must read tents.user_id",
      /must\s+read\s+(from\s+)?`?tents\.user_id`?/i,
    ],
    [
      "do not trust client-provided user_id",
      /must\s+not\s+trust\s+client-provided\s+`?user_id`?/i,
    ],
    [
      "do not trust bridge-provided owner id",
      /must\s+not\s+trust\s+bridge-provided\s+owner\s+id/i,
    ],
    [
      "cross-user tent inserts rejected",
      /Cross-user\s+tent\s+inserts\s+must\s+be\s+rejected/i,
    ],
    ["unknown tent fails closed", /Unknown\s+`?tent_id`?\s+fails\s+closed/i],
    [
      "missing tent id fails closed",
      /Missing\s+`?tent_id`?\s+fails\s+closed/i,
    ],
    [
      "failed lookup inserts zero sensor rows",
      /failed\s+lookup\s+inserts\s+zero\s+`?sensor_readings`?\s+rows/i,
    ],
    [
      "failed lookup records zero idempotency keys",
      /failed\s+lookup\s+records\s+zero\s+`?pi_ingest_idempotency_keys`?\s+rows/i,
    ],
    [
      "service_role only Edge Function after bridge auth",
      /service_role[\s\S]{0,200}Edge\s+Function[\s\S]{0,200}after[\s\S]{0,80}bridge/i,
    ],
    [
      "owner id must not be returned to external bridge caller",
      /(never|MUST\s+NOT)[\s\S]{0,200}(receive|returned?)[\s\S]{0,200}(owner\s+id|tentOwnerUserId)/i,
    ],
    [
      "no alerts/action_queue writes during lookup",
      /(alerts?\s+or\s+Action\s+Queue|`?alerts`?[\s\S]{0,40}`?action_queue`?)/i,
    ],
    ["includes stop-ship conditions", /##\s*7\.\s*Stop-ship conditions/i],
  ])("contract documents: %s", (_l, re) => {
    expect(DOC).toMatch(re);
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

describe("pi-ingest tent-owner lookup — repo guardrails", () => {
  it("no tent-owner lookup helper exists in src/lib yet", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter((p) =>
      /\.(ts|tsx)$/.test(p),
    );
    for (const f of files) {
      const base = f.split("/").pop() ?? "";
      expect(
        /TentOwnerLookup|tentOwnerLookup|TentOwnerResolver/.test(base),
        `unexpected tent-owner lookup helper: ${f}`,
      ).toBe(false);
    }
  });

  it("pi-ingest-readings Edge Function performs tent-owner lookup after HMAC verification", () => {
    const fn = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
    if (!existsSync(fn)) return;
    const src = readFileSync(fn, "utf8");
    expect(src).toMatch(/loadTentOwnerUserId\s*\(/);
    expect(src).toMatch(/evaluateBridgeAuthorization\s*\(/);
  });

  it("no new service_role usage in src/lib pi-ingest modules", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter(
      (p) => /\.(ts|tsx)$/.test(p) && /piIngest/i.test(p),
    );
    for (const f of files) {
      expect(readFileSync(f, "utf8"), `service_role in ${f}`).not.toMatch(
        /service_role/i,
      );
    }
  });

  it("no client/browser code references tentOwnerUserId", () => {
    // tentOwnerUserId is allowed in pure pi-ingest rule modules and tests;
    // it must not appear in React components, pages, or hooks shipped to
    // the browser bundle.
    const clientRoots = [
      resolve(ROOT, "src/components"),
      resolve(ROOT, "src/pages"),
      resolve(ROOT, "src/hooks"),
    ];
    for (const root of clientRoots) {
      const files = walk(root).filter((p) => /\.(ts|tsx)$/.test(p));
      for (const f of files) {
        expect(
          readFileSync(f, "utf8"),
          `tentOwnerUserId leaked into client surface: ${f}`,
        ).not.toMatch(/tentOwnerUserId/);
      }
    }
  });
});
