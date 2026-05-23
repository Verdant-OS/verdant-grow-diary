/**
 * Static guardrails for the pi-ingest bridge credential storage migration.
 *
 * Storage foundation only — no Edge Function, no service_role, no
 * plaintext secret storage, no UI, no automation, no device control,
 * no alert persistence changes, no Action Queue changes, no AI Doctor
 * changes, no PPFD/EC/reservoir expansion, no changes to existing
 * sensor pipeline behavior or the idempotency table.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function loadBridgeCredentialMigration(): string {
  for (const f of readdirSync(MIG_DIR)) {
    const txt = readFileSync(join(MIG_DIR, f), "utf8");
    if (
      /CREATE\s+TABLE\s+public\.pi_ingest_bridge_credentials/i.test(txt)
    )
      return txt;
  }
  return "";
}

const SQL = loadBridgeCredentialMigration();

describe("pi_ingest_bridge_credentials — migration exists", () => {
  it("creates the table", () => {
    expect(SQL).toMatch(
      /CREATE\s+TABLE\s+public\.pi_ingest_bridge_credentials/i,
    );
  });
});

describe("pi_ingest_bridge_credentials — required columns", () => {
  it.each([
    ["id", /\bid\s+uuid\s+PRIMARY\s+KEY/i],
    ["user_id", /\buser_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i],
    ["bridge_id", /\bbridge_id\s+text\s+NOT\s+NULL/i],
    ["secret_hash", /\bsecret_hash\s+text\s+NOT\s+NULL/i],
    ["secret_hint", /\bsecret_hint\s+text\s+NULL/i],
    [
      "allowed_tent_ids",
      /\ballowed_tent_ids\s+uuid\[\]\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::uuid\[\]/i,
    ],
    ["is_active", /\bis_active\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i],
    ["created_at", /\bcreated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i],
    ["updated_at", /\bupdated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i],
    ["last_used_at", /\blast_used_at\s+timestamptz\s+NULL/i],
  ])("has column %s", (_n, re) => {
    expect(SQL).toMatch(re);
  });
});

describe("pi_ingest_bridge_credentials — constraints", () => {
  it("unique (user_id, bridge_id)", () => {
    expect(SQL).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*bridge_id\s*\)/i);
  });
  it("nonempty bridge_id check", () => {
    expect(SQL).toMatch(/bridge_id\s*<>\s*''/);
  });
  it("nonempty secret_hash check", () => {
    expect(SQL).toMatch(/secret_hash\s*<>\s*''/);
  });
  it("active credential must have at least one allowed tent", () => {
    expect(SQL).toMatch(
      /is_active\s*=\s*false\s*OR\s*COALESCE\s*\(\s*array_length\s*\(\s*allowed_tent_ids/i,
    );
  });
});

describe("pi_ingest_bridge_credentials — indexes", () => {
  it("indexes (user_id, bridge_id)", () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?\(\s*user_id\s*,\s*bridge_id\s*\)/i,
    );
  });
  it("indexes (user_id, is_active)", () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?\(\s*user_id\s*,\s*is_active\s*\)/i,
    );
  });
});

describe("pi_ingest_bridge_credentials — RLS", () => {
  it("enables RLS", () => {
    expect(SQL).toMatch(
      /ALTER\s+TABLE\s+public\.pi_ingest_bridge_credentials\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  function policyBlock(re: RegExp): string {
    const m = SQL.match(re);
    return m ? m[0] : "";
  }

  it("has owner-scoped SELECT policy", () => {
    const block = policyBlock(
      /CREATE\s+POLICY[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?FOR\s+SELECT[\s\S]*?;/i,
    );
    expect(block).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
  });

  it("has owner-scoped INSERT policy", () => {
    const block = policyBlock(
      /CREATE\s+POLICY[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?FOR\s+INSERT[\s\S]*?;/i,
    );
    expect(block).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
  });

  it("UPDATE policy, if present, is owner-scoped only on both USING and WITH CHECK", () => {
    const block = policyBlock(
      /CREATE\s+POLICY[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?FOR\s+UPDATE[\s\S]*?;/i,
    );
    if (block !== "") {
      // both USING and WITH CHECK must restrict to owner
      const usingMatches = block.match(/USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      const checkMatches = block.match(/WITH\s+CHECK\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      expect(usingMatches).not.toBeNull();
      expect(checkMatches).not.toBeNull();
      // and must NOT use a true-everywhere expression
      expect(block).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(block).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    }
  });

  it("does NOT define a DELETE policy", () => {
    expect(SQL).not.toMatch(
      /CREATE\s+POLICY[\s\S]*?pi_ingest_bridge_credentials[\s\S]*?FOR\s+DELETE/i,
    );
  });

  it("never grants to service_role", () => {
    const noComments = SQL.replace(/^\s*--.*$/gm, "");
    expect(noComments).not.toMatch(/service_role/i);
  });
});

describe("pi_ingest_bridge_credentials — forbidden payload columns", () => {
  // Never store plaintext secret, raw bodies, signatures, payloads,
  // sensor values, or HMAC material on this table.
  it.each([
    "secret", // plaintext secret — only secret_hash and secret_hint are allowed
    "signature",
    "raw_body",
    "raw_payload",
    "value",
    "hmac",
    "plaintext",
  ])("does not include column %s", (col) => {
    const body =
      SQL.match(
        /CREATE\s+TABLE\s+public\.pi_ingest_bridge_credentials\s*\(([\s\S]*?)\);/i,
      )?.[1] ?? "";
    // allow secret_hash and secret_hint, but reject a bare `secret` column.
    if (col === "secret") {
      // strip allowed columns first
      const stripped = body
        .replace(/secret_hash[^,\n]*/gi, "")
        .replace(/secret_hint[^,\n]*/gi, "");
      expect(stripped).not.toMatch(/\bsecret\b/i);
    } else {
      expect(body).not.toMatch(new RegExp(`\\b${col}\\b`, "i"));
    }
  });
});

