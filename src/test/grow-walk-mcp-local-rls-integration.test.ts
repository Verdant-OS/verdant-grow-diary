import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

import getGrowWalkContextTool from "@/lib/mcp/tools/get-grow-walk-context";
import listGrowWalkTargetsTool from "@/lib/mcp/tools/list-grow-walk-targets";

const HARNESS_ENABLED =
  process.env.MCP_LOCAL_RLS_HARNESS === "1" &&
  !!process.env.LOCAL_SUPABASE_URL &&
  !!process.env.LOCAL_SUPABASE_ANON_KEY &&
  !!process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const describeIfHarness = HARNESS_ENABLED ? describe : describe.skip;

if (!HARNESS_ENABLED) {
  describe.skip("Grow Walk MCP local RLS integration", () => {
    it("Skipped: local Supabase Grow Walk MCP RLS harness is not configured.", () => {
      /* environment-gated by design */
    });
  });
}

type SeededUser = {
  id: string;
  marker: string;
  accessToken: string;
  growId: string;
  tentId: string;
  readingId: string;
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

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value ?? {});
  for (const pattern of [
    /service_role/i,
    /bearer\s+[A-Za-z0-9._-]{20,}/i,
    /refresh_token/i,
    /access_token/i,
    /raw_payload/i,
    /authorization/i,
    /bridge[_-]?token/i,
  ]) {
    expect(serialized).not.toMatch(pattern);
  }
}

function assertNoForeignMarker(value: unknown, other: SeededUser): void {
  expect(JSON.stringify(value ?? {})).not.toContain(other.marker);
}

