/**
 * Actual PostgreSQL ACL/RLS/trigger and save-founder-prefs regression proof.
 *
 * Requires PostgreSQL server tools (preinstalled on the Ubuntu CI runner).
 * Starts a disposable cluster owned by this test, with no TCP listener and a
 * private Unix socket. Never reads a DB URL, Supabase credentials, or production.
 * Replays the original founder and refund migrations unchanged; their external
 * auth/subscription dependencies are minimal empty fixtures.
 *
 * The real edge entrypoint is transpiled and executed with injected Supabase
 * clients: auth uses a synthetic verified identity; the write adapter executes
 * its actual column projection and filters against this PostgreSQL cluster.
 * This proves the endpoint contract and database rules, not deployed PostgREST.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "typescript";
import { validatePrefs } from "../../supabase/functions/save-founder-prefs/validate";

const MIGRATIONS = resolve("supabase/migrations");
const ORIGINALS = [
  "20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql",
  "20260719052812_c25ba6a6-dcdb-40c7-9dbf-292b35af9150.sql",
  "20260719063713_387faf67-35ad-4d20-ae4e-4a7419ec8966.sql",
];
const FIX = readFileSync(
  join(MIGRATIONS, "20260914190600_founders_client_updates_fail_closed.sql"),
  "utf8",
);
const REFUND_FIX = readFileSync(
  join(MIGRATIONS, "20260914212330_founder_refund_subscription_reference.sql"),
  "utf8",
);
const OWNER = "00000000-0000-4000-8000-00000000f001";
const OTHER = "00000000-0000-4000-8000-00000000f002";
const REFUNDED = "00000000-0000-4000-8000-00000000f003";
const REVOKED = "00000000-0000-4000-8000-00000000f004";
const MISSING = "00000000-0000-4000-8000-00000000f005";
const PREFS = {
  display_name: "Alice",
  display_style: "custom_name",
  show_on_wall: true,
  optional_link: "https://example.invalid/founder",
};
const childEnv = { PATH: process.env.PATH, LC_ALL: "C" };
let workdir = "";
let dataDir = "";
let binDir = "";
let started = false;
let baseline: Record<string, unknown>;
let refundBaseline: { status: number | null; error: string; before: string; after: string };

function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function identifier(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Unexpected fixture identifier");
  return '"' + value + '"';
}

function rawSql(query: string) {
  return spawnSync(
    join(binDir, "psql"),
    [
      "-X", "--no-password", "-qAt", "-h", workdir, "-p", "55432",
      "-U", "founder_test_admin", "-d", "postgres",
      "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
    ],
    { input: query, encoding: "utf8", env: childEnv, timeout: 15_000 },
  );
}

function sql(query: string): string {
  const result = rawSql(query);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "PostgreSQL command failed");
  }
  return result.stdout.trim();
}

function asRole(role: string, uid: string, query: string): string {
  return "SET ROLE " + identifier(role) +
    '; SET "request.jwt.claim.sub" = ' + literal(uid) + "; " + query;
}

function rows(): string {
  return sql("SELECT json_agg(f ORDER BY founder_number) FROM public.founders f;");
}

function seed() {
  sql(`
    TRUNCATE public.founders;
    TRUNCATE public.subscriptions;
    INSERT INTO public.founders (user_id, founder_number, status, display_name)
    VALUES
      ('${OWNER}', 1, 'confirmed', 'Original owner'),
      ('${OTHER}', 2, 'confirmed', 'Other owner'),
      ('${REFUNDED}', 3, 'refunded', 'Refunded owner'),
      ('${REVOKED}', 4, 'revoked', 'Revoked owner');
  `);
}

function expectDenied(role: string, uid: string, update: string) {
  const before = rows();
  const result = rawSql(asRole(role, uid, update));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/42501:.*permission denied/i);
  expect(rows()).toBe(before);
}

beforeAll(() => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    throw new Error("BLOCKED: run this database proof as a non-root Unix user with PostgreSQL tools.");
  }
  const discovery = spawnSync("pg_config", ["--bindir"], { encoding: "utf8", env: childEnv });
  if (discovery.status !== 0) {
    throw new Error("BLOCKED: PostgreSQL server tools are required; no database tests were skipped.");
  }
  binDir = discovery.stdout.trim();
  for (const tool of ["initdb", "pg_ctl", "psql"]) {
    if (!existsSync(join(binDir, tool))) throw new Error("BLOCKED: missing PostgreSQL " + tool);
  }
  workdir = mkdtempSync(join(tmpdir(), "founder-immutable-"));
  dataDir = join(workdir, "data");
  execFileSync(
    join(binDir, "initdb"),
    ["-D", dataDir, "-U", "founder_test_admin", "--auth-local=trust", "--auth-host=reject",
      "--no-locale", "--encoding=UTF8"],
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  writeFileSync(
    join(dataDir, "postgresql.auto.conf"),
    "listen_addresses = ''\nunix_socket_directories = " + literal(workdir) +
      "\nport = 55432\nfsync = off\n",
  );
  execFileSync(
    join(binDir, "pg_ctl"),
    ["-D", dataDir, "-l", join(workdir, "postgres.log"), "-w", "start"],
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  started = true;
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE public_probe NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.subscriptions (
      user_id uuid, paddle_subscription_id text, paddle_customer_id text,
      product_id text, price_id text, status text, environment text,
      current_period_start timestamptz, current_period_end timestamptz,
      cancel_at_period_end boolean, created_at timestamptz, updated_at timestamptz
    );
    INSERT INTO auth.users VALUES ('${OWNER}'), ('${OTHER}'), ('${REFUNDED}'), ('${REVOKED}');
  `);
  for (const file of ORIGINALS) sql(readFileSync(join(MIGRATIONS, file), "utf8"));
  seed();
  baseline = {
    prefsGrant: sql("SELECT has_column_privilege('authenticated', 'public.founders', 'display_name', 'UPDATE');"),
    lockedGrants: sql("SELECT has_column_privilege('authenticated', 'public.founders', 'status', 'UPDATE'), has_column_privilege('authenticated', 'public.founders', 'founder_number', 'UPDATE'), has_column_privilege('authenticated', 'public.founders', 'milestone_status', 'UPDATE');"),
    confirmedUpdate: sql(asRole("authenticated", OWNER,
      "UPDATE public.founders SET display_name = 'direct before fix' WHERE user_id = " +
      literal(OWNER) + " RETURNING display_name;")),
    refundedUpdate: sql(asRole("authenticated", REFUNDED,
      "UPDATE public.founders SET display_name = 'refunded bypass' WHERE user_id = " +
      literal(REFUNDED) + " RETURNING display_name;")),
  };
  seed();
  seedRefund();
  const beforeRefund = refundState();
  const failedRefund = rawSql(asRole("service_role", "", refundCall()));
  refundBaseline = {
    status: failedRefund.status, error: failedRefund.stderr,
    before: beforeRefund, after: refundState(),
  };
  sql(FIX);
  sql(REFUND_FIX);
}, 60_000);

afterAll(() => {
  if (started) {
    execFileSync(join(binDir, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"],
      { env: childEnv, stdio: "pipe", timeout: 20_000 });
  }
  if (workdir) rmSync(workdir, { recursive: true, force: true });
}, 30_000);

beforeEach(seed);

describe("founders — actual client UPDATE enforcement", () => {
  it("measures the original prefs bypass without claiming locked columns were writable", () => {
    expect(baseline).toEqual({
      prefsGrant: "t",
      lockedGrants: "f|f|f",
      confirmedUpdate: "direct before fix",
      refundedUpdate: "refunded bypass",
    });
  });

  it("removes effective client UPDATE privileges and retains RLS plus the immutable trigger", () => {
    expect(sql(`
      SELECT rolname, has_table_privilege(rolname, 'public.founders', 'UPDATE'),
        has_any_column_privilege(rolname, 'public.founders', 'UPDATE')
      FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'public_probe')
      ORDER BY rolname;
    `)).toBe("anon|f|f\nauthenticated|f|f\npublic_probe|f|f");
    expect(sql("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.founders'::regclass;")).toBe("t");
    expect(sql(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.founders'::regclass AND NOT tgisinternal AND tgenabled = 'O';
    `)).toBe("founders_guard_immutables_trg");
    expect(sql(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'founders' ORDER BY policyname;
    `)).toBe("founders_no_client_update\nfounders_owner_select\nfounders_service_all");
  });

  it("retains own-row SELECT and hides another owner's row", () => {
    expect(sql(asRole("authenticated", OWNER,
      "SELECT founder_number FROM public.founders ORDER BY founder_number;"))).toBe("1");
  });

  it("retains the denial of anonymous base-table reads", () => {
    const result = rawSql(asRole("anon", "", "SELECT * FROM public.founders;"));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/42501:.*permission denied/i);
  });

  it.each([
    ["status", "'refunded'"],
    ["founder_number", "10"],
    ["milestone_status", "'met'"],
    ["user_id", literal(MISSING)],
    ["created_at", "'2020-01-01'"],
    ["id", literal(MISSING)],
    ["paddle_subscription_ref", "'tampered'"],
    ["updated_at", "'2020-01-01'"],
    ["display_name", "'direct after fix'"],
    ["display_style", "'custom_name'"],
    ["show_on_wall", "true"],
    ["optional_link", "'https://example.invalid/direct'"],
  ])("rejects authenticated direct UPDATE of %s with 42501 and unchanged rows", (column, value) => {
    expectDenied("authenticated", OWNER,
      "UPDATE public.founders SET " + identifier(column) + " = " + value +
      " WHERE user_id = " + literal(OWNER) + ";");
  });

  it.each([REFUNDED, REVOKED])("rejects a retired owner's direct prefs UPDATE (%s)", (uid) => {
    expectDenied("authenticated", uid,
      "UPDATE public.founders SET display_name = 'bypass' WHERE user_id = " + literal(uid) + ";");
  });

  it("keeps the RLS backstop closed if broad client grants and a permissive policy return", () => {
    const before = rows();
    try {
      sql(`
        GRANT UPDATE ON public.founders TO authenticated;
        CREATE POLICY founders_harness_broad_update ON public.founders
          FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      `);
      for (const assignment of [
        "status = 'refunded'", "founder_number = 10",
        "milestone_status = 'met'", "display_name = 'bypass'",
      ]) {
        expect(sql(asRole("authenticated", OWNER,
          "UPDATE public.founders SET " + assignment + " WHERE user_id = " + literal(OWNER) +
          " RETURNING founder_number;"))).toBe("");
      }
      expect(rows()).toBe(before);
    } finally {
      sql("DROP POLICY IF EXISTS founders_harness_broad_update ON public.founders;");
      sql(FIX);
    }
  });

  it.each([
    ["founder_number", "10"],
    ["user_id", literal(MISSING)],
    ["created_at", "'2020-01-01'"],
  ])("preserves the existing immutable %s trigger even for service writes", (column, value) => {
    const before = rows();
    const result = rawSql(asRole("service_role", "",
      "UPDATE public.founders SET " + identifier(column) + " = " + value +
      " WHERE user_id = " + literal(OWNER) + ";"));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is immutable");
    expect(rows()).toBe(before);
  });

  it("preserves trusted service preference, status and milestone updates", () => {
    expect(sql(asRole("service_role", "", `
      UPDATE public.founders SET display_name = 'Service prefs', status = 'refunded',
        milestone_status = 'met' WHERE user_id = '${OWNER}'
      RETURNING founder_number, display_name, status, milestone_status;
    `))).toBe("1|Service prefs|refunded|met");
  });

  it("can reapply the migration without changing data or reopening client UPDATE", () => {
    const before = rows();
    sql(FIX);
    sql(FIX);
    expect(rows()).toBe(before);
    expectDenied("authenticated", OWNER,
      "UPDATE public.founders SET status = 'refunded' WHERE user_id = " + literal(OWNER) + ";");
  });
});

type WriteCall = {
  values: Record<string, unknown>;
  filters: Array<[string, string]>;
  projection: string;
};

function edgeHandler(verifiedUid: string | null) {
  const writes: WriteCall[] = [];
  let serve: ((request: Request) => Promise<Response>) | undefined;
  let verifications = 0;
  const createClient = (_url: string, key: string) => {
    if (key === "fixture-anon") {
      return { auth: { getUser: async () => {
        verifications++;
        return verifiedUid
          ? { data: { user: { id: verifiedUid } }, error: null }
          : { data: { user: null }, error: { message: "synthetic invalid JWT" } };
      } } };
    }
    expect(key).toBe("fixture-service");
    return { from: (table: string) => {
      expect(table).toBe("founders");
      return { update: (values: Record<string, unknown>) => {
        const call: WriteCall = { values, filters: [], projection: "" };
        writes.push(call);
        const query = {
          eq: (column: string, value: string) => { call.filters.push([column, value]); return query; },
          select: (projection: string) => { call.projection = projection; return query; },
          maybeSingle: async () => {
            const result = rawSql(asRole("service_role", "",
              "WITH changed AS (UPDATE public.founders SET " +
              Object.entries(values).map(([k, v]) => identifier(k) + " = " + literal(v)).join(", ") +
              " WHERE " + call.filters.map(([k, v]) => identifier(k) + " = " + literal(v)).join(" AND ") +
              " RETURNING " + identifier(call.projection) +
              ") SELECT coalesce(json_agg(changed), '[]'::json) FROM changed;"));
            if (result.status !== 0) return { data: null, error: { message: result.stderr } };
            const changed = JSON.parse(result.stdout.trim()) as Array<Record<string, unknown>>;
            return { data: changed[0] ?? null, error: null };
          },
        };
        return query;
      } };
    } };
  };
  const compiled = ts.transpileModule(
    readFileSync(resolve("supabase/functions/save-founder-prefs/index.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const requireFixture = (specifier: string) => {
    if (specifier === "npm:@supabase/supabase-js@2/cors") return { corsHeaders: {} };
    if (specifier === "npm:@supabase/supabase-js@2") return { createClient };
    if (specifier === "./validate.ts") return { validatePrefs };
    throw new Error("Unexpected edge import: " + specifier);
  };
  // Execute the real entrypoint, substituting only its external runtime/IO.
  new Function("require", "exports", "Deno", "Response", compiled)(
    requireFixture, {}, {
      serve: (handler: (request: Request) => Promise<Response>) => { serve = handler; },
      env: { get: (name: string) => ({
        SUPABASE_URL: "https://founder-fixture.invalid",
        SUPABASE_ANON_KEY: "fixture-anon",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
      } as Record<string, string>)[name] },
    }, Response,
  );
  if (!serve) throw new Error("save-founder-prefs did not register a handler");
  return {
    writes,
    verifications: () => verifications,
    request: (body: unknown, authorization: string | null = "Bearer synthetic-fixture") =>
      serve!(new Request("https://founder-fixture.invalid/save-founder-prefs", {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
        body: JSON.stringify(body),
      })),
  };
}

describe("save-founder-prefs — real handler with PostgreSQL write adapter", () => {
  it("saves only four prefs for the verified confirmed owner despite injected locked fields", async () => {
    const before = JSON.parse(rows());
    const edge = edgeHandler(OWNER);
    const response = await edge.request({
      ...PREFS, user_id: OTHER, founder_number: 99, status: "refunded", milestone_status: "met",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(edge.verifications()).toBe(1);
    expect(edge.writes).toEqual([{
      values: PREFS, filters: [["user_id", OWNER], ["status", "confirmed"]],
      projection: "founder_number",
    }]);
    const after = JSON.parse(rows());
    expect(after[0]).toMatchObject({ ...PREFS, user_id: OWNER, founder_number: 1,
      status: "confirmed", milestone_status: "pending" });
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it.each([REFUNDED, REVOKED, MISSING])("cannot save prefs for a non-confirmed or missing founder (%s)", async (uid) => {
    const before = rows();
    const response = await edgeHandler(uid).request(PREFS);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no_founder_row" });
    expect(rows()).toBe(before);
  });

  it.each(["missing header", "invalid JWT"])("rejects %s before a privileged write", async (reason) => {
    const before = rows();
    const edge = edgeHandler(reason === "invalid JWT" ? null : OWNER);
    const response = await edge.request(PREFS, reason === "missing header" ? null : "Bearer invalid");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "auth_required" });
    expect(edge.writes).toEqual([]);
    expect(rows()).toBe(before);
  });

  it("rejects invalid prefs before any database write", async () => {
    const before = rows();
    const edge = edgeHandler(OWNER);
    const response = await edge.request({ ...PREFS, optional_link: "javascript:alert(1)" });
    expect(response.status).toBe(400);
    expect(edge.writes).toEqual([]);
    expect(rows()).toBe(before);
  });
});

const REFUND_TX = "txn_founder_refund_fixture";
const REFUND_REF = "lifetime_" + REFUND_TX;
const REFUND_AT = "2026-09-14T20:00:00.000Z";

function seedRefund(env = "live", uid = OWNER, price = "founder_lifetime") {
  sql(`
    INSERT INTO public.subscriptions
      (user_id, paddle_subscription_id, price_id, status, environment)
    VALUES (${literal(uid)}, ${literal(REFUND_REF)}, ${literal(price)}, 'active', ${literal(env)});
    UPDATE public.founders SET paddle_subscription_ref = ${literal(REFUND_REF)},
      display_name = 'Keep prefs', milestone_status = 'met'
      WHERE user_id = ${literal(uid)};
  `);
}

function refundCall(tx: string | null = REFUND_TX, env: string | null = "live",
  at: string | null = REFUND_AT) {
  return "SELECT public.revoke_lovable_founder_lifetime_by_transaction(" +
    literal(tx) + ", " + literal(env) + ", " + literal(at) + "::timestamptz);";
}

function refundState() {
  return sql(`
    SELECT json_build_object(
      'subscriptions', (SELECT json_agg(s ORDER BY environment, user_id) FROM public.subscriptions s),
      'founders', (SELECT json_agg(f ORDER BY founder_number) FROM public.founders f)
    );
  `);
}

function refund(tx: string | null = REFUND_TX, env: string | null = "live",
  at: string | null = REFUND_AT) {
  return JSON.parse(sql(asRole("service_role", "", refundCall(tx, env, at))));
}

describe("founder refunds — executed PostgreSQL transaction contract", () => {
  it("reproduces the historical 42703 failure and rollback of subscription cancellation", () => {
    expect(refundBaseline.status).not.toBe(0);
    expect(refundBaseline.error).toMatch(/42703:.*column "paddle_transaction_id" does not exist/i);
    expect(refundBaseline.after).toBe(refundBaseline.before);
    const original = JSON.parse(refundBaseline.after);
    expect(original.subscriptions[0].status).toBe("active");
    expect(original.founders[0].status).toBe("confirmed");
  });

  it("cancels the live purchase and retires only its founder, preserving seat and evidence", () => {
    seedRefund();
    const before = JSON.parse(refundState());
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 1, founders_updated: 1 });
    const after = JSON.parse(refundState());
    expect(after.subscriptions[0].status).toBe("canceled");
    expect(new Date(after.subscriptions[0].current_period_end).toISOString()).toBe(REFUND_AT);
    expect(after.founders[0].status).toBe("refunded");
    const { status: _oldStatus, updated_at: _oldUpdated, ...oldEvidence } = before.founders[0];
    const { status: _newStatus, updated_at: _newUpdated, ...newEvidence } = after.founders[0];
    expect(newEvidence).toEqual(oldEvidence);
    expect(after.founders.slice(1)).toEqual(before.founders.slice(1));
    expect(sql("SELECT public.founders_seats_consumed();")).toBe("4");
    expect(sql(asRole("authenticated", OWNER,
      "SELECT status FROM public.founders;"))).toBe("refunded");
  });

  it("makes repeat delivery a no-op and preserves the first cancellation time", () => {
    seedRefund();
    refund();
    const before = refundState();
    expect(refund(REFUND_TX, "live", "2026-09-15T20:00:00Z"))
      .toEqual({ ok: true, subscriptions_updated: 0, founders_updated: 0 });
    expect(refundState()).toBe(before);
  });

  it("retires a still-confirmed founder even when its subscription is already canceled", () => {
    seedRefund();
    sql("UPDATE public.subscriptions SET status = 'canceled';");
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 0, founders_updated: 1 });
    expect(sql("SELECT status FROM public.founders WHERE user_id = " + literal(OWNER))).toBe("refunded");
  });

  it("isolates sandbox refunds from the same live reference and live founder", () => {
    seedRefund("live");
    seedRefund("sandbox");
    const before = rows();
    expect(refund(REFUND_TX, "sandbox"))
      .toEqual({ ok: true, subscriptions_updated: 1, founders_updated: 0 });
    expect(rows()).toBe(before);
    expect(sql("SELECT environment, status FROM public.subscriptions ORDER BY environment;"))
      .toBe("live|active\nsandbox|canceled");
  });

  it("does not retire a different owner even if their founder reference matches", () => {
    seedRefund();
    sql("UPDATE public.founders SET paddle_subscription_ref = NULL WHERE user_id = " + literal(OWNER));
    sql("UPDATE public.founders SET paddle_subscription_ref = " + literal(REFUND_REF) +
      " WHERE user_id = " + literal(OTHER));
    const before = rows();
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 1, founders_updated: 0 });
    expect(rows()).toBe(before);
  });

  it("does not retire the same owner's founder from a different transaction", () => {
    seedRefund();
    sql("UPDATE public.founders SET paddle_subscription_ref = 'lifetime_other' WHERE user_id = " +
      literal(OWNER));
    const before = rows();
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 1, founders_updated: 0 });
    expect(rows()).toBe(before);
  });

  it("leaves an unknown transaction unchanged without inventing a founder", () => {
    seedRefund();
    const before = refundState();
    expect(refund("txn_unknown")).toEqual({ ok: true, subscriptions_updated: 0, founders_updated: 0 });
    expect(refundState()).toBe(before);
  });

  it("does not cancel or retire a non-founder subscription through this RPC", () => {
    seedRefund("live", OWNER, "pro_monthly");
    const before = refundState();
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 0, founders_updated: 0 });
    expect(refundState()).toBe(before);
  });

  it.each([
    [null, "live", REFUND_AT, "invalid_input"],
    ["", "live", REFUND_AT, "invalid_input"],
    ["   ", "live", REFUND_AT, "invalid_input"],
    [REFUND_TX, null, REFUND_AT, "invalid_environment"],
    [REFUND_TX, "unknown", REFUND_AT, "invalid_environment"],
    [REFUND_TX, "live", null, "invalid_input"],
  ])("rejects invalid refund input (%s, %s, %s)", (tx, env, at, reason) => {
    seedRefund();
    const before = refundState();
    expect(refund(tx, env, at)).toEqual({ ok: false, reason });
    expect(refundState()).toBe(before);
  });

  it.each(["anon", "authenticated"])("denies direct %s execution of the refund RPC", (role) => {
    seedRefund();
    const before = refundState();
    const result = rawSql(asRole(role, OWNER, refundCall()));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/42501:.*permission denied for function/i);
    expect(refundState()).toBe(before);
  });

  it("rolls back cancellation if founder retirement fails, preserving retryability", () => {
    seedRefund();
    const before = refundState();
    try {
      sql(`
        CREATE FUNCTION public.founder_refund_test_failure() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic retirement failure'; END; $$;
        CREATE TRIGGER founder_refund_test_failure BEFORE UPDATE ON public.founders
          FOR EACH ROW EXECUTE FUNCTION public.founder_refund_test_failure();
      `);
      const failed = rawSql(asRole("service_role", "", refundCall()));
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain("synthetic retirement failure");
      expect(refundState()).toBe(before);
    } finally {
      sql(`
        DROP TRIGGER IF EXISTS founder_refund_test_failure ON public.founders;
        DROP FUNCTION IF EXISTS public.founder_refund_test_failure();
      `);
    }
    expect(refund()).toEqual({ ok: true, subscriptions_updated: 1, founders_updated: 1 });
  });
});
