/**
 * Static guardrails for the pi-ingest idempotency storage migration.
 *
 * Storage foundation only — no Edge Function, no service_role, no
 * automation, no device control, no alert persistence changes, no
 * Action Queue changes, no AI Doctor changes, no PPFD/EC/reservoir
 * expansion, and no schema changes to `sensor_readings`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ROOT, stripSqlComments, walkDir } from "./gate-safety-utils";

const MIG_DIR = resolve(ROOT, "supabase/migrations");

function loadIdempotencyMigration(): string {
  for (const f of readdirSync(MIG_DIR)) {
    const txt = readFileSync(join(MIG_DIR, f), "utf8");
    if (/CREATE\s+TABLE\s+public\.pi_ingest_idempotency_keys/i.test(txt)) return txt;
  }
  return "";
}

const SQL = loadIdempotencyMigration();

describe("pi_ingest_idempotency_keys — migration exists", () => {
  it("creates the table", () => {
    expect(SQL).toMatch(/CREATE\s+TABLE\s+public\.pi_ingest_idempotency_keys/i);
  });
});

describe("pi_ingest_idempotency_keys — required columns", () => {
  it.each([
    ["id", /\bid\s+uuid\s+PRIMARY\s+KEY/i],
    ["user_id", /\buser_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i],
    [
      "tent_id",
      /\btent_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.tents\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    ],
    ["bridge_id", /\bbridge_id\s+text\s+NOT\s+NULL/i],
    ["device_id", /\bdevice_id\s+text\s+NOT\s+NULL/i],
    ["metric", /\bmetric\s+text\s+NOT\s+NULL/i],
    ["captured_at", /\bcaptured_at\s+timestamptz\s+NOT\s+NULL/i],
    ["idempotency_key", /\bidempotency_key\s+text\s+NOT\s+NULL/i],
    [
      "sensor_reading_id",
      /\bsensor_reading_id\s+uuid\s+NULL\s+REFERENCES\s+public\.sensor_readings\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    ],
    ["created_at", /\bcreated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i],
  ])("has column %s", (_n, re) => {
    expect(SQL).toMatch(re);
  });
});

describe("pi_ingest_idempotency_keys — constraints", () => {
  it("unique (user_id, idempotency_key)", () => {
    expect(SQL).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*idempotency_key\s*\)/i);
  });
  it("nonempty idempotency_key", () => {
    expect(SQL).toMatch(/idempotency_key\s*<>\s*''/);
  });
  it("nonempty bridge_id", () => {
    expect(SQL).toMatch(/bridge_id\s*<>\s*''/);
  });
  it("nonempty device_id", () => {
    expect(SQL).toMatch(/device_id\s*<>\s*''/);
  });
  it("captured_at not more than 5 minutes in future", () => {
    expect(SQL).toMatch(/captured_at\s*<=\s*now\(\)\s*\+\s*interval\s*'5\s*minutes'/i);
  });

  it.each(["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm", "soil_moisture_pct"])(
    "allows current metric %s",
    (m) => {
      expect(SQL).toContain(`'${m}'`);
    },
  );

  it.each(["ppfd", "dli", "soil_ec", "soil_temp", "reservoir_ec", "reservoir_ph"])(
    "does not allow future metric %s",
    (m) => {
      // metric whitelist literal must not include any future metric
      const checkBlock = SQL.match(/metric\s+IN\s*\(([\s\S]*?)\)/i)?.[1] ?? "";
      expect(checkBlock).not.toMatch(new RegExp(`'${m}'`));
    },
  );
});

describe("pi_ingest_idempotency_keys — indexes", () => {
  it("indexes (user_id, tent_id, created_at DESC)", () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX[\s\S]*?\(\s*user_id\s*,\s*tent_id\s*,\s*created_at\s+DESC\s*\)/i,
    );
  });
  it("indexes (user_id, bridge_id, created_at DESC)", () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX[\s\S]*?\(\s*user_id\s*,\s*bridge_id\s*,\s*created_at\s+DESC\s*\)/i,
    );
  });
});

describe("pi_ingest_idempotency_keys — RLS", () => {
  it("enables RLS", () => {
    expect(SQL).toMatch(
      /ALTER\s+TABLE\s+public\.pi_ingest_idempotency_keys\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });
  it("has owner-scoped SELECT policy", () => {
    expect(SQL).toMatch(/CREATE\s+POLICY[\s\S]*?FOR\s+SELECT[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i);
  });
  it("has owner-scoped INSERT policy with tent ownership check", () => {
    const insertBlock = SQL.match(/CREATE\s+POLICY[\s\S]*?FOR\s+INSERT[\s\S]*?;/i)?.[0] ?? "";
    expect(insertBlock).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    expect(insertBlock).toMatch(/EXISTS[\s\S]*?public\.tents/i);
    expect(insertBlock).toMatch(/t\.user_id\s*=\s*auth\.uid\(\)/);
  });
  it("does NOT define an UPDATE policy", () => {
    expect(SQL).not.toMatch(
      /CREATE\s+POLICY[\s\S]*?pi_ingest_idempotency_keys[\s\S]*?FOR\s+UPDATE/i,
    );
    expect(SQL).not.toMatch(/FOR\s+UPDATE[\s\S]*?pi_ingest_idempotency_keys/i);
  });
  it("does NOT define a DELETE policy", () => {
    expect(SQL).not.toMatch(/FOR\s+DELETE/i);
  });
  it("never grants to service_role", () => {
    // strip SQL line comments before scanning so explanatory comments are OK
    const noComments = stripSqlComments(SQL);
    expect(noComments).not.toMatch(/service_role/i);
  });
});

describe("pi_ingest_idempotency_keys — forbidden payload columns", () => {
  // No raw payload, signature, secret, rawBody, or sensor value lives here.
  it.each(["raw_payload", "raw_body", "signature", "secret", "value", "hmac"])(
    "does not include column %s",
    (col) => {
      // crude but effective: the create-table body must not declare the col
      const body =
        SQL.match(/CREATE\s+TABLE\s+public\.pi_ingest_idempotency_keys\s*\(([\s\S]*?)\);/i)?.[1] ??
        "";
      expect(body).not.toMatch(new RegExp(`\\b${col}\\b`, "i"));
    },
  );
});

describe("pi-ingest idempotency — repo-level safety", () => {
  it("does not add idempotency_key column to sensor_readings", () => {
    for (const f of readdirSync(MIG_DIR)) {
      const txt = readFileSync(join(MIG_DIR, f), "utf8");
      expect(txt).not.toMatch(
        /ALTER\s+TABLE\s+public\.sensor_readings[\s\S]*?ADD\s+COLUMN[\s\S]*?idempotency_key/i,
      );
    }
  });

  it("Edge Function, if present, does not write idempotency rows yet", () => {
    const fn = resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts");
    if (!existsSync(fn)) return;
    const src = readFileSync(fn, "utf8");
    expect(src).toMatch(/secret_resolver_not_implemented/);
    expect(src).not.toMatch(/\bpi_ingest_idempotency_keys\b/);
  });

  it("no src/lib pi-ingest module references service_role", () => {
    const files = walkDir(resolve(ROOT, "src/lib")).filter((p) => /piIngest/i.test(p));
    for (const f of files) {
      expect(readFileSync(f, "utf8")).not.toMatch(/service_role/i);
    }
  });

  it("no src/lib pi-ingest module writes to action_queue or alerts", () => {
    const files = walkDir(resolve(ROOT, "src/lib")).filter((p) => /piIngest/i.test(p));
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      expect(txt).not.toMatch(/from\(\s*['"]action_queue['"]/);
      expect(txt).not.toMatch(/from\(\s*['"]alerts['"]/);
    }
  });
});
