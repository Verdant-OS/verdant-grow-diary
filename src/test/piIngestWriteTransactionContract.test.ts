/**
 * Static guardrails for the pi-ingest-readings write-path transaction
 * contract. Docs + static tests only — no write helpers, no RPC, no
 * Edge Function behavior change in this scope.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(ROOT, "docs/pi-ingest-write-transaction-contract.md");
const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

const FN_DIR = resolve(ROOT, "supabase/functions/pi-ingest-readings");
const INDEX_PATH = join(FN_DIR, "index.ts");
const INDEX_SRC = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf8") : "";

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

describe("pi-ingest write-transaction contract — doc exists & identity", () => {
  it("contract doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });
  it("names the endpoint pi-ingest-readings", () => {
    expect(DOC).toMatch(/pi-ingest-readings/);
  });
  it("declares docs/tests only", () => {
    expect(DOC).toMatch(/docs.*only|no\s+write\s+helpers/i);
  });
});

describe("pi-ingest write-transaction contract — required content", () => {
  it.each([
    ["atomic write requirement", /atomic/i],
    ["both succeed or neither succeeds", /both\s+succeed\s+or\s+neither\s+succeeds/i],
    ["no idempotency key for failed sensor row", /no\s+idempotency\s+key\s+may\s+be\s+recorded\s+for\s+a\s+sensor\s+row\s+that\s+failed/i],
    ["no sensor row without idempotency key", /no\s+sensor\s+row\s+may\s+be\s+inserted\s+without\s+its\s+idempotency\s+key/i],
    ["idempotency is per-reading", /per-?reading/i],
    ["forbids requestHash", /no\s+`?requestHash`?/i],
    ["forbids request_hash", /no\s+`?request_hash`?/i],
    ["no idempotency_key column on sensor_readings", /sensor_readings[\s\S]{0,80}MUST NOT[\s\S]{0,80}idempotency_key/],
    ["unique constraint (user_id, idempotency_key)", /\(user_id,\s*idempotency_key\)/],
    ["server-resolved user_id", /server-resolved\s+`?user_id`?/i],
    ["no client-provided user_id", /(no|MUST\s+NOT\s+accept)\s+(a\s+)?client-(provided|controlled)\s+(owner\s+id|`?user_id`?)/i],
    ["recommends RPC / SQL transaction", /RPC[\s\S]{0,80}transaction|Postgres\s+(RPC|function)/i],
    ["no alerts writes", /no\s+alerts?\s+writes|no\s+direct\s+alert\s+writes|MUST\s+NOT\s+create\s+alerts/i],
    ["no Action Queue writes", /no\s+`?action_queue`?\s+writes|MUST\s+NOT\s+create\s+Action\s+Queue/i],
    ["no automation/device-control writes", /no\s+automation|device.control/i],
    ["endpoint stays auth_ok_pipeline_not_implemented", /auth_ok_pipeline_not_implemented/],
    ["failure behavior section", /failure\s+behavior/i],
    ["response behavior section", /response\s+behavior/i],
    ["stop-ship conditions section", /stop-ship\s+conditions/i],
    ["forbids logging key/secret material", /logging[\s\S]{0,160}(idempotency\s+keys|secret|signature)/i],
  ])("documents: %s", (_label, re) => {
    expect(DOC).toMatch(re);
  });
});

describe("pi-ingest write-transaction contract — repo guardrails", () => {
  it("no idempotency writer helper exists yet", () => {
    expect(existsSync(join(FN_DIR, "idempotencyWriter.ts"))).toBe(false);
    expect(existsSync(join(FN_DIR, "idempotencyWriter.test.ts"))).toBe(false);
  });

  it("no sensor writer helper exists under Edge Function path yet", () => {
    expect(existsSync(join(FN_DIR, "sensorWriter.ts"))).toBe(false);
    expect(existsSync(join(FN_DIR, "sensorReadingsWriter.ts"))).toBe(false);
  });

  it("index.ts has no .insert/.upsert/.update/.delete/.rpc", () => {
    if (!existsSync(INDEX_PATH)) return;
    expect(INDEX_SRC).not.toMatch(/\.insert\s*\(/);
    expect(INDEX_SRC).not.toMatch(/\.upsert\s*\(/);
    expect(INDEX_SRC).not.toMatch(/\.update\s*\(/);
    expect(INDEX_SRC).not.toMatch(/\.delete\s*\(/);
    expect(INDEX_SRC).not.toMatch(/\.rpc\s*\(/);
  });

  it("index.ts has no { ok: true } success path", () => {
    if (!existsSync(INDEX_PATH)) return;
    expect(INDEX_SRC).not.toMatch(/ok\s*:\s*true/);
  });

  it("no requestHash/request_hash in pi-ingest Edge Function source files", () => {
    const files = walk(FN_DIR).filter((p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, `requestHash found in ${f}`).not.toMatch(/requestHash|request_hash/);
    }
  });

  it("no alerts/action_queue writes in pi-ingest Edge Function files", () => {
    const files = walk(FN_DIR).filter((p) => /\.(ts)$/.test(p) && !/\.test\.ts$/.test(p));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, `alerts write found in ${f}`).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
      expect(text, `action_queue write found in ${f}`).not.toMatch(/from\(\s*["']action_queue["']\s*\)/);
    }
  });

  it("no automation/device-control strings in pi-ingest Edge Function files", () => {
    const files = walk(FN_DIR).filter((p) => /\.(ts)$/.test(p) && !/\.test\.ts$/.test(p));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, `device-control reference in ${f}`).not.toMatch(/device[_-]?control|automation_trigger|equipment_command/i);
    }
  });
});
