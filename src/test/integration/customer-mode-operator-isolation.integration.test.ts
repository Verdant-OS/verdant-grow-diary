/**
 * Customer Mode ↔ Operator isolation — DB-backed audit test.
 *
 * Verdant's current Customer Mode surface is a **presenter-only** shell
 * (`src/pages/CustomerModeGuide.tsx` at `/customer/:shareId`, backed by
 * the pure `customerModeGuideViewModel`). There is NO customer-mode
 * table, RPC, edge function, session, or write path in the schema.
 *
 * This suite:
 *   1. Audits the repo for any customer-mode data surface (tables,
 *      RPCs, edge functions, share-token routes with I/O). If any
 *      appears, this test SHOULD be extended to prove isolation; the
 *      audit assertion below will fail loudly so a future contributor
 *      cannot silently ship Customer Mode without isolation coverage.
 *   2. Runs a live-DB probe (only when local Supabase env vars are
 *      present) proving an **anonymous** client — the mode a public
 *      `/customer/:shareId` visitor would carry — cannot read grows,
 *      tents, plants, diary_entries, sensor_readings, alerts,
 *      action_queue, pheno_hunts, billing_subscriptions, or
 *      subscriptions belonging to a seeded operator user.
 *
 * NEVER logs service_role material or seeded operator IDs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expectSanitizedDbError } from "./_helpers/sanitizedDbError";

const ROOT = process.cwd();

// ── 1. Static audit: no Customer Mode data surface exists yet ────────────
function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git") continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|sql)$/.test(e)) out.push(full);
  }
  return out;
}

describe("customer mode ↔ operator isolation (audit)", () => {
  it("no customer-mode data surface exists in schema / edge functions", () => {
    const migrationsDir = resolve(ROOT, "supabase/migrations");
    const functionsDir = resolve(ROOT, "supabase/functions");
    const suspects: string[] = [];

    // Patterns that would indicate a customer-mode backend has landed.
    const backendPatterns: RegExp[] = [
      /create\s+table\s+public\.customer_mode_/i,
      /create\s+table\s+public\.customer_sessions?/i,
      /create\s+table\s+public\.customer_share_tokens?/i,
      /create\s+function\s+public\.customer_mode_/i,
      /create\s+function\s+public\.resolve_customer_share/i,
    ];

    if (existsSync(migrationsDir)) {
      for (const f of walk(migrationsDir)) {
        const src = readFileSync(f, "utf8");
        for (const rx of backendPatterns) {
          if (rx.test(src)) suspects.push(`${f} matches ${rx}`);
        }
      }
    }
    if (existsSync(functionsDir)) {
      for (const entry of readdirSync(functionsDir)) {
        if (/^customer[-_]mode/i.test(entry)) {
          suspects.push(`edge function ${entry} exists`);
        }
      }
    }

    if (suspects.length > 0) {
      throw new Error(
        [
          "Customer Mode backend detected. Extend this suite with",
          "authenticated-customer isolation tests (read/write/entitlement)",
          "before shipping. Suspects:",
          ...suspects,
        ].join("\n"),
      );
    }
  });

  it("customer-mode presenter has no Supabase or fetch imports", () => {
    const page = readFileSync(resolve(ROOT, "src/pages/CustomerModeGuide.tsx"), "utf8");
    const vm = readFileSync(resolve(ROOT, "src/lib/customerModeGuideViewModel.ts"), "utf8");
    for (const src of [page, vm]) {
      expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
      expect(src).not.toMatch(/\bfrom\s+["']@supabase\//);
      expect(src).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

// ── 2. Live-DB probe: anonymous client cannot read operator data ─────────
const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE;
const d = hasLocalSupabase ? describe : describe.skip;

d("anonymous customer-mode visitor cannot read operator data (local DB)", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let operatorId = "";
  let operatorEmail = "";

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    operatorEmail = `op+${Date.now()}+${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `Test-${Math.random().toString(36).slice(2)}!A1`;
    const { data, error } = await admin.auth.admin.createUser({
      email: operatorEmail,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("failed to create operator");
    operatorId = data.user.id;
    // Seed one billing row so an entitlement leak would be observable.
    await admin.from("billing_subscriptions").upsert({
      user_id: operatorId,
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      cancel_at_period_end: false,
    });
  }, 45_000);

  afterAll(async () => {
    if (!operatorId) return;
    try {
      await admin.from("billing_subscriptions").delete().eq("user_id", operatorId);
      await admin.auth.admin.deleteUser(operatorId);
    } catch {
      /* best-effort */
    }
  }, 30_000);

  const OPERATOR_TABLES = [
    "grows",
    "tents",
    "plants",
    "diary_entries",
    "sensor_readings",
    "alerts",
    "action_queue",
    "pheno_hunts",
    "pheno_keepers",
    "billing_subscriptions",
    "subscriptions",
  ] as const;

  for (const table of OPERATOR_TABLES) {
    it(`anon client cannot read operator rows in ${table}`, async () => {
      const { data, error } = await anon
        .from(table as never)
        .select("*")
        .limit(10);
      // RLS should either error or return zero rows; either way, anon must
      // see no operator data. Any error must be sanitized.
      if (error) expectSanitizedDbError(error);
      expect(Array.isArray(data) ? data.length : 0).toBe(0);
    });
  }

  it("anon client cannot resolve operator entitlement via has_pheno_tracker_entitlement", async () => {
    const { data, error } = await anon.rpc(
      "has_pheno_tracker_entitlement" as never,
      { _user_id: operatorId } as never,
    );
    if (error) {
      expectSanitizedDbError(error);
    } else {
      // Anon calls must not leak the operator's Pro state.
      expect(data).toBe(false);
    }
  });

  it("anon client cannot INSERT into any operator write table", async () => {
    const writes: Array<{ table: string; row: Record<string, unknown> }> = [
      { table: "grows", row: { user_id: operatorId, name: "hijack" } },
      { table: "diary_entries", row: { user_id: operatorId, note: "hijack" } },
      { table: "sensor_readings", row: { user_id: operatorId } },
      { table: "action_queue", row: { user_id: operatorId } },
      { table: "pheno_hunts", row: { user_id: operatorId } },
    ];
    for (const w of writes) {
      const { error } = await anon.from(w.table as never).insert(w.row as never);
      expect(error, `anon INSERT into ${w.table} must be rejected`).not.toBeNull();
      expectSanitizedDbError(error);
    }
  });
});
