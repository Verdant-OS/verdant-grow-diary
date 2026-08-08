#!/usr/bin/env node
/**
 * E2E fixture garden rotation CLI.
 *
 * SAFETY:
 *  - Default DRY-RUN. Destructive mode requires BOTH:
 *      --execute --confirm-fixture-rotation
 *  - User JWT only when connected (anon + Bearer). Never service_role.
 *  - Deletes ONLY pheno_hunts that pass isFixtureHuntName (E2E-prefixed).
 *  - BLOCKS if account has forbidden/unmarked grows (contaminated).
 *  - Never bulk-deletes diary entries.
 *  - Project pin optional but when LOVABLE_E2E_TARGET_PROJECT_REF is set it
 *    must match VITE_SUPABASE_URL.
 *
 * Session (optional for dry inventory from flags; required for live discover):
 *  - E2E_ROTATION_ACCESS_TOKEN + VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
 *  - or LOVABLE_BROWSER_SUPABASE_SESSION_JSON (managed browser session)
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
} from "./e2e-fixture-rotation-core.mjs";

function emit(receipt, humanLines, exitCode) {
  for (const line of humanLines) console.log(line);
  console.log(renderRotationReceipt(receipt));
  process.exit(exitCode);
}

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname; // <ref>.supabase.co
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

function verifyTargetProject(supabaseUrl) {
  const declared = (process.env.LOVABLE_E2E_TARGET_PROJECT_REF ?? "").trim();
  if (!declared) {
    return { ok: true, verified: false, reason: null };
  }
  const actual = projectRefFromUrl(supabaseUrl);
  if (!actual || actual !== declared) {
    return {
      ok: false,
      verified: false,
      reason: "target_project_mismatch",
    };
  }
  return { ok: true, verified: true, reason: null };
}

function buildOps(supabase) {
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
    async deletePhenoHunt(huntId) {
      // Prefer RPC-free path: untag plants then delete hunt (mirrors app service intent).
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
      ],
      2,
    );
  }

  const mode = argResult.mode;
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
          "or LOVABLE_BROWSER_SUPABASE_SESSION_JSON from a managed fixture login.",
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
      }),
      [
        "E2E fixture rotation: BLOCKED",
        `Reason: ${project.reason}`,
        "LOVABLE_E2E_TARGET_PROJECT_REF must match VITE_SUPABASE_URL project ref.",
      ],
      2,
    );
  }

  const supabase = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve user (owner verified).
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

  const ops = buildOps(supabase);
  let inventory;
  try {
    const [grows, tents, plants, hunts] = await Promise.all([
      ops.listGrows(),
      ops.listTents(),
      ops.listPlants(),
      ops.listHunts(),
    ]);
    inventory = { grows, tents, plants, hunts };
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

  const expected = {
    tent: process.env.E2E_FIXTURE_EXPECTED_TENT_NAME?.trim() || E2E_GARDEN_NAMES.tent,
    plant: process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME?.trim() || E2E_GARDEN_NAMES.plant,
    plant2: E2E_GARDEN_NAMES.plant2,
    grow: process.env.E2E_FIXTURE_EXPECTED_GROW_NAME?.trim() || E2E_GARDEN_NAMES.grow,
  };

  const classification = classifyGardenInventory(inventory, expected);
  const plan = planRotation(classification);

  const human = [
    `E2E fixture rotation: mode=${mode}`,
    `Owner verified: yes`,
    `Target project verified: ${project.verified ? "yes" : "not declared"}`,
    `Grows: ${classification.counts.grows} (forbidden=${classification.counts.forbidden_grows}, unmarked=${classification.counts.unmarked_grows})`,
    `Fixture tents: ${classification.fixture_tents.length}, plants: ${classification.fixture_plants.length}`,
    `Hunts planned for delete: ${classification.counts.hunts_to_delete}`,
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
      human.push(`  plan: seed missing ${a.kind} name=${JSON.stringify(a.name)}`);
    }
  }

  let result;
  try {
    result = await executeRotationPlan(plan, mode, {
      deletePhenoHunt: (id) => ops.deletePhenoHunt(id),
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
  human.push(`Hunts deleted: ${result.counts.hunts_deleted}`);
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
