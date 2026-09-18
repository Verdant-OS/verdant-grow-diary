// @vitest-environment jsdom
/**
 * Real disposable PostgreSQL proof, not hosted Supabase acceptance.
 * Fixture tables provide auth/tents/readings; the committed dedupe and history
 * policy SQL are replayed unchanged. No DB URL or private environment is read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { confirmManualCorrectionReceipt } from "@/lib/manualSensorCorrectionReceiptRules";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";
import { resolveLegacyManualCorrections } from "@/lib/manualSensorLegacyCorrectionRules";
import { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadingRules";
import {
  submitPendingManualCorrection,
  type ManualCorrectionRpcClient,
} from "@/lib/manualSensorCorrectionService";

const OWNER = "00000000-0000-4000-8000-00000000c001";
const OTHER = "00000000-0000-4000-8000-00000000c002";
const TENT = "00000000-0000-4000-8000-00000000c003";
const TEMP = "00000000-0000-4000-8000-00000000c004";
const RH = "00000000-0000-4000-8000-00000000c005";
const OP = "00000000-0000-4000-8000-00000000c006";
const NEXT = "00000000-0000-4000-8000-00000000c007";
const migration = "20260917183000_manual_sensor_correction_operations.sql";
const childEnv = {
  PATH: process.env.PATH,
  LC_ALL: "C",
  ...(process.platform === "win32"
    ? {
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      }
    : {}),
};
let workdir = "",
  dataDir = "",
  binDir = "",
  host = "",
  port = "55432",
  observedAt = "";
let started = false;
const tool = (name: string) => join(binDir, name + (process.platform === "win32" ? ".exe" : ""));
const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
function args() {
  return [
    "-X",
    "--no-password",
    "-qAt",
    "-h",
    host,
    "-p",
    port,
    "-U",
    "correction_test_admin",
    "-d",
    "postgres",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
  ];
}
function rawSql(query: string) {
  return spawnSync(tool("psql"), args(), {
    input: query,
    encoding: "utf8",
    env: childEnv,
    windowsHide: true,
    timeout: 15_000,
  });
}
function sql(query: string) {
  const r = rawSql(query);
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || "Local PostgreSQL failed");
  return r.stdout.trim();
}
const role = (query: string, uid = OWNER) =>
  "SET ROLE authenticated; SET request.jwt.claim.sub = " + literal(uid) + "; " + query;
function operation() {
  const result = buildManualCorrectionOperation({
    operationId: OP,
    correction: {
      tentId: TENT,
      originalCapturedAt: observedAt,
      originalReadingIds: { temperature_c: TEMP, humidity_pct: RH },
      originalValues: { temperature_c: 25, humidity_pct: 55 },
    },
    metrics: [
      { metric: "temperature_c", value: 24 },
      { metric: "humidity_pct", value: 60 },
    ],
  });
  if (!result.ok) throw new Error("Invalid local fixture operation");
  return JSON.parse(JSON.stringify(result.operation));
}
const saveSql = (op: unknown) =>
  "SELECT public.save_manual_sensor_correction(" + literal(JSON.stringify(op)) + "::jsonb);";
const save = (op: unknown, uid = OWNER) => JSON.parse(sql(role(saveSql(op), uid)));
const count = () => Number(sql("SELECT count(*) FROM public.manual_sensor_correction_operations;"));
function denied(op: unknown, pattern: RegExp, uid = OWNER) {
  const before = sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.sensor_readings r;");
  const ledgerBefore = sql(
    "SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.manual_sensor_correction_operations o;",
  );
  const r = rawSql(role(saveSql(op), uid));
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(pattern);
  expect(
    sql(
      "SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.manual_sensor_correction_operations o;",
    ),
  ).toBe(ledgerBefore);
  expect(sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.sensor_readings r;")).toBe(
    before,
  );
}
beforeAll(async () => {
  if (process.getuid?.() === 0) throw new Error("Run disposable PostgreSQL as a non-root user");
  binDir = process.env.MANUAL_CORRECTION_PG_BIN ?? "";
  if (!binDir) {
    const found = spawnSync("pg_config", ["--bindir"], {
      encoding: "utf8",
      env: childEnv,
      windowsHide: true,
    });
    if (found.status !== 0) throw new Error("PostgreSQL tools required; no tests skipped");
    binDir = found.stdout.trim();
  }
  for (const name of ["initdb", "pg_ctl", "psql"])
    if (!existsSync(tool(name))) throw new Error("Missing " + name);
  workdir = mkdtempSync(join(tmpdir(), "manual-correction-db-"));
  dataDir = join(workdir, "data");
  host = workdir;
  if (process.platform === "win32") {
    host = "127.0.0.1";
    const server = createServer();
    await new Promise<void>((done, fail) => {
      server.once("error", fail);
      server.listen(0, host, done);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No local port");
    port = String(address.port);
    await new Promise<void>((done, fail) => server.close((e) => (e ? fail(e) : done())));
  }
  execFileSync(
    tool("initdb"),
    [
      "-D",
      dataDir,
      "-U",
      "correction_test_admin",
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
  started = true;
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
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${OWNER}'), ('${OTHER}');
    CREATE TABLE public.tents (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE TABLE public.plants (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_own ON public.plants FOR SELECT USING (user_id = auth.uid());
    GRANT SELECT ON public.plants TO authenticated;
    INSERT INTO public.tents VALUES ('${TENT}', '${OWNER}');
    CREATE TABLE public.sensor_readings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(),
      tent_id uuid NOT NULL, ts timestamptz NOT NULL DEFAULT now(), captured_at timestamptz,
      metric text NOT NULL, value numeric NOT NULL, source text NOT NULL DEFAULT 'manual',
      quality text NOT NULL DEFAULT 'ok', created_at timestamptz NOT NULL DEFAULT now(),
      device_id text, raw_payload jsonb);
    ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_own ON public.sensor_readings FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY insert_own ON public.sensor_readings FOR INSERT WITH CHECK (user_id = auth.uid());
    CREATE TABLE public.subscriptions (user_id uuid, environment text, price_id text,
      current_period_end timestamptz, status text, paddle_subscription_id text);
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_own ON public.subscriptions FOR SELECT USING (user_id = auth.uid());
    ALTER TABLE public.tents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_own ON public.tents FOR SELECT USING (user_id = auth.uid());
    GRANT SELECT ON public.tents, public.subscriptions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_readings TO authenticated;
  `);
  sql(
    readFileSync(
      resolve("supabase/migrations/20260617115621_a2a5d7f5-7c52-4dd9-a5bb-687e9d26f4df.sql"),
      "utf8",
    ),
  );
  sql(
    "CREATE TRIGGER validate_reading BEFORE INSERT ON public.sensor_readings FOR EACH ROW EXECUTE FUNCTION public.validate_sensor_reading();",
  );
  const history = readFileSync(
    resolve("supabase/migrations/20260728050000_canonical_subscription_authority_reassert.sql"),
    "utf8",
  );
  const begin = history.indexOf(
    'DROP POLICY IF EXISTS "Free sensor history is limited to 90 days"',
  );
  const end = history.indexOf("CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement", begin);
  if (begin < 0 || end < 0) throw new Error("History policy boundaries changed");
  sql(history.slice(begin, end));
  sql(
    readFileSync(
      resolve("supabase/migrations/20260707125159_903fb13e-ee2f-4903-a3e0-43fbcc74f2c6.sql"),
      "utf8",
    ),
  );
  sql(readFileSync(resolve("supabase/migrations", migration), "utf8"));
  console.info("Disposable PostgreSQL:", sql("SELECT version();"));
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
      !target.includes("manual-correction-db-")
    )
      throw new Error("Unexpected cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
}, 30_000);
beforeEach(() => {
  sql("TRUNCATE public.sensor_readings CASCADE; TRUNCATE public.subscriptions;");
  observedAt = sql(
    "SELECT to_char(now() - interval '26 hours', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
  );
  sql(`INSERT INTO public.sensor_readings (id,user_id,tent_id,metric,value,captured_at,ts)
    VALUES ('${TEMP}','${OWNER}','${TENT}','temperature_c',25,${literal(observedAt)},${literal(observedAt)}),
           ('${RH}','${OWNER}','${TENT}','humidity_pct',55,${literal(observedAt)},${literal(observedAt)});`);
});
describe("atomic manual correction database contract", () => {
  function legacyEvidence() {
    const rows = JSON.parse(
      sql(
        role("SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.sensor_readings r;"),
      ),
    );
    const links = JSON.parse(
      sql(
        role(
          "SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.manual_sensor_snapshot_edits e;",
        ),
      ),
    );
    return resolveLegacyManualCorrections(OWNER, rows, links);
  }
  function insertLegacyLink(replacement: string) {
    sql(
      role(`INSERT INTO public.manual_sensor_snapshot_edits
      (original_reading_id,replacement_reading_id,tent_id,old_values,new_values,changed_fields,source_before,source_after)
      VALUES ('${TEMP}','${replacement}','${TENT}','{"temperature_c":25}','{"temperature_c":24}',ARRAY['temperature_c'],'manual','manual');`),
    );
  }
  function insertLegacyReplacement() {
    sql(
      role(`INSERT INTO public.sensor_readings (id,tent_id,metric,value,captured_at,ts)
      VALUES ('${NEXT}','${TENT}','temperature_c',24,now(),now());`),
    );
    insertLegacyLink(NEXT);
  }
  const evidenceSql = (ids: string[]) =>
    `SELECT public.read_manual_sensor_correction_evidence(ARRAY[${ids.map(literal).join(",")}]::uuid[]);`;
  it("reads both endpoints and new-operation values in one caller-scoped evidence packet", () => {
    insertLegacyReplacement();
    const legacy = JSON.parse(sql(role(evidenceSql([NEXT]))));
    expect(legacy.complete).toBe(true);
    expect(legacy.readings.map((row: { id: string }) => row.id).sort()).toEqual(
      [TEMP, NEXT].sort(),
    );
    expect(legacy.links).toHaveLength(1);
    expect(legacy.effective).toHaveLength(1);
    expect(legacy.effective[0]).toMatchObject({ id: TEMP, value: 24, correction_valid: true });
    const op = operation();
    op.originals.find((row: { readingId: string }) => row.readingId === TEMP).value = 24;
    const change = op.changes.find(
      (row: { originalReadingId: string }) => row.originalReadingId === TEMP,
    );
    change.expectedValue = 24;
    change.value = 23;
    save(op);
    const corrected = JSON.parse(sql(role(evidenceSql([TEMP, RH]))));
    expect(corrected.complete).toBe(true);
    expect(corrected.readings.find((row: { id: string }) => row.id === TEMP).value).toBe(25);
    expect(corrected.effective.find((row: { id: string }) => row.id === TEMP).value).toBe(23);
    const decoded = requireEffectiveSensorReadings(corrected.effective);
    expect(decoded.find((row) => row.id === TEMP)?.value).toBe(23);
    expect(new Date(decoded.find((row) => row.id === TEMP)!.captured_at!).getTime()).toBe(
      new Date(observedAt).getTime(),
    );
    expect(
      corrected.effective.find((row: { id: string }) => row.id === TEMP).correction_operation_id,
    ).toBe(OP);
  });
  it("does not expose another owner's seed through the evidence RPC", () => {
    expect(JSON.parse(sql(role(evidenceSql([TEMP]), OTHER)))).toEqual({
      complete: false,
      readings: [],
      links: [],
      effective: [],
    });
  });
  it("returns incomplete rather than a partial packet when a legacy endpoint is hidden by history RLS", () => {
    insertLegacyReplacement();
    sql(
      `UPDATE public.sensor_readings SET captured_at = now() - interval '100 days', ts = now() - interval '100 days' WHERE id = '${TEMP}';`,
    );
    expect(JSON.parse(sql(role(evidenceSql([NEXT]))))).toEqual({
      complete: false,
      readings: [],
      links: [],
      effective: [],
    });
  });
  it("distinguishes a valid empty request from missing evidence input", () => {
    expect(JSON.parse(sql(role(evidenceSql([]))))).toEqual({
      complete: true,
      readings: [],
      links: [],
      effective: [],
    });
    expect(
      JSON.parse(sql(role("SELECT public.read_manual_sensor_correction_evidence(NULL);"))).complete,
    ).toBe(false);
  });
  it("denies anonymous access to correction evidence", () => {
    const result = rawSql("SET ROLE anon; " + evidenceSql([TEMP]));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("42501");
  });
  it("terminates cyclic legacy linkage and lets the resolver reject the ambiguous graph", () => {
    insertLegacyReplacement();
    sql(
      role(`INSERT INTO public.manual_sensor_snapshot_edits
      (original_reading_id,replacement_reading_id,tent_id,old_values,new_values,changed_fields,source_before,source_after)
      VALUES ('${NEXT}','${TEMP}','${TENT}','{"temperature_c":24}','{"temperature_c":25}',ARRAY['temperature_c'],'manual','manual');`),
    );
    const packet = JSON.parse(sql(role(evidenceSql([NEXT]))));
    expect(packet.complete).toBe(true);
    expect(packet.readings).toHaveLength(2);
    expect(packet.links).toHaveLength(2);
    expect(resolveLegacyManualCorrections(OWNER, packet.readings, packet.links)).toEqual({
      status: "unavailable",
    });
  });
  it("rejects oversized and null-containing seed requests rather than treating them as empty", () => {
    const oversized = JSON.parse(
      sql(
        role(
          `SELECT public.read_manual_sensor_correction_evidence(array_fill('${TEMP}'::uuid, ARRAY[2001]));`,
        ),
      ),
    );
    expect(oversized).toEqual({ complete: false, readings: [], links: [], effective: [] });
    expect(
      JSON.parse(
        sql(role("SELECT public.read_manual_sensor_correction_evidence(ARRAY[NULL]::uuid[]);")),
      ).complete,
    ).toBe(false);
  });
  it("resolves a real legacy replacement without refreshing its observation time", () => {
    insertLegacyReplacement();
    const result = legacyEvidence();
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("Legacy fixture unexpectedly unavailable");
    expect(result.readings).toHaveLength(2);
    expect(result.suppressedReplacementIds).toEqual([NEXT]);
    const temperature = result.readings.find((row) => row.id === TEMP);
    expect(temperature?.value).toBe(24);
    expect(temperature?.source).toBe("manual");
    expect(new Date(temperature!.captured_at!).getTime()).toBe(new Date(observedAt).getTime());
    expect(sql(role(`SELECT value FROM public.sensor_readings WHERE id = '${TEMP}';`))).toBe("25");
  });
  it("corrects a validated legacy value again using its original observation identity", () => {
    insertLegacyReplacement();
    const op = operation();
    op.originals.find((row: { readingId: string }) => row.readingId === TEMP).value = 24;
    const change = op.changes.find(
      (row: { originalReadingId: string }) => row.originalReadingId === TEMP,
    );
    change.expectedValue = 24;
    change.value = 23;
    save(op);
    expect(
      sql(role(`SELECT value FROM public.sensor_readings_effective WHERE id = '${TEMP}';`)),
    ).toBe("23");
    expect(
      sql(role(`SELECT count(*) FROM public.sensor_readings_effective WHERE id = '${NEXT}';`)),
    ).toBe("0");
    expect(
      sql(
        role(
          `SELECT count(*) FROM public.sensor_readings_effective WHERE captured_at > now() - interval '24 hours';`,
        ),
      ),
    ).toBe("0");
  });
  it("does not silently override a later legacy edit with an older new-operation value", () => {
    save(operation());
    insertLegacyReplacement();
    const row = JSON.parse(
      sql(role(`SELECT to_jsonb(r) FROM public.sensor_readings_effective r WHERE id = '${TEMP}';`)),
    );
    expect(row.correction_valid).toBe(false);
    expect(row.value).toBeNull();
    expect(() => requireEffectiveSensorReadings([row])).toThrow(/unavailable/i);
    const op = operation();
    op.operationId = NEXT;
    op.originals.find((entry: { readingId: string }) => entry.readingId === RH).value = 60;
    const humidity = op.changes.find(
      (entry: { originalReadingId: string }) => entry.originalReadingId === RH,
    );
    humidity.expectedValue = 60;
    humidity.value = 61;
    denied(op, /correction_original_unavailable/);
  });
  it("marks wrong-metric legacy evidence unavailable in the effective view", () => {
    insertLegacyLink(RH);
    const rows = JSON.parse(
      sql(role("SELECT jsonb_agg(to_jsonb(r)) FROM public.sensor_readings_effective r;")),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row: { correction_valid: boolean; value: number | null }) =>
          row.correction_valid === false && row.value === null,
      ),
    ).toBe(true);
  });
  it("does not expose a usable recent value when a legacy root is hidden", () => {
    insertLegacyReplacement();
    sql(
      `UPDATE public.sensor_readings SET captured_at = now() - interval '100 days', ts = now() - interval '100 days' WHERE id = '${TEMP}';`,
    );
    const row = JSON.parse(
      sql(role(`SELECT to_jsonb(r) FROM public.sensor_readings_effective r WHERE id = '${NEXT}';`)),
    );
    expect(row.correction_valid).toBe(false);
    expect(row.value).toBeNull();
  });
  it("rejects a wrong-metric link that the unchanged legacy INSERT policy permits", () => {
    insertLegacyLink(RH);
    expect(sql(role("SELECT count(*) FROM public.manual_sensor_snapshot_edits;"))).toBe("1");
    expect(legacyEvidence()).toEqual({ status: "unavailable" });
  });
  it("does not promote a recent replacement when history RLS hides its original", () => {
    insertLegacyReplacement();
    sql(
      `UPDATE public.sensor_readings SET captured_at = now() - interval '100 days', ts = now() - interval '100 days' WHERE id = '${TEMP}';`,
    );
    expect(sql(role(`SELECT count(*) FROM public.sensor_readings WHERE id = '${TEMP}';`))).toBe(
      "0",
    );
    expect(legacyEvidence()).toEqual({ status: "unavailable" });
  });
  it("restores journaled intent after a committed response is lost and confirms one database correction", async () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    };
    const sent: string[] = [];
    const client: ManualCorrectionRpcClient = {
      rpc: async (name, { p_request }) => {
        expect(name).toBe("save_manual_sensor_correction");
        expect(createManualCorrectionJournal(() => storage).read(OWNER)).toEqual({
          status: "pending",
          operation: p_request,
        });
        sent.push(JSON.stringify(p_request));
        const data = save(p_request);
        if (sent.length === 1) throw new Error("Simulated response lost after local commit");
        expect(data.reused).toBe(true);
        return { data, error: null };
      },
    };
    const op = operation();
    expect(
      await submitPendingManualCorrection(
        OWNER,
        op,
        client,
        createManualCorrectionJournal(() => storage),
      ),
    ).toEqual({ status: "unconfirmed", operation: op });
    expect(count()).toBe(1);
    const restored = createManualCorrectionJournal(() => storage);
    const different = operation();
    different.changes[0].value = 61;
    expect(await submitPendingManualCorrection(OWNER, different, client, restored)).toEqual({
      status: "pending",
      operation: op,
    });
    expect(sent).toHaveLength(1);
    const pending = restored.read(OWNER);
    if (pending.status !== "pending") throw new Error("Pending correction missing");
    expect(await submitPendingManualCorrection(OWNER, pending.operation, client, restored)).toEqual(
      { status: "confirmed", cleanup: "complete" },
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
    expect(count()).toBe(1);
    expect(restored.read(OWNER)).toEqual({ status: "empty" });
    expect(Number(sql("SELECT count(*) FROM public.sensor_readings;"))).toBe(2);
    expect(
      sql(
        role(
          "SELECT bool_and(captured_at = " +
            literal(observedAt) +
            "::timestamptz AND source = 'manual') FROM public.sensor_readings_effective;",
        ),
      ),
    ).toBe("t");
    expect(
      sql(
        role(
          "SELECT count(*) FROM public.sensor_readings_effective WHERE captured_at > now() - interval '24 hours';",
        ),
      ),
    ).toBe("0");
  });
  it("reports a committed correction with cleanup pending when storage removal fails", async () => {
    const stored = new Map<string, string>();
    const journal = createManualCorrectionJournal(() => ({
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
      removeItem: () => {
        throw new Error("Simulated storage failure");
      },
    }));
    const client: ManualCorrectionRpcClient = {
      rpc: async (_name, { p_request }) => ({ data: save(p_request), error: null }),
    };
    expect(await submitPendingManualCorrection(OWNER, operation(), client, journal)).toEqual({
      status: "confirmed",
      cleanup: "pending",
    });
    expect(count()).toBe(1);
    expect(journal.read(OWNER)).toEqual({ status: "pending", operation: operation() });
    expect(Number(sql("SELECT count(*) FROM public.sensor_readings;"))).toBe(2);
  });
  it("corrects both values without rewriting or multiplying original observations", () => {
    const receipt = save(operation());
    expect(receipt.reused).toBe(false);
    expect(receipt.observedAt).toBe(observedAt);
    expect(receipt.changes).toHaveLength(2);
    expect(receipt.request).toEqual(operation());
    expect(confirmManualCorrectionReceipt(receipt, operation())).toBe(true);
    expect(
      sql("SELECT string_agg(value::text, ',' ORDER BY metric) FROM public.sensor_readings;"),
    ).toBe("55,25");
    expect(
      sql(
        role(
          "SELECT string_agg(value::text, ',' ORDER BY metric) FROM public.sensor_readings_effective;",
        ),
      ),
    ).toBe("60,24");
    expect(count()).toBe(1);
  });
  it("reconciles a committed operation whose response was lost", () => {
    const op = operation(),
      first = save(op),
      retry = save(op);
    expect(retry).toEqual({ ...first, reused: true });
    expect(confirmManualCorrectionReceipt(retry, op)).toBe(true);
    expect(count()).toBe(1);
    expect(Number(sql("SELECT count(*) FROM public.sensor_readings;"))).toBe(2);
  });
  it("rejects reuse of an operation identity with a different payload", () => {
    const op = operation();
    save(op);
    op.changes[0].value = 61;
    const r = rawSql(role(saveSql(op)));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/operation_payload_mismatch/);
    expect(count()).toBe(1);
  });
  it("adds an explicitly entered missing metric once at the original observation time", () => {
    const op = operation();
    op.changes.push({
      metric: "soil_moisture_pct",
      originalReadingId: null,
      expectedValue: null,
      value: 35,
    });
    const first = save(op);
    expect(save(op)).toEqual({ ...first, reused: true });
    expect(confirmManualCorrectionReceipt(first, op)).toBe(true);
    expect(Number(sql("SELECT count(*) FROM public.sensor_readings;"))).toBe(3);
    expect(
      sql(
        "SELECT captured_at = " +
          literal(observedAt) +
          "::timestamptz FROM public.sensor_readings WHERE metric='soil_moisture_pct';",
      ),
    ).toBe("t");
  });
  it("rolls back an inserted additional metric when a later field fails", () => {
    const op = operation();
    op.changes = [
      { metric: "soil_moisture_pct", originalReadingId: null, expectedValue: null, value: 35 },
      { ...op.changes[0], value: 200 },
    ];
    denied(op, /invalid_correction_value/);
  });
  it("rejects a foreign owner without touching readings", () =>
    denied(operation(), /correction_.*unavailable/, OTHER));
  it("rejects a fabricated original observation time", () => {
    const op = operation();
    op.observedAt = new Date().toISOString();
    denied(op, /correction_original_unavailable/);
  });
  it("rejects changed expected original values", () => {
    const op = operation();
    op.originals[0].value = 54;
    denied(op, /correction_original_conflict/);
  });
  it.each(["original", "expected", "addition"] as const)(
    "returns a non-retryable conflict code for a deterministic %s mismatch",
    (kind) => {
      const op = operation();
      if (kind === "original") op.originals[0].value = 54;
      if (kind === "expected") op.changes[0].expectedValue = 54;
      if (kind === "addition") {
        op.changes[0].originalReadingId = null;
        op.changes[0].expectedValue = null;
      }
      const response = rawSql(role(saveSql(op)));
      expect(response.status).not.toBe(0);
      expect(response.stderr).toMatch(/PT409:.*correction_original_conflict/);
      expect(response.stderr).not.toContain("40001");
      expect(count()).toBe(0);
      expect(
        sql("SELECT string_agg(value::text, ',' ORDER BY metric) FROM public.sensor_readings;"),
      ).toBe("55,25");
    },
  );
  it("does not relabel a live row as manual", () => {
    sql("UPDATE public.sensor_readings SET source='live' WHERE id=" + literal(TEMP));
    denied(operation(), /correction_original_unavailable/);
  });
  it("preserves the original 90-day history restriction", () => {
    observedAt = sql(
      "SELECT to_char(now() - interval '100 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
    );
    sql(
      "UPDATE public.sensor_readings SET captured_at=" +
        literal(observedAt) +
        ", ts=" +
        literal(observedAt),
    );
    denied(operation(), /correction_original_unavailable/);
  });
  it("retains canonical paid historical access", () => {
    observedAt = sql(
      "SELECT to_char(now() - interval '100 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
    );
    sql(
      "UPDATE public.sensor_readings SET captured_at=" +
        literal(observedAt) +
        ", ts=" +
        literal(observedAt),
    );
    sql(
      "INSERT INTO public.subscriptions VALUES (" +
        literal(OWNER) +
        ", 'live', 'pro_annual', now()+interval '1 year', 'active', 'sub_fixture');",
    );
    expect(save(operation()).changes).toHaveLength(2);
  });
  it("does not grant anonymous execution", () => {
    const r = rawSql("SET ROLE anon; " + saveSql(operation()));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/42501/);
  });
  it("prevents direct client INSERT from forging a committed receipt", () => {
    const op = operation();
    sql(
      role(
        "INSERT INTO public.manual_sensor_correction_operations (request,resolved_changes,user_id) VALUES (" +
          literal(JSON.stringify(op)) +
          "::jsonb, '[{\"value\":9999}]', " +
          literal(OTHER) +
          ");",
      ),
    );
    expect(count()).toBe(1);
    const retry = save(op);
    expect(retry.reused).toBe(true);
    expect(retry.changes.map((c: { value: number }) => c.value)).toEqual([60, 24]);
    expect(sql("SELECT user_id FROM public.manual_sensor_correction_operations;")).toBe(OWNER);
  });
  it("blocks client ledger UPDATE and DELETE", () => {
    save(operation());
    for (const verb of [
      "UPDATE public.manual_sensor_correction_operations SET request='{}'",
      "DELETE FROM public.manual_sensor_correction_operations",
    ]) {
      const r = rawSql(role(verb));
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/42501/);
    }
    expect(count()).toBe(1);
  });
  it("does not expose another owner's corrected values or ledger", () => {
    save(operation());
    expect(sql(role("SELECT count(*) FROM public.sensor_readings_effective;", OTHER))).toBe("0");
    expect(
      sql(role("SELECT count(*) FROM public.manual_sensor_correction_operations;", OTHER)),
    ).toBe("0");
  });
  it("orders successive corrections while preserving every original value", () => {
    const first = save(operation());
    const next = operation();
    next.operationId = NEXT;
    next.originals[0].value = 60;
    next.originals[1].value = 24;
    next.changes[0].expectedValue = 60;
    next.changes[0].value = 61;
    next.changes[1].expectedValue = 24;
    next.changes[1].value = 23;
    const second = save(next);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(count()).toBe(2);
    expect(
      sql(
        role(
          "SELECT string_agg(value::text, ',' ORDER BY metric) FROM public.sensor_readings_effective;",
        ),
      ),
    ).toBe("61,23");
    expect(
      sql("SELECT string_agg(value::text, ',' ORDER BY metric) FROM public.sensor_readings; "),
    ).toBe("55,25");
  });
  it("does not allow a sandbox subscription to bypass the history limit", () => {
    observedAt = sql(
      "SELECT to_char(now() - interval '100 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
    );
    sql(
      "UPDATE public.sensor_readings SET captured_at=" +
        literal(observedAt) +
        ", ts=" +
        literal(observedAt),
    );
    sql(
      "INSERT INTO public.subscriptions VALUES (" +
        literal(OWNER) +
        ", 'sandbox', 'pro_annual', now()+interval '1 year', 'active', 'sub_fixture');",
    );
    denied(operation(), /correction_original_unavailable/);
  });
  it("hides historical correction receipts when paid history access ends", () => {
    observedAt = sql(
      "SELECT to_char(now() - interval '100 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
    );
    sql(
      "UPDATE public.sensor_readings SET captured_at=" +
        literal(observedAt) +
        ", ts=" +
        literal(observedAt),
    );
    sql(
      "INSERT INTO public.subscriptions VALUES (" +
        literal(OWNER) +
        ", 'live', 'pro_annual', now()+interval '1 year', 'active', 'sub_fixture');",
    );
    save(operation());
    sql("DELETE FROM public.subscriptions;");
    expect(sql(role("SELECT count(*) FROM public.manual_sensor_correction_operations;"))).toBe("0");
    expect(sql(role("SELECT count(*) FROM public.sensor_readings_effective;"))).toBe("0");
  });
  it("rejects snapshot isolation that could retain pre-lock stale reads", () => {
    const result = rawSql(
      role("BEGIN ISOLATION LEVEL REPEATABLE READ; " + saveSql(operation()) + " COMMIT;"),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/correction_requires_read_committed/);
    expect(count()).toBe(0);
  });
  it("serializes concurrent corrections and rejects the stale second intent", async () => {
    const first = operation(),
      second = operation();
    second.operationId = NEXT;
    let signal!: () => void;
    const locked = new Promise<void>((done) => {
      signal = done;
    });
    const child = spawn(tool("psql"), args(), {
      env: childEnv,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.stdout.on("data", (d) => {
      if (String(d).includes("CORRECTION_HELD")) signal();
    });
    const complete = new Promise<number | null>((done, fail) => {
      child.once("error", fail);
      child.once("close", done);
    });
    child.stdin.end(
      role("BEGIN; " + saveSql(first) + " SELECT 'CORRECTION_HELD'; SELECT pg_sleep(0.5); COMMIT;"),
    );
    await Promise.race([
      locked,
      complete.then(() => {
        throw new Error(stderr || "Writer ended before lock signal");
      }),
    ]);
    const loser = rawSql(role(saveSql(second)));
    expect(await complete).toBe(0);
    expect(loser.status).not.toBe(0);
    expect(loser.stderr).toMatch(/correction_original_conflict/);
    expect(count()).toBe(1);
  }, 20_000);
});
