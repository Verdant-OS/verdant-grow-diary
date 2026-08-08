#!/usr/bin/env node
/**
 * E2E fixture garden rotation CLI.
 *
 * SAFETY:
 *  - Default DRY-RUN. Destructive mode requires BOTH:
 *      --execute --confirm-fixture-rotation
 *  - Optional diary prune additionally requires --prune-e2e-diary
 *  - User JWT only (anon + Bearer). Never service_role.
 *  - Deletes ONLY hunts that pass isFixtureHuntName.
 *  - Auto-seeds ONLY exact E2E Test Tent / E2E Test Plant names.
 *  - Diary delete ONLY notes matching E2E patterns on fixture plants.
 *  - BLOCKS if account has forbidden/unmarked grows.
 *  - Project pin REQUIRED: LOVABLE_E2E_TARGET_PROJECT_REF or
 *    E2E_ROTATION_TARGET_PROJECT_REF must match VITE_SUPABASE_URL.
 *
 * Session:
 *  - E2E_ROTATION_ACCESS_TOKEN + VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
 *  - or LOVABLE_BROWSER_SUPABASE_SESSION_JSON
 *
 * Exit: 0 completed (incl. dry-run) · 2 blocked · 1 failed
 */

import { createClient } from "@supabase/supabase-js";
import {
  E2E_GARDEN_NAMES,
  parseRotationArgs,
  classifyGardenInventory,
  planRotation,
  executeRotationPlan,
  buildRotationReceipt,
  renderRotationReceipt,
  zeroRotationCounts,
  isE2eDiaryNote,
} from "./e2e-fixture-rotation-core.mjs";

function emit(receipt, humanLines, exitCode) {
  for (const line of humanLines) console.log(line);
  console.log(renderRotationReceipt(receipt));
  process.exit(exitCode);
}

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