describeIfHarness("Grow Walk MCP local RLS integration", () => {
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
    const marker = `grow-walk-${label}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const email = `${marker}@local.test`;
    const password = `Test-${Math.random().toString(36).slice(2, 12)}-Aa1!`;

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError || !created.user) throw new Error(`seed user ${label}: ${userError?.message}`);
    const id = created.user.id;

    const { data: grow, error: growError } = await admin
      .from("grows")
      .insert({
        user_id: id,
        name: `Grow-${marker}`,
        stage: "flower",
        grow_type: "indoor",
        is_archived: false,
      })
      .select("id")
      .single();
    if (growError || !grow) throw new Error(`seed grow ${label}: ${growError?.message}`);

    const { data: tent, error: tentError } = await admin
      .from("tents")
      .insert({
        user_id: id,
        grow_id: grow.id,
        name: `Tent-${marker}`,
        stage: "flower",
        is_archived: false,
      })
      .select("id")
      .single();
    if (tentError || !tent) throw new Error(`seed tent ${label}: ${tentError?.message}`);

    const now = new Date().toISOString();
    const { data: reading, error: readingError } = await admin
      .from("sensor_readings")
      .insert({
        user_id: id,
        tent_id: tent.id,
        metric: "humidity_pct",
        value: 58,
        source: "live",
        quality: "ok",
        ts: now,
        captured_at: now,
      })
      .select("id")
      .single();
    if (readingError || !reading)
      throw new Error(`seed reading ${label}: ${readingError?.message}`);

    const sessionClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signInError } = await sessionClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !session.session)
      throw new Error(`sign in ${label}: ${signInError?.message}`);

    return {
      id,
      marker,
      accessToken: session.session.access_token,
      growId: grow.id,
      tentId: tent.id,
      readingId: reading.id,
    };
  }

  async function countsFor(user: SeededUser) {
    const results = await Promise.all(
      ["grows", "tents", "sensor_readings", "grow_events", "alerts", "action_queue"].map(
        async (table) => {
          const { count, error } = await admin
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);
          if (error) throw new Error(`count ${table}: ${error.message}`);
          return [table, count ?? 0] as const;
        },
      ),
    );
    return Object.fromEntries(results);
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_PUBLISHABLE_KEY = anon;
    process.env.SUPABASE_ANON_KEY = anon;
    admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    [userA, userB] = await Promise.all([seedUser("a"), seedUser("b")]);
    const { error } = await admin
      .from("user_roles")
      .upsert({ user_id: userA.id, role: "operator" }, { onConflict: "user_id,role" });
    if (error) throw new Error(`grant operator role: ${error.message}`);
  }, 60_000);

  afterAll(async () => {
    for (const user of [userA, userB].filter(Boolean)) {
      try {
        await admin.from("user_roles").delete().eq("user_id", user.id);
        await admin.from("sensor_readings").delete().eq("user_id", user.id);
        await admin.from("tents").delete().eq("user_id", user.id);
        await admin.from("grows").delete().eq("user_id", user.id);
        await admin.auth.admin.deleteUser(user.id);
      } catch {
        /* best effort on disposable local database */
      }
    }
    process.env.SUPABASE_URL = priorEnv.SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = priorEnv.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_ANON_KEY = priorEnv.SUPABASE_ANON_KEY;
  }, 30_000);

  it("operator User A lists only A's targets; optional limit and inactive flags never widen scope", async () => {
    for (const args of [
      { growId: userA.growId },
      { growId: userA.growId, limit: 1 },
      { growId: userA.growId, includeInactivePlants: true, limit: 100 },
    ]) {
      const result = await listGrowWalkTargetsTool.handler(args, makeCtx(userA.accessToken));
      expect(result.isError).toBeFalsy();
      const targets = ((result.structuredContent as any)?.targets ?? []) as any[];
      expect(targets.some((target) => target.targetId === userA.tentId)).toBe(true);
      expect(targets.some((target) => target.targetId === userB.tentId)).toBe(false);
      assertNoForeignMarker(result, userB);
      assertNoSecrets(result);
    }
  });

  it("operator User A cannot list User B's grow targets", async () => {
    const result = await listGrowWalkTargetsTool.handler(
      { growId: userB.growId, includeInactivePlants: true, limit: 100 },
      makeCtx(userA.accessToken),
    );
    expect(result.isError).toBe(true);
    expect((result.structuredContent as any)?.targets ?? []).toEqual([]);
    assertNoForeignMarker(result, userB);
    assertNoSecrets(result);
  });

  it("User A reads only A's tent context and keeps sensor provenance safe", async () => {
    const result = await getGrowWalkContextTool.handler(
      { targetType: "tent", targetId: userA.tentId, lookbackHours: 168 },
      makeCtx(userA.accessToken),
    );
    expect(result.isError).toBeFalsy();
    const context = (result.structuredContent as any)?.context;
    expect(context.scope.growId).toBe(userA.growId);
    expect(context.scope.tentId).toBe(userA.tentId);
    expect(context.evidence.sensors.readings.humidity_pct.id).toBe(userA.readingId);
    expect(context.evidence.sensors.readings.humidity_pct.current_live).toBe(true);
    expect(context.evidence.photos).toEqual([]);
    assertNoForeignMarker(result, userB);
    assertNoSecrets(result);
  });

  it("User A cannot read User B's tent context with any lookback", async () => {
    for (const lookbackHours of [24, 72, 168]) {
      const result = await getGrowWalkContextTool.handler(
        { targetType: "tent", targetId: userB.tentId, lookbackHours },
        makeCtx(userA.accessToken),
      );
      expect(result.isError).toBe(true);
      expect((result.structuredContent as any)?.context).toBeUndefined();
      assertNoForeignMarker(result, userB);
      assertNoSecrets(result);
    }
  });

  it("unauthenticated callers are rejected by both tools", async () => {
    const targets = await listGrowWalkTargetsTool.handler(
      { growId: userA.growId },
      makeCtx(null),
    );
    const context = await getGrowWalkContextTool.handler(
      { targetType: "tent", targetId: userA.tentId },
      makeCtx(null),
    );
    expect(targets.isError).toBe(true);
    expect(context.isError).toBe(true);
  });

  it("complete Grow Walk tool execution creates zero database mutations", async () => {
    const beforeA = await countsFor(userA);
    const beforeB = await countsFor(userB);

    await listGrowWalkTargetsTool.handler(
      { growId: userA.growId, includeInactivePlants: false, limit: 50 },
      makeCtx(userA.accessToken),
    );
    await getGrowWalkContextTool.handler(
      { targetType: "tent", targetId: userA.tentId, lookbackHours: 72 },
      makeCtx(userA.accessToken),
    );

    expect(await countsFor(userA)).toEqual(beforeA);
    expect(await countsFor(userB)).toEqual(beforeB);
  });
});
