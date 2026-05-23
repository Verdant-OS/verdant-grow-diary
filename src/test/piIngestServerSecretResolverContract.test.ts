/**
 * Static guardrails for the pi-ingest server-only bridge secret resolver
 * contract. Docs + static repo scans only — no resolver implementation,
 * no Edge Function, no decryption, no service_role.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(
  ROOT,
  "docs/pi-ingest-server-secret-resolver-contract.md",
);
const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

describe("pi-ingest server secret resolver — contract doc", () => {
  it("doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it.each([
    ["mentions verifyBridgeRequest", /verifyBridgeRequest/],
    ["mentions secret_ciphertext", /secret_ciphertext/],
    ["mentions secret_nonce", /secret_nonce/],
    ["mentions secret_key_version", /secret_key_version/],
    ["mentions secret_status", /secret_status/],
    ["mentions bridge_id", /bridge_id/],
    [
      "server-side only",
      /only[\s\S]{0,20}inside\s+the\s+future\s+Supabase\s+Edge\s+Function/i,
    ],
    [
      "no React components",
      /MUST\s+NOT\s+run[\s\S]{0,200}React\s+components?/i,
    ],
    [
      "no browser/client bundles",
      /MUST\s+NOT\s+run[\s\S]{0,200}browser\/client\s+bundles?/i,
    ],
    [
      "no shared src/lib pure modules",
      /MUST\s+NOT\s+run[\s\S]{0,200}shared\s+`?src\/lib`?\s+pure\s+modules?/i,
    ],
    ["shared modules may define contracts/types only", /contracts\/types\s+only/i],
    [
      "secret never returned to caller",
      /Is\s+\*?\*?never\*?\*?\s+returned\s+to\s+the\s+bridge\s+caller/i,
    ],
    ["secret never logged", /Is\s+\*?\*?never\*?\*?\s+logged/i],
    ["secret never persisted", /Is\s+\*?\*?never\*?\*?\s+persisted/i],
    [
      "secret never cached across requests",
      /(never[\s\S]{0,40}cache|cach\w*[\s\S]{0,80}outlives\s+the\s+request)/i,
    ],
    [
      "unknown key version fails closed",
      /Unknown\s+key\s+version[\s\S]{0,80}reject/i,
    ],
    [
      "missing env key fails closed",
      /Missing\s+env\s+key[\s\S]{0,80}reject/i,
    ],
    [
      "decrypt error fails closed without leaking",
      /Decryption\s+error[\s\S]{0,80}without\s+leaking/i,
    ],
    [
      "failed resolution inserts zero sensor rows",
      /Inserts\s+\*?\*?zero\*?\*?\s+`?sensor_readings`?\s+rows/i,
    ],
    [
      "failed resolution records zero idempotency keys",
      /Records\s+\*?\*?zero\*?\*?\s+`?pi_ingest_idempotency_keys`?\s+rows/i,
    ],
    [
      "key version mapping references env vars",
      /PI_INGEST_SECRET_KEY_V1/,
    ],
    [
      "forbids mapping secret_hash to BridgeCredential.secret",
      /Mapping\s+`?secret_hash`?\s+to\s+`?BridgeCredential\.secret`?/i,
    ],
    [
      "forbids mapping secret_ciphertext directly to BridgeCredential.secret",
      /Mapping\s+`?secret_ciphertext`?\s+directly\s+to\s+`?BridgeCredential\.secret`?/i,
    ],
    [
      "forbids crypto.subtle.decrypt / createDecipheriv outside Edge Function",
      /(crypto\.subtle\.decrypt|createDecipheriv)[\s\S]{0,120}outside[\s\S]{0,80}Edge\s+Function/i,
    ],
    ["includes stop-ship conditions", /##\s*8\.\s*Stop-ship conditions/i],
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

const SELF = resolve(__dirname, "piIngestServerSecretResolverContract.test.ts");

describe("pi-ingest server secret resolver — repo guardrails", () => {
  it("no server secret resolver module exists yet", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter((p) =>
      /\.(ts|tsx)$/.test(p),
    );
    for (const f of files) {
      const base = f.split("/").pop() ?? "";
      expect(
        /ServerSecretResolver|BridgeSecretResolver|BridgeCredentialResolver/.test(
          base,
        ),
        `unexpected secret resolver: ${f}`,
      ).toBe(false);
    }
  });

  it("pi-ingest-readings Edge Function, if present, is fail-closed (no secret resolver)", () => {
    const fn = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
    if (!existsSync(fn)) return;
    const src = readFileSync(fn, "utf8");
    expect(src).toMatch(/secret_resolver_not_implemented/);
    expect(src).not.toMatch(/crypto\.subtle\.decrypt\s*\(/);
    expect(src).not.toMatch(/\bcreateDecipheriv\s*\(/);
    expect(src).not.toMatch(/PI_INGEST_SECRET_KEY/);
    expect(src).not.toMatch(/service_role/i);
  });

  it("no PI_INGEST_SECRET_KEY env reads anywhere in src/", () => {
    const files = walk(resolve(ROOT, "src")).filter(
      (p) => /\.(ts|tsx)$/.test(p) && p !== SELF,
    );
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, `env read in ${f}`).not.toMatch(
        /(process\.env|Deno\.env\.get\(\s*["'`])PI_INGEST_SECRET_KEY/,
      );
    }
  });

  it("no decryption APIs anywhere in src/", () => {
    const files = walk(resolve(ROOT, "src")).filter(
      (p) => /\.(ts|tsx)$/.test(p) && p !== SELF,
    );
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, `crypto.subtle.decrypt in ${f}`).not.toMatch(
        /crypto\.subtle\.decrypt\s*\(/,
      );
      expect(text, `createDecipheriv in ${f}`).not.toMatch(
        /\bcreateDecipheriv\s*\(/,
      );
    }
  });

  it("no client/browser code references secret resolver outputs", () => {
    const clientRoots = [
      resolve(ROOT, "src/components"),
      resolve(ROOT, "src/pages"),
      resolve(ROOT, "src/hooks"),
    ];
    for (const root of clientRoots) {
      const files = walk(root).filter((p) => /\.(ts|tsx)$/.test(p));
      for (const f of files) {
        const text = readFileSync(f, "utf8");
        for (const re of [
          /secret_ciphertext/,
          /secret_nonce/,
          /secret_key_version/,
          /secret_hash/,
        ]) {
          expect(text, `secret field leaked into ${f}`).not.toMatch(re);
        }
      }
    }
  });
});