function loadAccessToken() {
  const direct = (process.env.E2E_ROTATION_ACCESS_TOKEN ?? "").trim();
  if (direct) return direct;
  const raw = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    const token =
      parsed?.access_token ?? parsed?.accessToken ?? parsed?.session?.access_token ?? null;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Project pin is required (same spirit as one-tent teardown). */
function verifyTargetProject(supabaseUrl) {
  const declared = (
    process.env.E2E_ROTATION_TARGET_PROJECT_REF ||
    process.env.LOVABLE_E2E_TARGET_PROJECT_REF ||
    ""
  ).trim();
  if (!declared) {
    return { ok: false, verified: false, reason: "target_project_unverified" };
  }
  const actual = projectRefFromUrl(supabaseUrl);
  if (!actual || actual !== declared) {
    return { ok: false, verified: false, reason: "target_project_mismatch" };
  }
  return { ok: true, verified: true, reason: null };
}

function buildOps(supabase, userId, expected) {
  return {
    async listGrows() {
      const { data, error } = await supabase.from("grows").select("id,name").limit(200);
      if (error) throw new Error("grows_list_error");
      return data ?? [];
    },
    async listTents() {
      const { data, error } = await supabase.from("tents").select("id,name,grow_id").limit(200);
      if (error) throw new Error("tents_list_error");
      return data ?? [];
    },
    async listPlants() {
      const { data, error } = await supabase
        .from("plants")
        .select("id,name,grow_id,tent_id")
        .eq("is_archived", false)
        .limit(500);
      if (error) throw new Error("plants_list_error");
      return data ?? [];
    },
    async listHunts() {
      const { data, error } = await supabase
        .from("pheno_hunts")
        .select("id,name,grow_id")
        .limit(200);
      if (error) throw new Error("hunts_list_error");
      return data ?? [];
    },
    async listDiary(fixturePlantIds) {
      if (!fixturePlantIds.length) return [];
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id,note,plant_id")
        .in("plant_id", fixturePlantIds)
        .limit(500);
      if (error) throw new Error("diary_list_error");
      return (data ?? []).filter((d) => isE2eDiaryNote(d.note));
    },
    async deletePhenoHunt(huntId) {
      const untag = await supabase
        .from("plants")
        .update({ pheno_hunt_id: null, candidate_label: null })
        .eq("pheno_hunt_id", huntId)
        .select("id");
      if (untag.error) throw new Error("hunt_untag_error");
      const del = await supabase.from("pheno_hunts").delete().eq("id", huntId).select("id");
      if (del.error) throw new Error("hunt_delete_error");
      if (!del.data?.length) throw new Error("hunt_delete_empty");
    },
    async deleteDiaryEntry(entryId) {
      const del = await supabase
        .from("diary_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("id");
      if (del.error) throw new Error("diary_delete_error");
      if (!del.data?.length) throw new Error("diary_delete_empty");
    },
    /**
     * Create exact-name garden pieces only. Never renames existing rows.
     * @param {('tent'|'plant')[]} kinds
     */
    async seedGarden(kinds) {
      const seeded = [];
      const growName = expected.grow || E2E_GARDEN_NAMES.grow;
      const tentName = expected.tent || E2E_GARDEN_NAMES.tent;
      const plantName = expected.plant || E2E_GARDEN_NAMES.plant;

      // Resolve or create grow with exact E2E name (only if seeding tent/plant).
      let grow;
      {
        const { data: existing } = await supabase
          .from("grows")
          .select("id,name")
          .eq("name", growName)
          .maybeSingle();
        if (existing) {
          grow = existing;
        } else {
          // Prefer any existing E2E/Test grow before insert.
          const { data: anyE2e } = await supabase.from("grows").select("id,name").limit(50);
          const marked = (anyE2e ?? []).find((g) => /e2e|test/i.test(g.name));
          if (marked) {
            grow = marked;
          } else {
            const ins = await supabase
              .from("grows")
              .insert({
                name: growName,
                grow_type: "tent",
                stage: "veg",
                started_at: new Date().toISOString(),
                notes: "E2E fixture garden. Safe to prune via rotate-e2e-fixture.",
              })
              .select("id,name")
              .single();
            if (ins.error) throw new Error(`grow_seed_error:${ins.error.message}`);
            grow = ins.data;
            seeded.push("grow");
          }
        }
      }

      let tent;
      if (kinds.includes("tent") || kinds.includes("plant")) {
        const { data: existingTent } = await supabase
          .from("tents")
          .select("id,name,grow_id")
          .eq("name", tentName)
          .maybeSingle();
        if (existingTent) {
          tent = existingTent;
        } else if (kinds.includes("tent") || kinds.includes("plant")) {
          const ins = await supabase
            .from("tents")
            .insert({
              name: tentName,
              grow_id: grow.id,
              stage: "veg",
              light_on: true,
              light_schedule: "18/6",
            })
            .select("id,name")
            .single();
          if (ins.error) throw new Error(`tent_seed_error:${ins.error.message}`);
          tent = ins.data;
          seeded.push("tent");
        }
      }

      if (kinds.includes("plant")) {
        if (!tent) throw new Error("plant_seed_requires_tent");
        const { data: existingPlant } = await supabase
          .from("plants")
          .select("id,name")
          .eq("name", plantName)
          .maybeSingle();
        if (!existingPlant) {
          const ins = await supabase
            .from("plants")
            .insert({
              name: plantName,
              grow_id: grow.id,
              tent_id: tent.id,
              stage: "veg",
              health: "healthy",
              started_at: new Date().toISOString(),
            })
            .select("id,name")
            .single();
          if (ins.error) throw new Error(`plant_seed_error:${ins.error.message}`);
          seeded.push("plant");
        }
      }

      return { seeded };
    },
  };
}

async function main() {
  const argResult = parseRotationArgs(process.argv.slice(2));
  if (argResult.mode === "blocked") {
    emit(
      buildRotationReceipt({
        status: "blocked",
        reason: argResult.reason,
        mode: "blocked",
        counts: zeroRotationCounts(),
      }),
      [
        "E2E fixture rotation: BLOCKED",
        `Reason: ${argResult.reason}`,
        "Usage: node scripts/e2e/rotate-e2e-fixture.mjs [--dry-run]",
        "   or: node scripts/e2e/rotate-e2e-fixture.mjs --execute --confirm-fixture-rotation",
        "   or: … --execute --confirm-fixture-rotation --prune-e2e-diary",
      ],
      2,
    );
  }

  const mode = argResult.mode;
  const pruneDiary = argResult.pruneDiary === true;
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").trim();
  const anon = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const token = loadAccessToken();

  if (!supabaseUrl || !anon || !token) {
    emit(
      buildRotationReceipt({
        status: "blocked",
        reason: "missing_session_or_supabase_env",
        mode,
        counts: zeroRotationCounts(),
        next_steps: [
          "Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and E2E_ROTATION_ACCESS_TOKEN",
          "Set E2E_ROTATION_TARGET_PROJECT_REF (or LOVABLE_E2E_TARGET_PROJECT_REF) to the project ref.",
          "Then re-run dry-run before --execute --confirm-fixture-rotation.",
        ],
      }),
      [
        "E2E fixture rotation: BLOCKED",
        "Reason: missing Supabase URL/anon key or access token.",
        "No deletes performed.",
      ],
      2,
    );
  }

  const project = verifyTargetProject(supabaseUrl);
  if (!project.ok) {
    emit(
      buildRotationReceipt({
        status: "blocked",
        reason: project.reason,
        mode,
        targetProjectVerified: false,
        counts: zeroRotationCounts(),
        next_steps: [
          "Export E2E_ROTATION_TARGET_PROJECT_REF=<ref> matching VITE_SUPABASE_URL host.",
          "Teardown-style pin is required so rotation never hits the wrong project.",
        ],
      }),
      [
        "E2E fixture rotation: BLOCKED",
        `Reason: ${project.reason}`,
        "E2E_ROTATION_TARGET_PROJECT_REF (or LOVABLE_E2E_TARGET_PROJECT_REF) is required and must match the Supabase URL project ref.",
      ],
      2,
    );
  }

  const supabase = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    emit(
      buildRotationReceipt({
        status: "blocked",
        reason: "owner_unverified",
        mode,
        targetProjectVerified: project.verified,
        counts: zeroRotationCounts(),
      }),
      ["E2E fixture rotation: BLOCKED", "Reason: could not verify user from access token."],
      2,
    );
  }
  const userId = userData.user.id;

  const expected = {
    tent: process.env.E2E_FIXTURE_EXPECTED_TENT_NAME?.trim() || E2E_GARDEN_NAMES.tent,
    plant: process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME?.trim() || E2E_GARDEN_NAMES.plant,
    plant2: E2E_GARDEN_NAMES.plant2,
    grow: process.env.E2E_FIXTURE_EXPECTED_GROW_NAME?.trim() || E2E_GARDEN_NAMES.grow,
  };

  const ops = buildOps(supabase, userId, expected);
  let inventory;
  try {
    const [grows, tents, plants, hunts] = await Promise.all([
      ops.listGrows(),
      ops.listTents(),
      ops.listPlants(),
      ops.listHunts(),
    ]);
    // Provisional fixture plant ids for diary scan (exact names).
    const fixturePlantIds = plants
      .filter((p) => p.name === expected.plant || p.name === expected.plant2)
      .map((p) => p.id);
    const diary = await ops.listDiary(fixturePlantIds);
    inventory = { grows, tents, plants, hunts, diary };
  } catch (e) {
    emit(
      buildRotationReceipt({
        status: "failed",
        reason: "discover_failed",
        mode,
        ownerVerified: true,
        targetProjectVerified: project.verified,
        counts: zeroRotationCounts(),
      }),
      ["E2E fixture rotation: FAILED", `Discover error: ${e?.message ?? "unknown"}`],
      1,
    );
  }

  const classification = classifyGardenInventory(inventory, expected);
  const plan = planRotation(classification, { pruneDiary });

  const human = [
    `E2E fixture rotation: mode=${mode} prune_diary=${pruneDiary}`,
    `Owner verified: yes`,
    `Target project verified: yes`,
    `Grows: ${classification.counts.grows} (forbidden=${classification.counts.forbidden_grows}, unmarked=${classification.counts.unmarked_grows})`,
    `Fixture tents: ${classification.fixture_tents.length}, plants: ${classification.fixture_plants.length}`,
    `Hunts planned for delete: ${classification.counts.hunts_to_delete}`,
    `Diary E2E notes on fixture plants: ${classification.counts.diary_to_delete}${pruneDiary ? " (will prune)" : " (pass --prune-e2e-diary to prune)"}`,
    `Missing tent: ${classification.missing.tent}, missing plant: ${classification.missing.plant}`,
  ];

  if (plan.status === "blocked") {
    for (const step of plan.next_steps ?? []) human.push(`NEXT: ${step}`);
    emit(
      buildRotationReceipt({
        status: "blocked",
        reason: plan.reason,
        mode,
        ownerVerified: true,
        targetProjectVerified: project.verified,
        counts: {
          ...zeroRotationCounts(),
          hunts_planned: classification.counts.hunts_to_delete,
          diary_planned: pruneDiary ? classification.counts.diary_to_delete : 0,
          forbidden_grows: classification.counts.forbidden_grows,
          unmarked_grows: classification.counts.unmarked_grows,
        },
        next_steps: plan.next_steps,
      }),
      ["E2E fixture rotation: BLOCKED", `Reason: ${plan.reason}`, ...human.slice(1)],
      2,
    );
  }

  for (const a of plan.actions) {
    if (a.op === "delete_pheno_hunt") {
      human.push(`  plan: delete hunt name=${JSON.stringify(a.name)}`);
    } else if (a.op === "seed_missing") {
      human.push(`  plan: auto-seed ${a.kind} name=${JSON.stringify(a.name)}`);
    } else if (a.op === "delete_e2e_diary") {
      human.push(`  plan: delete diary id=${a.entry_id} note=${JSON.stringify(a.note_preview)}`);
    }
  }

  let result;
  try {
    result = await executeRotationPlan(plan, mode, {
      deletePhenoHunt: (id) => ops.deletePhenoHunt(id),
      seedGarden: (kinds) => ops.seedGarden(kinds),
      deleteDiaryEntry: (id) => ops.deleteDiaryEntry(id),
    });
  } catch (e) {
    emit(
      buildRotationReceipt({
        status: "failed",
        reason: "execute_failed",
        mode,
        ownerVerified: true,
        targetProjectVerified: project.verified,
        counts: {
          ...zeroRotationCounts(),
          hunts_planned: classification.counts.hunts_to_delete,
        },
      }),
      ["E2E fixture rotation: FAILED", `Execute error: ${e?.message ?? "unknown"}`, ...human],
      1,
    );
  }

  const exit = result.status === "completed" ? 0 : result.status === "blocked" ? 2 : 1;
  human.push(`Result: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
  human.push(
    `Hunts deleted: ${result.counts.hunts_deleted}; seeded: ${result.counts.seed_actions_completed}; diary deleted: ${result.counts.diary_deleted}`,
  );
  for (const step of result.next_steps ?? []) human.push(`NEXT: ${step}`);

  emit(
    buildRotationReceipt({
      status: result.status,
      reason: result.reason,
      mode,
      ownerVerified: true,
      targetProjectVerified: project.verified,
      counts: result.counts,
      next_steps: result.next_steps,
    }),
    human,
    exit,
  );
}

main().catch((e) => {
  console.error("E2E fixture rotation: unexpected error", e?.message ?? e);
  process.exit(1);
});
