/**
 * Community V1 authority proof: the 37 runtime (RT) cases of the Task 2
 * backend packet §8, written before the Community V1 migration exists.
 *
 * Task 2A (this file's first state): every case must FAIL against the replayed
 * base schema, because the community functions and tables are absent. Task 2B
 * adds the migration and expects every case to pass. Each `it` title starts
 * with its §8 ID; scripts/security/community-v1-db-proof.mjs refuses a run in
 * which any ID is missing, duplicated or skipped.
 *
 * BLOCKED unless a LOCAL loopback Supabase is exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
 * Run it through scripts/security/run-community-v1-db-security.mjs. Without
 * those variables the default suite skips this file.
 *
 * Fixtures are synthetic (`@example.test`) and live only in the disposable
 * database. The service key creates and deletes auth users and calls the two
 * service_role functions; psql (loopback only) seeds diary rows, reads state
 * for assertions and holds row locks for the race cases. Every client action
 * runs through an anon-key client signed in as that user.
 *
 * Wire contract this file pins for Task 2B (packet §6.3, resolved names):
 * - Arguments are the §6.3 `p_*` names. Mutating RPCs also take
 *   `p_idempotency_key uuid` (see MUTATING below).
 * - Every client RPC returns `{ ok: true, value }` or `{ ok: false, code }`.
 * - Values use the Task 1 camelCase shapes: CommunityProfileCard,
 *   PublicationPreview, SharedPublication (with `occurredDate`), DigestItem.
 * - `p_entries` items: { sourceEntryId, sourceJournalLabel, occurredDate,
 *   sharedNote, includeStage, measurementKeys, includeMedia }.
 *   Measurement keys are `watering.<key>` / `feeding.<key>` from the approved
 *   allowlist (packet §10.3).
 *
 * NEVER logs keys, JWTs, user ids or emails.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readCommunityInstant } from "@/lib/communityDigestRules";
import {
  requireLocalCommunityEnvironment,
  runCommunityFixtureSql,
} from "../../../scripts/security/community-v1-db-proof.mjs";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL?.trim() ?? "";
// Safety gate: this file creates and deletes auth users and writes fixture
// rows. It must never run against a remote project.
function isLocalSupabaseUrl(u: string): boolean {
  try {
    const h = new globalThis.URL(u).hostname.toLowerCase();
    return (
      h === "127.0.0.1" ||
      h === "localhost" ||
      h === "::1" ||
      h === "[::1]" ||
      h === "0.0.0.0" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE && !!DB_URL && isLocalSupabaseUrl(URL);
const d = hasLocalSupabase ? describe : describe.skip;

// Response bodies are untyped JSON from PostgREST.
type Json = any;
type Result = { ok: true; value: Json } | { ok: false; code: string };

interface Actor {
  id: string;
  client: SupabaseClient;
  communityId: string;
  username: string;
}

const MUTATING = new Set([
  "community_profile_upsert",
  "community_profile_deactivate",
  "community_follow_set",
  "community_collection_draft",
  "community_preview_create",
  "community_publish",
  "community_unpublish",
  "community_access_request",
  "community_access_decide",
  "community_access_withdraw",
  "community_access_leave",
  "community_block_set",
  "community_report_create",
  "community_moderation_decide",
]);
const TABLES: ReadonlyArray<readonly [string, string, string]> = [
  ["community_profiles", "id", "uuid"],
  ["community_follows", "follower_id", "uuid"],
  ["community_collections", "id", "uuid"],
  ["community_collection_access", "id", "uuid"],
  ["community_collection_items", "id", "uuid"],
  ["community_media_derivatives", "id", "uuid"],
  ["community_blocks", "blocker_id", "uuid"],
  ["community_reports", "id", "uuid"],
  ["community_digest_seen", "viewer_id", "uuid"],
  ["community_moderators", "user_id", "uuid"],
  ["community_preview_tokens", "id", "uuid"],
  ["community_command_receipts", "actor_user_id", "uuid"],
  ["community_feature_state", "enabled", "boolean"],
];

const createdUsers: string[] = [];
let admin: SupabaseClient;

function sql(text: string): string {
  return String(runCommunityFixtureSql(text) ?? "").trim();
}
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
function uname(): string {
  return `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one RPC; a transport error is a test failure, never a denial value.
 * Only when PostgREST itself names this community function as missing does the
 * error carry the structured RED marker that requireRedCommunityProof accepts.
 */
async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<Result> {
  const body = MUTATING.has(fn) ? { p_idempotency_key: randomUUID(), ...args } : args;
  const { data, error } = await client.rpc(fn as never, body as never);
  if (error) {
    const missing =
      error.code === "PGRST202" &&
      /^community_[a-z_]+$/.test(fn) &&
      (error.message ?? "").includes(`public.${fn}(`);
    throw new Error(
      missing
        ? `COMMUNITY_OBJECT_MISSING function ${fn} PGRST202`
        : `RPC_ERROR ${fn} ${error.code ?? "unknown"}`,
    );
  }
  return data as Result;
}
/** For calls expected to be refused by PostgREST or Postgres before the function body runs. */
async function rpcErrorCode(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { error } = await client.rpc(fn as never, args as never);
  return error?.code ?? "no-error";
}
function ok(result: Result): Json {
  expect(result).toMatchObject({ ok: true });
  return (result as { value: Json }).value;
}
function denied(result: Result, code: string): void {
  expect(result).toEqual({ ok: false, code });
}

async function newUser(tag: string): Promise<Omit<Actor, "communityId" | "username">> {
  const email = `cv1+${tag}+${randomUUID().slice(0, 8)}@example.test`;
  const password = `Test-${randomUUID()}-A1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("failed to create fixture user");
  createdUsers.push(data.user.id);
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error("failed to sign in fixture user");
  return { id: data.user.id, client };
}

/**
 * A signed-in user whose email is then marked unconfirmed in the disposable
 * database, so the server-side verification check (D4) is what is exercised,
 * independent of the local GoTrue confirmation and autoconfirm settings.
 */
async function unverifiedUser(tag: string): Promise<Omit<Actor, "communityId" | "username">> {
  const user = await newUser(tag);
  sql(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = ${lit(user.id)};`);
  const state = sql(
    `SELECT coalesce(email_confirmed_at::text, 'unconfirmed') FROM auth.users WHERE id = ${lit(user.id)};`,
  );
  if (state !== "unconfirmed") throw new Error("BLOCKED: unverified fixture is still confirmed.");
  return user;
}

/** A verified user who has opted in with an explicit username. */
async function participant(tag: string): Promise<Actor> {
  const user = await newUser(tag);
  const card = ok(
    await rpc(user.client, "community_profile_upsert", {
      p_username: uname(),
      p_display_name: `Grower ${tag}`,
      p_bio: "",
    }),
  );
  return { ...user, communityId: card.communityId, username: card.username };
}

async function newCollection(owner: Actor, title = "Tent log"): Promise<string> {
  const view = ok(
    await rpc(owner.client, "community_collection_draft", {
      p_collection_handle: null,
      p_title: title,
      p_source_label: "Main tent",
      p_description: "Synthetic fixture collection",
    }),
  );
  return view.collectionHandle;
}

interface EntryOptions {
  stage?: string | null;
  note?: string;
  watering?: Record<string, number>;
}
/** Inserts an owner-owned diary entry (and its typed watering event when asked). */
function diaryEntry(owner: { id: string }, options: EntryOptions = {}): string {
  const uid = lit(owner.id);
  // One active grow per owner: the free-tier cap trigger rejects a second
  // active grow, which would abort every multi-entry case before its
  // assertions (Copilot P1 on #2414 at 77d424b1).
  const grow = sql(`WITH existing AS (
      SELECT id FROM public.grows WHERE user_id = ${uid} AND is_archived = false
       ORDER BY created_at, id LIMIT 1
    ), created AS (
      INSERT INTO public.grows (user_id, name)
      SELECT ${uid}, '[fixture] community v1' WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT id FROM existing UNION ALL SELECT id FROM created LIMIT 1;`);
  let details = "'{}'::jsonb";
  if (options.watering) {
    const event = sql(
      `INSERT INTO public.grow_events (user_id, grow_id, event_type) VALUES (${uid}, ${lit(grow)}, 'watering') RETURNING id;`,
    );
    details = `jsonb_build_object('event_type', 'watering', 'quick_log_version', 2,
      'linked_grow_event_id', ${lit(event)}, 'watering', ${lit(JSON.stringify(options.watering))}::jsonb)`;
  }
  const stage =
    options.stage === undefined ? "'veg'" : options.stage === null ? "NULL" : lit(options.stage);
  return sql(`INSERT INTO public.diary_entries (user_id, grow_id, entry_at, note, stage, details)
    VALUES (${uid}, ${lit(grow)}, now() - interval '1 hour', ${lit(options.note ?? "private fixture note")},
            ${stage}, ${details}) RETURNING id;`);
}

function draft(sourceEntryId: string, overrides: Record<string, unknown> = {}) {
  return {
    sourceEntryId,
    sourceJournalLabel: "Main tent",
    occurredDate: null,
    sharedNote: "",
    includeStage: false,
    measurementKeys: [],
    includeMedia: false,
    ...overrides,
  };
}

