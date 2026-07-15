/**
 * phenoCandidateNumberService — the ONE client write path for assigning a Pheno
 * Hunt candidate number.
 *
 * Per the confirmed candidate-number contract (migration 20260712010343) there
 * is NO RPC and NO allocator: a candidate number is a plain owner-chosen
 * `plants.candidate_number` UPDATE (NULL → positive integer), and the database
 * `plants_candidate_number_guard` trigger is the AUTHORITATIVE enforcer of:
 *   - ownership (only auth.uid() = plants.user_id may set it),
 *   - the Pheno Tracker Pro entitlement gate,
 *   - per-hunt uniqueness, positivity, and immutability-within-a-hunt.
 *
 * This module never allocates, suggests, or auto-fills a number. It writes only
 * NULL → positive (the `.is("candidate_number", null)` predicate makes the
 * write a no-op on an already-numbered candidate, so we never even attempt an
 * immutable change), and maps the database's rejections to calm, grower-facing
 * messages. Client validation here is presentation-only; the trigger decides.
 *
 * No service_role, no automation, no AI, no Action Queue, no device control.
 */
import { phenoDb } from "@/integrations/supabase/phenoTables";

export type AssignCandidateNumberFailure =
  | "invalid"
  | "duplicate"
  | "immutable"
  | "not_owner"
  | "entitlement"
  | "stale"
  | "constraint"
  | "network";

export type AssignCandidateNumberResult =
  | { ok: true; candidateNumber: number }
  | { ok: false; reason: AssignCandidateNumberFailure; error: string };

export interface AssignCandidateNumberInput {
  readonly plantId: string;
  readonly candidateNumber: number;
}

const MESSAGES: Record<AssignCandidateNumberFailure, string> = {
  invalid: "Enter a positive whole number.",
  duplicate: "That number is already used by another candidate in this hunt. Pick a different one.",
  immutable:
    "This candidate already has a fixed number. Numbers can't be changed within a hunt — untag the plant to clear it.",
  not_owner: "Only the hunt owner can assign a candidate number.",
  entitlement: "Assigning a candidate number needs an active Pheno Tracker Pro plan.",
  stale: "This candidate already has a number. Refresh to see the current value.",
  constraint: "This candidate can't be numbered yet — it must be tagged to this hunt first.",
  network: "Couldn't save the number. Check your connection and try again.",
};

function fail(reason: AssignCandidateNumberFailure): AssignCandidateNumberResult {
  return { ok: false, reason, error: MESSAGES[reason] };
}

/** Presentation-only validity: a finite positive integer. */
export function isAssignableCandidateNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Map a Postgres/PostgREST error onto a calm failure reason. The trigger raises
 * specific SQLSTATEs; we disambiguate the two `insufficient_privilege` and two
 * `check_violation` cases by message text (kept in sync with the migration).
 */
function classifyError(error: {
  code?: string | null;
  message?: string | null;
}): AssignCandidateNumberFailure {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "23505") return "duplicate";
  if (code === "42501") {
    if (
      message.includes("pro") ||
      message.includes("subscription") ||
      message.includes("entitlement")
    ) {
      return "entitlement";
    }
    return "not_owner";
  }
  if (code === "23514") {
    if (message.includes("immutable")) return "immutable";
    return "constraint";
  }
  return "network";
}

/**
 * Assign a candidate number to an unnumbered plant. Returns a calm typed result
 * — never throws for expected denials. The database is authoritative; a UI that
 * lets the wrong user reach this still gets rejected here and surfaced calmly.
 */
export async function assignPhenoCandidateNumber(
  input: AssignCandidateNumberInput,
): Promise<AssignCandidateNumberResult> {
  const plantId = typeof input.plantId === "string" ? input.plantId.trim() : "";
  if (!plantId) return fail("invalid");
  if (!isAssignableCandidateNumber(input.candidateNumber)) return fail("invalid");

  try {
    const { data, error } = await phenoDb
      .from("plants")
      .update({ candidate_number: input.candidateNumber })
      // Only assign when currently unnumbered — this makes the write a no-op on
      // an already-numbered candidate (0 rows), so we never attempt an immutable
      // change and can detect the stale case explicitly below.
      .eq("id", plantId)
      .is("candidate_number", null)
      .select("id, candidate_number")
      .maybeSingle();

    if (error) return fail(classifyError(error));
    // No row updated: either the candidate is already numbered (stale view) or
    // the row isn't visible/owned under RLS. Either way the calm signal is the
    // same — refresh to see the authoritative state.
    if (!data) return fail("stale");

    const saved = (data as { candidate_number: number | null }).candidate_number;
    if (!isAssignableCandidateNumber(saved)) return fail("network");
    return { ok: true, candidateNumber: saved };
  } catch {
    return fail("network");
  }
}
