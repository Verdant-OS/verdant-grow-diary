/**
 * Static guardrail tests for the implemented pi-ingest-readings contract.
 *
 * Repository presence is distinct from deployment proof. These checks pin the
 * documented implementation identity and the ingestion-only safety fences.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
// Scanner guardrail: 30s per-file timeout + slow-test telemetry so the
// recursive src/ + migrations walks below do not flake under sharded
// validation load (default 5s vitest timeout can be exceeded by I/O
// contention alone).
import { installScannerGuardrail } from "./support/scannerGuardrailHarness";

installScannerGuardrail({ file: __filename });

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

  it("documents implemented repository status without claiming deployment", () => {
    expect(DOC).toMatch(/repository status:[\s\S]{0,80}implemented/i);
    expect(DOC).toContain("supabase/functions/pi-ingest-readings/index.ts");
    expect(DOC).toMatch(/repository presence does not prove/i);
    expect(DOC).toMatch(/confirm migration history[\s\S]{0,160}deployed smoke test/i);
    expect(DOC).not.toMatch(/no\s+implementation\s+yet/i);
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
  const CURRENT = ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm", "soil_moisture_pct"];
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
    [
      "rejects captured_at >5min in future",
      /captured_at[\s\S]{0,80}5\s*minutes?\s+in\s+the\s+future/i,
    ],
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
    ["requires timestamped HMAC auth", /timestamped\s+HMAC\s+signature/i],
    ["no unauthenticated writes", /no\s+unauthenticated\s+writes/i],
    ["no client-provided user_id", /no\s+client-provided\s+`?user_id`?/i],
    [
      "service_role pre-auth scope is credential lookup only",
      /service_role[\s\S]{0,180}before[\s\S]{0,80}limited[\s\S]{0,100}credential lookup/i,
    ],
    [
      "all service_role writes are post-verification",
      /every write[\s\S]{0,60}only after verification/i,
    ],
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
// Repo-level static guardrails: the implemented Edge Function must retain its
// fail-closed auth path and must not write alerts or action_queue rows.
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

describe("pi-ingest-readings — implemented repo guardrails", () => {
  const FN = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
  const SRC = existsSync(FN) ? readFileSync(FN, "utf8") : "";

  it("pi-ingest-readings Edge Function exists and retains fail-closed failure paths", () => {
    expect(existsSync(FN)).toBe(true);
    expect(SRC).toMatch(/(secret_resolver_not_implemented|internal_failure)/);
    expect(SRC).toMatch(/(status:\s*(503|501)|jsonResponse\s*\(\s*(503|501))/);
    // Success path only via commit helper, must include inserted/rejected.
    if (/ok\s*:\s*true/.test(SRC)) {
      expect(SRC).toMatch(/inserted\s*:/);
      expect(SRC).toMatch(/rejected\s*:/);
      expect(SRC).toMatch(/commitPiIngestBatch/);
    }
  });
  it("versioned migrations provide the pi-ingest credential, idempotency, and commit foundation", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    expect(existsSync(dir)).toBe(true);
    const migrationText = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(migrationText).toMatch(/CREATE TABLE public\.pi_ingest_bridge_credentials/i);
    expect(migrationText).toMatch(/CREATE TABLE public\.pi_ingest_idempotency_keys/i);
    expect(migrationText).toMatch(/FUNCTION public\.pi_ingest_commit_batch/i);
    expect(migrationText).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pi_ingest_commit_batch[\s\S]{0,160}service_role/i,
    );
  });

  it("no source file invokes a pi-ingest-readings function (no client wiring)", () => {
    const files = walk(resolve(ROOT, "src")).filter(
      (p) => /\.(ts|tsx)$/.test(p) && !/[\\/]test[\\/]/.test(p),
    );
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/functions\.invoke\(\s*['"]pi-ingest-readings/);
      expect(text).not.toMatch(/\/functions\/v1\/pi-ingest-readings/);
    }
  });

  it("pi-ingest-readings Edge Function does not write alerts or action_queue", () => {
    if (!existsSync(FN)) return;
    expect(SRC).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
    expect(SRC).not.toMatch(/from\(\s*["']action_queue["']\s*\)/);
  });
});