async function preview(owner: Actor, collection: string, entries: object[]): Promise<Json> {
  return ok(
    await rpc(owner.client, "community_preview_create", {
      p_collection_handle: collection,
      p_entries: entries,
    }),
  );
}
async function publish(owner: Actor, collection: string, entries: object[]) {
  const shown = await preview(owner, collection, entries);
  const published = ok(
    await rpc(owner.client, "community_publish", {
      p_collection_handle: collection,
      p_preview_token: shown.previewToken,
    }),
  );
  return { preview: shown, published };
}
/** An owner with one active collection holding `count` published entries. */
async function publishedOwner(tag: string, count = 1) {
  const owner = await participant(tag);
  const collection = await newCollection(owner);
  const entries = Array.from({ length: count }, (_, i) =>
    diaryEntry(owner, { note: `private ${tag} ${i}` }),
  );
  const result = await publish(
    owner,
    collection,
    entries.map((id, i) => draft(id, { sharedNote: `shared ${tag} ${i}` })),
  );
  return { owner, collection, entries, ...result };
}

function accessRevision(accessHandle: string): number {
  return Number(
    sql(
      `SELECT row_revision FROM public.community_collection_access WHERE handle = ${lit(accessHandle)};`,
    ),
  );
}
function accessState(accessHandle: string): string {
  return sql(
    `SELECT state FROM public.community_collection_access WHERE handle = ${lit(accessHandle)};`,
  );
}
async function requestAccess(viewer: Actor, collection: string): Promise<string> {
  return ok(
    await rpc(viewer.client, "community_access_request", { p_collection_handle: collection }),
  ).accessHandle;
}
async function decide(owner: Actor, accessHandle: string, decision: string): Promise<Result> {
  return rpc(owner.client, "community_access_decide", {
    p_access_handle: accessHandle,
    p_decision: decision,
    p_expected_revision: accessRevision(accessHandle),
  });
}
async function grant(owner: Actor, viewer: Actor, collection: string): Promise<string> {
  const accessHandle = await requestAccess(viewer, collection);
  ok(await decide(owner, accessHandle, "approve"));
  return accessHandle;
}
async function follow(viewer: Actor, owner: Actor, on = true): Promise<Result> {
  return rpc(viewer.client, "community_follow_set", {
    p_profile_id: owner.communityId,
    p_follow: on,
  });
}
async function read(viewer: Actor, collection: string): Promise<Result> {
  return rpc(viewer.client, "community_collection_read", {
    p_collection_handle: collection,
    p_cursor: null,
    p_limit: 50,
  });
}
async function digest(viewer: Actor, cursor: string | null = null, limit = 50): Promise<Json> {
  return ok(
    await rpc(viewer.client, "community_digest_read", { p_cursor: cursor, p_limit: limit }),
  );
}
function handlesOf(items: Json[]): string[] {
  return items.map((item) => item.publicationHandle ?? item.publication?.publicationHandle);
}
async function mediaLookup(viewer: { id: string }, derivativeHandle: string): Promise<Result> {
  return rpc(admin, "community_media_lookup", {
    p_viewer_user_id: viewer.id,
    p_derivative_handle: derivativeHandle,
  });
}
/** A ready synthetic derivative attached to a new current item (no bytes; Task 3 owns real media). */
function seedDerivativeItem(owner: Actor, collection: string, entryId: string): string {
  const derivative = sql(`INSERT INTO public.community_media_derivatives
      (handle, owner_user_id, collection_id, collection_revision, object_key, output_sha256,
       mime, byte_size, width, height, sanitizer_version, ready)
    SELECT gen_random_uuid(), ${lit(owner.id)}, c.id, c.revision,
           ${lit(owner.id)} || '/' || gen_random_uuid() || '.jpg', repeat('a', 64),
           'image/jpeg', 1, 1, 1, 'fixture', true
      FROM public.community_collections c WHERE c.handle = ${lit(collection)}
    RETURNING handle;`);
  sql(`INSERT INTO public.community_collection_items
      (publication_handle, collection_id, slot_key, item_revision, collection_revision,
       source_entry_id, source_fingerprint, payload, payload_hash, derivative_id, published_at, status)
    SELECT gen_random_uuid(), m.collection_id, gen_random_uuid(), 1, m.collection_revision,
           ${lit(entryId)}, 'fixture', '{}'::jsonb, 'fixture', m.id, now(), 'current'
      FROM public.community_media_derivatives m WHERE m.handle = ${lit(derivative)};`);
  return derivative;
}

interface LockHold {
  pid: number;
  done: Promise<void>;
}

/**
 * Holds one row lock in a second psql session. Ready only once that session has
 * locked the row and is sleeping inside its transaction. The hold is bounded by
 * the fixture's 10 s statement_timeout and released early by race().
 */
