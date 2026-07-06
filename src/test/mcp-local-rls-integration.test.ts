/**
 * Local-only integration test: MCP read-only tools enforce Supabase RLS
 * through the signed-in grower's OAuth/session token.
 *
 * SAFETY:
 * - Skips cleanly when the local Supabase + service-role seeding harness
 *   is not configured. Never touches hosted Supabase, never requires
 *   secrets in CI.
 * - Seeds two isolated users via a LOCAL service-role key (seeding only).
 *   Tool execution itself routes exclusively through per-user anon
 *   sessions (`supabaseForUser(ctx)`), never service_role.
 * - Cleans up seeded rows / users on completion.
 * - On failure, writes SANITIZED debug artifacts (harness log + response
 *   snapshots) under `artifacts/mcp-local-rls/`; CI uploads them only
 *   when the job fails. Sanitization redacts JWTs, bearer tokens,
 *   service_role material, refresh/bridge/access tokens, client secrets,
 *   raw headers, raw_payload, and live env values.
 *
 * COVERAGE:
 * - Explicit regression cases for `limit` and `includeArchived`.
 * - Manifest-driven generated cases: pagination/filter params are derived
 *   from `.lovable/mcp/manifest.json` at collection time, so new advertised
 *   params automatically gain cross-user isolation coverage — and params
 *   are never invented. Tools advertising no pagination/filter params are
 *   recorded as N/A (see manifest contract tests below).
 *
 * Enable locally by exporting all of:
 *   LOCAL_SUPABASE_URL           (e.g. http://127.0.0.1:54321)
 *   LOCAL_SUPABASE_ANON_KEY
 *   LOCAL_SUPABASE_SERVICE_ROLE_KEY   (LOCAL ONLY — never a hosted key)
 *   MCP_LOCAL_RLS_HARNESS=1
 *
 * Convenience: `bun run test:mcp:rls:local` (env vars still required).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

import listGrowsTool from "@/lib/mcp/tools/list-grows";
import listDiaryTool from "@/lib/mcp/tools/list-recent-diary-entries";
import getSnapshotTool from "@/lib/mcp/tools/get-latest-sensor-snapshot";
import manifest from "../../.lovable/mcp/manifest.json";
import {
  HarnessLog,
  derivePaginationFilterParams,
  generateRlsCasesFromManifest,
  hasPaginationOrFilterAxes,
} from "./helpers/mcpRlsHarnessOps";

const HARNESS_ENABLED =
  process.env.MCP_LOCAL_RLS_HARNESS === "1" &&
  !!process.env.LOCAL_SUPABASE_URL &&
  !!process.env.LOCAL_SUPABASE_ANON_KEY &&
  !!process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const describeIfHarness = HARNESS_ENABLED ? describe : describe.skip;

if (!HARNESS_ENABLED) {
  describe.skip("MCP local RLS integration", () => {
    it("Skipped: local Supabase MCP RLS harness is not configured.", () => {
      /* intentionally empty */
    });
  });
}

// ---------- Manifest-driven contract assertions (always run) ----------

function toolByName(name: string) {
  return manifest.mcp.tools.find((t) => t.name === name);
}

describe("MCP manifest tool contract (parameter allow-list)", () => {
  it("list_grows advertises exactly includeArchived + limit as optional", () => {
    const t = toolByName("list_grows");
    expect(t).toBeTruthy();
    const props = t!.inputSchema.properties ?? {};
    expect(Object.keys(props).sort()).toEqual(["includeArchived", "limit"].sort());
    expect(t!.inputSchema.required ?? []).toEqual([]);
  });

  it("list_recent_diary_entries advertises growId (required) + limit only", () => {
    const t = toolByName("list_recent_diary_entries");
    expect(t).toBeTruthy();
    const props = t!.inputSchema.properties ?? {};
    expect(Object.keys(props).sort()).toEqual(["growId", "limit"].sort());
    expect(t!.inputSchema.required ?? []).toEqual(["growId"]);
  });

  it("get_latest_sensor_snapshot advertises exactly tentId (required); no limit/pagination", () => {
    const t = toolByName("get_latest_sensor_snapshot");
    expect(t).toBeTruthy();
    const props = t!.inputSchema.properties ?? {};
    expect(Object.keys(props)).toEqual(["tentId"]);
    expect(t!.inputSchema.required ?? []).toEqual(["tentId"]);
    // Snapshot tool intentionally exposes no pagination/limit/filter params —
    // manifest-driven pagination/filter coverage is therefore N/A for it.
    expect(hasPaginationOrFilterAxes(t!)).toBe(false);
  });

  it("manifest-driven case generation covers every tool without inventing params", () => {
    for (const t of manifest.mcp.tools) {
      const advertised = new Set(Object.keys(t.inputSchema.properties ?? {}));
      for (const c of generateRlsCasesFromManifest(t)) {
        for (const argName of Object.keys(c.args)) {
          expect(advertised.has(argName), `${t.name} generated unadvertised arg ${argName}`).toBe(
            true,
          );
        }
        for (const scopeName of c.scopeParams) {
          expect(
            advertised.has(scopeName),
            `${t.name} generated unadvertised scope param ${scopeName}`,
          ).toBe(true);
        }
      }
    }
  });
});

