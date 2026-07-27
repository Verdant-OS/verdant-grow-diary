#!/usr/bin/env -S bun run
/**
 * Local-only runtime proof for the Quick Log dual-timestamp foundation.
 *
 * Exercises both authenticated RPC variants and direct legacy-writer inserts
 * against a disposable local Supabase stack. It refuses remote API hosts.
 * Temporary @verdant.test users and all fixture rows are deleted in finally.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!value) {
    console.error(`missing env: ${name}`);
    process.exit(2);
  }
}

const apiHost = new URL(SUPABASE_URL).hostname.toLowerCase();
if (!["127.0.0.1", "localhost", "::1"].includes(apiHost)) {
  console.log(`[quicklog-dual-timestamp] SKIP — local-only harness refused API host ${apiHost}`);
  process.exit(0);
}

const STAMP = Date.now();
const EMAIL_A = `quicklog-dual-time-a-${STAMP}@verdant.test`;
const EMAIL_B = `quicklog-dual-time-b-${STAMP}@verdant.test`;
const PASS_A = crypto.randomUUID();
const PASS_B = crypto.randomUUID();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function sameInstant(left: unknown, right: unknown): boolean {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    Number.isFinite(Date.parse(left)) &&
    Date.parse(left) === Date.parse(right)
  );
}

function instantsWithin(left: unknown, right: unknown, toleranceMs = 5_000): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return (
    Number.isFinite(leftMs) && Number.isFinite(rightMs) && Math.abs(leftMs - rightMs) <= toleranceMs
  );
}

function key(label: string): string {
  return `dual-time-${label}-${STAMP}-${crypto.randomUUID()}`;
}

async function recreateUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create temporary user failed: ${error?.message}`);
  }
  return data.user.id;
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`temporary sign-in failed: ${error.message}`);
  return client;
}

type Seed = {
  uid: string;
  growId: string;
  tentId: string;
  plantId: string;
};

async function seedFor(client: SupabaseClient, uid: string, label: string): Promise<Seed> {
  const { data: grow, error: growError } = await client
    .from("grows")
    .insert({ user_id: uid, name: `dual-time-${label}-grow-${STAMP}` })
    .select("id")
    .single();
  if (growError || !grow) {
    throw new Error(`seed grow failed: ${growError?.message}`);
  }

  const { data: tent, error: tentError } = await client
    .from("tents")
    .insert({
      user_id: uid,
      grow_id: grow.id,
      name: `dual-time-${label}-tent-${STAMP}`,
      stage: "veg",
    })
    .select("id")
    .single();
  if (tentError || !tent) {
    throw new Error(`seed tent failed: ${tentError?.message}`);
  }

  const { data: plant, error: plantError } = await client
    .from("plants")
    .insert({
      user_id: uid,
      grow_id: grow.id,
      tent_id: tent.id,
      name: `dual-time-${label}-plant-${STAMP}`,
      stage: "veg",
      health: "healthy",
    })
    .select("id")
    .single();
  if (plantError || !plant) {
    throw new Error(`seed plant failed: ${plantError?.message}`);
  }

  return {
    uid,
    growId: grow.id,
    tentId: tent.id,
    plantId: plant.id,
  };
}

async function seedExtraGrow(client: SupabaseClient, uid: string): Promise<string> {
  // This second grow exists only to prove cross-grow mirror correlation.
  // Keep it archived so the authenticated fixture follows the real Free
  // one-active-grow boundary instead of granting itself a paid bypass.
  const { data, error } = await client
    .from("grows")
    .insert({
      user_id: uid,
      name: `dual-time-extra-grow-${STAMP}`,
      is_archived: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed extra grow failed: ${error?.message}`);
  return data.id;
}

async function callEvent(client: SupabaseClient, args: Record<string, unknown>) {
  // Generated types intentionally remain unchanged until this migration can
  // be replayed locally and `supabase gen types --local` can run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).rpc("quicklog_save_event", args);
}

async function callManual(client: SupabaseClient, args: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).rpc("quicklog_save_manual", args);
}

async function readEvent(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("grow_events")
    .select("id,user_id,grow_id,occurred_at,logged_at,updated_at,note")
    .eq("id", id)
    .single();
  if (error) throw new Error(`read event failed: ${error.message}`);
  return data as Record<string, unknown>;
}

async function legacyEventRequestHash(args: Record<string, unknown>): Promise<string> {
  // Service-role-only deterministic helper from the migration. It exposes no
  // row data and exists so the runtime harness can model an actual old hash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(
    "quicklog_event_request_hash_pre_logged_at",
    args,
  );
  if (error || typeof data !== "string") {
    throw new Error(`legacy event hash failed: ${error?.message ?? "non-string result"}`);
  }
  return data;
}

async function readEnvironmentEvents(uid: string, growId: string, occurredAt: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("grow_events")
    .select("id,occurred_at,logged_at,updated_at")
    .eq("user_id", uid)
    .eq("grow_id", growId)
    .eq("event_type", "environment")
    .eq("source", "manual")
    .eq("occurred_at", occurredAt);
  if (error) throw new Error(`read environment events failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function readMirrors(uid: string, growId: string, eventId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("diary_entries")
    .select("id,user_id,grow_id,entry_at,logged_at,details,note")
    .eq("user_id", uid)
    .eq("grow_id", growId);
  if (error) throw new Error(`read mirrors failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const details = row.details as Record<string, unknown> | null;
    return details?.linked_grow_event_id === eventId || details?.grow_event_id === eventId;
  });
}

async function countEvents(uid: string): Promise<number> {
  const { count, error } = await admin
    .from("grow_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  if (error) throw new Error(`count events failed: ${error.message}`);
  return count ?? 0;
}

async function insertDiaryFixture(row: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("diary_entries")
    .insert(row)
    .select("id,entry_at,created_at,logged_at,details")
    .single();
  if (error || !data) {
    throw new Error(`insert diary fixture failed: ${error?.message}`);
  }
  return data as Record<string, unknown>;
}

async function seedLegacyEventRetryFixture(input: {
  uid: string;
  seed: Seed;
  idempotencyKey: string;
  note: string;
  occurredAt: string;
  details: Record<string, unknown>;
}) {
  const hashArgs = {
    p_grow_id: input.seed.growId,
    p_event_type: "observation",
    p_tent_id: input.seed.tentId,
    p_plant_id: input.seed.plantId,
    p_note: input.note,
    p_photo_url: null,
    p_occurred_at: input.occurredAt,
    p_sensor_snapshot: null,
    p_details: input.details,
    p_water: null,
    p_feed: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event, error: eventError } = await (admin as any)
    .from("grow_events")
    .insert({
      user_id: input.uid,
      grow_id: input.seed.growId,
      tent_id: input.seed.tentId,
      plant_id: input.seed.plantId,
      event_type: "observation",
      source: "manual",
      occurred_at: input.occurredAt,
      note: input.note,
    })
    .select("id,logged_at,updated_at")
    .single();
  if (eventError || !event?.id) {
    throw new Error(`seed pre-migration event failed: ${eventError?.message}`);
  }

  await insertDiaryFixture({
    user_id: input.uid,
    grow_id: input.seed.growId,
    tent_id: input.seed.tentId,
    plant_id: input.seed.plantId,
    note: input.note,
    entry_at: input.occurredAt,
    details: {
      ...input.details,
      linked_grow_event_id: event.id,
    },
  });

  const requestHash = await legacyEventRequestHash(hashArgs);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: keyError } = await (admin as any).from("quicklog_idempotency").insert({
    user_id: input.uid,
    idempotency_key: input.idempotencyKey,
    grow_event_id: event.id,
    request_hash: requestHash,
  });
  if (keyError) {
    throw new Error(`seed pre-migration idempotency failed: ${keyError.message}`);
  }

  return {
    args: {
      p_idempotency_key: input.idempotencyKey,
      ...hashArgs,
    },
    event: event as Record<string, unknown>,
  };
}

async function teardown(uids: string[]) {
  for (const uid of uids) {
    await admin.from("environment_events").delete().eq("user_id", uid);
    await admin.from("feeding_events").delete().eq("user_id", uid);
    await admin.from("watering_events").delete().eq("user_id", uid);
    await admin.from("quicklog_idempotency").delete().eq("user_id", uid);
    await admin.from("quicklog_audit_events").delete().eq("user_id", uid);
    await admin.from("diary_entries").delete().eq("user_id", uid);
    await admin.from("grow_events").delete().eq("user_id", uid);
    await admin.from("plants").delete().eq("user_id", uid);
    await admin.from("tents").delete().eq("user_id", uid);
    await admin.from("grows").delete().eq("user_id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
}

async function main() {
  console.log("→ Quick Log dual-timestamp local runtime proof");
  const uidA = await recreateUser(EMAIL_A, PASS_A);
  let uidB: string;
  try {
    uidB = await recreateUser(EMAIL_B, PASS_B);
  } catch (error) {
    await teardown([uidA]);
    throw error;
  }

  try {
    const clientA = await signedInClient(EMAIL_A, PASS_A);
    const clientB = await signedInClient(EMAIL_B, PASS_B);
    const seedA = await seedFor(clientA, uidA, "A");
    const seedB = await seedFor(clientB, uidB, "B");
    const otherGrowA = await seedExtraGrow(clientA, uidA);

    const eventOccurred = "2026-07-20T08:15:00.000Z";
    const eventCaptured = new Date(Date.now() - 90_000).toISOString();
    const eventKey = key("event-parity");
    const eventArgs = {
      p_idempotency_key: eventKey,
      p_grow_id: seedA.growId,
      p_event_type: "observation",
      p_tent_id: seedA.tentId,
      p_plant_id: seedA.plantId,
      p_note: `dual timestamp event ${STAMP}`,
      p_occurred_at: eventOccurred,
      p_details: { kind: "note", logged_at: eventCaptured },
    };
    const eventSave = await callEvent(clientA, eventArgs);
    const eventId = (eventSave.data as { grow_event_id?: string } | null)?.grow_event_id;
    check(
      "event RPC accepts captured != occurred",
      !eventSave.error &&
        (eventSave.data as { ok?: boolean } | null)?.ok === true &&
        Boolean(eventId),
      eventSave.error?.message,
    );

    if (!eventId) throw new Error("event RPC returned no grow_event_id");
    const eventRow = await readEvent(eventId);
    const eventMirrors = await readMirrors(uidA, seedA.growId, eventId);
    const eventMirror = eventMirrors[0];
    const eventDetails = eventMirror?.details as Record<string, unknown> | undefined;
    check(
      "event occurred_at remains the grower-reported time",
      sameInstant(eventRow.occurred_at, eventOccurred),
    );
    check(
      "event and diary real logged_at columns equal Captured",
      sameInstant(eventRow.logged_at, eventCaptured) &&
        sameInstant(eventMirror?.logged_at, eventCaptured),
      JSON.stringify({
        event: eventRow.logged_at,
        diary: eventMirror?.logged_at,
      }),
    );
    check(
      "event diary details.logged_at equals both real columns",
      sameInstant(eventDetails?.logged_at, eventCaptured) &&
        sameInstant(eventDetails?.logged_at, eventRow.logged_at),
    );
    check(
      "event companion preserves occurred entry_at separately",
      sameInstant(eventMirror?.entry_at, eventOccurred),
    );

    const invalidBefore = await countEvents(uidA);
    const invalidEvent = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: key("invalid-event-time"),
      p_details: {
        kind: "note",
        logged_at: "2026-02-30T25:61:00.000Z",
      },
    });
    const invalidAfter = await countEvents(uidA);
    check(
      "event RPC rejects impossible captured JSON without inserting",
      !invalidEvent.error &&
        (invalidEvent.data as { reason?: string } | null)?.reason === "invalid_logged_at" &&
        invalidBefore === invalidAfter,
      JSON.stringify(invalidEvent.data),
    );

    const rawDetailsCases: Array<{
      label: "scalar" | "array" | "null";
      initial: unknown;
      changed: unknown;
    }> = [
      {
        label: "scalar",
        initial: "original scalar details",
        changed: "changed scalar details",
      },
      {
        label: "array",
        initial: ["original", "array"],
        changed: ["changed", "array"],
      },
      {
        label: "null",
        initial: null,
        changed: {},
      },
    ];
    for (const rawDetailsCase of rawDetailsCases) {
      const rawKey = key(`event-raw-${rawDetailsCase.label}`);
      const rawArgs = {
        p_idempotency_key: rawKey,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_tent_id: seedA.tentId,
        p_plant_id: seedA.plantId,
        p_note: `event raw ${rawDetailsCase.label} ${STAMP}`,
        p_occurred_at: eventOccurred,
        p_details: rawDetailsCase.initial,
      };
      const rawBefore = await countEvents(uidA);
      const rawInitial = await callEvent(clientA, rawArgs);
      const rawEventId = (rawInitial.data as { grow_event_id?: string } | null)?.grow_event_id;
      const rawExactRetry = await callEvent(clientA, rawArgs);
      const rawChangedRetry = await callEvent(clientA, {
        ...rawArgs,
        p_details: rawDetailsCase.changed,
      });
      const rawAfter = await countEvents(uidA);
      const rawMirrors = rawEventId ? await readMirrors(uidA, seedA.growId, rawEventId) : [];
      const rawMirrorDetails = rawMirrors[0]?.details as Record<string, unknown> | undefined;

      check(
        `event ${rawDetailsCase.label} details save once and exact retry reuses`,
        !rawInitial.error &&
          (rawInitial.data as { ok?: boolean } | null)?.ok === true &&
          Boolean(rawEventId) &&
          !rawExactRetry.error &&
          (rawExactRetry.data as { reused?: boolean } | null)?.reused === true &&
          (rawExactRetry.data as { grow_event_id?: string } | null)?.grow_event_id === rawEventId &&
          rawAfter === rawBefore + 1 &&
          rawMirrors.length === 1 &&
          !("__verdant_request_details_hash_v1" in (rawMirrorDetails ?? {})),
        JSON.stringify({
          initial: rawInitial.data,
          exact: rawExactRetry.data,
          mirrors: rawMirrors,
        }),
      );
      check(
        `changed same-key event ${rawDetailsCase.label} details conflict without inserting`,
        !rawChangedRetry.error &&
          (rawChangedRetry.data as { reason?: string } | null)?.reason ===
            "idempotency_key_conflict" &&
          rawAfter === rawBefore + 1,
        JSON.stringify(rawChangedRetry.data),
      );
    }

    const rawBoundaryBefore = await countEvents(uidA);
    const oversizedRawDetails = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: key("event-oversized-raw-details"),
      p_details: "x".repeat(20_100),
    });
    const rawBoundaryAfterOversized = await countEvents(uidA);
    check(
      "event oversized non-object details are rejected before normalization",
      !oversizedRawDetails.error &&
        (oversizedRawDetails.data as { reason?: string } | null)?.reason ===
          "invalid_typed_payload" &&
        rawBoundaryAfterOversized === rawBoundaryBefore,
      JSON.stringify(oversizedRawDetails.data),
    );

    const secretLikeValue = ["sk", "test", "abcdefghijklmnop"].join("_");
    const secretLikeRawDetails = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: key("event-secret-like-raw-details"),
      p_details: secretLikeValue,
    });
    const rawBoundaryAfterSecret = await countEvents(uidA);
    check(
      "event secret-like non-object details are rejected before normalization",
      !secretLikeRawDetails.error &&
        (secretLikeRawDetails.data as { reason?: string } | null)?.reason ===
          "invalid_typed_payload" &&
        rawBoundaryAfterSecret === rawBoundaryBefore,
      JSON.stringify(secretLikeRawDetails.data),
    );

    const rawValidationOrder = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: key("event-raw-details-validation-order"),
      p_event_type: "not-a-real-event-type",
      p_details: secretLikeValue,
    });
    const rawBoundaryAfterValidationOrder = await countEvents(uidA);
    check(
      "event non-object details retain the delegate validation order",
      !rawValidationOrder.error &&
        (rawValidationOrder.data as { reason?: string } | null)?.reason === "invalid_event_type" &&
        rawBoundaryAfterValidationOrder === rawBoundaryBefore,
      JSON.stringify(rawValidationOrder.data),
    );

    const reservedMarkerValue = `caller-controlled-${STAMP}`;
    const reservedMarkerKey = key("event-reserved-details-marker");
    const reservedMarkerBefore = await countEvents(uidA);
    const reservedMarkerDetails = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: reservedMarkerKey,
      p_details: {
        kind: "note",
        __verdant_request_details_hash_v1: reservedMarkerValue,
      },
    });
    const reservedMarkerEventId = (reservedMarkerDetails.data as { grow_event_id?: string } | null)
      ?.grow_event_id;
    const reservedMarkerChangedRetry = await callEvent(clientA, {
      ...eventArgs,
      p_idempotency_key: reservedMarkerKey,
      p_details: {
        kind: "note",
        __verdant_request_details_hash_v1: "changed-caller-value",
      },
    });
    const reservedMarkerAfter = await countEvents(uidA);
    const reservedMarkerMirrors = reservedMarkerEventId
      ? await readMirrors(uidA, seedA.growId, reservedMarkerEventId)
      : [];
    const reservedMarkerMirrorDetails = reservedMarkerMirrors[0]?.details as
      | Record<string, unknown>
      | undefined;
    check(
      "event object details preserve a grower field matching the internal marker name",
      !reservedMarkerDetails.error &&
        (reservedMarkerDetails.data as { ok?: boolean } | null)?.ok === true &&
        Boolean(reservedMarkerEventId) &&
        reservedMarkerAfter === reservedMarkerBefore + 1 &&
        reservedMarkerMirrors.length === 1 &&
        reservedMarkerMirrorDetails?.__verdant_request_details_hash_v1 === reservedMarkerValue &&
        !reservedMarkerChangedRetry.error &&
        (reservedMarkerChangedRetry.data as { reason?: string } | null)?.reason ===
          "idempotency_key_conflict",
      JSON.stringify({
        initial: reservedMarkerDetails.data,
        changed: reservedMarkerChangedRetry.data,
        mirrors: reservedMarkerMirrors,
      }),
    );

    const legacyOccurred = "2026-07-18T14:20:00.000Z";
    const malformedLegacy = await seedLegacyEventRetryFixture({
      uid: uidA,
      seed: seedA,
      idempotencyKey: key("pre-migration-malformed"),
      note: `pre-migration malformed timestamp ${STAMP}`,
      occurredAt: legacyOccurred,
      details: {
        kind: "note",
        migration_fixture: "pre_logged_at_malformed",
        logged_at: "not-a-timestamp",
      },
    });
    const malformedLegacyRetry = await callEvent(clientA, malformedLegacy.args);
    const malformedLegacyAfter = await readEvent(malformedLegacy.event.id as string);
    const malformedLegacyMirrors = await readMirrors(
      uidA,
      seedA.growId,
      malformedLegacy.event.id as string,
    );
    const malformedLegacyMirrorDetails = malformedLegacyMirrors[0]?.details as
      | Record<string, unknown>
      | undefined;
    check(
      "exact pre-migration retry reuses a malformed legacy logged_at",
      !malformedLegacyRetry.error &&
        (malformedLegacyRetry.data as { reused?: boolean } | null)?.reused === true &&
        (malformedLegacyRetry.data as { grow_event_id?: string } | null)?.grow_event_id ===
          malformedLegacy.event.id,
      JSON.stringify(malformedLegacyRetry.data),
    );
    check(
      "malformed legacy retry preserves event capture/updated_at and repairs mirror parity",
      sameInstant(malformedLegacy.event.updated_at, malformedLegacyAfter.updated_at) &&
        sameInstant(malformedLegacyAfter.logged_at, malformedLegacy.event.logged_at) &&
        sameInstant(malformedLegacyMirrors[0]?.logged_at, malformedLegacy.event.logged_at) &&
        sameInstant(malformedLegacyMirrorDetails?.logged_at, malformedLegacy.event.logged_at),
      JSON.stringify({ malformedLegacy, malformedLegacyAfter, malformedLegacyMirrors }),
    );

    const changedLegacyBefore = await countEvents(uidA);
    const changedMalformedLegacy = await callEvent(clientA, {
      ...malformedLegacy.args,
      p_note: `changed pre-migration payload ${STAMP}`,
    });
    const changedLegacyAfter = await countEvents(uidA);
    check(
      "changed malformed legacy payload fails closed instead of reusing",
      !changedMalformedLegacy.error &&
        (changedMalformedLegacy.data as { reason?: string } | null)?.reason ===
          "invalid_logged_at" &&
        changedLegacyBefore === changedLegacyAfter,
      JSON.stringify(changedMalformedLegacy.data),
    );

    const futureLegacy = await seedLegacyEventRetryFixture({
      uid: uidA,
      seed: seedA,
      idempotencyKey: key("pre-migration-future"),
      note: `pre-migration future timestamp ${STAMP}`,
      occurredAt: legacyOccurred,
      details: {
        kind: "note",
        migration_fixture: "pre_logged_at_future",
        logged_at: "2099-01-01T00:00:00.000Z",
      },
    });
    const futureLegacyRetry = await callEvent(clientA, futureLegacy.args);
    const futureLegacyAfter = await readEvent(futureLegacy.event.id as string);
    const futureLegacyMirrors = await readMirrors(
      uidA,
      seedA.growId,
      futureLegacy.event.id as string,
    );
    const futureLegacyMirrorDetails = futureLegacyMirrors[0]?.details as
      | Record<string, unknown>
      | undefined;
    check(
      "exact pre-migration retry reuses a now-future legacy logged_at",
      !futureLegacyRetry.error &&
        (futureLegacyRetry.data as { reused?: boolean } | null)?.reused === true &&
        (futureLegacyRetry.data as { grow_event_id?: string } | null)?.grow_event_id ===
          futureLegacy.event.id,
      JSON.stringify(futureLegacyRetry.data),
    );
    check(
      "future legacy retry preserves event capture/updated_at and repairs mirror parity",
      sameInstant(futureLegacy.event.updated_at, futureLegacyAfter.updated_at) &&
        sameInstant(futureLegacyAfter.logged_at, futureLegacy.event.logged_at) &&
        sameInstant(futureLegacyMirrors[0]?.logged_at, futureLegacy.event.logged_at) &&
        sameInstant(futureLegacyMirrorDetails?.logged_at, futureLegacy.event.logged_at),
      JSON.stringify({ futureLegacy, futureLegacyAfter, futureLegacyMirrors }),
    );

    const legacyMarkerValue = `legacy-grower-detail-${STAMP}`;
    const legacyMarker = await seedLegacyEventRetryFixture({
      uid: uidA,
      seed: seedA,
      idempotencyKey: key("pre-migration-reserved-marker"),
      note: `pre-migration reserved marker ${STAMP}`,
      occurredAt: legacyOccurred,
      details: {
        kind: "note",
        migration_fixture: "pre_logged_at_reserved_marker",
        __verdant_request_details_hash_v1: legacyMarkerValue,
      },
    });
    const legacyMarkerRetry = await callEvent(clientA, legacyMarker.args);
    const legacyMarkerMirrors = await readMirrors(
      uidA,
      seedA.growId,
      legacyMarker.event.id as string,
    );
    const legacyMarkerDetails = legacyMarkerMirrors[0]?.details as
      | Record<string, unknown>
      | undefined;
    check(
      "exact legacy retry preserves a pre-existing grower detail matching the reserved marker",
      !legacyMarkerRetry.error &&
        (legacyMarkerRetry.data as { reused?: boolean } | null)?.reused === true &&
        legacyMarkerDetails?.__verdant_request_details_hash_v1 === legacyMarkerValue,
      JSON.stringify({ retry: legacyMarkerRetry.data, mirrors: legacyMarkerMirrors }),
    );

    const manualOccurred = "2026-07-19T19:30:00.000Z";
    const manualCaptured = new Date(Date.now() - 60_000).toISOString();
    const manualKey = key("manual-parity");
    const manualArgs = {
      p_target_type: "plant",
      p_target_id: seedA.plantId,
      p_action: "note",
      p_note: `dual timestamp manual ${STAMP}`,
      p_temperature_c: 25.2,
      p_humidity_pct: 58.4,
      p_vpd_kpa: 1.24,
      p_occurred_at: manualOccurred,
      p_details: { kind: "note", logged_at: manualCaptured },
      p_idempotency_key: manualKey,
    };
    const manualSave = await callManual(clientA, manualArgs);
    const manualId = (manualSave.data as { grow_event_id?: string } | null)?.grow_event_id;
    check(
      "manual RPC accepts captured != occurred",
      !manualSave.error &&
        (manualSave.data as { ok?: boolean } | null)?.ok === true &&
        Boolean(manualId),
      manualSave.error?.message,
    );

    if (!manualId) throw new Error("manual RPC returned no grow_event_id");
    const manualRow = await readEvent(manualId);
    const manualMirrors = await readMirrors(uidA, seedA.growId, manualId);
    const manualEnvironmentEvents = await readEnvironmentEvents(uidA, seedA.growId, manualOccurred);
    const manualMirror = manualMirrors[0];
    const manualDetails = manualMirror?.details as Record<string, unknown> | undefined;
    check(
      "manual real columns/details share one Captured timestamp",
      sameInstant(manualRow.logged_at, manualCaptured) &&
        sameInstant(manualMirror?.logged_at, manualCaptured) &&
        sameInstant(manualDetails?.logged_at, manualCaptured),
    );
    check(
      "manual occurred_at and diary entry_at remain separate",
      sameInstant(manualRow.occurred_at, manualOccurred) &&
        sameInstant(manualMirror?.entry_at, manualOccurred),
    );
    check(
      "manual sensor child uses the same Captured timestamp",
      manualEnvironmentEvents.length === 1 &&
        sameInstant(manualEnvironmentEvents[0].occurred_at, manualOccurred) &&
        sameInstant(manualEnvironmentEvents[0].logged_at, manualCaptured),
      JSON.stringify(manualEnvironmentEvents),
    );

    const manualRetry = await callManual(clientA, {
      ...manualArgs,
      p_details: {
        kind: "note",
        logged_at: new Date(Date.now() - 30_000).toISOString(),
      },
    });
    const manualAfterRetry = await readEvent(manualId);
    check(
      "manual idempotent retry reuses row and freezes original Captured",
      (manualRetry.data as { reused?: boolean } | null)?.reused === true &&
        (manualRetry.data as { grow_event_id?: string } | null)?.grow_event_id === manualId &&
        sameInstant(manualAfterRetry.logged_at, manualCaptured),
      JSON.stringify(manualRetry.data),
    );

    const malformedManualRetry = await callManual(clientA, {
      ...manualArgs,
      p_details: { kind: "note", logged_at: "not-a-timestamp" },
    });
    const manualAfterMalformedRetry = await readEvent(manualId);
    check(
      "manual existing key reuses before changed Captured validation",
      !malformedManualRetry.error &&
        (malformedManualRetry.data as { reused?: boolean } | null)?.reused === true &&
        sameInstant(manualAfterMalformedRetry.logged_at, manualCaptured) &&
        sameInstant(manualAfterMalformedRetry.updated_at, manualRow.updated_at),
      JSON.stringify(malformedManualRetry.data),
    );

    const invalidManualBefore = await countEvents(uidA);
    const invalidManual = await callManual(clientA, {
      ...manualArgs,
      p_idempotency_key: key("invalid-manual-time"),
      p_details: { kind: "note", logged_at: "not-a-timestamp" },
    });
    const invalidManualAfter = await countEvents(uidA);
    check(
      "manual RPC rejects malformed captured JSON without inserting",
      !invalidManual.error &&
        (invalidManual.data as { reason?: string } | null)?.reason === "invalid_logged_at" &&
        invalidManualBefore === invalidManualAfter,
      JSON.stringify(invalidManual.data),
    );

    const scalarManualBefore = await countEvents(uidA);
    const scalarManual = await callManual(clientA, {
      ...manualArgs,
      p_idempotency_key: key("scalar-manual-details"),
      p_details: ["not", "an", "object"],
    });
    const scalarManualAfter = await countEvents(uidA);
    check(
      "manual RPC preserves invalid_details for non-object JSON",
      !scalarManual.error &&
        (scalarManual.data as { reason?: string } | null)?.reason === "invalid_details" &&
        scalarManualBefore === scalarManualAfter,
      JSON.stringify(scalarManual.data),
    );

    const concurrentKey = key("event-concurrent");
    const concurrentArgs = {
      p_idempotency_key: concurrentKey,
      p_grow_id: seedA.growId,
      p_event_type: "observation",
      p_tent_id: seedA.tentId,
      p_plant_id: seedA.plantId,
      p_note: `dual timestamp concurrent ${STAMP}`,
      p_details: { kind: "note" },
    };
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => callEvent(clientA, concurrentArgs)),
    );
    const concurrentIds = concurrent.map(
      (result) => (result.data as { grow_event_id?: string } | null)?.grow_event_id,
    );
    const concurrentId = concurrentIds[0];
    check(
      "concurrent event retries share one id and no hash conflict",
      Boolean(concurrentId) &&
        concurrent.every(
          (result) => !result.error && (result.data as { ok?: boolean } | null)?.ok === true,
        ) &&
        concurrentIds.every((id) => id === concurrentId),
      concurrentIds.join(","),
    );
    if (concurrentId) {
      const beforeRetry = await readEvent(concurrentId);
      const retry = await callEvent(clientA, concurrentArgs);
      const afterRetry = await readEvent(concurrentId);
      check(
        "event retry freezes Captured without rewriting updated_at",
        (retry.data as { reused?: boolean } | null)?.reused === true &&
          sameInstant(beforeRetry.logged_at, afterRetry.logged_at) &&
          sameInstant(beforeRetry.updated_at, afterRetry.updated_at),
      );
    }

    const spoofCaptured = "2026-07-18T10:00:00.000Z";
    const correctDuplicateA = await insertDiaryFixture({
      user_id: uidA,
      grow_id: seedA.growId,
      tent_id: seedA.tentId,
      plant_id: seedA.plantId,
      note: `same-boundary duplicate A ${STAMP}`,
      entry_at: eventOccurred,
      details: {
        linked_grow_event_id: eventId,
        logged_at: spoofCaptured,
      },
    });
    const correctDuplicateB = await insertDiaryFixture({
      user_id: uidA,
      grow_id: seedA.growId,
      tent_id: seedA.tentId,
      plant_id: seedA.plantId,
      note: `same-boundary duplicate B ${STAMP}`,
      entry_at: eventOccurred,
      details: {
        grow_event_id: eventId,
        logged_at: spoofCaptured,
      },
    });
    const crossUser = await insertDiaryFixture({
      user_id: uidB,
      grow_id: seedB.growId,
      tent_id: seedB.tentId,
      plant_id: seedB.plantId,
      note: `cross-user spoof ${STAMP}`,
      entry_at: eventOccurred,
      details: {
        linked_grow_event_id: eventId,
        logged_at: spoofCaptured,
      },
    });
    const crossGrow = await insertDiaryFixture({
      user_id: uidA,
      grow_id: otherGrowA,
      note: `cross-grow spoof ${STAMP}`,
      entry_at: eventOccurred,
      details: {
        linked_grow_event_id: eventId,
        logged_at: spoofCaptured,
      },
    });
    const malformedMirror = await insertDiaryFixture({
      user_id: uidA,
      grow_id: seedA.growId,
      tent_id: seedA.tentId,
      plant_id: seedA.plantId,
      note: `malformed mirror ${STAMP}`,
      entry_at: eventOccurred,
      details: {
        linked_grow_event_id: "definitely-not-a-uuid",
        logged_at: "2026-02-30T25:61:00.000Z",
      },
    });
    check(
      "malformed legacy JSON inserts safely with server capture time",
      instantsWithin(malformedMirror.logged_at, malformedMirror.created_at) &&
        !sameInstant(malformedMirror.logged_at, eventOccurred),
      JSON.stringify(malformedMirror),
    );

    const duplicateRetry = await callEvent(clientA, eventArgs);
    check(
      "retry across malformed and spoofed mirrors still succeeds",
      !duplicateRetry.error &&
        (duplicateRetry.data as { reused?: boolean } | null)?.reused === true,
      duplicateRetry.error?.message,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: duplicateRows } = await (admin as any)
      .from("diary_entries")
      .select("id,logged_at,details")
      .in("id", [correctDuplicateA.id, correctDuplicateB.id]);
    const duplicatesCanonical = ((duplicateRows ?? []) as Array<Record<string, unknown>>).every(
      (row) => {
        const details = row.details as Record<string, unknown>;
        return (
          sameInstant(row.logged_at, eventCaptured) && sameInstant(details.logged_at, eventCaptured)
        );
      },
    );
    check(
      "same-user/same-grow duplicate mirrors converge to canonical Captured",
      (duplicateRows ?? []).length === 2 && duplicatesCanonical,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: spoofRows, error: spoofRowsError } = await (admin as any)
      .from("diary_entries")
      .select("id,logged_at,details")
      .in("id", [crossUser.id, crossGrow.id]);
    const originalSpoofRows = new Map(
      [crossUser, crossGrow].map((row) => [
        row.id,
        {
          logged_at: row.logged_at,
          details: row.details as Record<string, unknown> | null,
        },
      ]),
    );
    const untouchedSpoofRows = ((spoofRows ?? []) as Array<Record<string, unknown>>).every(
      (row) => {
        const details = row.details as Record<string, unknown> | null;
        const original = originalSpoofRows.get(row.id);
        return (
          original != null &&
          sameInstant(row.logged_at, original.logged_at) &&
          sameInstant(details?.logged_at, original.details?.logged_at) &&
          sameInstant(details?.logged_at, spoofCaptured)
        );
      },
    );
    check(
      "cross-user and cross-grow spoofed links remain untouched",
      !spoofRowsError && (spoofRows ?? []).length === 2 && untouchedSpoofRows,
      JSON.stringify({ error: spoofRowsError?.message, rows: spoofRows }),
    );

    const genericOccurred = "2026-07-17T06:45:00.000Z";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: genericEvent, error: genericEventError } = await (admin as any)
      .from("grow_events")
      .insert({
        user_id: uidA,
        grow_id: seedA.growId,
        tent_id: seedA.tentId,
        plant_id: seedA.plantId,
        event_type: "observation",
        source: "manual",
        occurred_at: genericOccurred,
        logged_at: genericOccurred,
        note: `non-quicklog fallback ${STAMP}`,
      })
      .select("occurred_at,created_at,logged_at")
      .single();
    check(
      "non-Quick-Log grow-event writer uses server capture, not backdated occurrence",
      !genericEventError &&
        instantsWithin(genericEvent?.logged_at, genericEvent?.created_at) &&
        !sameInstant(genericEvent?.logged_at, genericOccurred),
      JSON.stringify({ error: genericEventError?.message, row: genericEvent }),
    );

    const genericDiary = await insertDiaryFixture({
      user_id: uidA,
      grow_id: seedA.growId,
      tent_id: seedA.tentId,
      plant_id: seedA.plantId,
      note: `non-quicklog diary fallback ${STAMP}`,
      entry_at: genericOccurred,
      logged_at: genericOccurred,
      details: { logged_at: genericOccurred },
    });
    check(
      "non-Quick-Log diary writer uses server capture, not backdated entry/details",
      instantsWithin(genericDiary.logged_at, genericDiary.created_at) &&
        !sameInstant(genericDiary.logged_at, genericOccurred),
      JSON.stringify(genericDiary),
    );

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonEvent = await callEvent(anon, {
      p_idempotency_key: key("anon-event"),
      p_grow_id: seedA.growId,
      p_event_type: "observation",
    });
    const anonManual = await callManual(anon, {
      p_target_type: "plant",
      p_target_id: seedA.plantId,
      p_action: "note",
    });
    check(
      "anon has no EXECUTE on event RPC",
      Boolean(anonEvent.error) && anonEvent.data == null,
      anonEvent.error?.code,
    );
    check(
      "anon has no EXECUTE on manual RPC",
      Boolean(anonManual.error) && anonManual.data == null,
      anonManual.error?.code,
    );
  } finally {
    await teardown([uidA, uidB]);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(
    "quicklog dual-timestamp harness crashed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
