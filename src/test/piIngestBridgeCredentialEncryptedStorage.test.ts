/**
 * Static guardrails for the encrypted bridge credential storage foundation.
 *
 * Storage only — no Edge Function, no resolver, no encryption/decryption
 * logic, no service_role usage, no UI, no sensor insert behavior
 * changes, no Action Queue / alert / automation changes.
 *
 * The base-table client SELECT policy MUST be removed once encrypted
 * secret material lives on this table; a metadata-only safe view is the
 * sanctioned client read path.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function loadAllMigrations(): string {
  return readdirSync(MIG_DIR)
    .sort()
    .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
    .join("\n\n");
}

function loadEncryptedMigration(): string {
  // The encrypted-secret migration ALTERs the bridge credentials table to
  // add secret_ciphertext.
  for (const f of readdirSync(MIG_DIR).sort()) {
    const txt = readFileSync(join(MIG_DIR, f), "utf8");
    if (
      /ALTER\s+TABLE\s+public\.pi_ingest_bridge_credentials[\s\S]*?secret_ciphertext/i.test(
        txt,
      )
    )
      return txt;
  }
  return "";
}

const ALL_SQL = loadAllMigrations();
const SQL = loadEncryptedMigration();

describe("pi_ingest_bridge_credentials — encrypted columns", () => {
  it("migration exists and alters the bridge credentials table", () => {
    expect(SQL).not.toEqual("");
    expect(SQL).toMatch(
      /ALTER\s+TABLE\s+public\.pi_ingest_bridge_credentials/i,
    );
  });

  it.each([
    ["secret_ciphertext", /ADD\s+COLUMN\s+secret_ciphertext\s+bytea\s+NULL/i],
    ["secret_nonce", /ADD\s+COLUMN\s+secret_nonce\s+bytea\s+NULL/i],
    ["secret_key_version", /ADD\s+COLUMN\s+secret_key_version\s+integer\s+NULL/i],
    [
      "secret_status",
      /ADD\s+COLUMN\s+secret_status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'pending_rotation'/i,
    ],
  ])("adds column %s", (_n, re) => {
    expect(SQL).toMatch(re);
  });
});

describe("pi_ingest_bridge_credentials — encrypted check constraints", () => {
  it("secret_status allowed values are constrained", () => {
    expect(SQL).toMatch(
      /CHECK\s*\(\s*secret_status\s+IN\s*\(\s*'pending_rotation'\s*,\s*'active_encrypted'\s*,\s*'disabled'\s*\)/i,
    );
  });

  it("active credentials require active_encrypted secret status", () => {
    expect(SQL).toMatch(
      /CHECK\s*\(\s*is_active\s*=\s*false\s+OR\s+secret_status\s*=\s*'active_encrypted'/i,
    );
  });

  it("active_encrypted requires ciphertext, nonce, and key version", () => {
    expect(SQL).toMatch(
      /CHECK\s*\([\s\S]*?secret_status\s*<>\s*'active_encrypted'\s+OR\s*\(\s*secret_ciphertext\s+IS\s+NOT\s+NULL[\s\S]*?secret_nonce\s+IS\s+NOT\s+NULL[\s\S]*?secret_key_version\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("secret_key_version must be positive when present", () => {
    expect(SQL).toMatch(
      /CHECK\s*\(\s*secret_key_version\s+IS\s+NULL\s+OR\s+secret_key_version\s*>\s*0/i,
    );
  });
});

describe("pi_ingest_bridge_credentials — forbidden columns (defense)", () => {
  it.each([
    "signature",
    "raw_body",
    "raw_payload",
    "hmac",
  ])("does not add %s column anywhere across migrations", (col) => {
    // confine to ALTERs targeting our table
    const alters = ALL_SQL
      .split(/;\s*\n/)
      .filter((stmt) =>
        /pi_ingest_bridge_credentials/i.test(stmt) &&
        /\bADD\s+COLUMN\b/i.test(stmt),
      )
      .join("\n;\n");
    expect(alters).not.toMatch(new RegExp(`\\b${col}\\b`, "i"));
  });

  it("does not add a plaintext `secret` column", () => {
    // Look for any ADD COLUMN whose first identifier is exactly `secret`.
    const addColRe = /ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    const stmts = ALL_SQL
      .split(/;\s*\n/)
      .filter((stmt) => /pi_ingest_bridge_credentials/i.test(stmt));
    for (const stmt of stmts) {
      for (const m of stmt.matchAll(addColRe)) {
        expect(m[1].toLowerCase()).not.toBe("secret");
      }
    }
  });

  it("does not add a `value` column", () => {
    const alters = ALL_SQL
      .split(/;\s*\n/)
      .filter((stmt) =>
        /pi_ingest_bridge_credentials/i.test(stmt) &&
        /\bADD\s+COLUMN\b/i.test(stmt),
      )
      .join("\n;\n");
    expect(alters).not.toMatch(/\bvalue\b/i);
  });
});

describe("pi_ingest_bridge_credentials — base-table SELECT removal", () => {
  it("encrypted migration drops the base-table owner SELECT policy", () => {
    expect(SQL).toMatch(
      /DROP\s+POLICY[\s\S]*?Users view own pi_ingest_bridge_credentials[\s\S]*?ON\s+public\.pi_ingest_bridge_credentials/i,
    );
  });

  it("no CREATE POLICY ... FOR SELECT exists on the base table after migration sequence", () => {
    // Find the LAST mention of base-table SELECT policy create vs drop.
    const createCount = (
      ALL_SQL.match(
        /CREATE\s+POLICY[^;]*pi_ingest_bridge_credentials[^;]*FOR\s+SELECT/gi,
      ) ?? []
    ).length;
    const dropCount = (
      ALL_SQL.match(
        /DROP\s+POLICY[^;]*pi_ingest_bridge_credentials/gi,
      ) ?? []
    ).length;
    // After all migrations: at least one drop offsets the original create.
    expect(dropCount).toBeGreaterThanOrEqual(1);
    expect(createCount).toBeLessThanOrEqual(dropCount);
  });
});

describe("pi_ingest_bridge_credentials_safe — metadata-only view (deferred)", () => {
  // The view was originally created with SECURITY DEFINER behavior
  // (security_invoker = false). To resolve Supabase lint 0010
  // (Security Definer View) without weakening credential secrecy by
  // re-adding a base-table SELECT policy, a later migration drops the
  // view entirely. A safer server-only access path is deferred until
  // bridge management UI ships.
  const createCount = (
    ALL_SQL.match(
      /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+public\.pi_ingest_bridge_credentials_safe/gi,
    ) ?? []
  ).length;
  const dropCount = (
    ALL_SQL.match(
      /DROP\s+VIEW\s+(IF\s+EXISTS\s+)?public\.pi_ingest_bridge_credentials_safe/gi,
    ) ?? []
  ).length;
  const viewExistsAfterMigrations = createCount > dropCount;

  it("either drops the safe view or keeps it free of SECURITY DEFINER behavior", () => {
    if (viewExistsAfterMigrations) {
      expect(ALL_SQL).toMatch(
        /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+public\.pi_ingest_bridge_credentials_safe[\s\S]*?security_invoker\s*=\s*true/i,
      );
    } else {
      expect(dropCount).toBeGreaterThanOrEqual(1);
    }
  });

  it.each([
    "secret_hash",
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
  ])("if view exists, it does not expose %s", (col) => {
    if (!viewExistsAfterMigrations) return;
    const viewBlock =
      ALL_SQL.match(
        /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+public\.pi_ingest_bridge_credentials_safe[\s\S]*?FROM\s+public\.pi_ingest_bridge_credentials[\s\S]*?;/i,
      )?.[0] ?? "";
    expect(viewBlock).not.toMatch(new RegExp(`\\b${col}\\b`, "i"));
  });

  it("if view exists, it filters by auth.uid()", () => {
    if (!viewExistsAfterMigrations) return;
    expect(ALL_SQL).toMatch(
      /pi_ingest_bridge_credentials_safe[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i,
    );
  });

  it("safe view is not granted to anon or public in any migration", () => {
    // Statement-scoped: each GRANT statement individually must not target anon/public.
    const grants = ALL_SQL
      .split(/;\s*\n/)
      .filter((stmt) =>
        /^\s*GRANT\b/i.test(stmt) &&
        /pi_ingest_bridge_credentials_safe/i.test(stmt),
      );
    for (const stmt of grants) {
      expect(stmt).not.toMatch(/\bTO\s+anon\b/i);
      expect(stmt).not.toMatch(/\bTO\s+public\b/i);
    }
  });
});

describe("pi_ingest_bridge_credentials — encrypted migration safety guards", () => {
  it("encrypted migration never grants to service_role", () => {
    const noComments = SQL.replace(/^\s*--.*$/gm, "");
    expect(noComments).not.toMatch(/service_role/i);
  });

  it("encrypted migration does not alter sensor_readings", () => {
    expect(SQL).not.toMatch(/ALTER\s+TABLE\s+public\.sensor_readings/i);
  });

  it("encrypted migration does not alter idempotency table", () => {
    expect(SQL).not.toMatch(
      /ALTER\s+TABLE\s+public\.pi_ingest_idempotency_keys/i,
    );
  });

  it("encrypted migration does not alter alerts / action_queue", () => {
    expect(SQL).not.toMatch(/ALTER\s+TABLE\s+public\.alerts\b/i);
    expect(SQL).not.toMatch(/ALTER\s+TABLE\s+public\.action_queue\b/i);
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

describe("pi-ingest encrypted secret — repo guardrails", () => {
  it("Edge Function, if present, is fail-closed and does not touch encrypted credential rows", () => {
    const fn = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
    if (!existsSync(fn)) return;
    const src = readFileSync(fn, "utf8");
    expect(src).toMatch(/secret_resolver_not_implemented/);
    expect(src).not.toMatch(/secret_ciphertext/);
    expect(src).not.toMatch(/secret_nonce/);
  });

  it("no resolver module exists yet", () => {
    expect(
      existsSync(resolve(ROOT, "src/lib/piIngestBridgeCredentialResolver.ts")),
    ).toBe(false);
  });

  it("no code maps secret_hash or secret_ciphertext into a `secret` field", () => {
    const files = walkSrc(resolve(ROOT, "src")).filter((p) =>
      /\.(ts|tsx)$/.test(p),
    );
    const forbidden = [
      /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/,
      /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/,
      /\bsecret_hash\s+as\s+secret\b/,
      /\bsecret_ciphertext\s+as\s+secret\b/,
    ];
    for (const f of files) {
      if (
        f.endsWith("piIngestBridgeSecretStrategy.test.ts") ||
        f.endsWith("piIngestBridgeCredentialEncryptedStorage.test.ts")
      )
        continue;
      const text = readFileSync(f, "utf8");
      for (const re of forbidden) {
        expect(text, `forbidden mapping in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no pi-ingest pure module references service_role or device control", () => {
    const files = walkSrc(resolve(ROOT, "src/lib")).filter((p) =>
      /piIngest/i.test(p),
    );
    const banned = [
      /service_role/i,
      /\bMQTT\b/,
      /\brelay\b/i,
      /\bactuator\b/i,
      /home[_-]?assistant/i,
      /device[_-]?command/i,
    ];
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const re of banned) {
        expect(txt, `banned token in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no pi-ingest module inserts into sensor_readings, alerts, or action_queue", () => {
    const files = walkSrc(resolve(ROOT, "src/lib")).filter((p) =>
      /piIngest/i.test(p),
    );
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      expect(txt).not.toMatch(/from\(\s*['"]action_queue['"]/);
      expect(txt).not.toMatch(/from\(\s*['"]alerts['"]/);
      expect(txt).not.toMatch(
        /from\(\s*['"]sensor_readings['"]\s*\)[\s\S]*?\.insert\(/,
      );
    }
  });
});
