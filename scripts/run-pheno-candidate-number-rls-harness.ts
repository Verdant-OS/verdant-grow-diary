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

async function seedId(
  table: string,
  row: Record<string, unknown>,
  track: string[],
): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`seed ${table}: ${error?.message}`);
  // Track the id the instant it exists, so a later seed failure still tears it down.
  track.push(data.id as string);
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
  const cleanupErrors: string[] = [];

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
    // seedId() tracks each id the moment it is created, so a mid-seed failure
    // still leaves every already-created row queued for teardown.
    const gA = await seedId("grows", { user_id: owner.id, name: `PCN gA ${runId}` }, grows);
    const gB = await seedId("grows", { user_id: owner.id, name: `PCN gB ${runId}` }, grows);
    const hA = await seedId(
      "pheno_hunts",
      { user_id: owner.id, grow_id: gA, name: `hunt A ${runId}` },
      hunts,
    );
    const hA2 = await seedId(
      "pheno_hunts",
      { user_id: owner.id, grow_id: gA, name: `hunt A2 ${runId}` },
      hunts,
    );
    const hB = await seedId(
      "pheno_hunts",
      { user_id: owner.id, grow_id: gB, name: `hunt B ${runId}` },
      hunts,
    );
    const p1 = await seedId(
      "plants",
      { user_id: owner.id, grow_id: gA, pheno_hunt_id: hA, name: `p1 ${runId}` },
      plantIds,
    );
    const p2 = await seedId(
      "plants",
      { user_id: owner.id, grow_id: gA, pheno_hunt_id: hA, name: `p2 ${runId}` },
      plantIds,
    );
    const pB = await seedId(
      "plants",
      { user_id: owner.id, grow_id: gB, pheno_hunt_id: hB, name: `pB ${runId}` },
      plantIds,
    );
    const pUn = await seedId(
      "plants",
      { user_id: owner.id, grow_id: gA, name: `pUn ${runId}` },
      plantIds,
    );

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

    // 14) pheno_hunts-side guard: a hunt with numbered plants cannot change grow.
    //     pB still holds #3 in hB (check 9), so moving hB's grow must be blocked.
    {
      const moveHunt = await ownerC
        .from("pheno_hunts")
        .update({ grow_id: gA })
        .eq("id", hB)
        .select("id");
      check(
        "hunt with numbered plants cannot change grow",
        !!moveHunt.error && (await readNumber(pB)) === 3,
        moveHunt.error?.message,
      );
    }

    // 15) a direct grow_id -> NULL on a tagged plant is rejected for owner AND
    //     operator (untag first). pB is tagged hB with #3.
    {
      const ownerNull = await ownerC
        .from("plants")
        .update({ grow_id: null })
        .eq("id", pB)
        .select("id");
      check(
        "owner cannot null grow_id on a tagged plant",
        !!ownerNull.error,
        ownerNull.error?.message,
      );
      const opNull = await opC.from("plants").update({ grow_id: null }).eq("id", pB).select("id");
      check(
        "operator cannot null grow_id on a tagged plant",
        !!opNull.error,
        opNull.error?.message,
      );
    }

    // 16) owner grow deletion detaches + RETAINS tagged plants (numbered AND
    //     unnumbered): the plants survive with grow_id / pheno_hunt_id /
    //     candidate_number all NULL (existing SET-NULL retention preserved).
    {
      const gDel = await seedId("grows", { user_id: owner.id, name: `PCN gDel ${runId}` }, grows);
      const hDel = await seedId(
        "pheno_hunts",
        { user_id: owner.id, grow_id: gDel, name: `hunt Del ${runId}` },
        hunts,
      );
      const pDelN = await seedId(
        "plants",
        {
          user_id: owner.id,
          grow_id: gDel,
          pheno_hunt_id: hDel,
          candidate_number: 1,
          name: `pDelN ${runId}`,
        },
        plantIds,
      );
      const pDelU = await seedId(
        "plants",
        { user_id: owner.id, grow_id: gDel, pheno_hunt_id: hDel, name: `pDelU ${runId}` },
        plantIds,
      );
      const del = await ownerC.from("grows").delete().eq("id", gDel).select("id");
      const { data: retained } = await admin
        .from("plants")
        .select("id, grow_id, pheno_hunt_id, candidate_number")
        .in("id", [pDelN, pDelU]);
      const allNulled =
        (retained?.length ?? 0) === 2 &&
        (retained ?? []).every(
          (r) => r.grow_id === null && r.pheno_hunt_id === null && r.candidate_number === null,
        );
      check(
        "owner grow delete detaches + retains tagged plants (all NULL)",
        !del.error && allNulled,
        `err=${del.error?.message} retained=${retained?.length ?? 0}`,
      );
    }
  } finally {
    // Grow deletion does NOT cascade to plants (plants.grow_id is ON DELETE SET
    // NULL), and a hunt-tagged plant blocks grow changes — so remove plants first
    // (DELETE is not guarded by the trigger), then hunts, grows, roles, and users.
    // Every step is attempted even if an earlier one fails; each delete error is
    // recorded and fails the run (never silently swallowed).
    const step = async (label: string, fn: () => Promise<{ error: unknown }>) => {
      try {
        const { error } = await fn();
        if (error) {
          const msg = (error as { message?: string }).message ?? String(error);
          cleanupErrors.push(`${label}: ${msg}`);
        }
      } catch (e) {
        cleanupErrors.push(`${label}: ${(e as Error).message}`);
      }
    };
    if (plantIds.length)
      await step("delete plants", async () => admin.from("plants").delete().in("id", plantIds));
    if (hunts.length)
      await step("delete pheno_hunts", async () =>
        admin.from("pheno_hunts").delete().in("id", hunts),
      );
    if (grows.length)
      await step("delete grows", async () => admin.from("grows").delete().in("id", grows));
    for (const id of users) {
      await step(`delete user_roles ${id}`, async () =>
        admin.from("user_roles").delete().eq("user_id", id),
      );
      await step(`delete auth user ${id}`, async () => {
        const { error } = await admin.auth.admin.deleteUser(id);
        return { error };
      });
    }
  }

  // Zero-leftover verification. A failed count query is itself a failure — it is
  // never coerced into "0 leftovers". Covers seeded rows, user_roles, and the
  // created auth users.
  const problems: string[] = [...cleanupErrors];

  for (const t of ["plants", "grows", "pheno_hunts"] as const) {
    const { count, error } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .like("name", `%${runId}%`);
    if (error) problems.push(`leftover query ${t}: ${error.message}`);
    else if (count === null) problems.push(`leftover query ${t}: null count`);
    else if (count > 0) problems.push(`${t} leftover=${count}`);
  }

  if (users.length) {
    const { count, error } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", users);
    if (error) problems.push(`leftover query user_roles: ${error.message}`);
    else if (count === null) problems.push(`leftover query user_roles: null count`);
    else if (count > 0) problems.push(`user_roles leftover=${count}`);
  }

  for (const id of users) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) {
      if (!/not.*found|404/i.test(error.message))
        problems.push(`auth getUser ${id}: ${error.message}`);
    } else if (data?.user) {
      problems.push(`auth user ${id} still exists`);
    }
  }

  check(
    "cleanup complete: no leftover rows, user_roles, or auth users",
    problems.length === 0,
    problems.join("; "),
  );

  console.log(`pheno candidate_number RLS harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
