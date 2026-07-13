#!/usr/bin/env -S bun run
/**
 * Runtime RLS/JWT harness for the direct-column pheno candidate number
 * (public.plants.candidate_number) per the confirmed P.2 contract.
 *
 * service_role (admin) is used for seeding, readback, service-role repair, and
 * teardown. All owner/operator/stranger assertions run through real signed-in
 * clients (anon key + JWT), so genuine RLS + the plants_candidate_number_guard
 * trigger apply.
 *
 * Proves: NULL accepted; zero/negative rejected; owner initial assignment;
 * immutability within a hunt; operator cannot mutate but can read; stranger
 * cannot mutate; service-role repair; duplicate-per-hunt rejected; same number in
 * a different hunt allowed; lineage mismatch rejected; detach/hunt-change clears
 * the number; a tagged plant cannot cross grows; untag-then-move succeeds.
 *
 * Run:
 *   bun run scripts/run-pheno-candidate-number-rls-harness.ts
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [key, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!value) {
    console.error(`missing ${key}`);
    process.exit(2);
  }
}

const runId = crypto.randomUUID();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function createUser(label: string) {
  const email = `pcn-${label}-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}): ${error?.message}`);
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

async function seedId(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`seed ${table}: ${error?.message}`);
  return data.id as string;
}

async function setNumber(client: SupabaseClient, plantId: string, n: number | null) {
  const { data, error } = await client
    .from("plants")
    .update({ candidate_number: n })
    .eq("id", plantId)
    .select("id");
  return { error: error?.message ?? null, rows: data?.length ?? 0 };
}

async function setHunt(client: SupabaseClient, plantId: string, huntId: string | null) {
  const { error } = await client
    .from("plants")
    .update({ pheno_hunt_id: huntId })
    .eq("id", plantId)
    .select("id");
  return error?.message ?? null;
}

async function readNumber(plantId: string): Promise<number | null> {
  const { data } = await admin.from("plants").select("candidate_number").eq("id", plantId).single();
  return (data?.candidate_number ?? null) as number | null;
}

async function main() {
  const users: string[] = [];
  const grows: string[] = [];
  const hunts: string[] = [];
  const plantIds: string[] = [];

  try {
    const owner = await createUser("owner");
    users.push(owner.id);
    const op = await createUser("operator");
    users.push(op.id);
    const stranger = await createUser("stranger");
    users.push(stranger.id);

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: op.id, role: "operator" });
    if (roleErr) throw new Error(`grant operator: ${roleErr.message}`);

    const ownerC = await signIn(owner.email, owner.password);
    const opC = await signIn(op.email, op.password);
    const strangerC = await signIn(stranger.email, stranger.password);

    // Seed two grows, hunts, and tagged plants (service_role bypasses guards).
    const gA = await seedId("grows", { user_id: owner.id, name: `PCN gA ${runId}` });
    const gB = await seedId("grows", { user_id: owner.id, name: `PCN gB ${runId}` });
    grows.push(gA, gB);
    const hA = await seedId("pheno_hunts", {
      user_id: owner.id,
      grow_id: gA,
      name: `hunt A ${runId}`,
    });
    const hA2 = await seedId("pheno_hunts", {
      user_id: owner.id,
      grow_id: gA,
      name: `hunt A2 ${runId}`,
    });
    const hB = await seedId("pheno_hunts", {
      user_id: owner.id,
      grow_id: gB,
      name: `hunt B ${runId}`,
    });
    const p1 = await seedId("plants", {
      user_id: owner.id,
      grow_id: gA,
      pheno_hunt_id: hA,
      name: `p1 ${runId}`,
    });
    const p2 = await seedId("plants", {
      user_id: owner.id,
      grow_id: gA,
      pheno_hunt_id: hA,
      name: `p2 ${runId}`,
    });
    const pB = await seedId("plants", {
      user_id: owner.id,
      grow_id: gB,
      pheno_hunt_id: hB,
      name: `pB ${runId}`,
    });
    const pUn = await seedId("plants", { user_id: owner.id, grow_id: gA, name: `pUn ${runId}` });
    hunts.push(hA, hA2, hB);
    plantIds.push(p1, p2, pB, pUn);

    // 1) NULL accepted
    check("seeded plant has NULL candidate_number", (await readNumber(p1)) === null);

    // 2) zero / negative rejected (owner)
    check("owner cannot set zero", !!(await setNumber(ownerC, p1, 0)).error);
    check("owner cannot set negative", !!(await setNumber(ownerC, p1, -1)).error);

    // 3) owner initial assignment NULL -> positive
    const assign = await setNumber(ownerC, p1, 1);
    check(
      "owner assigns candidate #1",
      assign.error === null && (await readNumber(p1)) === 1,
      assign.error ?? "",
    );

    // 4) immutable within the same hunt (change + clear)
    check(
      "candidate number immutable within a hunt (change)",
      !!(await setNumber(ownerC, p1, 2)).error,
    );
    check(
      "candidate number immutable within a hunt (clear)",
      !!(await setNumber(ownerC, p1, null)).error,
    );

    // 5) duplicate within one hunt rejected (p2 also 1 in hunt hA)
    check("duplicate number in the same hunt rejected", !!(await setNumber(ownerC, p2, 1)).error);

    // 6) operator cannot mutate the number — and must fail for the AUTHORIZATION
    //    reason (the "owning grower" guard), not incidentally via immutability or
    //    the unique index. Asserting only "some error" would hide a wrong reason.
    const opMutate = await setNumber(opC, p1, 9);
    check(
      "operator cannot mutate the number (blocked by authorization)",
      (opMutate.error?.includes("owning grower") ?? false) && (await readNumber(p1)) === 1,
      `err=${opMutate.error}`,
    );
    {
      const { data } = await opC.from("plants").select("candidate_number").eq("id", p1).single();
      check("operator can read the number", (data?.candidate_number ?? null) === 1);
    }
    // 6b) operators retain ordinary edit ability on a tagged plant: the guard must
    //     not over-block writes that leave candidate_number untouched (edits label).
    {
      const opEdit = await opC
        .from("plants")
        .update({ candidate_label: `op-edit ${runId}` })
        .eq("id", p1)
        .select("id");
      check(
        "operator can make an ordinary edit on a tagged plant",
        !opEdit.error && (opEdit.data?.length ?? 0) === 1,
        opEdit.error?.message,
      );
    }

    // 7) stranger cannot mutate (no RLS access -> unchanged)
    await setNumber(strangerC, p1, 7);
    check("stranger cannot mutate the number", (await readNumber(p1)) === 1);

    // 8) service_role repair may override immutability
    check(
      "service_role repair can change the number",
      !(await setNumber(admin as SupabaseClient, p1, 3)).error && (await readNumber(p1)) === 3,
    );

    // 9) same number allowed in a different hunt (pB in hunt hB gets 3)
    check(
      "same number allowed in a different hunt",
      (await setNumber(ownerC, pB, 3)).error === null && (await readNumber(pB)) === 3,
    );

    // 10) lineage mismatch rejected (tag a gA plant to hB in gB)
    check("mismatched hunt/grow lineage rejected", !!(await setHunt(ownerC, pUn, hB)));

    // 11) detaching clears the number (p1 has 3)
    check(
      "detaching a hunt clears the number",
      (await setHunt(ownerC, p1, null)) === null && (await readNumber(p1)) === null,
    );

    // 12) changing hunt clears the number; retag requires a fresh assignment
    await setNumber(ownerC, p2, 4); // assign in hA (unique vs p1 which is now detached)
    const moved = await setHunt(ownerC, p2, hA2); // same grow, different hunt
    check("changing hunt clears the number", moved === null && (await readNumber(p2)) === null);
    check(
      "retag requires a fresh manual assignment",
      (await setNumber(ownerC, p2, 4)).error === null,
    );

    // 13) a tagged plant cannot move across grows; untag first
    check(
      "tagged plant cannot move across grows",
      !!(await ownerC.from("plants").update({ grow_id: gB }).eq("id", p2).select("id")).error,
    );
    await setHunt(ownerC, p2, null); // untag (clears number)
    const afterMove = await ownerC.from("plants").update({ grow_id: gB }).eq("id", p2).select("id");
    check("untagging before moving succeeds", !afterMove.error);
  } finally {
    // Grow deletion does NOT cascade to plants (plants.grow_id is ON DELETE SET
    // NULL), and a hunt-tagged plant blocks grow changes — so remove plants first
    // (DELETE is not guarded by the trigger), then hunts, grows, roles, and users.
    if (plantIds.length) await admin.from("plants").delete().in("id", plantIds);
    if (hunts.length) await admin.from("pheno_hunts").delete().in("id", hunts);
    if (grows.length) await admin.from("grows").delete().in("id", grows);
    for (const id of users) {
      await admin.from("user_roles").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  // Verify zero leftover test rows (every seeded row carries runId in its name).
  const leftover = await Promise.all(
    (["plants", "grows", "pheno_hunts"] as const).map(async (t) => {
      const { count } = await admin
        .from(t)
        .select("id", { count: "exact", head: true })
        .like("name", `%${runId}%`);
      return { table: t, count: count ?? 0 };
    }),
  );
  const totalLeftover = leftover.reduce((n, r) => n + r.count, 0);
  check(
    "no leftover test rows after teardown",
    totalLeftover === 0,
    leftover.map((r) => `${r.table}=${r.count}`).join(" "),
  );

  console.log(`pheno candidate_number RLS harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
