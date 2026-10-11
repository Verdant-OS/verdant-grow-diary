import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext, Page } from "@playwright/test";

export type Row = Record<string, unknown>;
export interface LocalEnvironment {
  ui: string;
  api: string;
  anon: string;
  service: string;
}

/** Dedicated opt-in only. Validate before creating a client or making any write. */
export function localEnvironment(): LocalEnvironment {
  const env = process.env;
  if (
    env.NATIVE_LOCAL_BROWSER !== "1" ||
    env.NATIVE_LOCAL_UI_URL !== "http://127.0.0.1:5173" ||
    env.SUPABASE_URL !== "http://127.0.0.1:54321" ||
    env.VITE_SUPABASE_URL !== env.SUPABASE_URL ||
    !env.SUPABASE_ANON_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.NATIVE_LOCAL_FIXTURE_PASSWORD ||
    env.NATIVE_LOCAL_FIXTURE_PASSWORD.length < 24 ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Native local browser acceptance requires the exact isolated UI/API and key mapping.");
  }
  return {
    ui: env.NATIVE_LOCAL_UI_URL,
    api: env.SUPABASE_URL,
    anon: env.SUPABASE_ANON_KEY,
    service: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function localClient(env: LocalEnvironment, key: string): SupabaseClient {
  localEnvironment();
  return createClient(env.api, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).origin !== env.api) {
          throw new Error("Blocked non-local fixture request.");
        }
        return fetch(request, { redirect: "error" });
      },
    },
  });
}

export function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function acceptedReceipt(value: unknown): Row & { grow_event_id: string } {
  if (
    !isRow(value) ||
    value.ok !== true ||
    typeof value.grow_event_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.grow_event_id)
  ) {
    throw new Error("Local Note RPC did not return a confirmed UUID receipt.");
  }
  return value as Row & { grow_event_id: string };
}

export interface Account {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}
export interface Scope {
  growId: string;
  tentId: string;
  plantId: string;
  tentName: string;
  plantName: string;
}
const ROW_TABLES = ["grow_events", "diary_entries", "environment_events", "sensor_readings"] as const;
export type OwnerRows = Record<(typeof ROW_TABLES)[number], Row[]>;

/** Authenticated anon-key/JWT readback, never privileged assertion reads. */
export async function ownerRows(account: Account): Promise<OwnerRows> {
  const entries = await Promise.all(
    ROW_TABLES.map(async (table) => {
      const { data, error } = await account.client.from(table).select("*");
      if (error || !Array.isArray(data)) throw new Error("Authenticated local read failed: " + table);
      if (data.some((row: Row) => row.user_id !== account.id)) {
        throw new Error("Authenticated local read exposed another owner: " + table);
      }
      return [table, data as Row[]] as const;
    }),
  );
  return Object.fromEntries(entries) as OwnerRows;
}

export function fingerprint(rows: OwnerRows): string {
  return JSON.stringify(
    ROW_TABLES.map((table) => [table, rows[table].map((row) => JSON.stringify(row)).sort()]),
  );
}

export async function visibleEventIds(account: Account, ids: string[]): Promise<string[]> {
  const { data, error } = await account.client.from("grow_events").select("id").in("id", ids);
  if (error || !Array.isArray(data)) throw new Error("Authenticated negative-scope read failed.");
  return data.map((row: { id: string }) => row.id).sort();
}

export async function visiblePlantIds(account: Account, ids: string[]): Promise<string[]> {
  const { data, error } = await account.client.from("plants").select("id").in("id", ids);
  if (error || !Array.isArray(data)) throw new Error("Authenticated plant-scope read failed.");
  return data.map((row: { id: string }) => row.id).sort();
}

export interface LocalFixture {
  env: LocalEnvironment;
  owner: Account;
  other: Account;
  primary: Scope;
  secondary: Scope;
  foreign: Scope;
  witnessId: string;
  manualAt: string;
  staleAt: string;
  cleanup: () => Promise<void>;
}

