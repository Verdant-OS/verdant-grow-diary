/**
 * Refund-before-allocation regression through the real webhook orchestrator.
 * Uses a disposable PostgreSQL cluster on a private Unix socket, with TCP
 * disabled and a scrubbed child environment. No hosted DB or credentials.
 * Replays the committed billing/event/founder migrations unchanged. Only
 * auth.users/auth.uid are fixture dependencies; all event writes and both
 * entitlement RPCs execute against PostgreSQL as service_role.
 * This tests verified-event orchestration, not signature transport or PostgREST.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const childEnv = { PATH: process.env.PATH, LC_ALL: "C" };
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

function rawSql(query: string) {
  return spawnSync(
    join(binDir, "psql"),
    [
      "-X",
      "--no-password",
      "-qAt",
      "-h",
      workdir,
      "-p",
      "55432",
      "-U",
      "refund_ordering_admin",
      "-d",
      "postgres",
      "--set=ON_ERROR_STOP=1",
      "--set=VERBOSITY=verbose",
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

function serviceSql(query: string): string {
  return sql("SET ROLE service_role; " + query);
}

beforeAll(() => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    throw new Error("BLOCKED: run as a non-root Unix user with PostgreSQL server tools.");
  }
  const discovery = spawnSync("pg_config", ["--bindir"], { encoding: "utf8", env: childEnv });
  if (discovery.status !== 0)
    throw new Error("BLOCKED: PostgreSQL tools required; no tests skipped.");
  binDir = discovery.stdout.trim();
  for (const tool of ["initdb", "pg_ctl", "psql"]) {
    if (!existsSync(join(binDir, tool))) throw new Error("BLOCKED: missing PostgreSQL " + tool);
  }
  workdir = mkdtempSync(join(tmpdir(), "founder-refund-ordering-"));
  dataDir = join(workdir, "data");
  execFileSync(
    join(binDir, "initdb"),
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
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  writeFileSync(
    join(dataDir, "postgresql.auto.conf"),
    "listen_addresses = ''\nunix_socket_directories = " +
      literal(workdir) +
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
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${OWNER}');
  `);
  for (const file of migrations) sql(readFileSync(resolve("supabase/migrations", file), "utf8"));
}, 60_000);

afterAll(() => {
  if (started)
    execFileSync(join(binDir, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      env: childEnv,
      stdio: "pipe",
      timeout: 20_000,
    });
  if (workdir) rmSync(workdir, { recursive: true, force: true });
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

describe("founder refund-first / purchase-second — real orchestrator and PostgreSQL", () => {
  it.each([
    ["live", "refund"],
    ["live", "chargeback"],
    ["sandbox", "refund"],
    ["sandbox", "chargeback"],
  ] as const)("blocks %s purchase after approved %s with no allocation", async (env, action) => {
    expect(await deliver(refund("evt_refund_first", TX, action), env)).toEqual({
      httpStatus: 200,
      reason: "processed:revoke_lifetime",
    });
    expect(sql("SELECT count(*) FROM public.subscriptions;")).toBe("0");
    expect(sql("SELECT count(*) FROM public.founders;")).toBe("0");
    const io = deps();
    io.cancelOtherRecurringSubscriptions = async () => {
      throw new Error("Must not cancel recurring plans");
    };
    const result = await deliver(purchase(), env, io);
    expect(activeCount()).toBe(0);
    expect(result).toEqual({ httpStatus: 200, reason: "skipped:founder_refund_precedes_purchase" });
    expect(sql("SELECT count(*) FROM public.founders;")).toBe("0");
    expect(eventState("evt_purchase_second")).toBe("skipped|f|founder_refund_precedes_purchase");
    expect(eventState("evt_refund_first")).toBe("processed|t|");
    expect(
      sql(
        "SELECT event_type, paddle_transaction_id, payload->>'source_paddle_event_id' " +
          "FROM public.lovable_paddle_events WHERE paddle_event_id = " +
          literal(barrierId(env)),
      ),
    ).toBe("internal.founder_refund_barrier|" + TX + "|evt_refund_first");
    expect(await deliver(purchase(), env)).toEqual({
      httpStatus: 200,
      reason: "duplicate_skipped",
    });
    expect(activeCount()).toBe(0);
  });

  it("preserves the normal purchase-then-refund path and consumed seat", async () => {
    expect(await deliver(purchase())).toEqual({
      httpStatus: 200,
      reason: "processed:record_lifetime",
    });
    expect(activeCount()).toBe(1);
    expect(await deliver(refund())).toEqual({
      httpStatus: 200,
      reason: "processed:revoke_lifetime",
    });
    expect(activeCount()).toBe(0);
    expect(sql("SELECT status, founder_number FROM public.founders;")).toBe("refunded|1");
    expect(sql("SELECT public.founders_seats_consumed();")).toBe("1");
  });

  it.each(["received", "failed", "processed", "skipped"])(
    "blocks a barrier in %s status",
    async (status) => {
      await deliver(refund());
      sql(
        "UPDATE public.lovable_paddle_events SET processing_status = " +
          literal(status) +
          " WHERE paddle_event_id = " +
          literal(barrierId()),
      );
      const io = deps();
      // Prove the legacy raw-upsert fallback is fenced too.
      delete io.allocateFounderLifetime;
      expect((await deliver(purchase(), "live", io)).reason).toBe(
        "skipped:founder_refund_precedes_purchase",
      );
      expect(activeCount()).toBe(0);
    },
  );

  it.each([
    ["refund", "pending_approval"],
    ["refund", "rejected"],
    ["credit", "approved"],
  ])("does not block a purchase for %s / %s", async (action, status) => {
    expect((await deliver(refund("evt_adjustment", TX, action, status))).reason).toMatch(
      /^skipped:/,
    );
    expect((await deliver(purchase())).reason).toBe("processed:record_lifetime");
    expect(activeCount()).toBe(1);
    expect(
      sql(
        "SELECT count(*) FROM public.lovable_paddle_events " +
          "WHERE event_type = 'internal.founder_refund_barrier';",
      ),
    ).toBe("0");
  });

  it.each(["live", "sandbox"] as const)(
    "isolates a %s refund from the other environment",
    async (env) => {
      await deliver(refund(), env);
      const other = env === "live" ? "sandbox" : "live";
      expect((await deliver(purchase(), other)).reason).toBe("processed:record_lifetime");
      expect(sql("SELECT environment, status FROM public.subscriptions;")).toBe(other + "|active");
    },
  );

  it("isolates an unrelated transaction and preserves the first refund provenance on replay", async () => {
    await deliver(refund());
    await deliver(refund("evt_refund_again"));
    expect(
      sql(
        "SELECT count(*) FROM public.lovable_paddle_events " +
          "WHERE event_type = 'internal.founder_refund_barrier';",
      ),
    ).toBe("1");
    expect(
      sql(
        "SELECT payload->>'source_paddle_event_id' FROM public.lovable_paddle_events " +
          "WHERE paddle_event_id = " +
          literal(barrierId()),
      ),
    ).toBe("evt_refund_first");
    expect((await deliver(purchase("evt_unrelated", "txn_unrelated"))).reason).toBe(
      "processed:record_lifetime",
    );
    expect(activeCount()).toBe(1);
  });

  it("fails closed on barrier lookup errors and allows replay after recovery", async () => {
    const io = deps();
    io.getExistingEvent = async () => ({ ok: false, error: "synthetic lookup failure" });
    expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
    expect(activeCount()).toBe(0);
    expect(eventState("evt_purchase_second")).toBe("failed|f|");
    expect((await deliver(purchase())).reason).toBe("processed:record_lifetime");
    expect(activeCount()).toBe(1);
  });

  it("retries a failed barrier insert without acknowledging the refund", async () => {
    sql(`
      CREATE FUNCTION public.reject_refund_barrier_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'internal.founder_refund_barrier' THEN
          RAISE EXCEPTION 'synthetic barrier insert failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_refund_barrier_fixture BEFORE INSERT ON public.lovable_paddle_events
        FOR EACH ROW EXECUTE FUNCTION public.reject_refund_barrier_fixture();
    `);
    try {
      expect((await deliver(refund())).httpStatus).toBe(500);
      expect(eventState("evt_refund_first")).toBe("failed|f|");
      expect(activeCount()).toBe(0);
    } finally {
      sql(
        "DROP TRIGGER reject_refund_barrier_fixture ON public.lovable_paddle_events; " +
          "DROP FUNCTION public.reject_refund_barrier_fixture();",
      );
    }
    expect((await deliver(refund())).httpStatus).toBe(200);
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
    expect(activeCount()).toBe(0);
  });

  it("retains a barrier after its mark fails and blocks the later purchase", async () => {
    const io = deps();
    const mark = io.markEvent;
    io.markEvent = async (id, patch) =>
      id === barrierId() ? { ok: false, error: "synthetic barrier mark failure" } : mark(id, patch);
    expect((await deliver(refund(), "live", io)).httpStatus).toBe(500);
    expect(eventState(barrierId())).toBe("received|f|");
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
    expect(activeCount()).toBe(0);
  });

  it("retains the barrier when revocation is unwired and fails closed on purchase reconciliation", async () => {
    const io = deps();
    delete io.revokeFounderLifetime;
    expect((await deliver(refund(), "live", io)).httpStatus).toBe(500);
    expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
    expect(activeCount()).toBe(0);
    expect(eventState("evt_purchase_second")).toBe("failed|f|");
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
  });

  it("retries a failed purchase skip mark without allocating", async () => {
    await deliver(refund());
    const io = deps();
    const mark = io.markEvent;
    io.markEvent = async (id, patch) =>
      id === "evt_purchase_second" && patch.processing_status === "skipped"
        ? { ok: false, error: "synthetic purchase mark failure" }
        : mark(id, patch);
    expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
    expect(eventState("evt_purchase_second")).toBe("failed|f|");
    expect(activeCount()).toBe(0);
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
  });

  it("reconciles an existing allocation before making its retried purchase terminal", async () => {
    await deliver(purchase());
    sql(
      "UPDATE public.lovable_paddle_events SET processing_status = 'failed', processed_ok = false " +
        "WHERE paddle_event_id = 'evt_purchase_second';",
    );
    const io = deps();
    io.revokeFounderLifetime = async () => ({ ok: false, error: "synthetic revoke failure" });
    expect((await deliver(refund(), "live", io)).httpStatus).toBe(500);
    expect(activeCount()).toBe(1);
    expect((await deliver(purchase(), "live", io)).httpStatus).toBe(500);
    expect(eventState("evt_purchase_second")).toBe("failed|f|");
    expect((await deliver(purchase())).reason).toBe("skipped:founder_refund_precedes_purchase");
    expect(activeCount()).toBe(0);
    expect(sql("SELECT status, founder_number FROM public.founders;")).toBe("refunded|1");
  });

  it("replays an older terminal refund to install its missing barrier and reconcile", async () => {
    await deliver(refund());
    // Simulate a pre-fix processed refund: provider event survives, no barrier.
    sql("DELETE FROM public.lovable_paddle_events WHERE paddle_event_id = " + literal(barrierId()));
    await deliver(purchase());
    expect(activeCount()).toBe(1);
    expect((await deliver(refund())).reason).toBe("processed:revoke_lifetime");
    expect(activeCount()).toBe(0);
    expect((await deliver(purchase("evt_redelivery"))).reason).toBe(
      "skipped:founder_refund_precedes_purchase",
    );
  });
});
