/**
 * Static guardrails for the pi-ingest-readings Edge Function
 * skeleton audit. Audit + docs + static tests only.
 *
 * These tests assert the live invariants of the current Edge Function
 * skeleton at the time of audit. They do NOT assume a thin stub —
 * the audit doc records the deviation from the original audit prompt.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const AUDIT_PATH = resolve(ROOT, "docs/pi-ingest-edge-skeleton-audit.md");
const FN_DIR = resolve(ROOT, "supabase/functions/pi-ingest-readings");
const FN_INDEX = resolve(FN_DIR, "index.ts");
const FN_RESOLVER = resolve(FN_DIR, "secretResolver.ts");
const FN_CRYPTO = resolve(FN_DIR, "crypto.ts");
const PLAN_PATH = resolve(ROOT, "docs/pi-ingest-secret-resolution-plan.md");
const CONTRACT_PATH = resolve(ROOT, "docs/pi-ingest-readings-contract.md");

const AUDIT = existsSync(AUDIT_PATH) ? readFileSync(AUDIT_PATH, "utf8") : "";
const PLAN = existsSync(PLAN_PATH) ? readFileSync(PLAN_PATH, "utf8") : "";
const CONTRACT = existsSync(CONTRACT_PATH)
  ? readFileSync(CONTRACT_PATH, "utf8")
  : "";
const INDEX_SRC = existsSync(FN_INDEX) ? readFileSync(FN_INDEX, "utf8") : "";
const RESOLVER_SRC = existsSync(FN_RESOLVER)
  ? readFileSync(FN_RESOLVER, "utf8")
  : "";

function readFnDirAll(): string {
  if (!existsSync(FN_DIR)) return "";
  return readdirSync(FN_DIR)
    .filter((n) => /\.ts$/.test(n) && !n.endsWith(".test.ts"))
    .map((n) => readFileSync(resolve(FN_DIR, n), "utf8"))
    .join("\n");
}
const FN_ALL = readFnDirAll();

describe("pi-ingest edge skeleton audit — existence", () => {
  it("audit doc exists", () => {
    expect(existsSync(AUDIT_PATH)).toBe(true);
  });
  it("function directory exists", () => {
    expect(existsSync(FN_DIR)).toBe(true);
  });
  it("index.ts exists OR audit doc notes its absence", () => {
    if (existsSync(FN_INDEX)) {
      expect(INDEX_SRC.length).toBeGreaterThan(0);
    } else {
      expect(AUDIT).toMatch(/index\.ts[\s\S]{0,80}(absent|missing|does\s+not\s+exist)/i);
    }
  });
});

describe("pi-ingest edge skeleton audit — fail-closed posture", () => {
  it("index.ts returns generic fail-closed bodies", () => {
    if (!INDEX_SRC) return;
    for (const fn of [
      "buildUnauthorizedResponseBody",
      "buildInvalidRequestResponseBody",
      "buildInternalFailureResponseBody",
      "buildMethodNotAllowedResponseBody",
    ]) {
      expect(INDEX_SRC).toContain(fn);
    }
  });

  it("preserves the secret_resolver_not_implemented sentinel for unconfigured env", () => {
    if (!INDEX_SRC) return;
    expect(INDEX_SRC).toMatch(/secret_resolver_not_implemented/);
  });
});

describe("pi-ingest edge skeleton audit — no direct writes", () => {
  it("no direct .insert into sensor_readings", () => {
    expect(FN_ALL).not.toMatch(/from\(\s*["']sensor_readings["']\s*\)/);
  });
  it("no direct .insert into pi_ingest_idempotency_keys", () => {
    expect(FN_ALL).not.toMatch(
      /from\(\s*["']pi_ingest_idempotency_keys["']\s*\)\s*[\s\S]{0,40}\.insert/,
    );
  });
  it("no writes to alerts", () => {
    expect(FN_ALL).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
  });
  it("no writes to action_queue", () => {
    expect(FN_ALL).not.toMatch(/from\(\s*["']action_queue["']\s*\)/);
  });
});

describe("pi-ingest edge skeleton audit — no automation / device control", () => {
  it("no MQTT / Home Assistant / device-actuation strings", () => {
    const forbidden = [
      /\bmqtt\b/i,
      /home[_-]?assistant/i,
      /\bturn[_-]?on\b/i,
      /\bturn[_-]?off\b/i,
      /actuator/i,
    ];
    for (const re of forbidden) {
      expect(FN_ALL, `forbidden term ${re}`).not.toMatch(re);
    }
  });
});

describe("pi-ingest edge skeleton audit — decryption confinement", () => {
  it("decryption (crypto.subtle.decrypt) appears only inside the Edge Function dir", () => {
    // Confirm it appears in the resolver (operational), then confirm
    // it does NOT appear under src/.
    if (RESOLVER_SRC) {
      // Operational — recorded by the audit doc, not a regression.
      expect(RESOLVER_SRC).toMatch(/crypto\.subtle\.decrypt\s*\(/);
    }
    // Walk src/ — no .ts/.tsx file may contain decrypt APIs.
    const offenders: string[] = [];
    function walk(dir: string) {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const p = resolve(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (
            /crypto\.subtle\.decrypt\s*\(/.test(text) ||
            /\bcreateDecipheriv\s*\(/.test(text)
          ) {
            offenders.push(p);
          }
        }
      }
    }
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("crypto.ts is either absent or audit doc notes its absence", () => {
    if (!existsSync(FN_CRYPTO)) {
      expect(AUDIT).toMatch(/crypto\.ts[\s\S]{0,80}(not exist|does not exist|absent|never broken out)/i);
    } else {
      const src = readFileSync(FN_CRYPTO, "utf8");
      // If it exists later, must be a pure helper — no DB / no env / no logs of secrets.
      expect(src).not.toMatch(/from\(\s*["'](sensor_readings|alerts|action_queue|pi_ingest_idempotency_keys)["']/);
      expect(src).not.toMatch(/console\.(log|warn|error)\([^)]*\b(secret|ciphertext|nonce|key)\b/i);
    }
  });
});

describe("pi-ingest edge skeleton audit — secret mapping prohibitions", () => {
  it("no secret_hash → BridgeCredential.secret mapping anywhere in the function dir", () => {
    expect(FN_ALL).not.toMatch(/secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/);
    expect(FN_ALL).not.toMatch(/\bsecret_hash\s+as\s+secret\b/);
  });
  it("no secret_ciphertext directly assigned as BridgeCredential.secret", () => {
    // secret: row.secret_ciphertext (or similar) is forbidden — must
    // pass through the resolver instead.
    expect(FN_ALL).not.toMatch(/secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/);
    expect(FN_ALL).not.toMatch(/\bsecret_ciphertext\s+as\s+secret\b/);
  });
});

describe("pi-ingest edge skeleton audit — logging prohibitions", () => {
  it("no console.* of rawBody / raw_payload / signature / secret / sensor value", () => {
    const re =
      /console\.(log|info|warn|error|debug)\s*\([^)]*\b(rawBody|raw_payload|signature|secret|secret_hash|secret_ciphertext|secret_nonce|sensor_value|\.value)\b/i;
    expect(FN_ALL).not.toMatch(re);
  });
});

describe("pi-ingest edge skeleton audit — service_role confinement", () => {
  it("SUPABASE_SERVICE_ROLE_KEY is read only inside the Edge Function dir", () => {
    if (INDEX_SRC) {
      expect(INDEX_SRC).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
    const offenders: string[] = [];
    function walk(dir: string) {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const p = resolve(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          // Skip test files — they may mention the env name in
          // guardrail assertions without ever reading its value.
          if (/\.(test|spec)\.(ts|tsx)$/.test(name)) continue;
          const text = readFileSync(p, "utf8");
          if (/SUPABASE_SERVICE_ROLE_KEY/.test(text)) offenders.push(p);
        }
      }
    }
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

});

describe("pi-ingest edge skeleton audit — supporting docs intact", () => {
  it("contract doc says verify HMAC before any write", () => {
    expect(CONTRACT.length).toBeGreaterThan(0);
    expect(CONTRACT).toMatch(/verif/i);
    expect(CONTRACT).toMatch(/HMAC/);
  });
  it("secret resolution plan says Edge-Function-only resolution", () => {
    expect(PLAN.length).toBeGreaterThan(0);
    expect(PLAN).toMatch(
      /Edge\s+Function\s+is\s+the\s+only\s+place[\s\S]{0,120}resolve\s+usable[\s\S]{0,40}bridge\s+secret/i,
    );
  });
});
