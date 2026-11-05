/** Pure policy for the owner's explicitly approved production-only Quick Log smoke. */
import type { FixtureSafetyEnv, FixtureEnvValidation } from "./fixtureSafety";

export const QUICKLOG_SMOKE_APP_ORIGIN = "https://verdantgrowdiary.com";
// Public backend origin committed in .env; this is not a credential.
export const QUICKLOG_SMOKE_BACKEND_ORIGIN = "https://knkwiiywfkbqznbxwqfh.supabase.co";
export const QUICKLOG_SMOKE_ACCOUNT_EMAIL = "cheekhimself@gmail.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Non-alphanumeric boundaries (not \b) so underscore-joined names such as
// "E2E_Test_Tent" carry a marker, while "Contest" or "Testing" do not.
export const PRODUCTION_FIXTURE_MARKER = /(?:^|[^A-Za-z0-9])(?:e2e|test|qa)(?:$|[^A-Za-z0-9])/i;
const MARKER = PRODUCTION_FIXTURE_MARKER;

export type FixtureOwnedRow = Readonly<{
  id: string;
  user_id: string;
  name: string;
  is_archived: false;
  grow_id?: string;
  tent_id?: string;
}>;
export type FixtureIdentity = Readonly<{ id: string; email: string }>;
export type FixtureTarget = Readonly<{ plantId: string; tentId: string; growId: string }>;
export type ProductionFixtureEvidence = Readonly<{
  identity: FixtureIdentity | null;
  plants: readonly FixtureOwnedRow[];
  tents: readonly FixtureOwnedRow[];
  grows: readonly FixtureOwnedRow[];
  invalidated: boolean;
}>;

export function productionFixturePlantId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== QUICKLOG_SMOKE_APP_ORIGIN || url.username || url.password || url.hash)
      return null;
    const seen = new Set<string>();
    for (const [key, value] of url.searchParams) {
      if (!["tentId", "growId"].includes(key) || seen.has(key) || !UUID.test(value)) return null;
      seen.add(key);
    }
    const match = /^\/plants\/([^/]+)$/.exec(url.pathname);
    return match && UUID.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

export function productionFixtureContextMatchesTarget(
  value: string,
  target: FixtureTarget,
): boolean {
  if (productionFixturePlantId(value) !== target.plantId) return false;
  const params = new URL(value).searchParams;
  return (
    (!params.has("tentId") || params.get("tentId") === target.tentId) &&
    (!params.has("growId") || params.get("growId") === target.growId)
  );
}

export function validateProductionQuickLogEnv(
  input: FixtureSafetyEnv | null | undefined,
): FixtureEnvValidation {
  const env = input ?? {};
  const errors: string[] = [];
  if (env.E2E_FIXTURE_MODE !== "true") errors.push("fixture_mode_required");
  if (!productionFixturePlantId(env.E2E_GROW_1_PLANT_URL))
    errors.push("canonical_production_plant_url_required");
  const expected = {
    grow: (env.E2E_FIXTURE_EXPECTED_GROW_NAME ?? "").trim(),
    tent: (env.E2E_FIXTURE_EXPECTED_TENT_NAME ?? "").trim(),
    plant: (env.E2E_FIXTURE_EXPECTED_PLANT_NAME ?? "").trim(),
  };
  for (const [key, name] of Object.entries(expected)) {
    if (key === "grow" ? name && !MARKER.test(name) : !name || !MARKER.test(name))
      errors.push(`${key}_fixture_name_required`);
  }
  const hint = env.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT?.trim().toLowerCase();
  if (hint && hint !== QUICKLOG_SMOKE_ACCOUNT_EMAIL) errors.push("unapproved_account_hint");
  return { ok: errors.length === 0, errors, expected };
}

/** Discard every field except the non-secret ownership/relationship evidence. */
export function projectFixtureOwnedRow(value: unknown): FixtureOwnedRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !UUID.test(row.id) ||
    typeof row.user_id !== "string" ||
    !UUID.test(row.user_id) ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.is_archived !== false
  )
    return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    is_archived: false,
    ...(typeof row.grow_id === "string" && UUID.test(row.grow_id) ? { grow_id: row.grow_id } : {}),
    ...(typeof row.tent_id === "string" && UUID.test(row.tent_id) ? { tent_id: row.tent_id } : {}),
  };
}

export function productionFixtureResponseKind(
  urlValue: string,
  method: string,
  status: number,
): "identity" | "plants" | "tents" | "grows" | null {
  try {
    const url = new URL(urlValue);
    if (
      url.origin !== QUICKLOG_SMOKE_BACKEND_ORIGIN ||
      url.username ||
      url.password ||
      method !== "GET" ||
      status !== 200
    )
      return null;
    if (url.pathname === "/auth/v1/user") return "identity";
    const match = /^\/rest\/v1\/(plants|tents|grows)$/.exec(url.pathname);
    return match ? (match[1] as "plants" | "tents" | "grows") : null;
  } catch {
    return null;
  }
}

/** All three rows must be positively owned; page access/RLS alone is insufficient. */
export function validateProductionFixtureTarget(
  evidence: ProductionFixtureEvidence | null | undefined,
  target: FixtureTarget | null | undefined,
  expected: FixtureEnvValidation["expected"] | null | undefined,
  plantName = expected?.plant ?? "",
): { ok: boolean; errors: string[] } {
  if (!evidence || !target || !expected)
    return { ok: false, errors: ["complete_fixture_evidence_required"] };
  const errors: string[] = [];
  const identity = evidence.identity;
  if (evidence.invalidated) errors.push("fixture_evidence_invalidated");
  if (
    !identity ||
    !UUID.test(identity.id) ||
    identity.email.toLowerCase() !== QUICKLOG_SMOKE_ACCOUNT_EMAIL
  )
    errors.push("approved_server_account_required");
  if (![target.plantId, target.tentId, target.growId].every((id) => UUID.test(id)))
    errors.push("complete_target_required");
  const plant = evidence.plants.find((row) => row.id === target.plantId);
  const tent = evidence.tents.find((row) => row.id === target.tentId);
  const grow = evidence.grows.find((row) => row.id === target.growId);
  for (const [kind, row, name] of [
    ["plant", plant, plantName],
    ["tent", tent, expected.tent],
    ["grow", grow, expected.grow],
  ] as const) {
    if (
      !row ||
      row.user_id !== identity?.id ||
      row.is_archived !== false ||
      row.name !== name ||
      !MARKER.test(name)
    )
      errors.push(`${kind}_owned_fixture_required`);
  }
  if (
    !plant ||
    !tent ||
    plant.tent_id !== target.tentId ||
    plant.grow_id !== target.growId ||
    tent.grow_id !== target.growId
  )
    errors.push("fixture_relationship_mismatch");
  return { ok: errors.length === 0, errors };
}

export function buildQuickLogSmokeNote(now: Date, sequence: 1 | 2): string {
  if (!Number.isFinite(now.getTime())) throw new Error("smoke_clock_invalid");
  return `[smoke ${now.toISOString()}] Quick Log checklist observation ${sequence}`;
}