// ---------- Shared harness types + helpers ----------

type SeededGrow = { id: string; name: string; archived: boolean };
type SeededDiary = { id: string; note: string; growId: string };

type SeededUser = {
  id: string;
  email: string;
  /** Unique marker embedded in every seeded name/note for leak detection. */
  marker: string;
  accessToken: string;
  tentId: string;
  emptyTentId: string;
  readingIds: string[];
  grows: SeededGrow[]; // includes both active + archived
  activeGrows: SeededGrow[];
  archivedGrow: SeededGrow;
  primaryGrow: SeededGrow; // convenience: activeGrows[0]
  diaries: SeededDiary[]; // multiple diary entries, all on primaryGrow
};

function makeCtx(token: string | null): ToolContext {
  return {
    isAuthenticated: () => token !== null,
    getToken: () => token ?? "",
    getUserId: () => "",
    getUserEmail: () => "",
    getClientId: () => "",
    getClaims: () => ({}),
  } as unknown as ToolContext;
}

const FORBIDDEN_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "service_role", re: /service_role/i },
  { label: "JWT", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { label: "bearer token", re: /bearer\s+[A-Za-z0-9._-]{20,}/i },
  { label: "refresh_token", re: /refresh_token/i },
  { label: "bridge_token", re: /bridge[_-]?token/i },
  { label: "oauth client secret", re: /client[_-]?secret/i },
  { label: "raw_payload", re: /raw_payload/i },
];

function assertNoSecretLeakage(payload: unknown) {
  const serialized = JSON.stringify(payload ?? {});
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    expect(serialized, `MCP response leaked ${label}`).not.toMatch(re);
  }
}

/** Real vocabularies from the live schema (long-format sensor_readings). */
const ALLOWED_SENSOR_SOURCES = new Set(["manual", "pi_bridge", "sim"]);
const ALLOWED_SENSOR_QUALITIES = new Set(["ok", "degraded", "stale", "invalid"]);

