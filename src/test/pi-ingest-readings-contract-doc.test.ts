/**
 * Static guardrail tests for the pi-ingest-readings Edge Function contract.
 *
 * This is a DOCS + STATIC TESTS ONLY scope. The Edge Function must not
 * exist yet, no service_role usage may be added, no schema migration
 * may be added, and no alert / action_queue write path may be added.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(ROOT, "docs/pi-ingest-readings-contract.md");
const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

describe("pi-ingest-readings contract doc — existence & identity", () => {
  it("contract doc exists at docs/pi-ingest-readings-contract.md", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it("names the endpoint pi-ingest-readings", () => {
    expect(DOC).toMatch(/pi-ingest-readings/);
  });

  it("declares docs/tests only — no implementation yet", () => {
    expect(DOC).toMatch(/docs.*tests.*only|no\s+implementation\s+yet|contract\s*\+\s*static/i);
  });
});

describe("pi-ingest-readings contract doc — scope/safety rules", () => {
  it.each([
    ["no automation", /no\s+automation/i],
    ["no device control", /no\s+device\s+control/i],
    ["no Action Queue creation", /no\s+action\s+queue\s+creation/i],
    ["endpoint writes only to sensor_readings", /writes?\s+only\s+to\s+`?sensor_readings`?/i],
    ["no alert creation inside endpoint", /no\s+alert\s+creation\s+inside\s+the\s+endpoint/i],
  ])("documents safety rule: %s", (_label, re) => {
    expect(DOC).toMatch(re);
  });
});

describe("pi-ingest-readings contract doc — metrics whitelist", () => {
  const CURRENT = [
    "temperature_c",
    "humidity_pct",
    "vpd_kpa",
    "co2_ppm",
    "soil_moisture_pct",
  ];
  const UNSUPPORTED = ["ppfd", "dli", "soil_ec", "soil_temp", "reservoir_ec", "reservoir_ph"];

  it("lists current allowed metrics exactly", () => {
    for (const m of CURRENT) expect(DOC).toContain(m);
  });

  it("lists unsupported future metrics", () => {
    for (const m of UNSUPPORTED) expect(DOC).toContain(m);
  });
});

describe("pi-ingest-readings contract doc — validation rules", () => {
  it.each([
    ["requires tent_id", /`?tent_id`?\s+required/i],
    ["requires device_id", /`?device_id`?\s+required/i],
    ["requires captured_at", /`?captured_at`?\s+required/i],
    ["rejects captured_at >5min in future", /captured_at[\s\S]{0,80}5\s*minutes?\s+in\s+the\s+future/i],
    ["no silent timestamp clamping", /no\s+silent\s+timestamp\s+clamping/i],
    ["all-or-nothing batch", /all-or-nothing/i],
    ["rejects unknown metrics", /reject\s+unknown\s+metrics/i],
    ["rejects unknown units", /reject\s+unknown\s+units/i],
    ["rejects non-finite values", /reject\s+non-?finite\s+values/i],
    ["rejects unknown sources", /reject\s+unknown\s+sources/i],
    ["rejects sim for endpoint", /reject\s+`?sim`?/i],
    ["rejects manual for endpoint", /reject\s+`?manual`?/i],
  ])("documents validation: %s", (_label, re) => {
    expect(DOC).toMatch(re);
  });
});

describe("pi-ingest-readings contract doc — auth/security", () => {
  it.each([
    ["requires token/HMAC style auth", /signed\s+bridge\s+token\s+or\s+HMAC/i],
    ["no unauthenticated writes", /no\s+unauthenticated\s+writes/i],
    ["no client-provided user_id", /no\s+client-provided\s+`?user_id`?/i],
    ["service_role only after token verification", /service_role[\s\S]{0,120}after[\s\S]{0,40}verif/i],
    ["failed auth inserts zero rows", /401[\s\S]{0,60}zero\s+rows/i],
    ["invalid payload inserts zero rows", /400[\s\S]{0,60}zero\s+rows/i],
  ])("documents auth rule: %s", (_label, re) => {
    expect(DOC).toMatch(re);
  });
});

describe("pi-ingest-readings contract doc — stop-ship", () => {
  it("includes a stop-ship conditions section", () => {
    expect(DOC).toMatch(/stop-ship\s+conditions/i);
  });
});

// ---------------------------------------------------------------------------
// Repo-level static guardrails: this task must NOT add the Edge Function,
// service_role usage, schema migrations, alert writes, or action_queue writes.
// ---------------------------------------------------------------------------

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

describe("pi-ingest-readings — repo guardrails (this task added no implementation)", () => {
  it("no supabase/functions/pi-ingest-readings directory exists yet", () => {
    expect(existsSync(resolve(ROOT, "supabase/functions/pi-ingest-readings"))).toBe(false);
  });

  it("no migration mentioning pi_ingest / pi-ingest-readings exists", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text).not.toMatch(/pi[_-]?ingest[_-]?readings/i);
    }
  });

  it("no source file references the pi-ingest-readings function name", () => {
    const files = walk(resolve(ROOT, "src")).filter(
      (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith("pi-ingest-readings-contract-doc.test.ts"),
    );
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/pi-ingest-readings/);
    }
  });

  it("no new pi-ingest-readings edge function uses service_role yet", () => {
    const fnDir = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    expect(existsSync(fnDir)).toBe(false);
  });

  it("no action_queue or alert write path appears in any edge function for this contract", () => {
    const dir = resolve(ROOT, "supabase/functions");
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      // Whatever functions may already exist, none may be the pi ingest one.
      expect(name).not.toMatch(/^pi-ingest-readings$/);
    }
  });
});
