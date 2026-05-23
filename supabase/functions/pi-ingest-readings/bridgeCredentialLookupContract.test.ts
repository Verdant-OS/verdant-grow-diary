// Deno tests for the server-only bridge credential lookup CONTRACT.
// Verifies the contract doc covers every required clause and that
// no lookup implementation, Supabase client, or service_role usage
// has crept into the Edge Function path or src/.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("../../../", import.meta.url);
const DOC_URL = new URL("docs/pi-ingest-bridge-credential-lookup-contract.md", ROOT);

async function readText(u: URL): Promise<string> {
  return await Deno.readTextFile(u);
}

async function walk(dir: URL, out: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === ".lovable"
    ) continue;
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) await walk(child, out);
    else out.push(child.pathname);
  }
  return out;
}

// ---------- Contract doc clauses ----------

Deno.test("contract doc exists", async () => {
  const stat = await Deno.stat(DOC_URL);
  assert(stat.isFile);
});

Deno.test("doc mentions bridge_id throughout", async () => {
  const d = await readText(DOC_URL);
  assertStringIncludes(d, "bridge_id");
});

Deno.test("doc calls out current (user_id, bridge_id) uniqueness gap", async () => {
  const d = await readText(DOC_URL);
  assert(/\(user_id,\s*bridge_id\)/.test(d));
  assert(/not\s+globally\s+unique/i.test(d));
});

Deno.test("doc says singular loadBridgeCredentialRow is unsafe without global uniqueness", async () => {
  const d = await readText(DOC_URL);
  assert(/loadBridgeCredentialRow/.test(d));
  assert(/unsafe[^.]*global(ly)?\s+unique/i.test(d));
});

Deno.test("doc recommends global bridge_id uniqueness or candidate lookup", async () => {
  const d = await readText(DOC_URL);
  assert(/global(ly)?\s+unique/i.test(d));
  assert(/loadBridgeCredentialCandidates/.test(d));
});