function isIsoTimestamp(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

function assertMcpEnvelope(res: unknown) {
  expect(res, "MCP tool must return an envelope object").toBeTruthy();
  const r = res as Record<string, unknown>;
  expect(Array.isArray(r.content), "envelope.content must be an array").toBe(true);
  for (const block of r.content as Array<Record<string, unknown>>) {
    expect(typeof block.type).toBe("string");
    if (block.type === "text") expect(typeof block.text).toBe("string");
  }
}

/** No other-user marker (grow name / diary note / tent name) may appear. */
function assertNoForeignMarker(res: unknown, other: SeededUser) {
  const serialized = JSON.stringify(res ?? {});
  expect(serialized, `response leaked marker of other user ${other.marker}`).not.toContain(
    other.marker,
  );
}

describeIfHarness("MCP local RLS integration", () => {
  const url = process.env.LOCAL_SUPABASE_URL!;
  const anon = process.env.LOCAL_SUPABASE_ANON_KEY!;
  const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY!;

  const priorEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };

  const harnessLog = new HarnessLog();
  const lastResponses: Record<string, unknown> = {};

  let admin: SupabaseClient;
  let userA: SeededUser;
  let userB: SeededUser;

  const toolHandlers: Record<
    string,
    (args: never, ctx: ToolContext) => Promise<Record<string, unknown>>
  > = {
    list_grows: async (args, ctx) =>
      (await listGrowsTool.handler(args, ctx)) as unknown as Record<string, unknown>,
    list_recent_diary_entries: async (args, ctx) =>
      (await listDiaryTool.handler(args, ctx)) as unknown as Record<string, unknown>,
    get_latest_sensor_snapshot: async (args, ctx) =>
      (await getSnapshotTool.handler(args, ctx)) as unknown as Record<string, unknown>,
  };

  async function callTool(
    toolName: string,
    caller: SeededUser | null,
    args: Record<string, unknown>,
    caseLabel: string,
  ) {
    const handler = toolHandlers[toolName];
    expect(handler, `no local handler for manifest tool ${toolName}`).toBeTruthy();
    const res = await handler(args as never, makeCtx(caller ? caller.accessToken : null));
    const structured = (res as Record<string, unknown>).structuredContent as
      | Record<string, unknown>
      | undefined;
    const rows = structured
      ? ((structured.grows ?? structured.entries ?? null) as unknown[] | null)
      : null;
    harnessLog.record({
      tool: toolName,
      caseLabel,
      caller: caller ? caller.marker : "(unauthenticated)",
      args,
      isError: !!(res as Record<string, unknown>).isError,
      rowCount: Array.isArray(rows) ? rows.length : null,
    });
    lastResponses[`${toolName} ${caseLabel} as ${caller ? caller.marker : "anon"}`] = res;
    return res as Record<string, unknown>;
  }

  async function seedUser(label: string): Promise<SeededUser> {
    const marker = `mcpr-${label}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const email = `mcp-rls-${marker}@local.test`;
    const password = `Test-${Math.random().toString(36).slice(2, 12)}-Aa1!`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`seedUser(${label}) createUser failed: ${createErr?.message}`);
    }
    const userId = created.user.id;

    // Seed multiple active grows + one archived grow.
    const activeSpecs = [
      { name: `Grow-${marker}-active-1`, is_archived: false },
      { name: `Grow-${marker}-active-2`, is_archived: false },
      { name: `Grow-${marker}-active-3`, is_archived: false },
    ];
    const archivedSpec = { name: `Grow-${marker}-archived`, is_archived: true };
    const growRows = [...activeSpecs, archivedSpec].map((g) => ({
      user_id: userId,
      stage: "veg",
      grow_type: "indoor",
      ...g,
    }));
    const { data: growsData, error: growsErr } = await admin
      .from("grows")
      .insert(growRows)
      .select("id,name,is_archived");
    if (growsErr || !growsData) throw new Error(`seed grows: ${growsErr?.message}`);

    const grows: SeededGrow[] = growsData.map((g) => ({
      id: g.id as string,
      name: g.name as string,
      archived: !!g.is_archived,
    }));
    const activeGrows = grows.filter((g) => !g.archived);
    const archivedGrow = grows.find((g) => g.archived)!;
    const primaryGrow = activeGrows[0];

    const { data: tents, error: tentErr } = await admin
      .from("tents")
      .insert([
        { user_id: userId, name: `Tent-${marker}` },
        { user_id: userId, name: `Tent-${marker}-empty` },
      ])
      .select("id,name");
    if (tentErr || !tents || tents.length !== 2) throw new Error(`seed tents: ${tentErr?.message}`);
    const tentId = tents.find((t) => !String(t.name).endsWith("-empty"))!.id as string;
    const emptyTentId = tents.find((t) => String(t.name).endsWith("-empty"))!.id as string;

    // Seed several diary entries against the primary grow, spaced in time.
    // Live schema: no event_type column; entry_at drives tool ordering.
    const now = Date.now();
    const diaryRows = [0, 1, 2, 3].map((i) => ({
      user_id: userId,
      grow_id: primaryGrow.id,
      note: `note-${marker}-${i}`,
      entry_at: new Date(now - i * 60_000).toISOString(),
    }));
    const { data: diaryData, error: diaryErr } = await admin
      .from("diary_entries")
      .insert(diaryRows)
      .select("id,note,grow_id");
    if (diaryErr || !diaryData) throw new Error(`seed diary: ${diaryErr?.message}`);
    const diaries: SeededDiary[] = diaryData.map((d) => ({
      id: d.id as string,
      note: d.note as string,
      growId: d.grow_id as string,
    }));

    // Live schema: sensor_readings is long-format (one row per metric).
    const { data: readings, error: readingsErr } = await admin
      .from("sensor_readings")
      .insert([
        {
          user_id: userId,
          tent_id: tentId,
          metric: "temperature_c",
          value: 24,
          source: "manual",
          ts: new Date(now - 30_000).toISOString(),
        },
        {
          user_id: userId,
          tent_id: tentId,
          metric: "humidity_pct",
          value: 55,
          source: "manual",
          ts: new Date(now - 15_000).toISOString(),
        },
      ])
      .select("id");
    if (readingsErr || !readings) throw new Error(`seed readings: ${readingsErr?.message}`);

    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !session.session) {
      throw new Error(`seedUser(${label}) signIn failed: ${signInErr?.message}`);
    }

    return {
      id: userId,
      email,
      marker,
      accessToken: session.session.access_token,
      tentId,
      emptyTentId,
      readingIds: readings.map((r) => r.id as string),
      grows,
      activeGrows,
      archivedGrow,
      primaryGrow,
      diaries,
    };
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_PUBLISHABLE_KEY = anon;
    process.env.SUPABASE_ANON_KEY = anon;

    admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    [userA, userB] = await Promise.all([seedUser("a"), seedUser("b")]);
  }, 60_000);

  afterEach((ctx) => {
    // Best-effort failure tracking for the artifact log; API differences
    // across vitest versions must never break the suite itself.
    try {
      const task = (ctx as unknown as { task?: { name?: string; result?: { state?: string } } })
        .task;
      if (task?.result?.state === "fail") harnessLog.recordFailedTest(task.name ?? "(unknown)");
    } catch {
      /* ignore */
    }
  });

  afterAll(async () => {
    // Sanitized debug artifacts. CI uploads these only when the job fails.
    try {
      harnessLog.flush(lastResponses);
    } catch {
      /* artifact plumbing must never mask the real result */
    }
    for (const u of [userA, userB].filter(Boolean)) {
      try {
        await admin.from("sensor_readings").delete().eq("user_id", u.id);
        await admin.from("diary_entries").delete().eq("user_id", u.id);
        await admin.from("tents").delete().eq("user_id", u.id);
        await admin.from("grows").delete().eq("user_id", u.id);
        await admin.auth.admin.deleteUser(u.id);
      } catch {
        /* ignore cleanup errors on ephemeral local DBs */
      }
    }
    process.env.SUPABASE_URL = priorEnv.SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = priorEnv.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_ANON_KEY = priorEnv.SUPABASE_ANON_KEY;
  }, 30_000);

  // ---------- list_grows (explicit regression cases) ----------

  describe("list_grows", () => {
    async function callAs(user: SeededUser, args: Record<string, unknown>) {
      const res = await callTool("list_grows", user, args, "explicit");
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      return res;
    }

    it("User A sees only own grows (default args)", async () => {
      const res = await callAs(userA, { includeArchived: false, limit: 25 });
      const rows = ((res.structuredContent as any)?.grows ?? []) as any[];
      expect(Array.isArray(rows)).toBe(true);
      const ids = rows.map((g) => g.id);
      for (const g of userA.activeGrows) expect(ids).toContain(g.id);
      for (const g of userB.grows) expect(ids).not.toContain(g.id);
      assertNoForeignMarker(res, userB);
      // Shape assertions on the first row
      const first = rows[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.name).toBe("string");
      expect(typeof first.is_archived).toBe("boolean");
      expect(isIsoTimestamp(first.created_at)).toBe(true);
      expect(isIsoTimestamp(first.updated_at)).toBe(true);
    });

    it("User B sees only own grows", async () => {
      const res = await callAs(userB, { includeArchived: false, limit: 25 });
      const ids = ((res.structuredContent as any)?.grows ?? []).map((g: any) => g.id);
      for (const g of userB.activeGrows) expect(ids).toContain(g.id);
      for (const g of userA.grows) expect(ids).not.toContain(g.id);
    });

    it("limit=1 for User A returns exactly one row, still owned by A only", async () => {
      const res = await callAs(userA, { includeArchived: false, limit: 1 });
      const rows = ((res.structuredContent as any)?.grows ?? []) as any[];
      expect(rows.length).toBe(1);
      const userAIds = new Set(userA.grows.map((g) => g.id));
      const userBIds = new Set(userB.grows.map((g) => g.id));
      expect(userAIds.has(rows[0].id)).toBe(true);
      expect(userBIds.has(rows[0].id)).toBe(false);
    });

    it("limit=1 for User B returns exactly one row, still owned by B only", async () => {
      const res = await callAs(userB, { includeArchived: false, limit: 1 });
      const rows = ((res.structuredContent as any)?.grows ?? []) as any[];
      expect(rows.length).toBe(1);
      const userAIds = new Set(userA.grows.map((g) => g.id));
      const userBIds = new Set(userB.grows.map((g) => g.id));
      expect(userBIds.has(rows[0].id)).toBe(true);
      expect(userAIds.has(rows[0].id)).toBe(false);
    });

    it("includeArchived:false hides own archived grow AND all other-user grows", async () => {
      const res = await callAs(userA, { includeArchived: false, limit: 100 });
      const ids = ((res.structuredContent as any)?.grows ?? []).map((g: any) => g.id);
      expect(ids).not.toContain(userA.archivedGrow.id);
      for (const g of userB.grows) expect(ids).not.toContain(g.id);
    });

    it("includeArchived:true may include own archived, but never other-user archived", async () => {
      const res = await callAs(userA, { includeArchived: true, limit: 100 });
      const ids = ((res.structuredContent as any)?.grows ?? []).map((g: any) => g.id);
      expect(ids).toContain(userA.archivedGrow.id);
      expect(ids).not.toContain(userB.archivedGrow.id);
      for (const g of userB.grows) expect(ids).not.toContain(g.id);
    });

    it("includeArchived:true for User B never leaks User A archived grow", async () => {
      const res = await callAs(userB, { includeArchived: true, limit: 100 });
      const ids = ((res.structuredContent as any)?.grows ?? []).map((g: any) => g.id);
      expect(ids).toContain(userB.archivedGrow.id);
      expect(ids).not.toContain(userA.archivedGrow.id);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await callTool(
        "list_grows",
        null,
        { includeArchived: false, limit: 25 },
        "explicit unauthenticated",
      );
      expect(res.isError).toBe(true);
    });
  });

  // ---------- list_recent_diary_entries (explicit regression cases) ----------

  describe("list_recent_diary_entries", () => {
    async function callAs(user: SeededUser, args: Record<string, unknown>) {
      const res = await callTool("list_recent_diary_entries", user, args, "explicit");
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      return res;
    }

    it("User A cannot read User B's diary via B's growId (ownership-gated error, no leak)", async () => {
      const res = await callAs(userA, { growId: userB.primaryGrow.id, limit: 10 });
      // The tool ownership-gates on grows (no operator policy there), so a
      // foreign growId surfaces as an error, never as another user's rows.
      expect(res.isError).toBe(true);
      assertNoForeignMarker(res, userB);
      const rows = ((res.structuredContent as any)?.entries ?? []) as any[];
      const bIds = new Set(userB.diaries.map((d) => d.id));
      for (const r of rows) expect(bIds.has(r.id)).toBe(false);
    });

    it("User A sees own diary entries with correct shape", async () => {
      const res = await callAs(userA, { growId: userA.primaryGrow.id, limit: 10 });
      const rows = ((res.structuredContent as any)?.entries ?? []) as any[];
      const ids = rows.map((r) => r.id);
      for (const d of userA.diaries) expect(ids).toContain(d.id);
      for (const d of userB.diaries) expect(ids).not.toContain(d.id);
      assertNoForeignMarker(res, userB);
      const first = rows[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.grow_id).toBe("string");
      expect(first.grow_id).toBe(userA.primaryGrow.id);
      expect(first.note === null || typeof first.note === "string").toBe(true);
      expect(isIsoTimestamp(first.entry_at)).toBe(true);
      expect(isIsoTimestamp(first.created_at)).toBe(true);
    });

    it("limit=1 for User A returns exactly one entry owned by A", async () => {
      const res = await callAs(userA, { growId: userA.primaryGrow.id, limit: 1 });
      const rows = ((res.structuredContent as any)?.entries ?? []) as any[];
      expect(rows.length).toBe(1);
      const aIds = new Set(userA.diaries.map((d) => d.id));
      const bIds = new Set(userB.diaries.map((d) => d.id));
      expect(aIds.has(rows[0].id)).toBe(true);
      expect(bIds.has(rows[0].id)).toBe(false);
    });

    it("limit=1 for User B returns exactly one entry owned by B", async () => {
      const res = await callAs(userB, { growId: userB.primaryGrow.id, limit: 1 });
      const rows = ((res.structuredContent as any)?.entries ?? []) as any[];
      expect(rows.length).toBe(1);
      const aIds = new Set(userA.diaries.map((d) => d.id));
      const bIds = new Set(userB.diaries.map((d) => d.id));
      expect(bIds.has(rows[0].id)).toBe(true);
      expect(aIds.has(rows[0].id)).toBe(false);
    });

    it("limit=1 targeting another user's growId still never leaks their rows", async () => {
      const res = await callAs(userA, { growId: userB.primaryGrow.id, limit: 1 });
      expect(res.isError).toBe(true);
      assertNoForeignMarker(res, userB);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await callTool(
        "list_recent_diary_entries",
        null,
        { growId: userA.primaryGrow.id, limit: 10 },
        "explicit unauthenticated",
      );
      expect(res.isError).toBe(true);
    });
  });

  // ---------- get_latest_sensor_snapshot (explicit regression cases) ----------

  describe("get_latest_sensor_snapshot", () => {
    async function callAs(user: SeededUser | null, args: Record<string, unknown>) {
      const res = await callTool("get_latest_sensor_snapshot", user, args, "explicit");
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      return res;
    }

    it("User A cannot read User B's tent snapshot (ownership-gated error, no leak)", async () => {
      const res = await callAs(userA, { tentId: userB.tentId });
      // Tent ownership is verified first; a foreign tent id surfaces as an
      // error, never as another user's readings.
      expect(res.isError).toBe(true);
      assertNoForeignMarker(res, userB);
    });

    it("User A sees own latest reading per metric with real source/quality labels", async () => {
      const res = await callAs(userA, { tentId: userA.tentId });
      const snap = (res.structuredContent as any)?.snapshot;
      expect(snap).toBeTruthy();
      expect(snap.tentId).toBe(userA.tentId);
      const readings = snap.readings as Record<string, any>;
      expect(readings).toBeTruthy();
      const metrics = Object.keys(readings);
      expect(metrics).toContain("temperature_c");
      expect(metrics).toContain("humidity_pct");
      for (const [metric, row] of Object.entries(readings)) {
        expect(row.metric).toBe(metric);
        expect(row.tent_id).toBe(userA.tentId);
        expect(typeof row.value).toBe("number");
        expect(ALLOWED_SENSOR_SOURCES.has(row.source)).toBe(true);
        expect(ALLOWED_SENSOR_QUALITIES.has(row.quality)).toBe(true);
        expect(isIsoTimestamp(row.ts)).toBe(true);
        expect(userA.readingIds).toContain(row.id);
        // Contract: never exposes raw_payload.
        expect("raw_payload" in row).toBe(false);
      }
      assertNoForeignMarker(res, userB);
    });

    it("User B sees own readings only", async () => {
      const res = await callAs(userB, { tentId: userB.tentId });
      const readings = ((res.structuredContent as any)?.snapshot?.readings ?? {}) as Record<
        string,
        any
      >;
      for (const row of Object.values(readings)) {
        expect(userB.readingIds).toContain(row.id);
        expect(userA.readingIds).not.toContain(row.id);
      }
      assertNoForeignMarker(res, userA);
    });

    it("Own tent with no readings has structuredContent.snapshot === null", async () => {
      const res = await callAs(userA, { tentId: userA.emptyTentId });
      expect(res.isError).toBeFalsy();
      const snap = (res.structuredContent as any)?.snapshot;
      expect(snap).toBeNull();
    });

    it("Nonexistent tent id surfaces as ownership-gated error", async () => {
      const nonexistent = "00000000-0000-4000-8000-000000000001";
      const res = await callAs(userA, { tentId: nonexistent });
      expect(res.isError).toBe(true);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await callTool(
        "get_latest_sensor_snapshot",
        null,
        { tentId: userA.tentId },
        "explicit unauthenticated",
      );
      expect(res.isError).toBe(true);
    });
  });

  // ---------- Manifest-driven generated pagination/filter cases ----------

  describe("manifest-driven pagination/filter isolation cases", () => {
    /** Fill advertised uuid scope params with a user's own resource ids. */
    function fillScope(
      toolName: string,
      scopeParams: string[],
      owner: SeededUser,
    ): Record<string, unknown> {
      const args: Record<string, unknown> = {};
      for (const name of scopeParams) {
        if (name === "growId") args.growId = owner.primaryGrow.id;
        else if (name === "tentId") args.tentId = owner.tentId;
        else throw new Error(`no seeded fixture for advertised scope param ${name}`);
      }
      return args;
    }

    /** Per-tool extraction of returned row identities for scoping checks. */
    function extractRowIds(toolName: string, res: Record<string, unknown>): string[] {
      const structured = (res.structuredContent ?? {}) as Record<string, unknown>;
      if (toolName === "list_grows") {
        return ((structured.grows ?? []) as Array<{ id: string }>).map((r) => r.id);
      }
      if (toolName === "list_recent_diary_entries") {
        return ((structured.entries ?? []) as Array<{ id: string }>).map((r) => r.id);
      }
      if (toolName === "get_latest_sensor_snapshot") {
        const snapshot = structured.snapshot as {
          readings?: Record<string, { id: string }>;
        } | null;
        return Object.values(snapshot?.readings ?? {}).map((r) => r.id);
      }
      return [];
    }

    function ownedIds(toolName: string, user: SeededUser): Set<string> {
      if (toolName === "list_grows") return new Set(user.grows.map((g) => g.id));
      if (toolName === "list_recent_diary_entries") return new Set(user.diaries.map((d) => d.id));
      return new Set(user.readingIds);
    }

    for (const tool of manifest.mcp.tools) {
      const cases = generateRlsCasesFromManifest(tool);
      const axes = hasPaginationOrFilterAxes(tool);

      if (!axes) {
        it(`${tool.name}: advertises no pagination/filter params — generated coverage is N/A`, () => {
          const nonScope = derivePaginationFilterParams(tool).filter(
            (p) => p.kind !== "scope-filter",
          );
          expect(nonScope).toEqual([]);
          // Still exactly one baseline case (scope-only), never invented args.
          expect(cases.length).toBe(1);
          expect(Object.keys(cases[0].args)).toEqual([]);
        });
      }

      for (const c of cases) {
        it(`${tool.name} ${c.label}: rows stay caller-scoped for both users`, async () => {
          for (const [caller, other] of [
            [userA, userB],
            [userB, userA],
          ] as Array<[SeededUser, SeededUser]>) {
            const args = { ...c.args, ...fillScope(tool.name, c.scopeParams, caller) };
            const res = await callTool(tool.name, caller, args, c.label);
            assertMcpEnvelope(res);
            assertNoSecretLeakage(res);
            assertNoForeignMarker(res, other);
            const owned = ownedIds(tool.name, caller);
            const foreign = ownedIds(tool.name, other);
            for (const id of extractRowIds(tool.name, res)) {
              expect(owned.has(id), `${tool.name} returned non-owned row ${id}`).toBe(true);
              expect(foreign.has(id), `${tool.name} leaked foreign row ${id}`).toBe(false);
            }
            if (typeof (args as { limit?: number }).limit === "number") {
              const rowIds = extractRowIds(tool.name, res);
              expect(rowIds.length).toBeLessThanOrEqual((args as { limit: number }).limit);
            }
          }
        });

        if (c.scopeParams.length > 0) {
          it(`${tool.name} ${c.label}: foreign scope ids never leak the other user's rows`, async () => {
            // User A supplies User B's resource ids.
            const args = { ...c.args, ...fillScope(tool.name, c.scopeParams, userB) };
            const res = await callTool(tool.name, userA, args, `${c.label} (foreign scope)`);
            assertMcpEnvelope(res);
            assertNoSecretLeakage(res);
            assertNoForeignMarker(res, userB);
            const bIds = ownedIds(tool.name, userB);
            for (const id of extractRowIds(tool.name, res)) {
              expect(bIds.has(id), `${tool.name} leaked foreign row ${id}`).toBe(false);
            }
          });
        }

        it(`${tool.name} ${c.label}: unauthenticated caller stays blocked`, async () => {
          const args = { ...c.args, ...fillScope(tool.name, c.scopeParams, userA) };
          const res = await callTool(tool.name, null, args, `${c.label} (unauthenticated)`);
          expect(res.isError).toBe(true);
          assertNoForeignMarker(res, userA);
          assertNoForeignMarker(res, userB);
        });
      }
    }
  });
});
