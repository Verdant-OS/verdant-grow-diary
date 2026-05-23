/**
 * Static guardrails for the pi-ingest bridge secret encryption
 * key management contract. Docs + static repo scans only — no runtime
 * encryption/decryption, no Edge Function, no resolver may appear yet.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(ROOT, "docs/pi-ingest-secret-key-management.md");

const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

describe("pi-ingest secret key management — contract doc", () => {
  it("doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it.each([
    ["mentions PI_INGEST_SECRET_KEY_V1", /PI_INGEST_SECRET_KEY_V1/],
    ["mentions PI_INGEST_SECRET_KEY_V2", /PI_INGEST_SECRET_KEY_V2/],
    [
      "maps secret_key_version to env var version",
      /`?secret_key_version`?\s*=\s*1[\s\S]{0,40}PI_INGEST_SECRET_KEY_V1/,
    ],
    [
      "unknown key versions fail closed",
      /unknown\s+key\s+versions?[\s\S]{0,80}fail\s+closed/i,
    ],
    [
      "missing env key fails closed",
      /missing\s+env\s+key[\s\S]{0,80}fail\s+closed/i,
    ],
    [
      "decryption may run only in Edge Function",
      /decryption[\s\S]{0,80}only[\s\S]{0,80}Edge\s+Function/i,
    ],
    [
      "decryption must not run in React/browser/client",
      /decryption\s+MUST\s+NOT\s+run[\s\S]{0,200}(React|browser|client)/i,
    ],
    [
      "pure src/lib modules may not decrypt secrets",
      /pure\s+modules[\s\S]{0,80}src\/lib[\s\S]{0,200}(must\s+not\s+decrypt|types\s+and\s+contracts\s+only)/i,
    ],
    [
      "forbids plaintext secret storage",
      /Plaintext\s+bridge\s+secret\s+storage/i,
    ],
    [
      "forbids returning decrypted secrets to client",
      /Returning\s+decrypted\s+secret\s+material\s+to\s+the\s+client/i,
    ],
    [
      "forbids logging decrypted secrets",
      /Logging\s+decrypted\s+secrets/i,
    ],
    [
      "forbids logging ciphertext/nonce/key material",
      /Logging\s+ciphertext,\s*nonce,\s*or\s+key\s+material/i,
    ],
    [
      "forbids mapping secret_hash to BridgeCredential.secret",
      /Mapping\s+`?secret_hash`?\s+to\s+`?BridgeCredential\.secret`?/i,
    ],
    [
      "forbids mapping secret_ciphertext directly to BridgeCredential.secret",
      /Mapping\s+`?secret_ciphertext`?\s+directly\s+to\s+`?BridgeCredential\.secret`?/i,
    ],
    ["documents rotation procedure", /##\s*6\.\s*Rotation procedure/i],
    ["documents safe credential lifecycle", /##\s*7\.\s*Safe credential lifecycle/i],
    ["documents stop-ship conditions", /##\s*8\.\s*Stop-ship conditions/i],
  ])("%s", (_label, re) => {
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

const SELF = resolve(__dirname, "piIngestSecretKeyManagementContract.test.ts");

describe("pi-ingest secret key management — repo guardrails", () => {
  const srcFiles = walk(resolve(ROOT, "src")).filter(
    (p) => /\.(ts|tsx)$/.test(p) && p !== SELF,
  );

  it("no process.env.PI_INGEST_SECRET_KEY references in src/", () => {
    for (const f of srcFiles) {
      const text = readFileSync(f, "utf8");
      expect(text, `forbidden env read in ${f}`).not.toMatch(
        /process\.env\.PI_INGEST_SECRET_KEY/,
      );
    }
  });

  it("no Deno.env.get(\"PI_INGEST_SECRET_KEY...\") outside future Edge Function paths", () => {
    const edgeRoot = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    const all = [
      ...srcFiles,
      ...walk(resolve(ROOT, "supabase/functions")).filter((p) =>
        /\.(ts|tsx)$/.test(p),
      ),
    ];
    for (const f of all) {
      if (f.startsWith(edgeRoot)) continue;
      if (f === SELF) continue;
      const text = readFileSync(f, "utf8");
      expect(
        text,
        `forbidden Deno.env.get PI_INGEST_SECRET_KEY in ${f}`,
      ).not.toMatch(/Deno\.env\.get\(\s*["'`]PI_INGEST_SECRET_KEY/);
    }
  });

  it("no crypto.subtle.decrypt calls outside future Edge Function paths", () => {
    const edgeRoot = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    const all = [
      ...srcFiles,
      ...walk(resolve(ROOT, "supabase/functions")).filter((p) =>
        /\.(ts|tsx)$/.test(p),
      ),
    ];
    for (const f of all) {
      if (f.startsWith(edgeRoot)) continue;
      if (f === SELF) continue;
      const text = readFileSync(f, "utf8");
      expect(text, `forbidden crypto.subtle.decrypt in ${f}`).not.toMatch(
        /crypto\.subtle\.decrypt\s*\(/,
      );
    }
  });

  it("no createDecipheriv calls outside future Edge Function paths", () => {
    const edgeRoot = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    const all = [
      ...srcFiles,
      ...walk(resolve(ROOT, "supabase/functions")).filter((p) =>
        /\.(ts|tsx)$/.test(p),
      ),
    ];
    for (const f of all) {
      if (f.startsWith(edgeRoot)) continue;
      if (f === SELF) continue;
      const text = readFileSync(f, "utf8");
      expect(text, `forbidden createDecipheriv in ${f}`).not.toMatch(
        /\bcreateDecipheriv\s*\(/,
      );
    }
  });

  it("no resolver module exists yet", () => {
    expect(
      existsSync(resolve(ROOT, "src/lib/piIngestBridgeCredentialResolver.ts")),
    ).toBe(false);
  });

  it("pi-ingest-readings Edge Function, if present, does not yet read PI_INGEST_SECRET_KEY", () => {
    const fn = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
    if (!existsSync(fn)) return;
    const src = readFileSync(fn, "utf8");
    expect(src).not.toMatch(/PI_INGEST_SECRET_KEY/);
    expect(src).toMatch(/secret_resolver_not_implemented/);
  });

  it("no code maps secret_hash to a secret field", () => {
    for (const f of srcFiles) {
      const text = readFileSync(f, "utf8");
      for (const re of [
        /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/,
        /\bsecret_hash\s+as\s+secret\b/,
      ]) {
        expect(text, `forbidden secret_hash→secret in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no code maps secret_ciphertext to a secret field", () => {
    for (const f of srcFiles) {
      const text = readFileSync(f, "utf8");
      for (const re of [
        /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/,
        /\bsecret_ciphertext\s+as\s+secret\b/,
      ]) {
        expect(text, `forbidden secret_ciphertext→secret in ${f}`).not.toMatch(
          re,
        );
      }
    }
  });
});