describe("pi-ingest bridge credentials — repo-level / project safety", () => {
  it("does not create a pi-ingest-readings Edge Function", () => {
    expect(
      existsSync(resolve(ROOT, "supabase/functions/pi-ingest-readings")),
    ).toBe(false);
  });

  it("does not alter sensor_readings to add credential columns", () => {
    for (const f of readdirSync(MIG_DIR)) {
      const txt = readFileSync(join(MIG_DIR, f), "utf8");
      expect(txt).not.toMatch(
        /ALTER\s+TABLE\s+public\.sensor_readings[\s\S]*?ADD\s+COLUMN[\s\S]*?secret_hash/i,
      );
      expect(txt).not.toMatch(
        /ALTER\s+TABLE\s+public\.sensor_readings[\s\S]*?ADD\s+COLUMN[\s\S]*?bridge_id/i,
      );
    }
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

  it("no src/lib pi-ingest module references service_role", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter((p) =>
      /piIngest/i.test(p),
    );
    for (const f of files) {
      expect(readFileSync(f, "utf8")).not.toMatch(/service_role/i);
    }
  });

  it("no src/lib pi-ingest module writes to action_queue, alerts, or sensor_readings", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter((p) =>
      /piIngest/i.test(p),
    );
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      expect(txt).not.toMatch(/from\(\s*['"]action_queue['"]/);
      expect(txt).not.toMatch(/from\(\s*['"]alerts['"]/);
      // pi-ingest pure modules must not insert into sensor_readings either.
      expect(txt).not.toMatch(
        /from\(\s*['"]sensor_readings['"]\s*\)[\s\S]*?\.insert\(/,
      );
    }
  });

  it("static safety: no automation / device-control strings in pi-ingest modules", () => {
    const files = walk(resolve(ROOT, "src/lib")).filter((p) =>
      /piIngest/i.test(p),
    );
    const banned = [
      /\bMQTT\b/,
      /\brelay\b/i,
      /\bactuator\b/i,
      /home[_-]?assistant/i,
      /webhook[_-]?execute/i,
      /device[_-]?command/i,
    ];
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const re of banned) {
        expect(txt).not.toMatch(re);
      }
    }
  });
});