/** A positive B read is required before an unchanged snapshot can prove isolation. */
export async function witnessRows(fixture: LocalFixture): Promise<OwnerRows> {
  const rows = await ownerRows(fixture.other);
  const matchesScope = (row: Row) =>
    row.user_id === fixture.other.id &&
    row.grow_id === fixture.foreign.growId &&
    row.tent_id === fixture.foreign.tentId &&
    row.plant_id === fixture.foreign.plantId &&
    row.note === "Native local untouched owner witness";
  const events = rows.grow_events.filter((row) => row.id === fixture.witnessId);
  const diary = rows.diary_entries.filter((row) => {
    const details = isRow(row.details) ? row.details : {};
    return details.linked_grow_event_id === fixture.witnessId ||
      details.grow_event_id === fixture.witnessId;
  });
  if (
    events.length !== 1 || diary.length !== 1 ||
    !matchesScope(events[0]) || !matchesScope(diary[0]) ||
    events[0].event_type !== "observation" || events[0].source !== "manual"
  ) {
    throw new Error("Other owner cannot retrieve the original canonical witness and diary.");
  }
  return rows;
}

/**
 * All rows live only in the disposable local backend. Privileged access is
 * limited to setup/cleanup; assertions use each temporary user's JWT client.
 * The dated physical envelope below is synthetic fixture data exercising the
 * stored gateway lineage contract, not evidence of connected hardware.
 */
