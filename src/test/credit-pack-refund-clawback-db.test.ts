/**
 * Credit-pack refund clawback through the real webhook orchestrator.
 * Grant-path audit (2026-10-03), FAIL #1: an approved refund or chargeback
 * must reverse the full pack grant, in either delivery order.
 * Uses a disposable PostgreSQL cluster on a private Unix socket, with TCP
 * disabled and a scrubbed child environment. No hosted DB or credentials.
 * Replays the committed event, founder and grant-ledger migrations unchanged.
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

const OWNER = "00000000-0000-4000-8000-00000000c101";
const TX = "txn_credit_pack_clawback_fixture";
const REFUND_AT = new Date("2026-10-03T20:00:00.000Z");
const PURCHASE_AT = new Date("2026-10-03T20:01:00.000Z");
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
  "20260721103000_ai_credit_grants.sql",
  "20260721105000_ai_credit_grants_non_paddle_grants.sql",
  "20261003010000_credit_pack_refund_clawback.sql",
].sort();
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
      "55433",
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
  workdir = mkdtempSync(join(tmpdir(), "credit-pack-clawback-"));
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
      "\nport = 55433\nfsync = off\n",
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
  sql(
    "TRUNCATE public.lovable_paddle_events, public.founders, public.subscriptions, public.ai_credit_grants;",
  ),
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
    async allocateCreditPack(input) {
      return JSON.parse(
        serviceSql(
          "SELECT public.grant_lovable_credit_pack(" +
            [
              input.user_id,
              input.paddle_transaction_id,
              input.credits,
              input.sku,
              input.environment,
            ]
              .map(literal)
              .join(",") +
            ");",
        ),
      );
    },
    async clawbackCreditPack(input) {
      const result = JSON.parse(
        serviceSql(
          "SELECT public.clawback_lovable_credit_pack(" +
            [input.paddle_transaction_id, input.environment].map(literal).join(",") +
            ");",
        ),
      );
      return result.ok ? { ok: true, reason: result.reason } : { ok: false, error: result.reason };
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

function refund(eventId = "evt_pack_refund", action = "refund", tx = TX): EventLikeWithId {
  return {
    eventId,
    eventType: "adjustment.created",
    data: {
      id: "adj_pack_fixture",
      action,
      status: "approved",
      transactionId: tx,
    } as EventLikeWithId["data"],
  };
}

function packPurchase(
  eventId = "evt_pack_purchase",
  sku = "credit_pack_50",
  tx = TX,
): EventLikeWithId {
  return {
    eventId,
    eventType: "transaction.completed",
    data: {
      id: tx,
      customerId: "ctm_pack_fixture",
      status: "completed",
      customData: { userId: OWNER },
      items: [{ price: { id: "pri_pack_fixture", importMeta: { externalId: sku } } }],
    },
  };
}

function deliver(event: EventLikeWithId, env: "live" | "sandbox" = "live") {
  return handleVerifiedEvent(
    deps(),
    event,
    env,
    event.eventType === "transaction.completed" ? PURCHASE_AT : REFUND_AT,
    event,
  );
}

function ledger() {
  return sql(
    "SELECT kind || ':' || credits || ':' || environment || ':' || coalesce(sku, '') " +
      "FROM public.ai_credit_grants ORDER BY created_at, kind DESC;",
  );
}

function balance(env = "live") {
  return Number(
    sql(
      "SELECT coalesce(sum(credits), 0) FROM public.ai_credit_grants " +
        "WHERE user_id = '" +
        OWNER +
        "' AND environment = " +
        literal(env) +
        ";",
    ),
  );
}

describe("credit-pack refund clawback — real orchestrator and PostgreSQL", () => {
  it.each([
    ["live", "refund", "credit_pack_50", 50],
    ["live", "chargeback", "credit_pack_150", 150],
    ["sandbox", "refund", "credit_pack_150", 150],
    ["sandbox", "chargeback", "credit_pack_50", 50],
  ] as const)(
    "a %s %s after purchase claws back the full %s grant",
    async (env, action, sku, credits) => {
      expect(await deliver(packPurchase("evt_pack_purchase", sku), env)).toEqual({
        httpStatus: 200,
        reason: "processed:grant_credit_pack",
      });
      expect(balance(env)).toBe(credits);

      expect(await deliver(refund("evt_pack_refund", action), env)).toEqual({
        httpStatus: 200,
        reason: "processed:revoke_lifetime",
      });
      expect(ledger()).toBe(`grant:${credits}:${env}:${sku}\nclawback:-${credits}:${env}:${sku}`);
      expect(balance(env)).toBe(0);
      expect(
        sql(
          "SELECT count(*) FROM public.ai_credit_grants c JOIN public.ai_credit_grants g " +
            "ON c.reverses = g.id WHERE c.kind = 'clawback' AND g.kind = 'grant';",
        ),
      ).toBe("1");
    },
  );

  it("replayed and duplicate refunds append exactly one clawback", async () => {
    await deliver(packPurchase());
    await deliver(refund("evt_pack_refund"));
    expect(await deliver(refund("evt_pack_refund"))).toEqual({
      httpStatus: 200,
      reason: "processed:revoke_lifetime",
    });
    await deliver(refund("evt_pack_refund_again", "chargeback"));
    expect(sql("SELECT count(*) FROM public.ai_credit_grants WHERE kind = 'clawback';")).toBe("1");
    expect(balance()).toBe(0);
  });

  it("a refund that arrives before the purchase leaves no credits behind", async () => {
    expect(await deliver(refund("evt_refund_first"))).toEqual({
      httpStatus: 200,
      reason: "processed:revoke_lifetime",
    });
    expect(await deliver(packPurchase("evt_purchase_second"))).toEqual({
      httpStatus: 200,
      reason: "skipped:credit_pack_refund_precedes_purchase",
    });
    expect(sql("SELECT count(*) FROM public.ai_credit_grants;")).toBe("0");
    expect(eventStatus("evt_purchase_second")).toBe(
      "skipped|false|credit_pack_refund_precedes_purchase",
    );
  });

  it("a refund in one environment does not reverse a grant in the other", async () => {
    await deliver(packPurchase(), "live");
    await deliver(refund(), "sandbox");
    expect(balance("live")).toBe(50);
    expect(sql("SELECT count(*) FROM public.ai_credit_grants WHERE kind = 'clawback';")).toBe("0");
  });

  it("a refund on a transaction that was not a pack purchase changes no credits", async () => {
    await deliver(packPurchase("evt_other_purchase", "credit_pack_50", "txn_other_pack"));
    expect(await deliver(refund("evt_unrelated_refund"))).toEqual({
      httpStatus: 200,
      reason: "processed:revoke_lifetime",
    });
    expect(balance()).toBe(50);
  });

  it("re-delivering the purchase after a refund grants nothing more", async () => {
    await deliver(packPurchase("evt_purchase_once"));
    await deliver(refund());
    // A new event id for the same transaction (Paddle re-send or replay tool).
    expect(await deliver(packPurchase("evt_purchase_resent"))).toEqual({
      httpStatus: 200,
      reason: "skipped:credit_pack_refund_precedes_purchase",
    });
    expect(ledger()).toBe("grant:50:live:credit_pack_50\nclawback:-50:live:credit_pack_50");
    expect(balance()).toBe(0);
  });

  it("only service_role can execute the clawback", () => {
    for (const role of ["anon", "authenticated"]) {
      const result = rawSql(
        "SET ROLE " +
          role +
          "; SELECT public.clawback_lovable_credit_pack(" +
          literal(TX) +
          ", 'live');",
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/42501|permission denied/);
    }
  });

  it("refuses outside Read Committed instead of reading a stale snapshot", () => {
    const result = sql(
      "BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; " +
        "SELECT public.clawback_lovable_credit_pack(" +
        literal(TX) +
        ", 'live')->>'reason'; COMMIT;",
    );
    expect(result.split("\n").filter(Boolean).pop()).toBe("unsupported_transaction_isolation");
  });
});

function eventStatus(id: string) {
  return sql(
    "SELECT processing_status || '|' || processed_ok || '|' || coalesce(skip_reason, '') " +
      "FROM public.lovable_paddle_events WHERE paddle_event_id = " +
      literal(id),
  );
}
