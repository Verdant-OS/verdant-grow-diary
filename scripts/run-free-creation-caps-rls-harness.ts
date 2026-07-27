#!/usr/bin/env -S bun run
/**
 * Runtime PostgREST harness for the server-authoritative Free creation caps.
 *
 * Proves with real authenticated clients that:
 *   - concurrent Free grow creation serializes to one active row
 *   - direct second-active INSERTs are rejected for grows and tents
 *   - archived rows do not consume a slot, but archive -> active is enforced
 *   - cross-user owner spoofing fails identically for Free and paid targets
 *   - BYO Pro, Lovable Founder, and Lovable Craft receive paid capability
 *   - service_role remains usable for trusted over-limit fixtures
 *   - an existing over-limit fixture can still receive ordinary row edits
 *
 * service_role is used only for auth setup/teardown, server-owned billing
 * fixtures, trusted over-limit fixture proof, and verification reads. Every
 * Free or paid policy assertion uses an anon-key client with a signed-in JWT.
 *
 * Run:
 *   bun run scripts/run-free-creation-caps-rls-harness.ts
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 *
 * Remote disposable project opt-in:
 *   FREE_CREATION_CAP_RLS_HARNESS_ALLOW_REMOTE=1
 *   FREE_CREATION_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF=<project-ref>
 *
 * Verdant production is always refused.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REMOTE_CONFIRM_ENV = "FREE_CREATION_CAP_RLS_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "FREE_CREATION_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[free-creation-cap] SUPABASE_URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[free-creation-cap] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

if (!localHost) {
  const expectedRemoteRef = process.env[EXPECTED_REMOTE_REF_ENV];
  const expectedRemoteHost = expectedRemoteRef ? `${expectedRemoteRef}.supabase.co` : null;
  const remoteConfirmed =
    process.env[REMOTE_CONFIRM_ENV] === "1" &&
    /^[a-z0-9]{20}$/.test(expectedRemoteRef ?? "") &&
    expectedRemoteRef !== PRODUCTION_PROJECT_REF &&
    hostname === expectedRemoteHost;

  if (!remoteConfirmed) {
    console.error(
      `[free-creation-cap] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
    );
    process.exit(2);
  }
}

const PASSWORD = crypto.randomUUID();
const RUN_ID = crypto.randomUUID().slice(0, 8);
const FUTURE_PERIOD_END = new Date(Date.now() + 30 * 86_400_000).toISOString();
const EMAILS = {
  free: `free-creation-cap-free-${RUN_ID}@verdant.test`,
  byoPro: `free-creation-cap-byo-pro-${RUN_ID}@verdant.test`,
  founder: `free-creation-cap-founder-${RUN_ID}@verdant.test`,
  craft: `free-creation-cap-craft-${RUN_ID}@verdant.test`,
  serviceFixture: `free-creation-cap-service-fixture-${RUN_ID}@verdant.test`,
} as const;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function adminCreateUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

function insertGrow(client: SupabaseClient, userId: string, name: string, isArchived = false) {
  return client
    .from("grows")
    .insert({
      user_id: userId,
      name,
      grow_type: "tent",
      stage: "seedling",
      is_archived: isArchived,
    })
    .select("id,is_archived")
    .single();
}

function insertTent(client: SupabaseClient, userId: string, name: string, isArchived = false) {
  return client
    .from("tents")
    .insert({
      user_id: userId,
      name,
      stage: "seedling",
      is_archived: isArchived,
    })
    .select("id,is_archived")
    .single();
}

function isCapError(
  error: { code?: string; message?: string } | null,
  expectedMessage: string,
): boolean {
  return error != null && error.code === "23514" && (error.message ?? "").includes(expectedMessage);
}

function isOwnerMismatchError(error: { code?: string; message?: string } | null): boolean {
  return (
    error != null && error.code === "42501" && error.message === "free_creation_cap_owner_mismatch"
  );
}

async function activeCount(table: "grows" | "tents", userId: string): Promise<number | null> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_archived", false);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count;
}

async function assertPaidUnlimited(
  label: string,
  checkName: string,
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const growResults = await Promise.all([
    insertGrow(client, userId, `${label} grow A`),
    insertGrow(client, userId, `${label} grow B`),
  ]);
  const tentResults = await Promise.all([
    insertTent(client, userId, `${label} tent A`),
    insertTent(client, userId, `${label} tent B`),
  ]);
  const errors = [...growResults, ...tentResults].map((result) => result.error).filter(Boolean);
  check(
    checkName,
    errors.length === 0 &&
      (await activeCount("grows", userId)) === 2 &&
      (await activeCount("tents", userId)) === 2,
    errors.map((error) => error?.message).join("; "),
  );
}

async function main() {
  const createdUserIds: string[] = [];

  try {
    console.log("→ creating disposable users");
    const userIds = {} as Record<keyof typeof EMAILS, string>;
    for (const key of Object.keys(EMAILS) as Array<keyof typeof EMAILS>) {
      const userId = await adminCreateUser(EMAILS[key]);
      createdUserIds.push(userId);
      userIds[key] = userId;
    }
    const {
      free: uidFree,
      byoPro: uidByoPro,
      founder: uidFounder,
      craft: uidCraft,
      serviceFixture: uidServiceFixture,
    } = userIds;

    console.log("→ seeding server-owned paid entitlement rows");
    const { error: byoError } = await admin.from("billing_subscriptions").insert({
      user_id: uidByoPro,
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      current_period_end: FUTURE_PERIOD_END,
    });
    if (byoError) throw new Error(`seed BYO Pro: ${byoError.message}`);

    const { error: lovableError } = await admin.from("subscriptions").insert([
      {
        user_id: uidFounder,
        paddle_subscription_id: `lifetime_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "founder_lifetime",
        price_id: "founder_lifetime",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: null,
        cancel_at_period_end: false,
        environment: "live",
      },
      {
        user_id: uidCraft,
        paddle_subscription_id: `subscription_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "craft",
        price_id: "craft_monthly",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: FUTURE_PERIOD_END,
        cancel_at_period_end: false,
        environment: "live",
      },
    ]);
    if (lovableError) throw new Error(`seed Lovable paid rows: ${lovableError.message}`);

    console.log("→ signing in real authenticated clients");
    const [freeA, freeB, byoPro, founder, craft, serviceFixtureUser] = await Promise.all([
      signedInClient(EMAILS.free),
      signedInClient(EMAILS.free),
      signedInClient(EMAILS.byoPro),
      signedInClient(EMAILS.founder),
      signedInClient(EMAILS.craft),
      signedInClient(EMAILS.serviceFixture),
    ]);

    console.log("→ authenticated owner-binding checks");
    const [paidGrowSpoof, freeGrowSpoof] = await Promise.all([
      insertGrow(freeA, uidByoPro, "Cross-user paid-owner grow spoof"),
      insertGrow(freeA, uidServiceFixture, "Cross-user Free-owner grow spoof"),
    ]);
    check(
      "cross-user grow spoof is denied identically for paid and Free targets",
      isOwnerMismatchError(paidGrowSpoof.error) &&
        isOwnerMismatchError(freeGrowSpoof.error) &&
        paidGrowSpoof.error?.code === freeGrowSpoof.error?.code &&
        paidGrowSpoof.error?.message === freeGrowSpoof.error?.message,
      [paidGrowSpoof.error, freeGrowSpoof.error]
        .map((error) => `${error?.code ?? "none"}:${error?.message ?? "created"}`)
        .join("; "),
    );

    const [paidTentSpoof, freeTentSpoof] = await Promise.all([
      insertTent(freeA, uidByoPro, "Cross-user paid-owner tent spoof"),
      insertTent(freeA, uidServiceFixture, "Cross-user Free-owner tent spoof"),
    ]);
    check(
      "cross-user tent spoof cannot select another account's paid bypass",
      isOwnerMismatchError(paidTentSpoof.error) &&
        isOwnerMismatchError(freeTentSpoof.error) &&
        paidTentSpoof.error?.code === freeTentSpoof.error?.code &&
        paidTentSpoof.error?.message === freeTentSpoof.error?.message,
      [paidTentSpoof.error, freeTentSpoof.error]
        .map((error) => `${error?.code ?? "none"}:${error?.message ?? "created"}`)
        .join("; "),
    );

    const transferSource = await insertGrow(
      freeA,
      uidFree,
      "Cross-user owner transfer source",
      true,
    );
    if (transferSource.error || !transferSource.data) {
      throw new Error(`create owner-transfer source: ${transferSource.error?.message}`);
    }
    const ownerTransfer = await freeA
      .from("grows")
      .update({ user_id: uidByoPro })
      .eq("id", transferSource.data.id)
      .select("id");
    check(
      "cross-user owner transfer is denied before RLS WITH CHECK",
      isOwnerMismatchError(ownerTransfer.error),
      `${ownerTransfer.error?.code ?? "none"}:${ownerTransfer.error?.message ?? "updated"}`,
    );

    check(
      "cross-user owner spoof creates no rows for either target",
      (await activeCount("grows", uidByoPro)) === 0 &&
        (await activeCount("grows", uidServiceFixture)) === 0 &&
        (await activeCount("tents", uidByoPro)) === 0 &&
        (await activeCount("tents", uidServiceFixture)) === 0,
    );

    console.log("→ Free grow concurrency and transition checks");
    const concurrentGrows = await Promise.all([
      insertGrow(freeA, uidFree, "Free concurrent grow A"),
      insertGrow(freeB, uidFree, "Free concurrent grow B"),
    ]);
    const concurrentSuccesses = concurrentGrows.filter((result) => result.error == null);
    const concurrentDenials = concurrentGrows.filter((result) =>
      isCapError(result.error, "free_active_grow_limit_reached"),
    );
    check(
      "Free concurrent grow attempts leave exactly one active grow",
      concurrentSuccesses.length === 1 &&
        concurrentDenials.length === 1 &&
        (await activeCount("grows", uidFree)) === 1,
      concurrentGrows.map((result) => result.error?.message ?? "created").join("; "),
    );

    const secondGrow = await insertGrow(freeA, uidFree, "Free second active grow");
    check(
      "Free second active grow is denied",
      isCapError(secondGrow.error, "free_active_grow_limit_reached"),
      secondGrow.error?.message,
    );

    const archivedGrow = await insertGrow(freeA, uidFree, "Free archived grow", true);
    if (archivedGrow.error || !archivedGrow.data) {
      throw new Error(`create archived grow: ${archivedGrow.error?.message}`);
    }
    const growReactivate = await freeA
      .from("grows")
      .update({ is_archived: false })
      .eq("id", archivedGrow.data.id)
      .select("id");
    check(
      "Free grow archive-to-active transition is denied",
      isCapError(growReactivate.error, "free_active_grow_limit_reached"),
      growReactivate.error?.message,
    );

    const activeGrowId = concurrentSuccesses[0]?.data?.id;
    if (!activeGrowId) throw new Error("missing concurrent active grow id");
    const archiveCurrentGrow = await freeA
      .from("grows")
      .update({ is_archived: true })
      .eq("id", activeGrowId)
      .select("id");
    const activateReplacementGrow = await freeA
      .from("grows")
      .update({ is_archived: false })
      .eq("id", archivedGrow.data.id)
      .select("id");
    check(
      "Free replacement grow can activate after the prior grow is archived",
      archiveCurrentGrow.error == null &&
        activateReplacementGrow.error == null &&
        (await activeCount("grows", uidFree)) === 1,
      archiveCurrentGrow.error?.message ?? activateReplacementGrow.error?.message,
    );

    const archiveReplacementGrow = await freeA
      .from("grows")
      .update({ is_archived: true })
      .eq("id", archivedGrow.data.id)
      .select("id");
    if (archiveReplacementGrow.error) {
      throw new Error(`archive replacement grow: ${archiveReplacementGrow.error.message}`);
    }
    const bulkGrowInsert = await freeA
      .from("grows")
      .insert([
        {
          user_id: uidFree,
          name: "Free bulk grow A",
          grow_type: "tent",
          stage: "seedling",
        },
        {
          user_id: uidFree,
          name: "Free bulk grow B",
          grow_type: "tent",
          stage: "seedling",
        },
      ])
      .select("id");
    check(
      "Free bulk grow insert cannot create two active rows",
      isCapError(bulkGrowInsert.error, "free_active_grow_limit_reached") &&
        (await activeCount("grows", uidFree)) === 0,
      bulkGrowInsert.error?.message,
    );

    console.log("→ Free tent INSERT and transition checks");
    const firstTent = await insertTent(freeA, uidFree, "Free first tent");
    if (firstTent.error || !firstTent.data) {
      throw new Error(`create first tent: ${firstTent.error?.message}`);
    }
    const secondTent = await insertTent(freeA, uidFree, "Free second active tent");
    check(
      "Free second active tent is denied",
      isCapError(secondTent.error, "free_active_tent_limit_reached"),
      secondTent.error?.message,
    );

    const archivedTent = await insertTent(freeA, uidFree, "Free archived tent", true);
    if (archivedTent.error || !archivedTent.data) {
      throw new Error(`create archived tent: ${archivedTent.error?.message}`);
    }
    const tentReactivate = await freeA
      .from("tents")
      .update({ is_archived: false })
      .eq("id", archivedTent.data.id)
      .select("id");
    check(
      "Free tent archive-to-active transition is denied",
      isCapError(tentReactivate.error, "free_active_tent_limit_reached"),
      tentReactivate.error?.message,
    );

    const archiveCurrentTent = await freeA
      .from("tents")
      .update({ is_archived: true })
      .eq("id", firstTent.data.id)
      .select("id");
    const activateReplacementTent = await freeA
      .from("tents")
      .update({ is_archived: false })
      .eq("id", archivedTent.data.id)
      .select("id");
    check(
      "Free replacement tent can activate after the prior tent is archived",
      archiveCurrentTent.error == null &&
        activateReplacementTent.error == null &&
        (await activeCount("tents", uidFree)) === 1,
      archiveCurrentTent.error?.message ?? activateReplacementTent.error?.message,
    );

    const archiveReplacementTent = await freeA
      .from("tents")
      .update({ is_archived: true })
      .eq("id", archivedTent.data.id)
      .select("id");
    if (archiveReplacementTent.error) {
      throw new Error(`archive replacement tent: ${archiveReplacementTent.error.message}`);
    }
    const bulkTentInsert = await freeA
      .from("tents")
      .insert([
        { user_id: uidFree, name: "Free bulk tent A", stage: "seedling" },
        { user_id: uidFree, name: "Free bulk tent B", stage: "seedling" },
      ])
      .select("id");
    check(
      "Free bulk tent insert cannot create two active rows",
      isCapError(bulkTentInsert.error, "free_active_tent_limit_reached") &&
        (await activeCount("tents", uidFree)) === 0,
      bulkTentInsert.error?.message,
    );

    console.log("→ paid server-union checks");
    await assertPaidUnlimited(
      "BYO Pro",
      "BYO Pro can create multiple active grows and tents",
      byoPro,
      uidByoPro,
    );
    await assertPaidUnlimited(
      "Lovable Founder",
      "Lovable Founder can create multiple active grows and tents",
      founder,
      uidFounder,
    );
    await assertPaidUnlimited(
      "Lovable Craft",
      "Lovable Craft can create multiple active grows and tents",
      craft,
      uidCraft,
    );

    console.log("→ trusted fixture and legacy-overage checks");
    const serviceResults = await Promise.all([
      insertGrow(admin, uidServiceFixture, "Service fixture grow A"),
      insertGrow(admin, uidServiceFixture, "Service fixture grow B"),
      insertTent(admin, uidServiceFixture, "Service fixture tent A"),
      insertTent(admin, uidServiceFixture, "Service fixture tent B"),
    ]);
    check(
      "service_role can seed over-limit Free fixtures",
      serviceResults.every((result) => result.error == null) &&
        (await activeCount("grows", uidServiceFixture)) === 2 &&
        (await activeCount("tents", uidServiceFixture)) === 2,
      serviceResults
        .map((result) => result.error?.message)
        .filter(Boolean)
        .join("; "),
    );

    const fixtureGrowId = serviceResults[0]?.data?.id;
    if (!fixtureGrowId) throw new Error("missing service fixture grow id");
    const legacyEdit = await serviceFixtureUser
      .from("grows")
      .update({ notes: "Existing over-limit row remains editable." })
      .eq("id", fixtureGrowId)
      .select("id");
    check(
      "existing over-limit active rows remain editable",
      legacyEdit.error == null && legacyEdit.data?.length === 1,
      legacyEdit.error?.message,
    );

    const fixtureThirdGrow = await insertGrow(
      serviceFixtureUser,
      uidServiceFixture,
      "Authenticated third fixture grow",
    );
    check(
      "authenticated writes cannot extend a service-seeded Free overage",
      isCapError(fixtureThirdGrow.error, "free_active_grow_limit_reached"),
      fixtureThirdGrow.error?.message,
    );
  } finally {
    console.log("→ teardown");
    for (const userId of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.error(`teardown ${userId}: ${error.message}`);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
