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
 *
 * Enable locally by exporting all of:
 *   LOCAL_SUPABASE_URL           (e.g. http://127.0.0.1:54321)
 *   LOCAL_SUPABASE_ANON_KEY
 *   LOCAL_SUPABASE_SERVICE_ROLE_KEY   (LOCAL ONLY — never a hosted key)
 *   MCP_LOCAL_RLS_HARNESS=1
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

import listGrowsTool from "@/lib/mcp/tools/list-grows";
import listDiaryTool from "@/lib/mcp/tools/list-recent-diary-entries";
import getSnapshotTool from "@/lib/mcp/tools/get-latest-sensor-snapshot";
import manifest from "../../.lovable/mcp/manifest.json";

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
    // includeArchived / limit RLS coverage below is therefore N/A for it.
  });
});

// ---------- Shared harness types + helpers ----------

type SeededGrow = { id: string; name: string; archived: boolean };
type SeededDiary = { id: string; note: string; growId: string };

type SeededUser = {
  id: string;
  email: string;
  accessToken: string;
  tentId: string;
  snapshotId: string;
  grows: SeededGrow[];         // includes both active + archived
  activeGrows: SeededGrow[];
  archivedGrow: SeededGrow;
  primaryGrow: SeededGrow;     // convenience: activeGrows[0]
  diaries: SeededDiary[];      // multiple diary entries, all on primaryGrow
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

const ALLOWED_SENSOR_SOURCES = new Set([
  "live", "manual", "csv", "demo", "stale", "invalid",
]);

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

describeIfHarness("MCP local RLS integration", () => {
  const url = process.env.LOCAL_SUPABASE_URL!;
  const anon = process.env.LOCAL_SUPABASE_ANON_KEY!;
  const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY!;

  const priorEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };

  let admin: SupabaseClient;
  let userA: SeededUser;
  let userB: SeededUser;

  async function seedUser(label: string): Promise<SeededUser> {
    const email = `mcp-rls-${label}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@local.test`;
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
      { name: `Grow-${label}-active-1`, is_archived: false },
      { name: `Grow-${label}-active-2`, is_archived: false },
      { name: `Grow-${label}-active-3`, is_archived: false },
    ];
    const archivedSpec = { name: `Grow-${label}-archived`, is_archived: true };
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

    const { data: tent, error: tentErr } = await admin
      .from("tents")
      .insert({ user_id: userId, name: `Tent-${label}` })
      .select("id")
      .single();
    if (tentErr || !tent) throw new Error(`seed tent: ${tentErr?.message}`);

    // Seed several diary entries against the primary grow, spaced in time.
    const now = Date.now();
    const diaryRows = [0, 1, 2, 3].map((i) => ({
      user_id: userId,
      grow_id: primaryGrow.id,
      event_type: "note",
      note: `note-${label}-${i}`,
      created_at: new Date(now - i * 60_000).toISOString(),
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

    const { data: snap, error: snapErr } = await admin
      .from("sensor_readings")
      .insert({
        user_id: userId,
        tent_id: tent.id,
        source: "manual",
        captured_at: new Date().toISOString(),
        temperature_c: 24,
        humidity_pct: 55,
      })
      .select("id")
      .single();
    if (snapErr || !snap) throw new Error(`seed snapshot: ${snapErr?.message}`);

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
      accessToken: session.session.access_token,
      tentId: tent.id,
      snapshotId: snap.id,
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

  afterAll(async () => {
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

  // ---------- list_grows ----------

  describe("list_grows", () => {
    async function callAs(user: SeededUser, args: Record<string, unknown>) {
      const res = await listGrowsTool.handler(args as never, makeCtx(user.accessToken));
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
      const res = await listGrowsTool.handler(
        { includeArchived: false, limit: 25 } as never,
        makeCtx(null),
      );
      expect(res.isError).toBe(true);
    });
  });

  // ---------- list_recent_diary_entries ----------

  describe("list_recent_diary_entries", () => {
    async function callAs(user: SeededUser, args: Record<string, unknown>) {
      const res = await listDiaryTool.handler(args as never, makeCtx(user.accessToken));
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      return res;
    }

    it("User A cannot read User B's diary via B's growId (empty, no leak)", async () => {
      const res = await callAs(userA, { growId: userB.primaryGrow.id, limit: 10 });
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
      const first = rows[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.grow_id).toBe("string");
      expect(first.grow_id).toBe(userA.primaryGrow.id);
      expect(typeof first.event_type).toBe("string");
      expect(first.note === null || typeof first.note === "string").toBe(true);
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
      const rows = ((res.structuredContent as any)?.entries ?? []) as any[];
      const bIds = new Set(userB.diaries.map((d) => d.id));
      for (const r of rows) expect(bIds.has(r.id)).toBe(false);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await listDiaryTool.handler(
        { growId: userA.primaryGrow.id, limit: 10 } as never,
        makeCtx(null),
      );
      expect(res.isError).toBe(true);
    });
  });

  // ---------- get_latest_sensor_snapshot ----------

  describe("get_latest_sensor_snapshot", () => {
    it("User A cannot read User B's tent snapshot (empty or non-B row)", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userB.tentId } as never,
        makeCtx(userA.accessToken),
      );
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      const snap = (res.structuredContent as any)?.snapshot ?? null;
      // Either empty (RLS-filtered) or, if surfaced, must not be B's row.
      if (snap !== null) expect(snap.id).not.toBe(userB.snapshotId);
    });

    it("User A sees own snapshot with correct shape and safe source label", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userA.tentId } as never,
        makeCtx(userA.accessToken),
      );
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      const snap = (res.structuredContent as any)?.snapshot;
      expect(snap).toBeTruthy();
      expect(snap.id).toBe(userA.snapshotId);
      expect(typeof snap.tent_id).toBe("string");
      expect(snap.tent_id).toBe(userA.tentId);
      expect(typeof snap.source).toBe("string");
      expect(ALLOWED_SENSOR_SOURCES.has(snap.source)).toBe(true);
      expect(isIsoTimestamp(snap.captured_at)).toBe(true);
      for (const k of [
        "temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm",
        "soil_moisture_pct", "ph", "ec_ms_cm", "confidence",
      ]) {
        if (k in snap && snap[k] !== null) expect(typeof snap[k]).toBe("number");
      }
      // Contract: never exposes raw_payload.
      expect("raw_payload" in snap).toBe(false);
    });

    it("User B sees own snapshot B", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userB.tentId } as never,
        makeCtx(userB.accessToken),
      );
      assertMcpEnvelope(res);
      assertNoSecretLeakage(res);
      expect((res.structuredContent as any)?.snapshot?.id).toBe(userB.snapshotId);
    });

    it("Empty state (no visible snapshot) has structuredContent.snapshot === null", async () => {
      // Cross-user call is RLS-filtered → should be empty for a fresh tent.
      // Use a random UUID that doesn't exist to force the empty branch.
      const nonexistent = "00000000-0000-4000-8000-000000000001";
      const res = await getSnapshotTool.handler(
        { tentId: nonexistent } as never,
        makeCtx(userA.accessToken),
      );
      assertMcpEnvelope(res);
      const snap = (res.structuredContent as any)?.snapshot;
      expect(snap).toBeNull();
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userA.tentId } as never,
        makeCtx(null),
      );
      expect(res.isError).toBe(true);
    });
  });
});