Deno.test("doc names candidate lookup if global uniqueness is not added", async () => {
  const d = await readText(DOC_URL);
  assert(/loadBridgeCredentialCandidates\s*\(/.test(d));
  assert(/candidate/i.test(d));
});

Deno.test("doc says server-side Edge Function only", async () => {
  const d = await readText(DOC_URL);
  assert(/Edge Function only|inside.*Edge Function/i.test(d));
  assertStringIncludes(d, "supabase/functions/pi-ingest-readings/");
});

Deno.test("doc forbids browser/client lookup", async () => {
  const d = await readText(DOC_URL);
  assert(/browser\/client/i.test(d));
  assert(/MUST NOT[^.]*browser|browser[^.]*MUST NOT/i.test(d));
});

Deno.test("doc forbids lookup under src/lib", async () => {
  const d = await readText(DOC_URL);
  assert(/src\/lib/i.test(d));
});

Deno.test("doc lists every required SELECT column", async () => {
  const d = await readText(DOC_URL);
  for (
    const col of [
      "bridge_id",
      "user_id",
      "is_active",
      "secret_ciphertext",
      "secret_nonce",
      "secret_key_version",
      "secret_status",
      "allowed_tent_ids",
      "last_used_at",
    ]
  ) {
    assertStringIncludes(d, col);
  }
});

Deno.test("doc forbids selecting secret_hash", async () => {
  const d = await readText(DOC_URL);
  assert(/MUST NOT select[\s\S]{0,400}secret_hash/i.test(d));
});

Deno.test("doc forbids selecting plaintext secret", async () => {
  const d = await readText(DOC_URL);
  assert(/plaintext\s+`?secret/i.test(d));
});

Deno.test("doc forbids selecting signature / raw body / raw payload", async () => {
  const d = await readText(DOC_URL);
  assertStringIncludes(d, "raw_body");
  assertStringIncludes(d, "raw_payload");
  assert(/signature/i.test(d));
});

Deno.test("doc forbids client-provided user_id", async () => {
  const d = await readText(DOC_URL);
  assert(/client-provided\s+`?user_id/i.test(d));
});

Deno.test("doc forbids bridge-provided owner id", async () => {
  const d = await readText(DOC_URL);
  assert(/bridge-provided\s+owner id/i.test(d));
});

Deno.test("doc says missing bridge id fails closed", async () => {
  const d = await readText(DOC_URL);
  assert(/Missing\s+`?bridge_id`?[\s\S]{0,200}(fail|reject)/i.test(d));
});

Deno.test("doc says unknown bridge id fails closed", async () => {
  const d = await readText(DOC_URL);
  assert(/Unknown\s+`?bridge_id`?[\s\S]{0,200}fail|reject/i.test(d));
});

Deno.test("doc says multiple rows fail closed unless candidate-mode is explicit", async () => {
  const d = await readText(DOC_URL);
  assert(/Multiple rows/i.test(d));
  assert(/candidate/i.test(d));
});

Deno.test("doc says lookup failure inserts zero sensor rows", async () => {
  const d = await readText(DOC_URL);
  assert(/Zero[\s\S]{0,80}sensor_readings/i.test(d));
});

Deno.test("doc says lookup failure records zero idempotency keys", async () => {
  const d = await readText(DOC_URL);
  assert(/Zero[\s\S]{0,80}pi_ingest_idempotency_keys/i.test(d));
});

Deno.test("doc says service role, if used, is Edge Function only", async () => {
  const d = await readText(DOC_URL);
  assertStringIncludes(d, "SUPABASE_SERVICE_ROLE_KEY");
  assert(/inside\s+this\s+Edge Function/i.test(d));
});

Deno.test("doc says service role is never exposed to browser/client", async () => {
  const d = await readText(DOC_URL);
  assert(/NEVER[\s\S]{0,200}browser\/client/i.test(d));
});

Deno.test("doc forbids writes", async () => {
  const d = await readText(DOC_URL);
  assert(/read-only|MUST NOT write/i.test(d));
});

Deno.test("doc includes stop-ship conditions", async () => {
  const d = await readText(DOC_URL);
  assert(/##\s*9\.\s*Stop-ship conditions/i.test(d));
});

// ---------- Static guardrails ----------

Deno.test("only the sanctioned lookup file exists in Edge Function dir", async () => {
  const files: string[] = [];
  for await (const e of Deno.readDir(HERE)) files.push(e.name);
  // The sanctioned helper is bridgeCredentialLookup.ts (added once
  // global bridge_id uniqueness was enforced). Other variants remain
  // forbidden to keep the lookup surface single-sourced.
  for (
    const forbidden of [
      "loadBridgeCredential.ts",
      "credentialLookup.ts",
    ]
  ) {
    assert(!files.includes(forbidden), `${forbidden} must not exist`);
  }
});

Deno.test("Supabase client import/construction is allowed in index.ts only", async () => {
  for await (const e of Deno.readDir(HERE)) {
    if (!e.isFile || !e.name.endsWith(".ts")) continue;
    if (e.name.endsWith(".test.ts")) continue;
    if (e.name === "index.ts") continue; // index.ts is the sanctioned site.
    const text = await readText(new URL(e.name, HERE));
    assert(
      !/from\s+["'][^"']*@supabase\/supabase-js[^"']*["']/.test(text),
      `${e.name} must not import @supabase/supabase-js (allowed in index.ts only)`,
    );
    assert(
      !/\bcreateClient\s*\(/.test(text),
      `${e.name} must not construct a Supabase client (allowed in index.ts only)`,
    );
  }
});

Deno.test("no SUPABASE_SERVICE_ROLE_KEY runtime read exists anywhere in src/", async () => {
  const srcDir = new URL("src/", ROOT);
  const files = await walk(srcDir);
  for (const p of files) {
    if (!/\.(ts|tsx)$/.test(p)) continue;
    // Guardrail tests legitimately enumerate the literal string as a
    // forbidden token; only runtime code is forbidden from reading it.
    if (/\.test\.(ts|tsx)$/.test(p)) continue;
    const text = await Deno.readTextFile(p);
    assert(
      !/SUPABASE_SERVICE_ROLE_KEY/.test(text),
      `${p} must not reference SUPABASE_SERVICE_ROLE_KEY`,
    );
  }
});

Deno.test("no service_role string in src/lib pi-ingest modules", async () => {
  const libDir = new URL("src/lib/", ROOT);
  for await (const e of Deno.readDir(libDir)) {
    if (!e.isFile) continue;
    if (!/^piIngest.*\.ts$/.test(e.name)) continue;
    const text = await Deno.readTextFile(new URL(e.name, libDir));
    assert(
      !/service_role/i.test(text),
      `src/lib/${e.name} must not reference service_role`,
    );
  }
});

Deno.test("SUPABASE_SERVICE_ROLE_KEY runtime read is limited to index.ts", async () => {
  for await (const e of Deno.readDir(HERE)) {
    if (!e.isFile || !e.name.endsWith(".ts")) continue;
    if (e.name.endsWith(".test.ts")) continue;
    if (e.name === "index.ts") continue;
    const text = await readText(new URL(e.name, HERE));
    assert(
      !/SUPABASE_SERVICE_ROLE_KEY/.test(text),
      `${e.name} must not reference SUPABASE_SERVICE_ROLE_KEY (allowed in index.ts only)`,
    );
  }
});

Deno.test("index.ts may consume credential lookup but still fails closed with no ingestion writes", async () => {
  const text = await readText(new URL("index.ts", HERE));
  // Post-auth fail-closed sentinel.
  assertStringIncludes(text, "auth_ok_pipeline_not_implemented");
  // No success path.
  assert(!/ok\s*:\s*true/.test(text), "index.ts must not expose a success path");
  // No ingestion-side writes / RPCs.
  for (
    const [label, re] of [
      ["insert", /\.insert\s*\(/],
      ["upsert", /\.upsert\s*\(/],
      ["update", /\.update\s*\(/],
      ["delete", /\.delete\s*\(/],
      ["rpc", /\.rpc\s*\(/],
      ["sensor_readings", /\bsensor_readings\b/],
      ["pi_ingest_idempotency_keys", /\bpi_ingest_idempotency_keys\b/],
      ["alerts from()", /from\(\s*["']alerts["']\s*\)/],
      ["action_queue from()", /from\(\s*["']action_queue["']\s*\)/],
    ] as Array<[string, RegExp]>
  ) {
    assert(!re.test(text), `index.ts must not contain forbidden ingestion surface: ${label}`);
  }
});
