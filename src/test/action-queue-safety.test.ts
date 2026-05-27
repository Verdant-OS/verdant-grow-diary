/**
 * Action Queue safety regression tests for Verdant.
 *
 * Verdant currently has NO action_queue table and NO device-control surface.
 * AI Coach is suggest-only by construction: it returns structured JSON to the
 * user and never writes side effects, never opens MQTT / Home Assistant /
 * Pi-bridge / webhook sockets, and the schema has no table that could be used
 * to drive equipment.
 *
 * These tests lock that posture in TWO ways:
 *
 *   A. CURRENT-STATE assertions — fail loudly if any device-control code is
 *      introduced into the repo (ai-coach edge function or anywhere in src/
 *      / supabase/functions/).
 *
 *   B. FUTURE-PROOF assertions — if/when a migration introduces the
 *      `action_queue` table, it MUST satisfy the safety contract:
 *        - default status = 'pending_approval'
 *        - required columns: user_id, grow_id, action_type, target,
 *          reason, risk_level, status, created_at
 *        - RLS enabled with user-scoped policies
 *        - no service-role bypass on writes
 *      Until that migration exists those assertions are gated behind a
 *      detection step and reported as "n/a (table not yet introduced)".
 *
 * Do NOT relax these tests without a security review.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const AI_COACH_SRC = readFileSync(
  resolve(ROOT, "supabase/functions/ai-coach/index.ts"),
  "utf8",
);
const TYPES_SRC = readFileSync(
  resolve(ROOT, "src/integrations/supabase/types.ts"),
  "utf8",
);

// Recursively collect text files under a directory, excluding test files and
// this file (so we don't false-positive on our own regex strings).
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx|js|jsx|sql|toml)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const SCAN_PATHS = [
  ...walk(resolve(ROOT, "src")),
  ...walk(resolve(ROOT, "supabase/functions")),
].filter((p) => !p.includes("/test/") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));

function readAll(): string {
  return SCAN_PATHS.map((p) => readFileSync(p, "utf8")).join("\n\n//FILE\n\n");
}
const ALL_PROD_CODE = readAll();

// Find the migration that introduces the action_queue TABLE (for table-shape checks).
function findActionQueueMigration(): string | null {
  const migDir = resolve(ROOT, "supabase/migrations");
  for (const name of readdirSync(migDir)) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(migDir, name), "utf8");
    if (/create\s+table[^;]*\baction_queue\b/i.test(sql)) return sql;
  }
  return null;
}

// Concatenate EVERY migration that touches action_queue — needed because later
// migrations may DROP + recreate policies to tighten checks.
function readAllActionQueueMigrations(): string {
  const migDir = resolve(ROOT, "supabase/migrations");
  const chunks: string[] = [];
  for (const name of readdirSync(migDir).sort()) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(migDir, name), "utf8");
    if (/\baction_queue\b/i.test(sql)) chunks.push(sql);
  }
  return chunks.join("\n\n");
}
const ACTION_QUEUE_SQL = findActionQueueMigration();
const ALL_ACTION_QUEUE_SQL = readAllActionQueueMigrations();
const HAS_ACTION_QUEUE_TABLE = /action_queue/i.test(TYPES_SRC) || !!ACTION_QUEUE_SQL;

// Strip JS/TS comments for source-shape checks on ai-coach.
const AI_COACH_CODE = AI_COACH_SRC
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Action Queue safety — current posture (suggest-only by construction)", () => {
  it("1. ai-coach performs NO writes (no .insert / .upsert / .update / .delete / .rpc)", () => {
    // Strong invariant: the AI Coach must be read-only on the database.
    expect(AI_COACH_CODE).not.toMatch(/\.insert\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.upsert\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.update\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.delete\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.rpc\s*\(/);
    // And specifically never writes to action_queue (even once the table exists).
    expect(AI_COACH_CODE).not.toMatch(/action_queue/i);
  });

  it("2. no AI / coach code reaches MQTT, Home Assistant, Pi bridge, webhooks, or device endpoints", () => {
    const banned: Array<{ name: string; re: RegExp }> = [
      { name: "MQTT", re: /\bmqtt:\/\//i },
      { name: "MQTT client", re: /\bmqtt\.connect\b/i },
      { name: "Pi bridge HTTP", re: /pi[\s_-]?bridge\.(?:local|lan|home|io|net|com)/i },
      { name: "webhook URL var", re: /\bWEBHOOK_URL\b/ },
      { name: "device_command", re: /device_command/i },
      { name: "actuator call", re: /\bactuator\.(send|trigger|run|fire)/i },
      { name: "relay control", re: /\brelay\.(on|off|toggle)/i },
      { name: "command bus", re: /command_bus/i },
    ];
    for (const { name, re } of banned) {
      expect(ALL_PROD_CODE, `must not contain device-control surface: ${name}`).not.toMatch(re);
    }
    // home_assistant references appear ONLY as sensor_readings.source enum
    // values (`home_assistant_bridge`, `ha_forwarded`) — never as outbound
    // control calls. Assert no fetch/HTTP/MQTT context around them.
    const haContexts = [...ALL_PROD_CODE.matchAll(/home[\s_-]?assistant/gi)];
    for (const m of haContexts) {
      const ctx = ALL_PROD_CODE.slice(Math.max(0, m.index! - 60), m.index! + 60);
      expect(ctx, `home_assistant reference must not be a control call: ${ctx}`).not.toMatch(
        /fetch\(|http\.|mqtt|publish|\.post\(|\.send\(|trigger/i,
      );
    }
    // pi_bridge appears ONLY as a sensor_readings.source enum value (read-side
    // ingest tag), never as an outbound device controller — assert it's not
    // referenced from any fetch/url/MQTT call.
    const piContexts = [...ALL_PROD_CODE.matchAll(/pi[_-]bridge/gi)];
    for (const m of piContexts) {
      const ctx = ALL_PROD_CODE.slice(Math.max(0, m.index! - 60), m.index! + 60);
      expect(ctx, `pi_bridge reference must not be a control call: ${ctx}`).not.toMatch(
        /fetch|http|mqtt|publish|post|send|trigger/i,
      );
    }
  });

  it("10. no simulation/auto-execute path exists that could push commands to real devices", () => {
    // No "auto execute / autopilot" code paths in production.
    for (const re of [
      /\bautopilot\b/i,
      /\bauto[-_ ]?execute\b/i,
      /\bauto[-_ ]?apply\b/i,
      /\bexecute_action\b/i,
      /\bdispatch_command\b/i,
    ]) {
      expect(ALL_PROD_CODE).not.toMatch(re);
    }
  });
});

describe("Action Queue safety — future-proof contract (active only when action_queue ships)", () => {
  it(`detects whether action_queue table exists (currently: ${HAS_ACTION_QUEUE_TABLE ? "YES" : "no — gated tests are pending"})`, () => {
    // This is informational; the gated tests below assert the contract IF the
    // table is introduced. Today we expect it NOT to exist.
    expect(typeof HAS_ACTION_QUEUE_TABLE).toBe("boolean");
  });

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "3. action_queue.status defaults to 'pending_approval' (or equivalent approval-required state)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      expect(sql).toMatch(/status[\s\S]{0,80}default\s+['"](pending_approval|awaiting_approval|proposed|suggested)['"]/i);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "4. action_queue includes user_id, grow_id, action_type, target, reason, risk_level, status, created_at",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      for (const col of [
        "user_id",
        "grow_id",
        "action_type",
        "reason",
        "risk_level",
        "status",
        "created_at",
      ]) {
        expect(sql, `action_queue missing required column: ${col}`).toMatch(
          new RegExp(`\\b${col}\\b`, "i"),
        );
      }
      // target_device OR target_metric must exist.
      expect(sql).toMatch(/target_(device|metric)/i);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "5+6+7. action_queue enforces RLS with auth.uid() = user_id (user-scoped writes; client user_id not trusted)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      expect(sql).toMatch(/alter\s+table[\s\S]*action_queue[\s\S]*enable\s+row\s+level\s+security/i);
      expect(sql).toMatch(/create\s+policy[\s\S]*action_queue[\s\S]*auth\.uid\(\)\s*=\s*user_id/i);
      // No service_role bypass policy.
      expect(sql).not.toMatch(/service_role/i);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "8. action_queue grow ownership is enforced (FK to grows or trigger/policy referencing grows.user_id)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      // Either a FK to grows(id) plus the RLS-on-user_id above, or an explicit
      // grow-ownership check.
      const hasGrowFk = /grow_id[\s\S]{0,200}references\s+(public\.)?grows\s*\(\s*id\s*\)/i.test(sql);
      const hasGrowOwnershipCheck = /grows[\s\S]{0,200}user_id[\s\S]{0,40}auth\.uid\(\)/i.test(sql);
      expect(hasGrowFk || hasGrowOwnershipCheck).toBe(true);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "9. approved actions are separated from suggested (status enum / approved_at column / approvals table)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      const hasStatusEnum = /status[\s\S]{0,200}(approved|executed|rejected|pending_approval)/i.test(sql);
      const hasApprovedAt = /\bapproved_at\b/i.test(sql);
      const hasApprovalsTable = /create\s+table[^;]*\baction_approvals?\b/i.test(sql);
      expect(hasStatusEnum || hasApprovedAt || hasApprovalsTable).toBe(true);
    },
  );
});

describe("Action Queue safety — tightened plant/tent ownership (active once policies tighten)", () => {
  // Pull out just the latest CREATE POLICY ... FOR INSERT / UPDATE blocks on action_queue
  // from across all migrations. The last one wins (later DROP + recreate).
  function lastPolicyBlock(cmd: "INSERT" | "UPDATE"): string {
    const re = new RegExp(
      `CREATE\\s+POLICY[^;]*?ON\\s+public\\.action_queue[\\s\\S]*?FOR\\s+${cmd}[\\s\\S]*?;`,
      "gi",
    );
    const matches = [...ALL_ACTION_QUEUE_SQL.matchAll(re)];
    return matches.length ? matches[matches.length - 1][0] : "";
  }
  const INSERT_POLICY = lastPolicyBlock("INSERT");
  const UPDATE_POLICY = lastPolicyBlock("UPDATE");

  const hasTightening =
    /plant_id\s+IS\s+NULL\s+OR\s+EXISTS/i.test(INSERT_POLICY) &&
    /tent_id\s+IS\s+NULL\s+OR\s+EXISTS/i.test(INSERT_POLICY);

  it(`detects tightened plant/tent ownership policy: ${hasTightening ? "YES" : "no"}`, () => {
    expect(typeof hasTightening).toBe("boolean");
  });

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces user_id = auth.uid()",
    () => {
      expect(INSERT_POLICY).toMatch(/WITH\s+CHECK\s*\([\s\S]*auth\.uid\(\)\s*=\s*user_id/i);
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces grow_id ownership via grows.user_id = auth.uid()",
    () => {
      expect(INSERT_POLICY).toMatch(
        /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows[\s\S]*?id\s*=\s*grow_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces plant_id ownership when plant_id is not null",
    () => {
      expect(INSERT_POLICY).toMatch(
        /plant_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*plant_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces tent_id ownership when tent_id is not null",
    () => {
      expect(INSERT_POLICY).toMatch(
        /tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents[\s\S]*?id\s*=\s*tent_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces plant-in-tent consistency when both are set",
    () => {
      // plant.tent_id must match the action's tent_id.
      expect(INSERT_POLICY).toMatch(
        /plant_id\s+IS\s+NULL\s+OR\s+tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*plant_id[\s\S]*?tent_id\s*=\s*tent_id/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "UPDATE WITH CHECK mirrors the same plant/tent/grow ownership guards",
    () => {
      expect(UPDATE_POLICY).toMatch(/WITH\s+CHECK\s*\([\s\S]*auth\.uid\(\)\s*=\s*user_id/i);
      expect(UPDATE_POLICY).toMatch(/plant_id\s+IS\s+NULL\s+OR\s+EXISTS/i);
      expect(UPDATE_POLICY).toMatch(/tent_id\s+IS\s+NULL\s+OR\s+EXISTS/i);
      expect(UPDATE_POLICY).toMatch(
        /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows[\s\S]*?id\s*=\s*grow_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "client-provided user_id cannot bypass auth.uid() (default = auth.uid() AND WITH CHECK auth.uid() = user_id)",
    () => {
      // Table default: user_id DEFAULT auth.uid(). Combined with WITH CHECK
      // auth.uid() = user_id, a spoofed client user_id cannot land in the row.
      expect(ALL_ACTION_QUEUE_SQL).toMatch(/user_id[\s\S]{0,80}DEFAULT\s+auth\.uid\(\)/i);
      expect(INSERT_POLICY).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
      expect(UPDATE_POLICY).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
    },
  );

  (hasTightening ? it : it.skip)(
    "no service_role bypass introduced by tightening migrations",
    () => {
      expect(ALL_ACTION_QUEUE_SQL).not.toMatch(/service_role/i);
    },
  );
});

describe("Action Queue safety — same-grow lineage (plants/tents must share grow_id)", () => {
  // Reuse the last INSERT/UPDATE policy text.
  function lastPolicyBlock(cmd: "INSERT" | "UPDATE"): string {
    const re = new RegExp(
      `CREATE\\s+POLICY[^;]*?ON\\s+public\\.action_queue[\\s\\S]*?FOR\\s+${cmd}[\\s\\S]*?;`,
      "gi",
    );
    const matches = [...ALL_ACTION_QUEUE_SQL.matchAll(re)];
    return matches.length ? matches[matches.length - 1][0] : "";
  }
  const INSERT_POLICY = lastPolicyBlock("INSERT");
  const UPDATE_POLICY = lastPolicyBlock("UPDATE");

  // Detect that plants/tents have a grow_id column and the policy enforces same-grow.
  function findMigration(re: RegExp): string | null {
    const migDir = resolve(ROOT, "supabase/migrations");
    for (const name of readdirSync(migDir).sort()) {
      if (!name.endsWith(".sql")) continue;
      const sql = readFileSync(join(migDir, name), "utf8");
      if (re.test(sql)) return sql;
    }
    return null;
  }
  const tentsGrowMig = findMigration(/ALTER\s+TABLE\s+public\.tents[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,80}grow_id/i);
  const plantsGrowMig = findMigration(/ALTER\s+TABLE\s+public\.plants[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,80}grow_id/i);
  const hasLineage =
    !!tentsGrowMig &&
    !!plantsGrowMig &&
    /t\.grow_id\s*=\s*grow_id/i.test(INSERT_POLICY) &&
    /p\.grow_id\s*=\s*grow_id/i.test(INSERT_POLICY);

  it(`detects grow_id lineage on plants+tents and same-grow policy: ${hasLineage ? "YES" : "no"}`, () => {
    expect(typeof hasLineage).toBe("boolean");
  });

  (hasLineage ? it : it.skip)(
    "tents.grow_id exists and references public.grows(id)",
    () => {
      expect(tentsGrowMig).toMatch(
        /ALTER\s+TABLE\s+public\.tents[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,200}grow_id\s+uuid[\s\S]{0,80}REFERENCES\s+public\.grows\s*\(\s*id\s*\)/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "plants.grow_id exists and references public.grows(id)",
    () => {
      expect(plantsGrowMig).toMatch(
        /ALTER\s+TABLE\s+public\.plants[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,200}grow_id\s+uuid[\s\S]{0,80}REFERENCES\s+public\.grows\s*\(\s*id\s*\)/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "required indexes added: tents(user_id,grow_id), plants(user_id,grow_id), plants(tent_id)",
    () => {
      expect(ALL_ACTION_QUEUE_SQL + (tentsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}tents\s*\(\s*user_id\s*,\s*grow_id\s*\)/i,
      );
      expect(ALL_ACTION_QUEUE_SQL + (plantsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}plants\s*\(\s*user_id\s*,\s*grow_id\s*\)/i,
      );
      expect(ALL_ACTION_QUEUE_SQL + (plantsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}plants\s*\(\s*tent_id\s*\)/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "INSERT enforces tent belongs to the SAME grow (t.grow_id = grow_id)",
    () => {
      expect(INSERT_POLICY).toMatch(
        /tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents[\s\S]*?id\s*=\s*tent_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?grow_id\s*=\s*grow_id/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "INSERT enforces plant belongs to the SAME grow (p.grow_id = grow_id)",
    () => {
      expect(INSERT_POLICY).toMatch(
        /plant_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*plant_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?grow_id\s*=\s*grow_id/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "UPDATE mirrors the same-grow lineage checks for both plant and tent",
    () => {
      expect(UPDATE_POLICY).toMatch(/t\.grow_id\s*=\s*grow_id/i);
      expect(UPDATE_POLICY).toMatch(/p\.grow_id\s*=\s*grow_id/i);
    },
  );

  (hasLineage ? it : it.skip)(
    "plant-in-tent consistency still enforced when both are set",
    () => {
      expect(INSERT_POLICY).toMatch(
        /plant_id\s+IS\s+NULL\s+OR\s+tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?tent_id\s*=\s*tent_id/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "no service_role bypass and no device-control surface introduced",
    () => {
      expect(ALL_ACTION_QUEUE_SQL).not.toMatch(/service_role/i);
      const combined = (tentsGrowMig ?? "") + (plantsGrowMig ?? "") + ALL_ACTION_QUEUE_SQL;
      expect(combined).not.toMatch(/mqtt|home[\s_-]?assistant|webhook|pi[\s_-]?bridge\.(local|lan|home|io|net|com)/i);
    },
  );
});
