// @vitest-environment jsdom
/**
 * Native PostgreSQL multi-session refund/grant regression. Replays committed
 * migrations unchanged into a disposable cluster; auth.users/auth.uid are fixtures.
 * Uses private Unix sockets (TCP off), or loopback only on Windows. No hosted DB.
 * PostgreSQL tools must be on pg_config's bindir or FOUNDER_CONCURRENCY_PG_BIN.
 * Missing tools fail the suite, never skip. Real webhook orchestration and RPCs;
 * signature transport, PostgREST and provider cancellation are not exercised.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  handleVerifiedEvent,
  type Deps,
  type EventLikeWithId,
  type ProcessingStatus,
} from "../../supabase/functions/payments-webhook/orchestrator";
import { insertPaddleEventLog } from "../../supabase/functions/payments-webhook/eventLogInsert";

const OWNER = "00000000-0000-4000-8000-00000000f101";
const TX = "txn_refund_ordering_fixture";
const REFUND_AT = new Date("2026-09-14T20:00:00.000Z");
const PURCHASE_AT = new Date("2026-09-14T20:01:00.000Z");
const childEnv = {
  PATH: process.env.PATH,
  LC_ALL: "C",
  ...(process.platform === "win32"
    ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP }
    : {}),
};
const migration = "20260915193000_founder_refund_grant_serialization.sql";
let host = "";
let port = "55432";
const tool = (name: string) => join(binDir, name + (process.platform === "win32" ? ".exe" : ""));
const migrations = [
  "20260709083556_e7572ff2-e7c2-402b-bc53-d6ecb58bcd71.sql",
  "20260709094314_46d36a20-d975-43ce-bc79-6e8f6ff194fd.sql",
  "20260715182500_7010ca0e-c4e5-455f-a35f-4de9547e2f4e.sql",
  "20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql",
  "20260719052812_c25ba6a6-dcdb-40c7-9dbf-292b35af9150.sql",
  "20260719063713_387faf67-35ad-4d20-ae4e-4a7419ec8966.sql",
  "20260914190600_founders_client_updates_fail_closed.sql",
  "20260914212330_founder_refund_subscription_reference.sql",
];
let workdir = "";
let dataDir = "";
let binDir = "";
let started = false;

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function psqlArgs() {
  return [
    "-X",
    "--no-password",
    "-qAt",
    "-h",
    host,
    "-p",
    port,
    "-U",
    "refund_ordering_admin",
    "-d",
    "postgres",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
  ];
}
function rawSql(query: string) {
  return spawnSync(tool("psql"), psqlArgs(), {
    input: query,
    encoding: "utf8",
    env: childEnv,
    windowsHide: true,
    timeout: 15_000,
  });
}

function sql(query: string): string {
  const result = rawSql(query);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "PostgreSQL command failed");
  }
  return result.stdout.trim();
}

function serviceSql(query: string): string {
  return sql("SET ROLE service_role; " + query);
}

beforeAll(async () => {
  if (process.getuid?.() === 0) {
    throw new Error("BLOCKED: run as a non-root user with PostgreSQL server tools.");
  }
  binDir = process.env.FOUNDER_CONCURRENCY_PG_BIN ?? "";
  if (!binDir) {
    const discovery = spawnSync("pg_config", ["--bindir"], {
      encoding: "utf8",
      env: childEnv,
      windowsHide: true,
    });
    if (discovery.status !== 0)
      throw new Error("BLOCKED: PostgreSQL tools required; no tests skipped.");
    binDir = discovery.stdout.trim();
  }
  for (const name of ["initdb", "pg_ctl", "psql"]) {
    if (!existsSync(tool(name))) throw new Error("BLOCKED: missing PostgreSQL " + name);
  }
  workdir = mkdtempSync(join(tmpdir(), "founder-refund-concurrency-"));
  dataDir = join(workdir, "data");
  host = workdir;
  if (process.platform === "win32") {
    host = "127.0.0.1";
    const reservation = createServer();
    await new Promise<void>((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, host, resolve);
    });
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback port");
    port = String(address.port);
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
  }
  execFileSync(
    tool("initdb"),
    [
      "-D",
      dataDir,
      "-U",
      "refund_ordering_admin",
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-locale",
      "--encoding=UTF8",
    ],
    { env: childEnv, stdio: "pipe", windowsHide: true, timeout: 30_000 },
  );
  writeFileSync(
    join(dataDir, "postgresql.auto.conf"),
    "listen_addresses = " +
      literal(process.platform === "win32" ? host : "") +
      "\nunix_socket_directories = " +
      literal(process.platform === "win32" ? "" : workdir) +
      "\nport = " +
      port +
      "\nfsync = off\n",
  );
  if (process.platform === "win32")
    writeFileSync(join(dataDir, "pg_hba.conf"), "host all all 127.0.0.1/32 trust\n");
  started = true; // Cleanup must attempt a stop even if startup times out.
  execFileSync(
    tool("pg_ctl"),
    ["-D", dataDir, "-l", join(workdir, "postgres.log"), "-w", "start"],
    { env: childEnv, stdio: "ignore", windowsHide: true, timeout: 30_000 },
  );
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${OWNER}');
  `);
  for (const file of migrations) sql(readFileSync(resolve("supabase/migrations", file), "utf8"));
  sql(readFileSync(resolve("supabase/migrations", migration), "utf8"));
  console.info("Disposable concurrency database:", sql("SELECT version();"));
}, 60_000);

afterAll(() => {
  if (started)
    execFileSync(tool("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      env: childEnv,
      stdio: "ignore",
      windowsHide: true,
      timeout: 20_000,
    });
  if (workdir) {
    const target = resolve(workdir);
    if (
      !target.startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")) ||
      !target.includes("founder-refund-concurrency-")
    )
      throw new Error("Unexpected cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
}, 30_000);

beforeEach(() =>
  sql("TRUNCATE public.lovable_paddle_events, public.founders, public.subscriptions;"),
);

function deps(): Deps {
  return {
    async insertEventReceived({ paddle_event_id, audit, payload }) {
      return insertPaddleEventLog(
        {
          paddle_event_id,
          ...audit,
          payload,
          processing_status: "received",
          processed_ok: false,
          skip_reason: null,
          last_error: null,
        },
        async (candidate) => {
          const fields = Object.keys(candidate);
          const values = Object.entries(candidate).map(([key, value]) =>
            key === "payload" ? literal(JSON.stringify(value)) + "::jsonb" : literal(value),
          );
          const result = rawSql(
            "SET ROLE service_role; INSERT INTO public.lovable_paddle_events (" +
              fields.join(",") +
              ") VALUES (" +
              values.join(",") +
              ");",
          );
          return {
            error:
              result.status === 0
                ? null
                : {
                    code: result.stderr.match(/ERROR:\s+(\d{5}):/)?.[1],
                    message: result.stderr || result.error?.message || "Event insert failed",
                  },
          };
        },
      );
    },
    async getExistingEvent(id) {
      const status = serviceSql(
        "SELECT processing_status FROM public.lovable_paddle_events " +
          "WHERE paddle_event_id = " +
          literal(id),
      );
      return { ok: true, row: status ? { processing_status: status as ProcessingStatus } : null };
    },
    async markEvent(id, patch) {
      serviceSql(
        "UPDATE public.lovable_paddle_events SET " +
          Object.entries(patch)
            .map(([key, value]) => key + " = " + literal(value))
            .join(",") +
          " WHERE paddle_event_id = " +
          literal(id),
      );
      return { ok: true };
    },
    async allocateFounderLifetime(input) {
      try {
        return JSON.parse(
          serviceSql(
            "SELECT public.allocate_lovable_founder_lifetime(" +
              [
                input.user_id,
                input.paddle_transaction_id,
                input.paddle_customer_id,
                input.environment,
                input.now.toISOString(),
              ]
                .map(literal)
                .join(",") +
              ");",
          ),
        );
      } catch (error) {
        // Match index.ts: an RPC error remains retryable, never a successful grant.
        return { ok: false, reason: `rpc_error:${String(error)}` };
      }
    },
    async revokeFounderLifetime(input) {
      const result = JSON.parse(
        serviceSql(
          "SELECT public.revoke_lovable_founder_lifetime_by_transaction(" +
            [input.paddle_transaction_id, input.environment, input.now.toISOString()]
              .map(literal)
              .join(",") +
            ");",
        ),
      );
      return result.ok
        ? {
            ok: true,
            subscriptionsUpdated: result.subscriptions_updated,
            foundersUpdated: result.founders_updated,
          }
        : { ok: false, error: result.reason };
    },
    async upsertSubscription() {
      throw new Error("Unexpected raw entitlement upsert");
    },
    async updateSubscription() {
      throw new Error("Unexpected recurring subscription update");
    },
  };
}

function refund(
  eventId = "evt_refund_first",
  tx = TX,
  action = "refund",
  status = "approved",
): EventLikeWithId {
  return {
    eventId,
    eventType: "adjustment.created",
    data: {
      id: "adj_ordering_fixture",
      action,
      status,
      transactionId: tx,
    } as EventLikeWithId["data"],
  };
}

function purchase(eventId = "evt_purchase_second", tx = TX): EventLikeWithId {
  return {
    eventId,
    eventType: "transaction.completed",
    data: {
      id: tx,
      customerId: "ctm_ordering_fixture",
      status: "completed",
      customData: { userId: OWNER },
      items: [
        { price: { id: "pri_ordering_fixture", importMeta: { externalId: "founder_lifetime" } } },
      ],
    },
  };
}

function deliver(event: EventLikeWithId, env: "live" | "sandbox" = "live", io = deps()) {
  return handleVerifiedEvent(
    io,
    event,
    env,
    event.eventType === "transaction.completed" ? PURCHASE_AT : REFUND_AT,
    event,
  );
}

function activeCount() {
  return Number(sql("SELECT count(*) FROM public.subscriptions WHERE status = 'active';"));
}

function eventState(id: string) {
  return sql(
    "SELECT processing_status, processed_ok, coalesce(skip_reason, '') " +
      "FROM public.lovable_paddle_events WHERE paddle_event_id = " +
      literal(id),
  );
}

function barrierId(env = "live", tx = TX) {
  return `internal:founder-refund:${env}:${tx}`;
}

function allocationSql(env = "live", tx = TX) {
  return `SELECT public.allocate_lovable_founder_lifetime(${[OWNER, tx, "ctm_fixture", env, PURCHASE_AT.toISOString()].map(literal).join(",")});`;
}

function revocationSql(env = "live", tx = TX) {
  return `SELECT public.revoke_lovable_founder_lifetime_by_transaction(${[tx, env, REFUND_AT.toISOString()].map(literal).join(",")});`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// One persistent psql process per transaction, so the test can hold a real lock
// while another backend enters the actual RPC. No timing sleeps establish order.
async function session(name: string) {
  const child = spawn(tool("psql"), psqlArgs(), { env: childEnv, windowsHide: true });
  let buffer = "";
  let output = "";
  let error = "";
  let sequence = 0;
  let pending: { marker: string; resolve(value: string): void; reject(error: Error): void } | null =
    null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trimEnd();
      buffer = buffer.slice(index + 1);
      if (pending && line === pending.marker) {
        const done = pending;
        pending = null;
        done.resolve(output.trim());
        output = "";
      } else output += line + "\n";
    }
  });
  child.on("error", (failure) => pending?.reject(failure));
  const closed = new Promise<void>((done) =>
    child.once("close", () => {
      pending?.reject(new Error(error || "PostgreSQL session closed before query completed"));
      pending = null;
      done();
    }),
  );
  function query(statement: string) {
    if (pending) throw new Error("Session already has an in-flight query");
    return new Promise<string>((resolve, reject) => {
      const marker = `concurrency_done_${++sequence}`;
      pending = { marker, resolve, reject };
      child.stdin.write(statement + "\n\\echo " + marker + "\n");
    });
  }
  await query(
    `SET application_name = ${literal(name)}; SET statement_timeout = '12s'; SET ROLE service_role;`,
  );
  return {
    query,
    async close() {
      child.stdin.end("ROLLBACK;\n");
      await closed;
    },
  };
}

async function waitForAdvisoryWait(name: string) {
  await vi.waitFor(
    () =>
      expect(
        sql(`
    SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE a.application_name = ${literal(name)} AND l.locktype = 'advisory' AND NOT l.granted;
  `),
      ).toBe("1"),
    { timeout: 5_000, interval: 40 },
  );
}

function expectRetired(env = "live", tx = TX) {
  expect(
    sql(
      `SELECT count(*) FROM public.subscriptions WHERE paddle_subscription_id = ${literal("lifetime_" + tx)} AND environment = ${literal(env)} AND status = 'active';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `SELECT count(*) FROM public.founders WHERE paddle_subscription_ref = ${literal("lifetime_" + tx)} AND status = 'confirmed';`,
    ),
  ).toBe("0");
}

describe("Founder Lifetime grant/refund concurrency — native PostgreSQL", () => {
  it.each([
    ["live", "refund"],
    ["live", "chargeback"],
    ["sandbox", "refund"],
    ["sandbox", "chargeback"],
  ] as const)(
    "%s delayed grant rechecks after approved %s persists and completes",
    async (env, action) => {
      const read = deferred();
      const resume = deferred();
      const io = deps();
      const lookup = io.getExistingEvent;
      const cancel = vi.fn(async () => ({ ok: true as const, canceled: 0 }));
      io.cancelOtherRecurringSubscriptions = cancel;
      io.getExistingEvent = async (id) => {
        const result = await lookup(id);
        if (id === barrierId(env)) {
          expect(result).toEqual({ ok: true, row: null });
          read.resolve();
          await resume.promise;
        }
        return result;
      };
      const delayed = deliver(purchase(), env, io);
      try {
        await read.promise;
        expect((await deliver(refund("evt_refund_race", TX, action), env)).reason).toBe(
          "processed:revoke_lifetime",
        );
      } finally {
        resume.resolve();
      }
      expect(await delayed).toEqual({
        httpStatus: 200,
        reason: "skipped:founder_refund_precedes_purchase",
      });
      expectRetired(env);
      expect(sql("SELECT count(*) FROM public.subscriptions;")).toBe("0");
      expect(sql("SELECT count(*) FROM public.founders;")).toBe("0");
      expect(cancel).not.toHaveBeenCalled();
      expect(eventState("evt_purchase_second")).toBe("skipped|f|founder_refund_precedes_purchase");
      expect((await deliver(purchase(), env)).reason).toBe("duplicate_skipped");
    },
  );

  it("refund waits for an uncommitted grant, then retires both rows and preserves preferences", async () => {
    const grant = await session("grant_first");
    const revoke = await session("refund_waiter");
    let refundDone: Promise<unknown> | undefined;
    try {
      expect(JSON.parse(await grant.query("BEGIN; " + allocationSql())).ok).toBe(true);
      await grant.query(
        `UPDATE public.founders SET display_name = 'Fixture grower', show_on_wall = true, optional_link = 'https://example.test/founder' WHERE user_id = ${literal(OWNER)};`,
      );
      const io = deps();
      io.revokeFounderLifetime = async () => {
        const result = JSON.parse(await revoke.query(revocationSql()));
        return {
          ok: true,
          subscriptionsUpdated: result.subscriptions_updated,
          foundersUpdated: result.founders_updated,
        };
      };
      refundDone = deliver(refund(), "live", io);
      void refundDone.catch(() => undefined);
      await waitForAdvisoryWait("refund_waiter");
      expect(activeCount()).toBe(0); // The grant is still uncommitted in another backend.
      await grant.query("COMMIT;");
      expect(await refundDone).toEqual({ httpStatus: 200, reason: "processed:revoke_lifetime" });
      expectRetired();
      expect(
        sql(
          "SELECT status, founder_number, display_name, show_on_wall, optional_link FROM public.founders;",
        ),
      ).toBe("refunded|1|Fixture grower|t|https://example.test/founder");
      expect(
        sql("SELECT public.founders_seats_consumed(), public.founder_lifetime_slots_remaining();"),
      ).toBe("1|99");
    } finally {
      await grant.close();
      await refundDone?.catch(() => undefined);
      await revoke.close();
    }
  });

  it("grant sees a barrier committed while it is waiting for refund's lock", async () => {
    const refundOwner = await session("refund_first");
    const grant = await session("grant_waiter");
    let pending: Promise<string> | undefined;
    try {
      await refundOwner.query("BEGIN; " + revocationSql());
      expect(eventState(barrierId())).toBe("");
      pending = grant.query(allocationSql());
      void pending.catch(() => undefined);
      await waitForAdvisoryWait("grant_waiter");
      // Commit the barrier in a third backend only AFTER the allocator is
      // already waiting. A barrier check before the lock would miss it.
      const io = deps();
      io.revokeFounderLifetime = async () => {
        const result = JSON.parse(await refundOwner.query(revocationSql()));
        return { ok: result.ok };
      };
      expect((await deliver(refund(), "live", io)).httpStatus).toBe(200);
      await refundOwner.query("COMMIT;");
      expect(JSON.parse(await pending)).toEqual({
        ok: false,
        reason: "founder_refund_precedes_purchase",
      });
      expectRetired();
    } finally {
      await refundOwner.close();
      await pending?.catch(() => undefined);
      await grant.close();
    }
  });

  it.each(["received", "failed", "skipped", "processed"])(
    "checks a %s barrier before idempotency and reconciles a previous grant",
    async (status) => {
      await deliver(purchase());
      const io = deps();
      io.revokeFounderLifetime = async () => ({ ok: false, error: "synthetic revoke failure" });
      expect((await deliver(refund(), "live", io)).httpStatus).toBe(500);
      sql(
        `UPDATE public.lovable_paddle_events SET processing_status = ${literal(status)} WHERE paddle_event_id = ${literal(barrierId())};`,
      );
      expect(JSON.parse(serviceSql(allocationSql()))).toEqual({
        ok: false,
        reason: "founder_refund_precedes_purchase",
      });
      expectRetired();
      expect(sql("SELECT founder_number, status FROM public.founders;")).toBe("1|refunded");
      expect(sql("SELECT public.founders_seats_consumed();")).toBe("1");
    },
  );

  it.each(["live", "sandbox"] as const)(
    "does not block the other environment after a %s refund",
    async (env) => {
      await deliver(refund(), env);
      const other = env === "live" ? "sandbox" : "live";
      expect(JSON.parse(serviceSql(allocationSql(other))).reason).toBe("allocated");
      expect(sql("SELECT environment, status FROM public.subscriptions;")).toBe(other + "|active");
      expect(JSON.parse(serviceSql(revocationSql(env))).subscriptions_updated).toBe(0);
      expect(activeCount()).toBe(1);
    },
  );

  it("preserves purchase-first, replay, unrelated transactions and a consumed seat", async () => {
    expect((await deliver(purchase())).reason).toBe("processed:record_lifetime");
    expect(JSON.parse(serviceSql(allocationSql())).reason).toBe("idempotent");
    expect((await deliver(refund())).reason).toBe("processed:revoke_lifetime");
    expect((await deliver(refund())).reason).toBe("processed:revoke_lifetime");
    expect((await deliver(purchase("evt_replay"))).reason).toBe(
      "skipped:founder_refund_precedes_purchase",
    );
    expectRetired();
    expect(JSON.parse(serviceSql(allocationSql("live", "txn_other"))).reason).toBe("allocated");
    expect(sql("SELECT founder_number, status FROM public.founders;")).toBe("1|refunded");
    expect(sql("SELECT public.founders_seats_consumed();")).toBe("1");
  });

  it.each(["repeatable read", "serializable"])(
    "fails closed for %s snapshots in both RPCs without granting or retiring",
    (isolation) => {
      for (const command of [allocationSql(), revocationSql()]) {
        const result = serviceSql(`BEGIN ISOLATION LEVEL ${isolation}; ${command} COMMIT;`);
        expect(JSON.parse(result)).toEqual({
          ok: false,
          reason: "unsupported_transaction_isolation",
        });
      }
      expect(sql("SELECT count(*) FROM public.subscriptions;")).toBe("0");
      expect(sql("SELECT count(*) FROM public.founders;")).toBe("0");
    },
  );

  it("keeps both RPCs unavailable to anon and authenticated clients", () => {
    for (const role of ["anon", "authenticated"])
      for (const command of [allocationSql(), revocationSql()]) {
        const result = rawSql(`SET ROLE ${role}; ${command}`);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("42501");
      }
    expect(activeCount()).toBe(0);
  });

  it("keeps a database-blocked purchase retryable when its skipped mark fails", async () => {
    const io = deps();
    const lookup = io.getExistingEvent;
    const mark = io.markEvent;
    io.getExistingEvent = async (id) => {
      const result = await lookup(id);
      if (id === barrierId()) await deliver(refund());
      return result;
    };
    io.markEvent = async (id, patch) =>
      patch.processing_status === "skipped"
        ? { ok: false, error: "synthetic mark failure" }
        : mark(id, patch);
    expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
    expect(eventState("evt_purchase_second")).toBe("failed|f|");
    expectRetired();
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
  });

  it("does not recreate a missing founder on idempotent replay of a refunded subscription", async () => {
    await deliver(purchase());
    sql("DELETE FROM public.founders;"); // Simulate an earlier partial grant.
    await deliver(refund());
    expect(JSON.parse(serviceSql(allocationSql()))).toEqual({
      ok: false,
      reason: "founder_refund_precedes_purchase",
    });
    expectRetired();
    expect(sql("SELECT count(*) FROM public.founders;")).toBe("0");
  });

  it("preserves the 100 consumed-seat cap, including refunded seats", () => {
    sql(`
      INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1,100) n;
      INSERT INTO public.founders(user_id, founder_number, paddle_subscription_ref, status)
        SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, n, 'lifetime_retired_' || n, 'refunded' FROM generate_series(1,100) n;
    `);
    expect(JSON.parse(serviceSql(allocationSql()))).toEqual({
      ok: false,
      reason: "cap_reached",
      seats_consumed: 100,
    });
    expect(activeCount()).toBe(0);
    expect(
      sql("SELECT public.founders_seats_consumed(), public.founder_lifetime_slots_remaining();"),
    ).toBe("100|0");
    expect(JSON.parse(serviceSql(allocationSql("sandbox"))).reason).toBe("allocated");
    expect(
      sql("SELECT min(founder_number), max(founder_number), count(*) FROM public.founders;"),
    ).toBe("1|100|100");
  });

  it("rolls back a failed protected reconciliation and retries without acknowledging a purchase", async () => {
    serviceSql(allocationSql());
    const failedRefund = deps();
    failedRefund.revokeFounderLifetime = async () => ({
      ok: false,
      error: "synthetic revoke failure",
    });
    await deliver(refund(), "live", failedRefund);
    sql(`
      CREATE FUNCTION public.reject_refund_concurrency_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic founder retirement failure'; END $$;
      CREATE TRIGGER reject_refund_concurrency_fixture BEFORE UPDATE ON public.founders
        FOR EACH ROW EXECUTE FUNCTION public.reject_refund_concurrency_fixture();
    `);
    const io = deps();
    // Model the stale precheck while exercising the real protected allocator.
    io.getExistingEvent = async () => ({ ok: true, row: null });
    const cancel = vi.fn(async () => ({ ok: true as const, canceled: 0 }));
    io.cancelOtherRecurringSubscriptions = cancel;
    try {
      expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
      expect(eventState("evt_purchase_second")).toBe("failed|f|");
      // Revocation updated subscription first, but the second write failed:
      // both changes roll back and the unresolved purchase remains retryable.
      expect(sql("SELECT status FROM public.subscriptions;")).toBe("active");
      expect(sql("SELECT status, founder_number FROM public.founders;")).toBe("confirmed|1");
      expect(cancel).not.toHaveBeenCalled();
    } finally {
      sql(
        "DROP TRIGGER reject_refund_concurrency_fixture ON public.founders; DROP FUNCTION public.reject_refund_concurrency_fixture();",
      );
    }
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
    expectRetired();
    expect(sql("SELECT public.founders_seats_consumed();")).toBe("1");
  });
});
