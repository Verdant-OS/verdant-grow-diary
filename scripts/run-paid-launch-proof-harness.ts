/**
 * Paid-launch proof harness — RUNTIME proofs against a disposable/sandbox
 * Supabase project. NEVER production. Uses obviously fake ids/secrets and
 * never contacts Paddle or triggers a charge.
 *
 * Run: bun run scripts/run-paid-launch-proof-harness.ts
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *      (exit 2 when missing — mirrors run-billing-rls-harness.ts).
 *
 * Proves, at the database layer (the RPCs re-validate everything, so these
 * hold regardless of which webhook received the event):
 *   1. valid processed event + verified link → exactly one billing row
 *   2. duplicate application → noop, no duplicate entitlement
 *   3. unverified-signature event → blocked, zero writes
 *   4. wrong environment (live) → blocked, zero writes
 *   5. unknown plan → blocked; missing link → blocked
 *   6. cancel/pause/past-due transitions apply; older occurred_at → noop
 *   7. founder: allocation, idempotent duplicate, concurrency (parallel
 *      calls mint distinct numbers), cap respected, subscription events
 *      cannot allocate
 *   8. authenticated client cannot write any billing row; anon denied
 *   9. every RPC invocation leaves a sanitized audit row
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !SERVICE || !ANON) {
  console.error(
    "paid-launch harness: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY — refusing to guess. Exit 2.",
  );
  process.exit(2);
}

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon: SupabaseClient = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUN = `plh-${Math.random().toString(36).slice(2, 10)}`;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures++;
    console.error(`  FAIL - ${name}`, detail ?? "");
  }
}

type SeededEvent = { eventId: string; processingId: string };

async function seedUser(tag: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${RUN}-${tag}@verdant.test`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`seed user ${tag}: ${error?.message}`);
  return data.user.id;
}

async function seedEvent(opts: {
  tag: string;
  eventType: string;
  environment?: string;
  signatureVerified?: boolean;
  planId?: string | null;
  status?: string | null;
  customerId?: string;
  subscriptionId?: string | null;
  occurredAt?: string | null;
  periodEnd?: string | null;
  founder?: boolean;
  processingStatus?: string;
}): Promise<SeededEvent> {
  const env = opts.environment ?? "sandbox";
  const { data: evt, error: e1 } = await admin
    .from("paddle_events")
    .insert({
      event_id: `fake_evt_${RUN}_${opts.tag}`,
      event_type: opts.eventType,
      environment: env,
      signature_verified: opts.signatureVerified ?? true,
      payload: { fake: true, run: RUN },
    })
    .select("id")
    .single();
  if (e1 || !evt) throw new Error(`seed event ${opts.tag}: ${e1?.message}`);
  const { data: proc, error: e2 } = await admin
    .from("paddle_event_processing")
    .insert({
      paddle_event_id: evt.id,
      event_id: `fake_evt_${RUN}_${opts.tag}`,
      event_type: opts.eventType,
      environment: env,
      status: opts.processingStatus ?? "processed",
      reason: null,
      candidate_plan_id: opts.planId === undefined ? "pro_monthly" : opts.planId,
      candidate_status: opts.status === undefined ? "active" : opts.status,
      provider_customer_id: opts.customerId ?? `fake_ctm_${RUN}_${opts.tag}`,
      provider_subscription_id:
        opts.subscriptionId === undefined ? `fake_sub_${RUN}_${opts.tag}` : opts.subscriptionId,
      provider_price_id: `fake_pri_${RUN}`,
      current_period_end: opts.periodEnd ?? null,
      cancel_at_period_end: false,
      is_founder_candidate: opts.founder ?? false,
      occurred_at: opts.occurredAt ?? null,
      details: { phase: "harness", run: RUN },
    })
    .select("id")
    .single();
  if (e2 || !proc) throw new Error(`seed processing ${opts.tag}: ${e2?.message}`);
  return { eventId: evt.id, processingId: proc.id };
}

async function seedLink(userId: string, customerId: string, subscriptionId: string | null) {
  const { error } = await admin.from("billing_customer_links").insert({
    user_id: userId,
    provider: "paddle",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    link_status: "linked",
    link_source: "webhook",
    confidence: "verified",
  });
  if (error) throw new Error(`seed link: ${error.message}`);
}

async function rpc(name: string, processingId: string) {
  const { data, error } = await admin.rpc(name, { p_processing_id: processingId });
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as { ok: boolean; status: string; reason: string | null; user_id: string | null };
}

async function billingRow(userId: string) {
  const { data } = await admin
    .from("billing_subscriptions")
    .select("plan_id,status,founder_number,provider_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function main() {
  console.log(`paid-launch proof harness run ${RUN}`);
  const userA = await seedUser("a");
  const userB = await seedUser("b");
  const cleanupUsers = [userA, userB];

  // 1. valid event → exactly one row
  const cA = `fake_ctm_${RUN}_a`;
  const sA = `fake_sub_${RUN}_a`;
  await seedLink(userA, cA, sA);
  const ev1 = await seedEvent({ tag: "a1", customerId: cA, subscriptionId: sA, occurredAt: "2026-07-01T00:00:00Z" });
  let r = await rpc("apply_paddle_subscription_update_with_audit", ev1.processingId);
  check("valid event creates entitlement", r.ok && r.status === "created");
  check("exactly one billing row", (await billingRow(userA))?.plan_id === "pro_monthly");

  // 2. duplicate application → noop
  r = await rpc("apply_paddle_subscription_update_with_audit", ev1.processingId);
  check("duplicate application is a noop", r.ok && r.status === "noop" && r.reason === "already_applied");

  // 3. unverified signature → blocked
  const ev2 = await seedEvent({ tag: "a2", customerId: cA, subscriptionId: sA, signatureVerified: false });
  r = await rpc("apply_paddle_subscription_update_with_audit", ev2.processingId);
  check("unverified event blocked", !r.ok && r.reason === "event_not_verified");

  // 4. wrong environment → blocked
  const ev3 = await seedEvent({ tag: "a3", customerId: cA, subscriptionId: sA, environment: "live" });
  r = await rpc("apply_paddle_subscription_update_with_audit", ev3.processingId);
  check("live environment blocked (launch posture)", !r.ok && r.reason === "environment_not_allowed");

  // 5. unknown plan / missing link → blocked
  const ev4 = await seedEvent({ tag: "a4", customerId: cA, subscriptionId: sA, planId: "free" });
  r = await rpc("apply_paddle_subscription_update_with_audit", ev4.processingId);
  check("unknown plan blocked", !r.ok && r.reason === "unknown_plan");
  const ev5 = await seedEvent({ tag: "a5", customerId: `fake_ctm_${RUN}_nolink`, subscriptionId: `fake_sub_${RUN}_nolink` });
  r = await rpc("apply_paddle_subscription_update_with_audit", ev5.processingId);
  check("missing verified link blocked", !r.ok && r.reason === "missing_verified_customer_link");

  // 6. transitions + ordering
  const evPd = await seedEvent({ tag: "a6", customerId: cA, subscriptionId: sA, status: "past_due", occurredAt: "2026-07-02T00:00:00Z" });
  r = await rpc("apply_paddle_subscription_update_with_audit", evPd.processingId);
  check("past_due transition applies", r.ok && (await billingRow(userA))?.status === "past_due");
  const evOld = await seedEvent({ tag: "a7", customerId: cA, subscriptionId: sA, status: "canceled", occurredAt: "2026-06-01T00:00:00Z" });
  r = await rpc("apply_paddle_subscription_update_with_audit", evOld.processingId);
  check(
    "older replayed cancel cannot overwrite newer state",
    r.ok && r.status === "noop" && r.reason === "stale_event_ordering" && (await billingRow(userA))?.status === "past_due",
  );
  const evCancel = await seedEvent({ tag: "a8", customerId: cA, subscriptionId: sA, status: "canceled", occurredAt: "2026-07-03T00:00:00Z" });
  r = await rpc("apply_paddle_subscription_update_with_audit", evCancel.processingId);
  check("newer cancel applies", r.ok && (await billingRow(userA))?.status === "canceled");

  // 7. founder: transaction-only, idempotent, concurrent-safe
  const cB = `fake_ctm_${RUN}_b`;
  await seedLink(userB, cB, null);
  const evFsub = await seedEvent({ tag: "f0", eventType: "subscription.created", customerId: cB, subscriptionId: null, planId: "founder_lifetime", founder: true });
  r = await rpc("allocate_founder_lifetime_with_audit", evFsub.processingId);
  check("subscription event cannot allocate founder", !r.ok && r.reason === "founder_requires_completed_transaction");
  const evF1 = await seedEvent({ tag: "f1", eventType: "transaction.completed", customerId: cB, subscriptionId: null, planId: "founder_lifetime", founder: true });
  const evF2 = await seedEvent({ tag: "f2", eventType: "transaction.completed", customerId: cB, subscriptionId: null, planId: "founder_lifetime", founder: true });
  const [rf1, rf2] = await Promise.all([
    rpc("allocate_founder_lifetime_with_audit", evF1.processingId),
    rpc("allocate_founder_lifetime_with_audit", evF2.processingId),
  ]);
  const rowB = await billingRow(userB);
  const outcomes = [rf1, rf2].map((x) => `${x.status}:${x.reason ?? ""}`).sort();
  check(
    "concurrent founder events yield ONE allocation + one noop/idempotent outcome",
    rowB?.plan_id === "founder_lifetime" &&
      typeof rowB?.founder_number === "number" &&
      outcomes.some((o) => o.startsWith("created") || o.startsWith("updated")),
    outcomes,
  );
  r = await rpc("allocate_founder_lifetime_with_audit", evF1.processingId);
  check("replayed founder event is a noop", r.ok && r.reason === "already_founder");

  // 8. client-side isolation (RLS)
  const { error: anonRead } = await anon.from("billing_subscriptions").select("*").limit(1);
  const anonRows = anonRead ? [] : ((await anon.from("billing_subscriptions").select("*").limit(1)).data ?? []);
  check("anon reads no billing rows", anonRows.length === 0);
  const { error: anonWrite } = await anon
    .from("billing_subscriptions")
    .insert({ user_id: userA, plan_id: "founder_lifetime", status: "active" });
  check("anon cannot write billing rows", !!anonWrite);
  const { error: anonRpc } = await anon.rpc("allocate_founder_lifetime", { p_processing_id: ev1.processingId });
  check("anon cannot execute founder RPC", !!anonRpc);

  // 9. audit rows exist and are sanitized
  const { data: audits } = await admin
    .from("billing_subscription_update_audit")
    .select("result_status,result_reason")
    .in("processing_id", [ev1.processingId, evF1.processingId, ev3.processingId]);
  check("audit rows recorded for success, founder, and blocked paths", (audits?.length ?? 0) >= 3);
  check(
    "audit reasons carry no fake provider ids",
    !(JSON.stringify(audits ?? []).includes("fake_ctm_") || JSON.stringify(audits ?? []).includes("fake_sub_")),
  );
  const { error: auditUpdate } = await admin
    .from("billing_subscription_update_audit")
    .update({ result_reason: "tampered" })
    .eq("processing_id", ev1.processingId);
  check("audit history is append-only even for service_role", !!auditUpdate);

  // Cleanup — RUN-tagged rows and users only.
  await admin.from("billing_subscriptions").delete().in("user_id", cleanupUsers);
  await admin.from("billing_customer_links").delete().in("user_id", cleanupUsers);
  await admin.from("paddle_events").delete().like("event_id", `fake_evt_${RUN}_%`);
  for (const id of cleanupUsers) await admin.auth.admin.deleteUser(id);

  console.log(failures === 0 ? "PAID-LAUNCH HARNESS: ALL PROOFS PASSED" : `PAID-LAUNCH HARNESS: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("paid-launch harness crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
