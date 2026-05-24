/**
 * Static guardrails for the Supabase lint 0010 (Security Definer View)
 * fix on public.pi_ingest_bridge_credentials_safe.
 *
 * Fallback path: the view is dropped. A SECURITY INVOKER replacement
 * is not viable yet because the base table intentionally has no
 * owner-scoped SELECT policy (storing encrypted bridge secrets).
 *
 * Scope:
 * - Migration + static guardrails only.
 * - No Edge Function. No service_role. No UI. No sensor inserts.
 * - No alert/Action Queue/automation changes.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

const MIG_FILES = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const ALL_SQL = MIG_FILES.map((f) =>
  readFileSync(join(MIG_DIR, f), "utf8"),
).join("\n\n-- FILE BOUNDARY --\n\n");

const SAFE_VIEW = "pi_ingest_bridge_credentials_safe";

const createCount = (
  ALL_SQL.match(
    new RegExp(
      `CREATE\\s+(OR\\s+REPLACE\\s+)?VIEW\\s+public\\.${SAFE_VIEW}`,
      "gi",
    ),
  ) ?? []
).length;
const dropCount = (
  ALL_SQL.match(
    new RegExp(
      `DROP\\s+VIEW\\s+(IF\\s+EXISTS\\s+)?public\\.${SAFE_VIEW}`,
      "gi",
    ),
  ) ?? []
).length;
const viewExistsAfterMigrations = createCount > dropCount;

describe("pi_ingest_bridge_credentials_safe — SECURITY DEFINER lint fix", () => {
  it("a migration drops or rebuilds the safe view", () => {
    expect(createCount + dropCount).toBeGreaterThanOrEqual(2);
    expect(dropCount).toBeGreaterThanOrEqual(1);
  });

  it("if the view exists after all migrations, it is SECURITY INVOKER", () => {
    if (!viewExistsAfterMigrations) return;
    expect(ALL_SQL).toMatch(
      new RegExp(
        `CREATE\\s+(OR\\s+REPLACE\\s+)?VIEW\\s+public\\.${SAFE_VIEW}[\\s\\S]*?security_invoker\\s*=\\s*true`,
        "i",
      ),
    );
  });

  it("if the view exists, it filters owner rows via auth.uid()", () => {
    if (!viewExistsAfterMigrations) return;
    expect(ALL_SQL).toMatch(
      new RegExp(
        `${SAFE_VIEW}[\\s\\S]*?auth\\.uid\\(\\)\\s*=\\s*user_id`,
        "i",
      ),
    );
  });

  const FORBIDDEN_COLUMNS = [
    "secret_hash",
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
    "signature",
    "raw_body",
    "raw_payload",
    "hmac",
  ] as const;

  it.each(FORBIDDEN_COLUMNS)(
    "if the view exists, it does not expose %s",
    (col) => {
      if (!viewExistsAfterMigrations) return;
      const block =
        ALL_SQL.match(
          new RegExp(
            `CREATE\\s+(OR\\s+REPLACE\\s+)?VIEW\\s+public\\.${SAFE_VIEW}[\\s\\S]*?FROM\\s+public\\.pi_ingest_bridge_credentials[\\s\\S]*?;`,
            "i",
          ),
        )?.[0] ?? "";
      expect(block).not.toMatch(new RegExp(`\\b${col}\\b`, "i"));
    },
  );

  it("if the view exists, it does not expose a bare plaintext 'secret' or 'value' column", () => {
    if (!viewExistsAfterMigrations) return;
    const block =
      ALL_SQL.match(
        new RegExp(
          `CREATE\\s+(OR\\s+REPLACE\\s+)?VIEW\\s+public\\.${SAFE_VIEW}[\\s\\S]*?FROM\\s+public\\.pi_ingest_bridge_credentials[\\s\\S]*?;`,
          "i",
        ),
      )?.[0] ?? "";
    // Allow secret_hint/secret_status, but reject a bare secret column.
    const stripped = block
      .replace(/secret_hint/gi, "")
      .replace(/secret_status/gi, "");
    expect(stripped).not.toMatch(/\bsecret\b/i);
    expect(stripped).not.toMatch(/\bvalue\b/i);
  });
});

describe("lint-fix migration — safety guardrails", () => {
  function findLintFixMigration(): string {
    for (const f of MIG_FILES) {
      const txt = readFileSync(join(MIG_DIR, f), "utf8");
      if (
        new RegExp(
          `DROP\\s+VIEW\\s+(IF\\s+EXISTS\\s+)?public\\.${SAFE_VIEW}`,
          "i",
        ).test(txt)
      ) {
        return txt;
      }
    }
    return "";
  }
  const FIX = findLintFixMigration();

  it("lint-fix migration exists", () => {
    expect(FIX).not.toEqual("");
  });

  it("lint-fix migration does not introduce service_role", () => {
    const noComments = FIX.replace(/^\s*--.*$/gm, "");
    expect(noComments).not.toMatch(/service_role/i);
  });

  it("lint-fix migration does not introduce SECURITY DEFINER", () => {
    expect(FIX).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("lint-fix migration does not touch sensor_readings, alerts, action_queue, or idempotency tables", () => {
    expect(FIX).not.toMatch(/\bsensor_readings\b/i);
    expect(FIX).not.toMatch(/\balerts\b/i);
    expect(FIX).not.toMatch(/\baction_queue\b/i);
    expect(FIX).not.toMatch(/\bpi_ingest_idempotency_keys\b/i);
  });

  it("lint-fix migration does not add new broad grants", () => {
    expect(FIX).not.toMatch(/GRANT[\s\S]*?\bTO\s+(public|anon)\b/i);
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

describe("repo-wide safety after lint fix", () => {
  it("no new Edge Function directory was added for bridge credential metadata", () => {
    const fnDir = resolve(ROOT, "supabase/functions");
    if (!existsSync(fnDir)) return;
    for (const name of readdirSync(fnDir)) {
      expect(name).not.toMatch(/bridge[_-]?credential[_-]?metadata/i);
      expect(name).not.toMatch(/bridge[_-]?credentials[_-]?safe/i);
    }
  });

  it("no client code reads from pi_ingest_bridge_credentials_safe", () => {
    const files = walk(resolve(ROOT, "src")).filter((p) =>
      /\.(ts|tsx)$/.test(p),
    );
    for (const f of files) {
      // types.ts is auto-generated; allow type references but no runtime reads.
      if (/integrations\/supabase\/types\.ts$/.test(f)) continue;
      const txt = readFileSync(f, "utf8");
      expect(txt).not.toMatch(
        /from\(\s*['"]pi_ingest_bridge_credentials_safe['"]/,
      );
    }
  });
});
