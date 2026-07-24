/**
 * plantPayloadValidation — request/response guards for plant rows.
 *
 * Two directions, one contract:
 *  - `validatePlantInsertPayload` normalizes and rejects outbound insert
 *    payloads that would fail the DB CHECK/NOT NULL constraints, so the UI
 *    never posts a plant missing `name`, a valid `stage`/`health`, or a
 *    canonical `plant_type`.
 *  - `validatePlantRowResponse` guards inbound rows from Lovable Cloud so a
 *    row missing `plant_type` (schema drift, cached response, RPC bypass)
 *    cannot reach the UI silently as a "photoperiod" default.
 *
 * Pure: no I/O, no React, no Supabase. Callers decide what to do with the
 * result — throw, toast, drop the row, etc.
 */
import { z } from "zod";
import { normalizePlantType, PLANT_TYPE_VALUES, type PlantType } from "@/lib/plantTypeRules";

const STAGES = ["seedling", "veg", "flower", "flush", "harvest", "cure"] as const;
const HEALTHS = ["healthy", "watch", "issue"] as const;

const uuid = z.string().uuid();

/**
 * Outbound insert payload contract. Mirrors the plants-table NOT NULL/CHECK
 * columns. `plant_type` is required and canonicalized before it leaves the
 * client — "unknown" is a legitimate value, blank/garbage is not.
 */
export const PlantInsertPayloadSchema = z
  .object({
    user_id: uuid,
    name: z.string().trim().min(1, "Plant name is required").max(120),
    strain: z.string().trim().max(120).nullish(),
    stage: z.enum(STAGES),
    health: z.enum(HEALTHS),
    plant_type: z.enum(PLANT_TYPE_VALUES as readonly [PlantType, ...PlantType[]]),
    tent_id: uuid.optional(),
    grow_id: uuid.optional(),
    started_at: z.string().datetime().optional(),
  })
  .strict();

export type PlantInsertPayload = z.infer<typeof PlantInsertPayloadSchema>;

export interface PlantPayloadValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly errors: readonly string[];
}

/**
 * Normalize + validate a plant insert payload. Trims strings and canonicalizes
 * plant_type before the schema check so callers that pass `"Autoflower "` or
 * omit the field entirely still produce a compliant payload (unknown, not a
 * silent photoperiod default).
 */
export function validatePlantInsertPayload(
  input: Record<string, unknown>,
): PlantPayloadValidationResult<PlantInsertPayload> {
  const draft: Record<string, unknown> = { ...input };
  draft.plant_type = normalizePlantType(
    typeof draft.plant_type === "string" ? draft.plant_type : null,
  );
  if (typeof draft.name === "string") draft.name = draft.name.trim();
  if (typeof draft.strain === "string") {
    const trimmed = draft.strain.trim();
    draft.strain = trimmed.length > 0 ? trimmed : null;
  }
  const parsed = PlantInsertPayloadSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "payload"}: ${i.message}`),
    };
  }
  return { ok: true, value: parsed.data, errors: [] };
}

/**
 * Inbound row contract. Only the fields the UI depends on are asserted; extra
 * columns are ignored so schema additions don't break the guard. `plant_type`
 * must be present as a string — a null/missing value is drift, not "unknown".
 */
const PlantRowResponseSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    plant_type: z.string(),
  })
  .passthrough();

/**
 * Guard a single plant row from the database. Rows missing required fields
 * are rejected so a UI list can drop or repair them instead of rendering a
 * misleading fallback. `plant_type` values that don't normalize to a known
 * PlantType are rewritten to "unknown" (never silently photoperiod).
 */
export function validatePlantRowResponse<T extends Record<string, unknown>>(
  row: T | null | undefined,
): PlantPayloadValidationResult<T> {
  if (!row || typeof row !== "object") {
    return { ok: false, errors: ["plant row is null or not an object"] };
  }
  const parsed = PlantRowResponseSchema.safeParse(row);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`),
    };
  }
  const normalizedType = normalizePlantType(parsed.data.plant_type);
  const repaired = { ...row, plant_type: normalizedType } as T;
  return { ok: true, value: repaired, errors: [] };
}

/**
 * Filter a batch of plant rows, dropping malformed entries. Callers can log
 * the rejected count without letting bad rows reach presenters.
 */
export function filterValidPlantRows<T extends Record<string, unknown>>(
  rows: readonly T[] | null | undefined,
): { readonly valid: T[]; readonly rejected: number; readonly errors: readonly string[] } {
  if (!rows || rows.length === 0) return { valid: [], rejected: 0, errors: [] };
  const valid: T[] = [];
  const errors: string[] = [];
  let rejected = 0;
  for (const row of rows) {
    const result = validatePlantRowResponse(row);
    if (result.ok && result.value) {
      valid.push(result.value);
    } else {
      rejected += 1;
      errors.push(...result.errors);
    }
  }
  return { valid, rejected, errors };
}
