/**
 * Static guardrails for the pi-ingest bridge credential secret-resolution
 * strategy audit. Docs + static tests only — no Edge Function, no
 * resolver module, no service_role usage may appear yet.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC = readFileSync(
  resolve(ROOT, "docs/pi-ingest-readings-contract.md"),
  "utf8",
);

describe("pi-ingest contract — bridge secret strategy section", () => {
  it("has a Section 12 secret resolution strategy", () => {
    expect(DOC).toMatch(/##\s*12\.\s*Bridge secret resolution strategy/i);
  });

  it.each([
    [
      "secret_hash alone cannot verify HMAC",
      /`?secret_hash`?[\s\S]{0,80}cannot\s+verify[\s\S]{0,40}HMAC/i,
    ],
    [
      "resolver must not map secret_hash to BridgeCredential.secret",
      /resolver\s+must\s+not\s+map\s+`?secret_hash`?\s+to\s+`?(BridgeCredential\.)?secret`?/i,
    ],
    [
      "usable secret material must be resolved server-side",
      /usable\s+(shared\s+)?secret\s+material[\s\S]{0,80}server-side/i,
    ],
    [
      "no plaintext secret storage",
      /database\s+must\s+not\s+store\s+the\s+plaintext\s+bridge\s+secret/i,
    ],
    [
      "browser/client never receives raw secret",
      /browser\/client\s+must\s+never\s+receive\s+the\s+raw\s+bridge\s+secret/i,
    ],
    [
      "Edge Function implementation is blocked until strategy finalized",
      /Edge\s+Function\s+implementation\s+is\s+\*?\*?blocked\*?\*?\s+until[\s\S]{0,80}secret\s+resolution\s+strategy/i,
    ],
    [
      "documents Option A encrypted secret",
      /Option\s+A[\s\S]{0,40}Encrypted/i,
    ],
    [
      "documents Option B vault / server-side store",
      /Option\s+B[\s\S]{0,80}(Vault|server-side\s+secret\s+store)/i,
    ],
    [
      "shown once at creation if UI added",
      /only\s+once\s+at\s+creation/i,
    ],
  ])("contract documents: %s", (_l, re) => {
    expect(DOC).toMatch(re);
  });
});

function walkSrc(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSrc(p, acc);
    else acc.push(p);
  }
  return acc;
}

describe("pi-ingest bridge secret — repo guardrails", () => {
  it("no resolver module exists yet", () => {
    expect(
      existsSync(resolve(ROOT, "src/lib/piIngestBridgeCredentialResolver.ts")),
    ).toBe(false);
  });

  it("no source file maps secret_hash to a secret field", () => {
    const files = walkSrc(resolve(ROOT, "src")).filter((p) =>
      /\.(ts|tsx)$/.test(p),
    );
    const forbidden = [
      /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/,
      /secret\s*:\s*row\.secret_hash\b/,
      /\bsecret_hash\s+as\s+secret\b/,
    ];
    for (const f of files) {
      // Skip this guardrail test file itself
      if (f.endsWith("piIngestBridgeSecretStrategy.test.ts")) continue;
      const text = readFileSync(f, "utf8");
      for (const re of forbidden) {
        expect(text, `forbidden mapping in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no pi-ingest-readings Edge Function exists yet", () => {
    expect(
      existsSync(resolve(ROOT, "supabase/functions/pi-ingest-readings")),
    ).toBe(false);
  });
});
