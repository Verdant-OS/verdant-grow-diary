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

const HARNESS_ENABLED =
  process.env.MCP_LOCAL_RLS_HARNESS === "1" &&
  !!process.env.LOCAL_SUPABASE_URL &&
  !!process.env.LOCAL_SUPABASE_ANON_KEY &&
  !!process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const describeIfHarness = HARNESS_ENABLED ? describe : describe.skip;

if (!HARNESS_ENABLED) {
  // Emit a single skipped test so runners surface the reason clearly.
  describe.skip("MCP local RLS integration", () => {
    it("Skipped: local Supabase MCP RLS harness is not configured.", () => {
      /* intentionally empty */
    });
  });
}

type SeededUser = {
  id: string;
  email: string;
  accessToken: string;
  growId: string;
  tentId: string;
  diaryId: string;
  snapshotId: string;
};

function makeCtx(token: string | null): ToolContext {
  // Minimal ToolContext shim — only the accessors our tools use.
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

describeIfHarness("MCP local RLS integration", () => {
  // Non-null-asserted because harness gate above guarantees presence.
  const url = process.env.LOCAL_SUPABASE_URL!;
  const anon = process.env.LOCAL_SUPABASE_ANON_KEY!;
  const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY!;

  // Point the MCP tool factory at the local instance for the duration
  // of these tests. Save & restore prior values so we don't leak into
  // other test files.
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

    // Seed one grow, tent, diary entry, sensor reading owned by this user.
    const { data: grow, error: growErr } = await admin
      .from("grows")
      .insert({ user_id: userId, name: `Grow-${label}`, stage: "veg", grow_type: "indoor" })
      .select("id")
      .single();
    if (growErr || !grow) throw new Error(`seed grow: ${growErr?.message}`);

    const { data: tent, error: tentErr } = await admin
      .from("tents")
      .insert({ user_id: userId, name: `Tent-${label}` })
      .select("id")
      .single();
    if (tentErr || !tent) throw new Error(`seed tent: ${tentErr?.message}`);

    const { data: diary, error: diaryErr } = await admin
      .from("diary_entries")
      .insert({
        user_id: userId,
        grow_id: grow.id,
        event_type: "note",
        note: `note-${label}`,
      })
      .select("id")
      .single();
    if (diaryErr || !diary) throw new Error(`seed diary: ${diaryErr?.message}`);

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

    // Sign in as this user to obtain a real anon-scoped access token.
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
      growId: grow.id,
      tentId: tent.id,
      diaryId: diary.id,
      snapshotId: snap.id,
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
    // Best-effort cleanup — local DB may reset per run.
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

  describe("list_grows", () => {
    it("User A sees only Grow A", async () => {
      const res = await listGrowsTool.handler({ includeArchived: false, limit: 25 } as never, makeCtx(userA.accessToken));
      const ids = (res.structuredContent?.grows ?? []).map((g: { id: string }) => g.id);
      expect(ids).toContain(userA.growId);
      expect(ids).not.toContain(userB.growId);
      assertNoSecretLeakage(res);
    });

    it("User B sees only Grow B", async () => {
      const res = await listGrowsTool.handler({ includeArchived: false, limit: 25 } as never, makeCtx(userB.accessToken));
      const ids = (res.structuredContent?.grows ?? []).map((g: { id: string }) => g.id);
      expect(ids).toContain(userB.growId);
      expect(ids).not.toContain(userA.growId);
      assertNoSecretLeakage(res);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await listGrowsTool.handler({ includeArchived: false, limit: 25 } as never, makeCtx(null));
      expect(res.isError).toBe(true);
    });
  });

  describe("list_recent_diary_entries", () => {
    it("User A cannot read User B's diary via B's growId", async () => {
      const res = await listDiaryTool.handler(
        { growId: userB.growId },
        makeCtx(userA.accessToken),
      );
      const ids = (res.structuredContent?.entries ?? []).map((e: { id: string }) => e.id);
      expect(ids).not.toContain(userB.diaryId);
      assertNoSecretLeakage(res);
    });

    it("User A sees own diary entry A", async () => {
      const res = await listDiaryTool.handler(
        { growId: userA.growId },
        makeCtx(userA.accessToken),
      );
      const ids = (res.structuredContent?.entries ?? []).map((e: { id: string }) => e.id);
      expect(ids).toContain(userA.diaryId);
      expect(ids).not.toContain(userB.diaryId);
      assertNoSecretLeakage(res);
    });

    it("User B sees own diary entry B", async () => {
      const res = await listDiaryTool.handler(
        { growId: userB.growId },
        makeCtx(userB.accessToken),
      );
      const ids = (res.structuredContent?.entries ?? []).map((e: { id: string }) => e.id);
      expect(ids).toContain(userB.diaryId);
      expect(ids).not.toContain(userA.diaryId);
      assertNoSecretLeakage(res);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await listDiaryTool.handler(
        { growId: userA.growId },
        makeCtx(null),
      );
      expect(res.isError).toBe(true);
    });
  });

  describe("get_latest_sensor_snapshot", () => {
    it("User A cannot read User B's tent snapshot", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userB.tentId },
        makeCtx(userA.accessToken),
      );
      const snap = res.structuredContent?.snapshot;
      expect(snap?.id ?? null).not.toBe(userB.snapshotId);
      assertNoSecretLeakage(res);
    });

    it("User A sees own snapshot A", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userA.tentId },
        makeCtx(userA.accessToken),
      );
      expect(res.structuredContent?.snapshot?.id).toBe(userA.snapshotId);
      assertNoSecretLeakage(res);
    });

    it("User B sees own snapshot B", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userB.tentId },
        makeCtx(userB.accessToken),
      );
      expect(res.structuredContent?.snapshot?.id).toBe(userB.snapshotId);
      assertNoSecretLeakage(res);
    });

    it("Unauthenticated caller is rejected", async () => {
      const res = await getSnapshotTool.handler(
        { tentId: userA.tentId },
        makeCtx(null),
      );
      expect(res.isError).toBe(true);
    });
  });
});