async function holdRowLock(table: string, column: string, value: string): Promise<LockHold> {
  const where = `${column} = ${lit(value)}`;
  if (sql(`SELECT count(*) FROM public.${table} WHERE ${where};`) !== "1") {
    throw new Error("BLOCKED: the row to lock does not exist.");
  }
  const tag = `cv1_lock_${randomUUID().replace(/-/g, "")}`;
  const done = new Promise<void>((resolve) => {
    runCommunityFixtureSql(
      `SET application_name = '${tag}';
       BEGIN; SELECT 1 FROM public.${table} WHERE ${where} FOR UPDATE;
       SELECT pg_sleep(9); COMMIT;`,
      process.env,
      (command: string, args: string[], options: { env: NodeJS.ProcessEnv; input: string }) => {
        // Cancelled on purpose by race(); either way the transaction ends and the lock is released.
        const child = execFile(command, args, { env: options.env, timeout: 20_000 }, () =>
          resolve(),
        );
        child.stdin?.end(options.input);
        return "";
      },
    );
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pid = sql(
      `SELECT pid FROM pg_stat_activity WHERE application_name = '${tag}' AND wait_event = 'PgSleep';`,
    );
    if (pid) return { pid: Number(pid), done };
    await sleep(100);
  }
  throw new Error("BLOCKED: the lock-holding session did not take its row lock.");
}

/**
 * Fires the calls while the row is held, waits until at least two of them are
 * queued on a lock (PostgREST's pool may queue the rest before the database),
 * then releases the lock. Contention is asserted, never assumed from timing.
 */
async function race<T>(hold: LockHold, calls: Array<() => Promise<T>>): Promise<T[]> {
  const settled = calls.map((call) =>
    call().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  );
  const needed = Math.min(calls.length, 2);
  let waiting = 0;
  for (let attempt = 0; attempt < 70 && waiting < needed; attempt += 1) {
    await sleep(100);
    waiting = Number(
      sql(
        // Only sessions blocked by the held row count, so unrelated lock waiters
        // cannot release it early (Codex P2 on #2414 at 77d424b1).
        `SELECT count(*) FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND ${hold.pid} = ANY (pg_blocking_pids(pid));`,
      ),
    );
  }
  sql(`SELECT pg_cancel_backend(${hold.pid});`);
  await hold.done;
  const outcomes = await Promise.all(settled);
  const failed = outcomes.find((outcome) => !outcome.ok);
  if (failed && !failed.ok) throw failed.error;
  expect(waiting, "racing calls queued on the held lock").toBeGreaterThanOrEqual(needed);
  return outcomes.map((outcome) => (outcome as { value: T }).value);
}

/** Every client RPC, with real targets where the context supplies them. */
function everyClientCall(context: {
  username?: string;
  profileId?: string;
  collection?: string;
  accessHandle?: string;
  publicationHandle?: string;
  reportHandle?: string;
}): Array<[string, Record<string, unknown>]> {
  const id = () => randomUUID();
  return [
    [
      "community_profile_upsert",
      { p_username: context.username ?? uname(), p_display_name: "Again", p_bio: "" },
    ],
    ["community_profile_search", { p_username: context.username ?? uname() }],
    ["community_follow_set", { p_profile_id: context.profileId ?? id(), p_follow: true }],
    [
      "community_collection_draft",
      {
        p_collection_handle: context.collection ?? null,
        p_title: "T",
        p_source_label: "L",
        p_description: "",
      },
    ],
    ["community_source_entries", { p_cursor: null, p_limit: 20 }],
    [
      "community_preview_create",
      { p_collection_handle: context.collection ?? id(), p_entries: [] },
    ],
    [
      "community_publish",
      { p_collection_handle: context.collection ?? id(), p_preview_token: "x" },
    ],
    ["community_unpublish", { p_collection_handle: context.collection ?? id() }],
    ["community_access_request", { p_collection_handle: context.collection ?? id() }],
    [
      "community_access_decide",
      {
        p_access_handle: context.accessHandle ?? id(),
        p_decision: "approve",
        p_expected_revision: 0,
      },
    ],
    [
      "community_access_withdraw",
      { p_access_handle: context.accessHandle ?? id(), p_expected_revision: 0 },
    ],
    ["community_access_leave", { p_collection_handle: context.collection ?? id() }],
    [
      "community_collection_read",
      { p_collection_handle: context.collection ?? id(), p_cursor: null, p_limit: 20 },
    ],
    ["community_digest_read", { p_cursor: null, p_limit: 20 }],
    ["community_digest_seen", { p_publication_handles: [context.publicationHandle ?? id()] }],
    ["community_block_set", { p_profile_id: context.profileId ?? id(), p_block: true }],
    [
      "community_report_create",
      {
        p_publication_handle: context.publicationHandle ?? id(),
        p_reason_code: "spam",
        p_reason_text: "",
      },
    ],
    ["community_moderation_list", { p_cursor: null, p_limit: 20 }],
    [
      "community_moderation_decide",
      { p_report_handle: context.reportHandle ?? id(), p_decision: "dismiss", p_reason: "" },
    ],
    // Last, so a broken implementation cannot mask the calls above by deactivating first.
    ["community_profile_deactivate", {}],
  ];
}
/**
 * One digest of every Community table's rows, the switch included, so a call
 * that writes (or re-enables the switch) and then reports `unavailable` is
 * still caught. Callers take both digests while the switch is off (Copilot P2
 * on #2408 at a5da2191).
 */
function communityStateFingerprint(): string {
  const parts = TABLES.map(
    ([table]) =>
      `(SELECT coalesce(string_agg(x::text, '|' ORDER BY x::text), '') FROM public.${table} x)`,
  );
  return sql(`SELECT md5(concat_ws('#', ${parts.join(", ")}));`);
}

/** One digest of a collection row and all its publication rows. */
function collectionState(handle: string): string {
  return sql(`SELECT md5(concat_ws('#',
      (SELECT c::text FROM public.community_collections c WHERE c.handle = ${lit(handle)}),
      (SELECT coalesce(string_agg(i::text, '|' ORDER BY i::text), '')
         FROM public.community_collection_items i
         JOIN public.community_collections c ON c.id = i.collection_id
        WHERE c.handle = ${lit(handle)})));`);
}

/** Returns every call whose result was not the generic `unavailable`. */
async function notUnavailable(
  client: SupabaseClient,
  calls: Array<[string, Record<string, unknown>]>,
): Promise<string[]> {
  const leaks: string[] = [];
  for (const [fn, args] of calls) {
    const result = await rpc(client, fn, args);
    if (!(result.ok === false && result.code === "unavailable")) leaks.push(fn);
  }
  return leaks;
}

d("community v1 authority (local DB)", () => {
  beforeAll(async () => {
    requireLocalCommunityEnvironment(process.env);
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Before the migration exists (Task 2A) the switch table is absent; the
    // guard keeps fixture setup from failing so each case fails on its own call.
    sql(`DO $$ BEGIN
      IF to_regclass('public.community_feature_state') IS NOT NULL THEN
        UPDATE public.community_feature_state SET enabled = true;
      END IF; END $$;`);
  }, 30_000);

  afterAll(async () => {
    try {
      sql(`DO $$ BEGIN
        IF to_regclass('public.community_feature_state') IS NOT NULL THEN
          UPDATE public.community_feature_state SET enabled = false;
        END IF; END $$;`);
    } finally {
      for (const id of createdUsers) {
        try {
          await admin.auth.admin.deleteUser(id);
        } catch {
          /* best-effort; the database is disposable */
        }
      }
    }
  }, 120_000);

  // ── Isolation ────────────────────────────────────────────────────────────
  it("T-ISO-01 direct table access is denied with 42501 for anon and authenticated", async () => {
    const user = await participant("iso1");
    const anon = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const codes: string[] = [];
    for (const [table, column, kind] of TABLES) {
      const filterValue = kind === "boolean" ? false : randomUUID();
      for (const client of [anon, user.client]) {
        const from = () => client.from(table as never);
        codes.push(
          `${table}:select:${(await from().select("*")).error?.code}`,
          `${table}:insert:${(await from().insert({} as never)).error?.code}`,
          `${table}:update:${
            (
              await from()
                .update({} as never)
                .eq(column, filterValue as never)
            ).error?.code
          }`,
          `${table}:delete:${
            (
              await from()
                .delete()
                .eq(column, filterValue as never)
            ).error?.code
          }`,
        );
      }
    }
    expect(codes.filter((entry) => !entry.endsWith(":42501"))).toEqual([]);
  }, 120_000);

  it("T-ISO-02 approval of collection A never authorizes collection B's handles", async () => {
    const owner = await participant("iso2o");
    const viewer = await participant("iso2v");
    const a = await newCollection(owner, "A");
    const b = await newCollection(owner, "B");
    const entryA = diaryEntry(owner);
    const entryB = diaryEntry(owner);
    await publish(owner, a, [draft(entryA, { sharedNote: "a" })]);
    await publish(owner, b, [draft(entryB, { sharedNote: "b" })]);
    await grant(owner, viewer, a);
    ok(await follow(viewer, owner));
    const derivativeA = seedDerivativeItem(owner, a, diaryEntry(owner));
    const derivativeB = seedDerivativeItem(owner, b, diaryEntry(owner));
    const bItems = ok(await read(owner, b)).items;

    ok(await read(viewer, a));
    denied(await read(viewer, b), "unavailable");
    const digestHandles = handlesOf((await digest(viewer)).items);
    expect(digestHandles.some((h) => handlesOf(bItems).includes(h))).toBe(false);
    expect(ok(await mediaLookup(viewer, derivativeA)).objectKey).toEqual(expect.any(String));
    denied(await mediaLookup(viewer, derivativeB), "unavailable");
  }, 90_000);

  it("T-ISO-03 a caller cannot preview or publish another owner's diary entry", async () => {
    const owner = await participant("iso3o");
    const attacker = await participant("iso3a");
    const victimEntry = diaryEntry(owner, { note: "victim private note" });
    const attackerCollection = await newCollection(attacker);
    const result = await rpc(attacker.client, "community_preview_create", {
      p_collection_handle: attackerCollection,
      p_entries: [draft(victimEntry, { includeStage: true })],
    });
    expect(result.ok).toBe(false);
    expect(["invalid", "unavailable"]).toContain((result as { code: string }).code);
    expect(
      sql(`SELECT count(*) FROM public.community_preview_tokens t
             JOIN public.community_collections c ON c.id = t.collection_id
            WHERE c.handle = ${lit(attackerCollection)};`),
    ).toBe("0");
    expect(
      sql(
        `SELECT count(*) FROM public.community_collection_items WHERE source_entry_id = ${lit(victimEntry)};`,
      ),
    ).toBe("0");
  }, 60_000);

  it("T-ISO-04 an approved reader cannot publish, decide, unpublish or edit the owner's collection", async () => {
    const { owner, collection } = await publishedOwner("iso4");
    const reader = await participant("iso4r");
    await grant(owner, reader, collection);
    const other = await participant("iso4x");
    const pending = await requestAccess(other, collection);
    const ownerPreview = await preview(owner, collection, [draft(diaryEntry(owner))]);
    // Every denied call below leaves the collection and its publications as they
    // are, not merely the item count (Copilot P2 on #2408 at a5da2191).
    const stateBefore = collectionState(collection);
    const unchanged = () => expect(collectionState(collection)).toBe(stateBefore);

    denied(
      await rpc(reader.client, "community_publish", {
        p_collection_handle: collection,
        p_preview_token: ownerPreview.previewToken,
      }),
      "unavailable",
    );
    unchanged();
    denied(
      await rpc(reader.client, "community_access_decide", {
        p_access_handle: pending,
        p_decision: "approve",
        p_expected_revision: accessRevision(pending),
      }),
      "unavailable",
    );
    unchanged();
    denied(
      await rpc(reader.client, "community_unpublish", { p_collection_handle: collection }),
      "unavailable",
    );
    unchanged();
    denied(
      await rpc(reader.client, "community_collection_draft", {
        p_collection_handle: collection,
        p_title: "Hijacked",
        p_source_label: "x",
        p_description: "x",
      }),
      "unavailable",
    );
    unchanged();
    expect(accessState(pending)).toBe("pending");
    expect(ok(await read(reader, collection)).items).toHaveLength(1);
  }, 90_000);

  it("T-ISO-05 no RPC accepts an actor; extra identity keys are ignored or invalid", async () => {
    const owner = await participant("iso5o");
    const attacker = await participant("iso5a");
    const ownerCollection = await newCollection(owner);
    const revisionBefore = sql(
      `SELECT revision FROM public.community_collections WHERE handle = ${lit(ownerCollection)};`,
    );
    // PostgREST resolves functions by named arguments: an actor argument matches no overload.
    expect(
      await rpcErrorCode(attacker.client, "community_collection_draft", {
        p_idempotency_key: randomUUID(),
        p_collection_handle: ownerCollection,
        p_title: "Hijacked",
        p_source_label: "x",
        p_description: "x",
        p_user_id: owner.id,
      }),
    ).toBe("PGRST202");
    const attackerCollection = await newCollection(attacker);
    const result = await rpc(attacker.client, "community_preview_create", {
      p_collection_handle: attackerCollection,
      p_entries: [{ ...draft(diaryEntry(owner)), userId: owner.id, ownerId: owner.communityId }],
    });
    expect(result.ok).toBe(false);
    expect(
      sql(
        `SELECT revision FROM public.community_collections WHERE handle = ${lit(ownerCollection)};`,
      ),
    ).toBe(revisionBefore);
  }, 60_000);

  // ── Profiles ─────────────────────────────────────────────────────────────
  it("T-PRO-01 opt-in copies nothing from the private profile and signup creates no community profile", async () => {
    const bystander = await newUser("pro1b");
    const user = await newUser("pro1");
    sql(
      `UPDATE public.profiles SET display_name = 'Private Profile Name' WHERE user_id = ${lit(user.id)};`,
    );
    const card = ok(
      await rpc(user.client, "community_profile_upsert", {
        p_username: uname(),
        p_display_name: "Shown Name",
        p_bio: "",
      }),
    );
    expect(card.displayName).toBe("Shown Name");
    expect(Object.keys(card).sort()).toEqual(["bio", "communityId", "displayName", "username"]);
    expect(JSON.stringify(card)).not.toMatch(/Private Profile Name|example\.test/);
    expect(
      sql(`SELECT count(*) FROM public.community_profiles WHERE user_id = ${lit(bystander.id)};`),
    ).toBe("0");
  }, 60_000);

  it("T-PRO-02 concurrent claims of one username yield exactly one ok and one conflict", async () => {
    const first = await newUser("pro2a");
    const second = await newUser("pro2b");
    const base = uname();
    const results = await Promise.all([
      rpc(first.client, "community_profile_upsert", {
        p_username: base.toUpperCase(),
        p_display_name: "A",
        p_bio: "",
      }),
      rpc(second.client, "community_profile_upsert", {
        p_username: base,
        p_display_name: "B",
        p_bio: "",
      }),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok).map((r) => (r as { code: string }).code)).toEqual([
      "conflict",
    ]);
    expect(
      sql(`SELECT count(*) FROM public.community_profiles WHERE username = ${lit(base)};`),
    ).toBe("1");
  }, 60_000);

  it("T-PRO-03 anonymous, unverified, inactive and deleting callers get unavailable from every RPC", async () => {
    const { owner, collection, published } = await publishedOwner("pro3");
    expect(published.collectionRevision).toEqual(expect.any(Number));
    const target = { profileId: owner.communityId, collection };

    // No session: EXECUTE is revoked from anon, so Postgres refuses before the body runs.
    const noSession = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonCodes = new Set<string>();
    for (const [fn, args] of everyClientCall(target)) {
      anonCodes.add(
        await rpcErrorCode(
          noSession,
          fn,
          MUTATING.has(fn) ? { p_idempotency_key: randomUUID(), ...args } : args,
        ),
      );
    }
    expect([...anonCodes]).toEqual(["42501"]);

    // Anonymous auth: refused by GoTrue, or every RPC is unavailable.
    const anonymous = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: anonymousError } = await anonymous.auth.signInAnonymously();
    // A disabled anonymous sign-in sends no RPC as an anonymous user, so it
    // proves nothing: the case fails BLOCKED instead of passing (Codex P2 on
    // #2414 at 77d424b1). Enabling it locally is a supabase/config.toml change.
    if (anonymousError) {
      throw new Error(
        "BLOCKED: anonymous sign-in is disabled; the anonymous-caller probe did not run.",
      );
    } else {
      expect(await notUnavailable(anonymous, everyClientCall(target))).toEqual([]);
    }

    const unverified = await unverifiedUser("pro3u");
    expect(await notUnavailable(unverified.client, everyClientCall(target))).toEqual([]);
    expect(
      sql(`SELECT count(*) FROM public.community_profiles WHERE user_id = ${lit(unverified.id)};`),
    ).toBe("0");

    const inactive = await participant("pro3i");
    const inactiveCollection = await newCollection(inactive);
    ok(await rpc(inactive.client, "community_profile_deactivate", {}));
    const inactiveCalls = everyClientCall({ ...target, collection: inactiveCollection }).filter(
      ([fn]) => fn !== "community_profile_upsert", // re-opt-in is the one allowed call (T-LIFE-01)
    );
    expect(await notUnavailable(inactive.client, inactiveCalls)).toEqual([]);

    const deleting = await participant("pro3d");
    ok(await rpc(admin, "community_account_deletion_begin", { p_user_id: deleting.id }));
    expect(
      await notUnavailable(
        deleting.client,
        everyClientCall({ ...target, username: deleting.username }),
      ),
    ).toEqual([]);
  }, 180_000);

  it("T-PRO-04 confusable, reserved and out-of-bounds profile fields are invalid", async () => {
    const user = await newUser("pro4");
    const attempts: Array<[string, string, string]> = [
      ["growerK", "Name", ""],
      ["admin", "Name", ""],
      ["ab", "Name", ""],
      ["a".repeat(31), "Name", ""],
      [uname(), "n".repeat(61), ""],
      [uname(), "Name", "b".repeat(281)],
    ];
    for (const [p_username, p_display_name, p_bio] of attempts) {
      denied(
        await rpc(user.client, "community_profile_upsert", { p_username, p_display_name, p_bio }),
        "invalid",
      );
    }
    expect(
      sql(`SELECT count(*) FROM public.community_profiles WHERE user_id = ${lit(user.id)};`),
    ).toBe("0");
  }, 60_000);

  // ── Follows ──────────────────────────────────────────────────────────────
  it("T-FOL-01 following grants no body, digest or media access", async () => {
    const { owner, collection, entries } = await publishedOwner("fol1");
    const derivative = seedDerivativeItem(owner, collection, entries[0]);
    const follower = await participant("fol1f");
    expect(ok(await follow(follower, owner)).following).toBe(true);
    denied(await read(follower, collection), "unavailable");
    expect((await digest(follower)).items).toEqual([]);
    denied(await mediaLookup(follower, derivative), "unavailable");
  }, 60_000);

  it("T-FOL-02 unfollow keeps an approved collection readable but drops it from the digest", async () => {
    const owner = await participant("fol2");
    const collection = await newCollection(owner);
    const viewer = await participant("fol2v");
    // Publish once so the collection is active, then approve, then publish the digest item.
    await publish(owner, collection, [draft(diaryEntry(owner), { sharedNote: "first" })]);
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    await publish(owner, collection, [draft(diaryEntry(owner), { sharedNote: "second" })]);
    expect((await digest(viewer)).items.length).toBeGreaterThan(0);
    expect(ok(await follow(viewer, owner, false)).following).toBe(false);
    expect(ok(await read(viewer, collection)).items.length).toBeGreaterThan(0);
    expect((await digest(viewer)).items).toEqual([]);
  }, 60_000);

  // ── Access ───────────────────────────────────────────────────────────────
  it("T-ACC-01 pending, declined, revoked and left readers cannot read the body", async () => {
    const { owner, collection } = await publishedOwner("acc1");
    const pending = await participant("acc1p");
    await requestAccess(pending, collection);
    const declined = await participant("acc1d");
    ok(await decide(owner, await requestAccess(declined, collection), "decline"));
    const revoked = await participant("acc1r");
    ok(await decide(owner, await grant(owner, revoked, collection), "revoke"));
    const left = await participant("acc1l");
    await grant(owner, left, collection);
    ok(await rpc(left.client, "community_access_leave", { p_collection_handle: collection }));
    for (const viewer of [pending, declined, revoked, left]) {
      denied(await read(viewer, collection), "unavailable");
    }
  }, 90_000);

  it("T-ACC-02 withdraw racing approve never yields approved-after-withdraw", async () => {
    const { owner, collection } = await publishedOwner("acc2");
    const viewer = await participant("acc2v");
    const accessHandle = await requestAccess(viewer, collection);
    const expected = accessRevision(accessHandle);
    const [withdraw, approve] = await race(
      await holdRowLock("community_collection_access", "handle", accessHandle),
      [
        () =>
          rpc(viewer.client, "community_access_withdraw", {
            p_access_handle: accessHandle,
            p_expected_revision: expected,
          }),
        () =>
          rpc(owner.client, "community_access_decide", {
            p_access_handle: accessHandle,
            p_decision: "approve",
            p_expected_revision: expected,
          }),
      ],
    );
    expect([withdraw.ok, approve.ok].filter(Boolean)).toHaveLength(1);
    const loser = withdraw.ok ? approve : withdraw;
    denied(loser, "conflict");
    expect(accessState(accessHandle)).toBe(withdraw.ok ? "left" : "approved");
    if (withdraw.ok) denied(await read(viewer, collection), "unavailable");
  }, 60_000);

  it("T-ACC-03 after revoke, old handles fail for read, digest, media and seen", async () => {
    const owner = await participant("acc3");
    const collection = await newCollection(owner);
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    const viewer = await participant("acc3v");
    const accessHandle = await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    await publish(owner, collection, [draft(diaryEntry(owner), { sharedNote: "after approval" })]);
    const derivative = seedDerivativeItem(owner, collection, diaryEntry(owner));
    const before = ok(await read(viewer, collection)).items;
    expect(before.length).toBeGreaterThan(0);
    ok(await mediaLookup(viewer, derivative));

    ok(await decide(owner, accessHandle, "revoke"));
    denied(await read(viewer, collection), "unavailable");
    expect((await digest(viewer)).items).toEqual([]);
    denied(await mediaLookup(viewer, derivative), "unavailable");
    expect(
      ok(
        await rpc(viewer.client, "community_digest_seen", {
          p_publication_handles: handlesOf(before),
        }),
      ).marked,
    ).toBe(0);
  }, 90_000);

  it("T-ACC-04 re-request after revoke is rate limited for 24 h, then needs a fresh approval", async () => {
    const { owner, collection } = await publishedOwner("acc4");
    const viewer = await participant("acc4v");
    const accessHandle = await grant(owner, viewer, collection);
    ok(await decide(owner, accessHandle, "revoke"));
    denied(
      await rpc(viewer.client, "community_access_request", { p_collection_handle: collection }),
      "rate_limited",
    );
    sql(`UPDATE public.community_collection_access SET decided_at = now() - interval '25 hours',
                                                       requested_at = now() - interval '25 hours'
          WHERE handle = ${lit(accessHandle)};`);
    const again = ok(
      await rpc(viewer.client, "community_access_request", { p_collection_handle: collection }),
    );
    expect(again.state).toBe("pending");
    denied(await read(viewer, collection), "unavailable");
  }, 60_000);

  // ── Publishing ───────────────────────────────────────────────────────────
  it("T-PUB-01 a multi-entry publish delivers exactly the previewed entries", async () => {
    const owner = await participant("pub1");
    const collection = await newCollection(owner);
    const viewer = await participant("pub1v");
    const watered = diaryEntry(owner, {
      stage: "flower",
      watering: { volume_ml: 500, ph: 6.2, ec_ms_cm: 1.4 },
    });
    const plain = diaryEntry(owner);
    // The owner-selected date (#2297): the UTC date of entry_at, inside the server's ±1 day bound.
    const selectedDate = sql(
      `SELECT to_char((entry_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') FROM public.diary_entries WHERE id = ${lit(watered)};`,
    );
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    const { preview: shown } = await publish(owner, collection, [
      draft(watered, {
        sharedNote: "Watered to runoff",
        occurredDate: selectedDate,
        includeStage: true,
        measurementKeys: ["watering.volume_ml", "watering.ph", "watering.ec_ms_cm"],
      }),
      draft(plain, { sharedNote: "Checked the canopy" }),
    ]);
    const display = (item: Json) =>
      JSON.stringify(
        [
          "sourceJournalLabel",
          "occurredDate",
          "action",
          "note",
          "stage",
          "measurements",
          "derivativeHandle",
        ].map((key) => item[key]),
      );
    const delivered = ok(await read(viewer, collection)).items;
    expect(delivered.map(display)).toEqual(shown.entries.map(display));
    // The three selected measurements, each against the seeded watering row
    // (500 ml, pH 6.2, EC 1.4), all manual: never invented, zeroed or swapped.
    const measured: Json[] = delivered[0].measurements;
    expect(measured).toHaveLength(3);
    for (const m of measured) {
      expect(m.provenance).toBe("manual");
      expect(typeof m.name).toBe("string");
      expect(typeof m.unit).toBe("string");
    }
    const valueOf = (pattern: RegExp) =>
      measured.filter((m) => pattern.test(String(m.name))).map((m) => m.value);
    expect(valueOf(/volume/i)).toEqual([500]);
    expect(valueOf(/(^|[._\s])ph($|[._\s])/i)).toEqual([6.2]);
    expect(valueOf(/(^|[._\s])ec($|[._\s])/i)).toEqual([1.4]);
    // Exact reader-facing fields: no full instant, source id, preview binding or private key.
    const publicationKeys = [
      "action",
      "derivativeHandle",
      "measurements",
      "note",
      "occurredDate",
      "publicationHandle",
      "publishedAt",
      "revision",
      "sourceJournalLabel",
      "stage",
    ];
    const digestItems = (await digest(viewer)).items;
    expect(digestItems).toHaveLength(2);
    for (const item of [...delivered, ...digestItems.map((entry: Json) => entry.publication)]) {
      expect(Object.keys(item).sort()).toEqual(publicationKeys);
    }
    for (const entry of digestItems) {
      expect(Object.keys(entry).sort()).toEqual([
        "collectionTitle",
        "ownerDisplayName",
        "ownerUsername",
        "publication",
        "sourceJournalLabel",
      ]);
    }
    expect(delivered[0].occurredDate).toBe(selectedDate);
    expect(delivered[0].occurredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(delivered[1].occurredDate).toBeNull();
    const serialized = JSON.stringify([delivered, digestItems]);
    for (const secret of [watered, plain, owner.id, owner.communityId]) {
      expect(serialized).not.toContain(secret);
    }
  }, 60_000);

  it("T-PUB-02 later private entries and note edits never appear in a publication", async () => {
    const { owner, collection, entries } = await publishedOwner("pub2");
    const viewer = await participant("pub2v");
    await grant(owner, viewer, collection);
    const before = ok(await read(viewer, collection)).items;
    sql(
      `UPDATE public.diary_entries SET note = 'EDITED PRIVATE NOTE' WHERE id = ${lit(entries[0])};`,
    );
    diaryEntry(owner, { note: "NEW PRIVATE ENTRY" });
    const after = ok(await read(viewer, collection)).items;
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toMatch(/EDITED PRIVATE NOTE|NEW PRIVATE ENTRY|private pub2/);
  }, 60_000);

  it("T-PUB-03 expired, consumed, foreign, source-edited and audience-changed previews are stale", async () => {
    const owner = await participant("pub3");
    const collection = await newCollection(owner);
    const entry = diaryEntry(owner);
    const publishWith = (who: Actor, handle: string, token: string) =>
      rpc(who.client, "community_publish", { p_collection_handle: handle, p_preview_token: token });
    // A rejected publish leaves the token's collection and the requested one
    // unchanged; the code alone could follow a write (Copilot P2 on #2408 at a5da2191).
    const rejectedWith = async (who: Actor, handle: string, token: string) => {
      const before = [collectionState(collection), collectionState(handle)];
      denied(await publishWith(who, handle, token), "stale_preview");
      expect([collectionState(collection), collectionState(handle)]).toEqual(before);
    };

    const expired = await preview(owner, collection, [draft(entry)]);
    sql(`UPDATE public.community_preview_tokens SET expires_at = now() - interval '1 minute'
          WHERE collection_id = (SELECT id FROM public.community_collections WHERE handle = ${lit(collection)});`);
    await rejectedWith(owner, collection, expired.previewToken);

    const consumed = await preview(owner, collection, [draft(entry)]);
    ok(await publishWith(owner, collection, consumed.previewToken));
    await rejectedWith(owner, collection, consumed.previewToken);

    const other = await participant("pub3x");
    const otherCollection = await newCollection(other);
    const foreign = await preview(owner, collection, [draft(entry)]);
    await rejectedWith(other, otherCollection, foreign.previewToken);

    // The same owner reusing a preview on another of their own collections is
    // stale too: the token binds to its collection, not only its owner
    // (Copilot P2 on #2414 at 77d424b1).
    const ownerSecond = await newCollection(owner, "Second tent");
    const rebound = await preview(owner, collection, [draft(entry)]);
    await rejectedWith(owner, ownerSecond, rebound.previewToken);

    const staged = await preview(owner, collection, [draft(entry, { includeStage: true })]);
    sql(`UPDATE public.diary_entries SET stage = 'flower' WHERE id = ${lit(entry)};`);
    await rejectedWith(owner, collection, staged.previewToken);

    const viewer = await participant("pub3v");
    const accessHandle = await requestAccess(viewer, collection);
    const audience = await preview(owner, collection, [draft(entry)]);
    ok(await decide(owner, accessHandle, "approve"));
    await rejectedWith(owner, collection, audience.previewToken);
  }, 90_000);

  it("T-PUB-04 one idempotency key replays one revision; two keys racing one token publish once", async () => {
    const owner = await participant("pub4");
    const collection = await newCollection(owner);
    const revision = () =>
      Number(
        sql(`SELECT revision FROM public.community_collections WHERE handle = ${lit(collection)};`),
      );
    const first = await preview(owner, collection, [draft(diaryEntry(owner))]);
    const key = randomUUID();
    const call = () =>
      rpc(owner.client, "community_publish", {
        p_idempotency_key: key,
        p_collection_handle: collection,
        p_preview_token: first.previewToken,
      });
    const before = revision();
    const once = await call();
    const replay = await call();
    expect(replay).toEqual(once);
    expect(revision()).toBe(before + 1);

    const second = await preview(owner, collection, [draft(diaryEntry(owner))]);
    const racing = await race(await holdRowLock("community_collections", "handle", collection), [
      () =>
        rpc(owner.client, "community_publish", {
          p_collection_handle: collection,
          p_preview_token: second.previewToken,
        }),
      () =>
        rpc(owner.client, "community_publish", {
          p_collection_handle: collection,
          p_preview_token: second.previewToken,
        }),
    ]);
    expect(racing.filter((r) => r.ok)).toHaveLength(1);
    denied(racing.find((r) => !r.ok) as Result, "stale_preview");
    expect(revision()).toBe(before + 2);
  }, 60_000);

  it("T-PUB-05 publish racing revoke or block is never readable after the revoke", async () => {
    const owner = await participant("pub5");
    const collection = await newCollection(owner);
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    const revoked = await participant("pub5r");
    const revokedAccess = await grant(owner, revoked, collection);
    const blocked = await participant("pub5b");
    await grant(owner, blocked, collection);
    const pending = await preview(owner, collection, [
      draft(diaryEntry(owner), { sharedNote: "racing" }),
    ]);
    const expected = accessRevision(revokedAccess);
    await race(await holdRowLock("community_collections", "handle", collection), [
      () =>
        rpc(owner.client, "community_publish", {
          p_collection_handle: collection,
          p_preview_token: pending.previewToken,
        }),
      () =>
        rpc(owner.client, "community_access_decide", {
          p_access_handle: revokedAccess,
          p_decision: "revoke",
          p_expected_revision: expected,
        }),
      () =>
        rpc(owner.client, "community_block_set", {
          p_profile_id: blocked.communityId,
          p_block: true,
        }),
    ]);
    denied(await read(revoked, collection), "unavailable");
    denied(await read(blocked, collection), "unavailable");
  }, 60_000);

  it("T-PUB-06 republishing one changed entry renews only that slot's handle", async () => {
    const owner = await participant("pub6");
    const collection = await newCollection(owner);
    const viewer = await participant("pub6v");
    const kept = diaryEntry(owner);
    const changed = diaryEntry(owner);
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    await publish(owner, collection, [
      draft(kept, { sharedNote: "same" }),
      draft(changed, { sharedNote: "v1" }),
    ]);
    const byNote = (items: Json[]) =>
      new Map(items.map((item) => [item.note as string, item.publicationHandle as string]));
    const first = byNote(ok(await read(viewer, collection)).items);
    // Both slots exist before any handle is compared (Copilot P2 on #2408 at a5da2191).
    expect([...first.keys()].sort()).toEqual(["same", "v1"]);
    expect(first.get("same")).toEqual(expect.any(String));
    expect(first.get("v1")).toEqual(expect.any(String));
    await publish(owner, collection, [
      draft(kept, { sharedNote: "same" }),
      draft(changed, { sharedNote: "v2" }),
    ]);
    const secondItems = ok(await read(viewer, collection)).items;
    const second = handlesOf(secondItems);
    const renewed = byNote(secondItems);
    expect(second).toHaveLength(2);
    expect([...renewed.keys()].sort()).toEqual(["same", "v2"]);
    // The unchanged slot keeps its handle; only the changed slot is renewed.
    expect(renewed.get("same")).toBe(first.get("same"));
    expect(renewed.get("v2")).toEqual(expect.any(String));
    expect(renewed.get("v2")).not.toBe(first.get("v1"));
    expect(renewed.has("v1")).toBe(false);
    const digestHandles = handlesOf((await digest(viewer)).items);
    expect([...digestHandles].sort()).toEqual([...second].sort());
  }, 60_000);

  it("T-PUB-07 a measurement or stage absent from the source is invalid, never invented", async () => {
    const owner = await participant("pub7");
    const collection = await newCollection(owner);
    const noWatering = diaryEntry(owner);
    const noStage = diaryEntry(owner, { stage: null });
    denied(
      await rpc(owner.client, "community_preview_create", {
        p_collection_handle: collection,
        p_entries: [draft(noWatering, { measurementKeys: ["watering.volume_ml"] })],
      }),
      "invalid",
    );
    denied(
      await rpc(owner.client, "community_preview_create", {
        p_collection_handle: collection,
        p_entries: [draft(noStage, { includeStage: true })],
      }),
      "invalid",
    );
  }, 60_000);

  // ── Blocks ───────────────────────────────────────────────────────────────
  it("T-BLK-01 block revokes grants both ways and removes follows; unblock restores nothing", async () => {
    const a = await publishedOwner("blk1a");
    const b = await publishedOwner("blk1b");
    const aToB = await grant(b.owner, a.owner, b.collection);
    const bToA = await grant(a.owner, b.owner, a.collection);
    ok(await follow(a.owner, b.owner));
    ok(await follow(b.owner, a.owner));
    const followCount = () =>
      sql(`SELECT count(*) FROM public.community_follows
            WHERE (follower_id, followed_id) IN ((${lit(a.owner.communityId)}::uuid, ${lit(b.owner.communityId)}::uuid),
                                                 (${lit(b.owner.communityId)}::uuid, ${lit(a.owner.communityId)}::uuid));`);
    ok(
      await rpc(a.owner.client, "community_block_set", {
        p_profile_id: b.owner.communityId,
        p_block: true,
      }),
    );
    expect(followCount()).toBe("0");
    expect([accessState(aToB), accessState(bToA)]).toEqual(["revoked", "revoked"]);
    denied(await read(a.owner, b.collection), "unavailable");
    denied(await read(b.owner, a.collection), "unavailable");
    ok(
      await rpc(a.owner.client, "community_block_set", {
        p_profile_id: b.owner.communityId,
        p_block: false,
      }),
    );
    expect(followCount()).toBe("0");
    expect([accessState(aToB), accessState(bToA)]).toEqual(["revoked", "revoked"]);
    denied(await read(a.owner, b.collection), "unavailable");
  }, 90_000);

  it("T-BLK-02 a block does not hide an already-filed report from the moderator", async () => {
    const { owner, collection } = await publishedOwner("blk2");
    const reporter = await participant("blk2r");
    await grant(owner, reporter, collection);
    const item = ok(await read(reporter, collection)).items[0];
    const report = ok(
      await rpc(reporter.client, "community_report_create", {
        p_publication_handle: item.publicationHandle,
        p_reason_code: "spam",
        p_reason_text: "",
      }),
    );
    ok(
      await rpc(owner.client, "community_block_set", {
        p_profile_id: reporter.communityId,
        p_block: true,
      }),
    );
    const moderator = await participant("blk2m");
    sql(`INSERT INTO public.community_moderators (user_id) VALUES (${lit(moderator.id)});`);
    const cases = ok(
      await rpc(moderator.client, "community_moderation_list", { p_cursor: null, p_limit: 50 }),
    ).cases;
    expect(cases.map((c: Json) => c.reportHandle)).toContain(report.reportHandle);
  }, 60_000);

  // ── Source validity and lifecycle ────────────────────────────────────────
  it("T-SRC-01 a retracted or deleted source denies its item and filters the digest", async () => {
    const owner = await participant("src1");
    const collection = await newCollection(owner);
    const viewer = await participant("src1v");
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    const retracted = diaryEntry(owner);
    const deleted = diaryEntry(owner);
    await publish(owner, collection, [
      draft(retracted, { sharedNote: "r" }),
      draft(deleted, { sharedNote: "d" }),
    ]);
    expect(ok(await read(viewer, collection)).items).toHaveLength(2);
    sql(`UPDATE public.diary_entries SET retracted_at = now() WHERE id = ${lit(retracted)};`);
    // Retraction alone removes only its own item; the still-valid source
    // stays (Copilot P2 on #2414 at 77d424b1).
    const notes = (items: Json[]) => items.map((item) => item.note as string);
    expect(notes(ok(await read(viewer, collection)).items)).toEqual(["d"]);
    expect((await digest(viewer)).items.map((item: Json) => item.publication.note)).toEqual(["d"]);
    sql(`DELETE FROM public.diary_entries WHERE id = ${lit(deleted)};`);
    const after = await read(viewer, collection);
    if (after.ok) expect(after.value.items).toEqual([]);
    else denied(after, "unavailable");
    expect((await digest(viewer)).items).toEqual([]);
  }, 60_000);

  it("T-LIFE-01 opt-out then re-opt-in restores no grants, follows or publications", async () => {
    const { owner, collection } = await publishedOwner("life1");
    const viewer = await participant("life1v");
    const accessHandle = await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    ok(await rpc(owner.client, "community_profile_deactivate", {}));
    denied(await read(viewer, collection), "unavailable");
    ok(
      await rpc(owner.client, "community_profile_upsert", {
        p_username: owner.username,
        p_display_name: "Back again",
        p_bio: "",
      }),
    );
    denied(await read(viewer, collection), "unavailable");
    // The owner needs no reader grant, so this read shows whether the old
    // publications came back (Copilot P2 on #2414 at 77d424b1).
    const ownView = await read(owner, collection);
    if (ownView.ok) expect(ownView.value.items).toEqual([]);
    else denied(ownView, "unavailable");
    expect(accessState(accessHandle)).toBe("revoked");
    expect(
      sql(
        `SELECT count(*) FROM public.community_follows WHERE followed_id = ${lit(owner.communityId)};`,
      ),
    ).toBe("0");
  }, 60_000);

  it("T-LIFE-02 deletion begin is idempotent, never reactivates, and auth delete anonymizes reports", async () => {
    const target = await publishedOwner("life2t");
    const leaving = await participant("life2");
    await grant(target.owner, leaving, target.collection);
    const item = ok(await read(leaving, target.collection)).items[0];
    const report = ok(
      await rpc(leaving.client, "community_report_create", {
        p_publication_handle: item.publicationHandle,
        p_reason_code: "other",
        p_reason_text: "",
      }),
    );
    ok(await rpc(admin, "community_account_deletion_begin", { p_user_id: leaving.id }));
    ok(await rpc(admin, "community_account_deletion_begin", { p_user_id: leaving.id }));
    denied(
      await rpc(leaving.client, "community_profile_upsert", {
        p_username: leaving.username,
        p_display_name: "Undo",
        p_bio: "",
      }),
      "unavailable",
    );
    expect(
      sql(`SELECT lifecycle FROM public.community_profiles WHERE user_id = ${lit(leaving.id)};`),
    ).toBe("deleting");
    const { error } = await admin.auth.admin.deleteUser(leaving.id);
    expect(error).toBeNull();
    expect(
      sql(`SELECT count(*) FROM public.community_profiles WHERE user_id = ${lit(leaving.id)};`),
    ).toBe("0");
    expect(
      sql(`SELECT coalesce(reporter_id::text, 'null') || '|' || status FROM public.community_reports
            WHERE handle = ${lit(report.reportHandle)};`),
    ).toBe("null|pending");
  }, 90_000);

  // ── Moderation ───────────────────────────────────────────────────────────
  it("T-MOD-01 a report leaves the collection readable and hides the reporter from the owner", async () => {
    const { owner, collection } = await publishedOwner("mod1");
    const reporter = await participant("mod1r");
    await grant(owner, reporter, collection);
    const item = ok(await read(reporter, collection)).items[0];
    ok(
      await rpc(reporter.client, "community_report_create", {
        p_publication_handle: item.publicationHandle,
        p_reason_code: "harassment",
        p_reason_text: "fixture",
      }),
    );
    expect(ok(await read(reporter, collection)).items).toHaveLength(1);
    const ownerViews = JSON.stringify([
      ok(await read(owner, collection)),
      ok(
        await rpc(owner.client, "community_collection_draft", {
          p_collection_handle: collection,
          p_title: "Tent log",
          p_source_label: "Main tent",
          p_description: "Synthetic fixture collection",
        }),
      ),
    ]);
    expect(ownerViews).not.toContain(reporter.username);
    expect(ownerViews).not.toContain(reporter.communityId);
  }, 60_000);

  it("T-MOD-02 operators and ordinary users cannot use moderation RPCs", async () => {
    const { owner, collection } = await publishedOwner("mod2");
    const reporter = await participant("mod2r");
    await grant(owner, reporter, collection);
    const item = ok(await read(reporter, collection)).items[0];
    const report = ok(
      await rpc(reporter.client, "community_report_create", {
        p_publication_handle: item.publicationHandle,
        p_reason_code: "spam",
        p_reason_text: "",
      }),
    );
    const operator = await participant("mod2op");
    sql(`INSERT INTO public.user_roles (user_id, role) VALUES (${lit(operator.id)}, 'operator');`);
    for (const actor of [operator, reporter]) {
      denied(
        await rpc(actor.client, "community_moderation_list", { p_cursor: null, p_limit: 20 }),
        "unavailable",
      );
      denied(
        await rpc(actor.client, "community_moderation_decide", {
          p_report_handle: report.reportHandle,
          p_decision: "remove",
          p_reason: "",
        }),
        "unavailable",
      );
    }
    expect(ok(await read(reporter, collection)).items).toHaveLength(1);
  }, 60_000);

  it("T-MOD-03 a moderator removal denies all reads and blocks owner republish", async () => {
    const { owner, collection } = await publishedOwner("mod3");
    const reader = await participant("mod3r");
    await grant(owner, reader, collection);
    const item = ok(await read(reader, collection)).items[0];
    const report = ok(
      await rpc(reader.client, "community_report_create", {
        p_publication_handle: item.publicationHandle,
        p_reason_code: "unsafe_advice",
        p_reason_text: "",
      }),
    );
    // A valid preview minted before the removal: publish must recheck it.
    const pending = await preview(owner, collection, [draft(diaryEntry(owner))]);
    const moderator = await participant("mod3m");
    sql(`INSERT INTO public.community_moderators (user_id) VALUES (${lit(moderator.id)});`);
    expect(
      ok(
        await rpc(moderator.client, "community_moderation_decide", {
          p_report_handle: report.reportHandle,
          p_decision: "remove",
          p_reason: "fixture removal",
        }),
      ).status,
    ).toBe("removed");
    denied(await read(reader, collection), "unavailable");
    denied(
      await rpc(owner.client, "community_publish", {
        p_collection_handle: collection,
        p_preview_token: pending.previewToken,
      }),
      "unavailable",
    );
    denied(await read(reader, collection), "unavailable");
    denied(
      await rpc(owner.client, "community_preview_create", {
        p_collection_handle: collection,
        p_entries: [draft(diaryEntry(owner))],
      }),
      "unavailable",
    );
    denied(
      await rpc(owner.client, "community_collection_draft", {
        p_collection_handle: collection,
        p_title: "Restored",
        p_source_label: "x",
        p_description: "",
      }),
      "unavailable",
    );
  }, 60_000);

  // ── Digest ───────────────────────────────────────────────────────────────
  it("T-DIG-01 the digest needs follow plus approval and excludes items before approval", async () => {
    const { owner, collection, published } = await publishedOwner("dig1", 2);
    expect(published.publishedAt).toEqual(expect.any(String));
    const viewer = await participant("dig1v");
    ok(await follow(viewer, owner));
    expect((await digest(viewer)).items).toEqual([]);
    await grant(owner, viewer, collection);
    expect((await digest(viewer)).items).toEqual([]);
    await publish(owner, collection, [draft(diaryEntry(owner), { sharedNote: "new" })]);
    const items = (await digest(viewer)).items;
    expect(items).toHaveLength(1);
    expect(items[0].publication.note).toBe("new");
  }, 60_000);

  it("T-DIG-02 equal publishedAt ties order by handle and keyset pages have no gaps or duplicates", async () => {
    const owner = await participant("dig2");
    const collection = await newCollection(owner);
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    const viewer = await participant("dig2v");
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    // One publish stamps every new item with the same transaction time.
    const ties = Array.from({ length: 5 }, (_, i) =>
      draft(diaryEntry(owner), { sharedNote: `tie ${i}` }),
    );
    await publish(owner, collection, ties);
    const all = (await digest(viewer)).items;
    // The oracle must be complete: exactly the five tie entries, each once.
    expect(all).toHaveLength(5);
    expect(new Set(handlesOf(all)).size).toBe(5);
    expect(all.map((item: Json) => item.publication.note).sort()).toEqual(
      Array.from({ length: 5 }, (_, i) => `tie ${i}`),
    );
    expect(new Set(all.map((item: Json) => item.publication.publishedAt)).size).toBe(1);
    const expected = handlesOf(all);
    expect(expected).toEqual([...expected].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));

    const pages: string[] = [];
    let page = await digest(viewer, null, 2);
    // A partial first page with a cursor, so the concurrent publish really lands
    // between pages (Copilot P2 on #2408 at a5da2191).
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toBe("");
    pages.push(...handlesOf(page.items));
    // A concurrent publish lands newer than every paged item and must not shift later pages.
    // Unchanged slots keep their current rows (D2), so only the new entry is new.
    await publish(owner, collection, [
      ...ties,
      draft(diaryEntry(owner), { sharedNote: "concurrent" }),
    ]);
    while (page.nextCursor) {
      page = await digest(viewer, page.nextCursor, 2);
      pages.push(...handlesOf(page.items));
    }
    expect(pages).toEqual(expected);
  }, 90_000);

  it("T-DIG-03 digest_seen marks only delivered, authorized handles", async () => {
    const a = await publishedOwner("dig3a");
    const b = await publishedOwner("dig3b");
    const viewer = await participant("dig3v");
    const accessA = await grant(a.owner, viewer, a.collection);
    await grant(b.owner, viewer, b.collection);
    ok(await follow(viewer, a.owner));
    ok(await follow(viewer, b.owner));
    // Published after approval and follow, so both handles are digest-deliverable.
    await publish(a.owner, a.collection, [draft(diaryEntry(a.owner), { sharedNote: "a new" })]);
    await publish(b.owner, b.collection, [draft(diaryEntry(b.owner), { sharedNote: "b new" })]);
    const handleA = ok(await read(viewer, a.collection)).items[0].publicationHandle;
    const handleB = ok(await read(viewer, b.collection)).items[0].publicationHandle;
    ok(await decide(a.owner, accessA, "revoke"));
    const marked = ok(
      await rpc(viewer.client, "community_digest_seen", {
        p_publication_handles: [handleA, handleB],
      }),
    ).marked;
    expect(marked).toBe(1);
    expect(
      sql(`SELECT string_agg(i.publication_handle::text, ',') FROM public.community_digest_seen s
             JOIN public.community_collection_items i ON i.id = s.item_id
            WHERE s.viewer_id = ${lit(viewer.communityId)};`),
    ).toBe(handleB);
  }, 60_000);

  // ── Formats, rate limits, kill switch ────────────────────────────────────
  it("T-FMT-01 every timestamp in every RPC response parses with readCommunityInstant", async () => {
    const owner = await participant("fmt1");
    const collection = await newCollection(owner);
    await publish(owner, collection, [draft(diaryEntry(owner))]);
    const viewer = await participant("fmt1v");
    await grant(owner, viewer, collection);
    ok(await follow(viewer, owner));
    const { preview: shown, published } = await publish(owner, collection, [
      draft(diaryEntry(owner)),
    ]);
    // At least one successful response from every RPC response shape (Codex P2 at d0a009fb).
    const requester = await participant("fmt1q");
    const accessRequested = ok(
      await rpc(requester.client, "community_access_request", { p_collection_handle: collection }),
    );
    const reported = ok(
      await rpc(viewer.client, "community_report_create", {
        p_publication_handle: ok(await read(viewer, collection)).items[0].publicationHandle,
        p_reason_code: "other",
        p_reason_text: "",
      }),
    );
    const moderator = await participant("fmt1m");
    sql(`INSERT INTO public.community_moderators (user_id) VALUES (${lit(moderator.id)});`);
    const bodies = [
      shown,
      published,
      ok(await read(viewer, collection)),
      await digest(viewer),
      ok(await rpc(owner.client, "community_source_entries", { p_cursor: null, p_limit: 20 })),
      accessRequested,
      reported,
      ok(await rpc(moderator.client, "community_moderation_list", { p_cursor: null, p_limit: 20 })),
      ok(
        await rpc(owner.client, "community_profile_upsert", {
          p_username: owner.username,
          p_display_name: "Format check",
          p_bio: "",
        }),
      ),
      ok(
        await rpc(owner.client, "community_collection_draft", {
          p_collection_handle: collection,
          p_title: "Tent log",
          p_source_label: "Main tent",
          p_description: "",
        }),
      ),
    ];
    const stamps: string[] = [];
    const walk = (node: Json) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (/At$/.test(key) && value !== null) stamps.push(value as string);
          walk(value);
        }
      }
    };
    walk(bodies);
    expect(stamps.length).toBeGreaterThanOrEqual(4);
    expect(stamps.filter((stamp) => readCommunityInstant(stamp) === null)).toEqual([]);
  }, 60_000);

  it("T-RL-01 concurrent follows and requests stop exactly at 20 and 10", async () => {
    const actor = await participant("rl1");
    const targets: Actor[] = [];
    const collections: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      if (i < 11) {
        const owned = await publishedOwner(`rl1t${i}`);
        targets.push(owned.owner);
        collections.push(owned.collection);
      } else {
        targets.push(await participant(`rl1t${i}`));
      }
    }
    const followsBefore = Number(
      sql(
        `SELECT count(*) FROM public.community_follows WHERE follower_id = ${lit(actor.communityId)};`,
      ),
    );
    const follows = await race(
      await holdRowLock("community_profiles", "id", actor.communityId),
      targets.map((target) => () => follow(actor, target)),
    );
    expect(follows.filter((r) => r.ok)).toHaveLength(20);
    expect(follows.filter((r) => !r.ok).map((r) => (r as { code: string }).code)).toEqual([
      "rate_limited",
    ]);
    // The limit holds in storage, not only in the returned codes (Codex P1 at d0a009fb).
    expect(
      Number(
        sql(
          `SELECT count(*) FROM public.community_follows WHERE follower_id = ${lit(actor.communityId)};`,
        ),
      ) - followsBefore,
    ).toBe(20);

    const accessRowsBefore = Number(
      sql(`SELECT count(*) FROM public.community_collection_access;`),
    );
    const requests = await race(
      await holdRowLock("community_profiles", "id", actor.communityId),
      collections.map(
        (handle) => () =>
          rpc(actor.client, "community_access_request", { p_collection_handle: handle }),
      ),
    );
    expect(requests.filter((r) => r.ok)).toHaveLength(10);
    expect(requests.filter((r) => !r.ok).map((r) => (r as { code: string }).code)).toEqual([
      "rate_limited",
    ]);
    expect(
      Number(sql(`SELECT count(*) FROM public.community_collection_access;`)) - accessRowsBefore,
    ).toBe(10);
  }, 240_000);

  it("T-RL-02 the 31st search in a minute is rate limited and prefixes never match", async () => {
    const searcher = await participant("rl2");
    const found = await participant("rl2f");
    denied(
      await rpc(searcher.client, "community_profile_search", {
        p_username: found.username.slice(0, 6),
      }),
      "unavailable",
    );
    for (let i = 0; i < 29; i += 1) {
      expect(
        ok(await rpc(searcher.client, "community_profile_search", { p_username: found.username }))
          .profile,
      ).toMatchObject({ communityId: found.communityId });
    }
    denied(
      await rpc(searcher.client, "community_profile_search", { p_username: found.username }),
      "rate_limited",
    );
  }, 60_000);

  it("T-KS-01 with the kill switch off every client RPC is unavailable", async () => {
    // Each RPC runs as an otherwise-authorized actor with valid arguments, first with the
    // switch off (must be unavailable), then on (must not be), so only the switch explains it.
    const { owner, collection, entries } = await publishedOwner("ks1");
    const second = await newCollection(owner, "Second");
    await publish(owner, second, [draft(diaryEntry(owner))]);
    const reader = await participant("ks1r");
    await grant(owner, reader, collection);
    ok(await follow(reader, owner));
    await publish(owner, collection, [
      draft(entries[0], { sharedNote: "shared ks1 0" }),
      draft(diaryEntry(owner), { sharedNote: "after follow" }),
    ]);
    const publicationHandle = ok(await read(reader, collection)).items[0].publicationHandle;
    const requester = await participant("ks1q");
    const decideHandle = await requestAccess(requester, collection);
    const withdrawer = await participant("ks1w");
    const withdrawHandle = await requestAccess(withdrawer, collection);
    const newcomer = await participant("ks1n");
    const blockTarget = await participant("ks1b");
    const leaver = await participant("ks1l");
    await grant(owner, leaver, collection);
    const reporter = await participant("ks1p");
    await grant(owner, reporter, collection);
    const report = ok(
      await rpc(reporter.client, "community_report_create", {
        p_publication_handle: publicationHandle,
        p_reason_code: "spam",
        p_reason_text: "",
      }),
    );
    const moderator = await participant("ks1m");
    sql(`INSERT INTO public.community_moderators (user_id) VALUES (${lit(moderator.id)});`);
    const quitter = await participant("ks1d");
    // The publish probe runs on `second`, so the reader and report fixtures on
    // `collection` keep a current publication handle (Copilot on #2301 at d0a009fb).
    const pending = await preview(owner, second, [draft(diaryEntry(owner))]);

    const calls: Array<[Actor, string, () => Record<string, unknown>]> = [
      [
        owner,
        "community_publish",
        () => ({ p_collection_handle: second, p_preview_token: pending.previewToken }),
      ],
      [
        owner,
        "community_profile_upsert",
        () => ({ p_username: owner.username, p_display_name: "Owner again", p_bio: "" }),
      ],
      [newcomer, "community_profile_search", () => ({ p_username: owner.username })],
      [
        newcomer,
        "community_follow_set",
        () => ({ p_profile_id: owner.communityId, p_follow: true }),
      ],
      [
        owner,
        "community_collection_draft",
        () => ({
          p_collection_handle: collection,
          p_title: "Tent log",
          p_source_label: "Main tent",
          p_description: "Synthetic fixture collection",
        }),
      ],
      [owner, "community_source_entries", () => ({ p_cursor: null, p_limit: 20 })],
      [
        owner,
        "community_preview_create",
        () => ({ p_collection_handle: collection, p_entries: [draft(entries[0])] }),
      ],
      [
        reader,
        "community_collection_read",
        () => ({ p_collection_handle: collection, p_cursor: null, p_limit: 20 }),
      ],
      [reader, "community_digest_read", () => ({ p_cursor: null, p_limit: 20 })],
      [reader, "community_digest_seen", () => ({ p_publication_handles: [publicationHandle] })],
      [
        reader,
        "community_report_create",
        () => ({
          p_publication_handle: publicationHandle,
          p_reason_code: "other",
          p_reason_text: "",
        }),
      ],
      [newcomer, "community_access_request", () => ({ p_collection_handle: collection })],
      [
        owner,
        "community_access_decide",
        () => ({
          p_access_handle: decideHandle,
          p_decision: "approve",
          p_expected_revision: accessRevision(decideHandle),
        }),
      ],
      [
        withdrawer,
        "community_access_withdraw",
        () => ({
          p_access_handle: withdrawHandle,
          p_expected_revision: accessRevision(withdrawHandle),
        }),
      ],
      [leaver, "community_access_leave", () => ({ p_collection_handle: collection })],
      [
        owner,
        "community_block_set",
        () => ({ p_profile_id: blockTarget.communityId, p_block: true }),
      ],
      [moderator, "community_moderation_list", () => ({ p_cursor: null, p_limit: 20 })],
      [
        moderator,
        "community_moderation_decide",
        () => ({
          p_report_handle: report.reportHandle,
          p_decision: "dismiss",
          p_reason: "fixture",
        }),
      ],
      [owner, "community_unpublish", () => ({ p_collection_handle: second })],
      [quitter, "community_profile_deactivate", () => ({})],
    ];
    expect(new Set(calls.map(([, fn]) => fn)).size).toBe(20);
    const leaks: string[] = [];
    const mutatedWhileOff: string[] = [];
    const baselineFailed: string[] = [];
    try {
      for (const [actor, fn, args] of calls) {
        sql(`UPDATE public.community_feature_state SET enabled = false;`);
        const before = communityStateFingerprint();
        const off = await rpc(actor.client, fn, args());
        if (!(off.ok === false && off.code === "unavailable")) leaks.push(fn);
        // A call may not write and then report unavailable (Codex P1 at d0a009fb).
        if (communityStateFingerprint() !== before) mutatedWhileOff.push(fn);
        sql(`UPDATE public.community_feature_state SET enabled = true;`);
        const on = await rpc(actor.client, fn, args());
        // With the switch on, every probe is an authorized, valid call that succeeds.
        if (!on.ok) baselineFailed.push(`${fn}:${(on as { code: string }).code}`);
      }
    } finally {
      sql(`UPDATE public.community_feature_state SET enabled = true;`);
    }
    expect(leaks).toEqual([]);
    expect(mutatedWhileOff).toEqual([]);
    expect(baselineFailed).toEqual([]);
  }, 180_000);
});