export async function createLocalFixture(withDatedReadings = false): Promise<LocalFixture> {
  const env = localEnvironment();
  const admin = localClient(env, env.service);
  const created: string[] = [];
  const cleanup = async () => {
    localEnvironment();
    let failed = false;
    for (const uid of created) {
      for (const table of [
        "sensor_readings", "environment_events", "feeding_events", "watering_events",
        "quicklog_idempotency", "quicklog_audit_events", "diary_entries", "grow_events",
        "plants", "tents", "grows",
      ]) {
        const { error } = await admin.from(table).delete().eq("user_id", uid);
        if (error) failed = true;
      }
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) failed = true;
    }
    if (failed) throw new Error("Local fixture cleanup failed; inspect the disposable backend.");
  };
  const makeAccount = async (): Promise<Account> => {
    const email = "native-local-" + randomUUID() + "@verdant.test";
    // The dedicated workflow generates/masks this before starting Playwright.
    // Worker stdout must never contain secrets: reporters capture it verbatim.
    const password = process.env.NATIVE_LOCAL_FIXTURE_PASSWORD;
    if (!password) throw new Error("Missing isolated fixture password.");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error("Local fixture account creation failed.");
    created.push(data.user.id);
    const client = localClient(env, env.anon);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || login.data.user?.id !== data.user.id) {
      throw new Error("Local fixture user authentication failed.");
    }
    return { id: data.user.id, email, password, client };
  };
  const seedScope = async (account: Account, label: string): Promise<Scope> => {
    const suffix = randomUUID().slice(0, 8);
    const tentName = "Native local " + label + " tent " + suffix;
    const plantName = "Native local " + label + " plant " + suffix;
    const { data: grow, error: growError } = await admin.from("grows")
      .insert({ user_id: account.id, name: "Native local grow " + suffix }).select("id").single();
    if (growError || !grow) throw new Error("Local fixture grow creation failed.");
    const { data: tent, error: tentError } = await admin.from("tents")
      .insert({ user_id: account.id, grow_id: grow.id, name: tentName, stage: "veg" })
      .select("id").single();
    if (tentError || !tent) throw new Error("Local fixture tent creation failed.");
    const { data: plant, error: plantError } = await admin.from("plants")
      .insert({
        user_id: account.id, grow_id: grow.id, tent_id: tent.id,
        name: plantName, stage: "veg", health: "healthy",
      }).select("id").single();
    if (plantError || !plant) throw new Error("Local fixture plant creation failed.");
    return { growId: grow.id, tentId: tent.id, plantId: plant.id, tentName, plantName };
  };
  try {
    const owner = await makeAccount();
    const other = await makeAccount();
    const primary = await seedScope(owner, "primary");
    const secondary = await seedScope(owner, "secondary");
    const foreign = await seedScope(other, "other owner");
    const witness = await other.client.rpc("quicklog_save_manual", {
      p_target_type: "plant", p_target_id: foreign.plantId, p_action: "note",
      p_note: "Native local untouched owner witness", p_idempotency_key: randomUUID(),
    });
    if (witness.error) throw new Error("Local fixture witness save failed.");
    const witnessId = acceptedReceipt(witness.data).grow_event_id;
    const now = Date.now();
    const manualAt = new Date(now - 9 * 60 * 60 * 1000).toISOString();
    const staleAt = new Date(now - 45 * 60 * 1000).toISOString();
    if (withDatedReadings) {
      const physical = {
        vendor: "ecowitt_windows_testbench",
        metadata: {
          reported_verdant_source: "live",
          raw_payload: { stationtype: "GW2000", model: "GW2000" },
        },
      };
      const reading = (account: Account, scope: Scope, source: string, at: string, value: number) => ({
        user_id: account.id, tent_id: scope.tentId, source, captured_at: at, ts: at,
        metric: "temperature_c", value, quality: "ok",
        raw_payload: source === "live" ? physical : { fixture: "native-local-manual" },
      });
      const { error } = await admin.from("sensor_readings").insert([
        reading(owner, primary, "manual", manualAt, 25),
        // More than the Doctor mixed-window cap: the separate manual query is required.
        ...Array.from({ length: 55 }, (_, index) =>
          reading(owner, primary, "live", new Date(Date.parse(staleAt) - index * 1000).toISOString(), 30)),
        reading(owner, secondary, "live", staleAt, 29),
        reading(other, foreign, "live", new Date(now - 60_000).toISOString(), 27),
      ]);
      if (error) throw new Error("Local dated sensor fixture creation failed.");
    }
    return { env, owner, other, primary, secondary, foreign, witnessId, manualAt, staleAt, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Install before sign-in; no hosted origins or provider calls are permitted. */
export async function fenceBrowser(context: BrowserContext, env: LocalEnvironment): Promise<void> {
  localEnvironment();
  await context.route("**/*", async (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === env.ui || origin === env.api) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    const allowed = new Set([env.ui.replace(/^http/, "ws"), env.api.replace(/^http/, "ws")]);
    if (allowed.has(new URL(socket.url()).origin)) socket.connectToServer();
    else socket.close();
  });
  await context.addInitScript(() => {
    // A consent preference only; no auth/session or pending operation is injected.
    window.localStorage.setItem("verdant.analytics-consent.v1", "denied");
  });
}

/** Drive the actual sign-in form. Never snapshot auth storage or attach credentials. */
export async function signIn(page: Page, fixture: LocalFixture): Promise<void> {
  localEnvironment();
  try {
    await page.goto(fixture.env.ui + "/auth");
    await page.locator("#signin-email").fill(fixture.owner.email);
    await page.locator("#signin-password").fill(fixture.owner.password);
    await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
    await page.waitForURL((url) => url.origin === fixture.env.ui && url.pathname !== "/auth");
    // A newly created user has no agreement rows. Wait for the real gate on
    // an unsuppressed route instead of racing its asynchronous read.
    await page.goto(fixture.env.ui + "/plants/" + fixture.primary.plantId);
    const gate = page.getByTestId("agreement-reconsent-gate");
    await gate.waitFor({ state: "visible" });
    await page.locator("#reconsent-accept").click();
    await gate.getByRole("button", { name: "Accept and continue" }).click();
    await gate.waitFor({ state: "hidden" });
    await page.getByTestId("header-quick-log-trigger").waitFor({ state: "visible" });
  } catch {
    // Playwright fill-call errors can contain the filled value. Do not propagate them.
    throw new Error("Real local UI sign-in did not reach the authenticated application.");
  }
}
