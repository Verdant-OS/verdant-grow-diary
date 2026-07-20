/**
 * quickLogFeedingFormViewModel — pure form state + mapper for the Quick Log
 * structured feeding surface.
 *
 * Responsibilities:
 *   - Hold the minimal feeding form state (strings only — the UI deals in
 *     text inputs and we coerce here).
 *   - Validate the smallest set of required fields needed to safely call
 *     `writeFeedingTypedEvent`.
 *   - Map the form to a `FeedingTypedEventInput` payload. The writer itself
 *     re-validates and rejects token-like product payloads, but we run the
 *     same `containsSecret` check here so the UI can fail fast with a
 *     user-friendly reason.
 *
 * Hard rules:
 *   - No I/O, no React, no Supabase, no time, no randomness.
 *   - Never coerces NaN/Infinity to a number — invalid numeric input is a
 *     hard reject so the writer never sees garbage.
 *   - Empty optional fields are dropped, not zeroed.
 */

import type { FeedingTypedEventInput } from "./writeFeedingTypedEvent";
import { resolveEcPpm500Pair } from "./ecPpm500PairRules";
import { ROOT_ZONE_PRODUCT_CAP } from "./rootZoneObservationRules";

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export interface QuickLogFeedingFormProductRow {
  name: string;
  amount: string;
  unit: string;
}

export interface QuickLogFeedingFormState {
  lineId: string;
  products: QuickLogFeedingFormProductRow[];
  volumeMl: string;
  ph: string;
  ecIn: string;
  ppmIn: string;
  ecOut: string;
  ppmOut: string;
  runoffMl: string;
  runoffPh: string;
  runoffEc: string;
  runoffPpm: string;
  waterTempC: string;
  note: string;
}

export const FEEDING_FORM_DEFAULT_UNIT = "ml_per_l";
export const FEEDING_FORM_PRODUCT_CAP = ROOT_ZONE_PRODUCT_CAP;

export const EMPTY_FEEDING_PRODUCT_ROW: QuickLogFeedingFormProductRow = {
  name: "",
  amount: "",
  unit: FEEDING_FORM_DEFAULT_UNIT,
};

export const EMPTY_QUICKLOG_FEEDING_FORM: QuickLogFeedingFormState = {
  lineId: "",
  products: [{ ...EMPTY_FEEDING_PRODUCT_ROW }],
  volumeMl: "",
  ph: "",
  ecIn: "",
  ppmIn: "",
  ecOut: "",
  ppmOut: "",
  runoffMl: "",
  runoffPh: "",
  runoffEc: "",
  runoffPpm: "",
  waterTempC: "",
  note: "",
};

/** True only before the grower has changed any feeding field. */
export function isFeedingFormPristine(form: QuickLogFeedingFormState): boolean {
  const scalarFields: Array<keyof Omit<QuickLogFeedingFormState, "products">> = [
    "lineId",
    "volumeMl",
    "ph",
    "ecIn",
    "ppmIn",
    "ecOut",
    "ppmOut",
    "runoffMl",
    "runoffPh",
    "runoffEc",
    "runoffPpm",
    "waterTempC",
    "note",
  ];

  if (scalarFields.some((field) => form[field].trim() !== "")) return false;
  if (form.products.length !== 1) return false;

  const [product] = form.products;
  return (
    product.name.trim() === "" &&
    product.amount.trim() === "" &&
    product.unit.trim() === FEEDING_FORM_DEFAULT_UNIT
  );
}

/** Add one blank product row without mutating the current recipe. */
export function addFeedingProductRow(
  rows: readonly QuickLogFeedingFormProductRow[],
): QuickLogFeedingFormProductRow[] {
  const current = rows.map((row) => ({ ...row }));
  if (current.length >= FEEDING_FORM_PRODUCT_CAP) return current;
  return [...current, { ...EMPTY_FEEDING_PRODUCT_ROW }];
}

/** Remove a product row while always preserving one editable row. */
export function removeFeedingProductRow(
  rows: readonly QuickLogFeedingFormProductRow[],
  index: number,
): QuickLogFeedingFormProductRow[] {
  const current = rows.map((row) => ({ ...row }));
  if (current.length <= 1 || !Number.isInteger(index) || index < 0 || index >= current.length) {
    return current;
  }
  return current.filter((_, rowIndex) => rowIndex !== index);
}

// ---------------------------------------------------------------------------
// Validation / mapping
// ---------------------------------------------------------------------------

export type FeedingFormFailureReason =
  | "grow_id:missing"
  | "idempotency_key:invalid"
  | "line_id:missing"
  | "volume_ml:missing"
  | "volume_ml:invalid"
  | "products:empty"
  | "products:too_many"
  | "products:invalid_amount"
  | "products:contains_secret"
  | "ec_ppm:mismatch"
  | "numeric:invalid";

export interface FeedingFormMapInput {
  growId: string | null | undefined;
  tentId?: string | null;
  plantId?: string | null;
  idempotencyKey: string;
  form: QuickLogFeedingFormState;
}

export type FeedingFormMapResult =
  | { ok: true; payload: FeedingTypedEventInput }
  | { ok: false; reason: FeedingFormFailureReason };

const SECRET_HINT_RE =
  /(secret|token|api[_-]?key|password|service[_-]?role|bearer\s|^eyJ[A-Za-z0-9_-]{8,}\.|^sk_(live|test)_|^sb_|^pk_(live|test)_)/i;

function trim(v: string): string {
  return v.trim();
}

function parseOptionalFiniteNumber(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  // Reject anything that does not look like a plain number to keep the
  // writer's "finite number or null" contract bulletproof.
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function rowContainsSecret(row: QuickLogFeedingFormProductRow): boolean {
  return (
    SECRET_HINT_RE.test(row.name) ||
    SECRET_HINT_RE.test(row.amount) ||
    SECRET_HINT_RE.test(row.unit)
  );
}

export function buildFeedingFormPayload(input: FeedingFormMapInput): FeedingFormMapResult {
  const growId = (input.growId ?? "").trim();
  if (!growId) return { ok: false, reason: "grow_id:missing" };

  const idempotencyKey = (input.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return { ok: false, reason: "idempotency_key:invalid" };
  }

  const lineId = trim(input.form.lineId);
  if (!lineId) return { ok: false, reason: "line_id:missing" };

  const parsedVolume = parseOptionalFiniteNumber(input.form.volumeMl);
  if (!parsedVolume.ok) return { ok: false, reason: "volume_ml:invalid" };
  if (parsedVolume.value === null) {
    return { ok: false, reason: "volume_ml:missing" };
  }
  if (parsedVolume.value <= 0 || parsedVolume.value > 1_000_000) {
    return { ok: false, reason: "volume_ml:invalid" };
  }

  const rawRows = Array.isArray(input.form.products) ? input.form.products : [];
  // A product row is "present" if it has at least a name.
  const presentRows = rawRows.filter((r) => trim(r?.name ?? "") !== "");
  if (presentRows.length === 0) return { ok: false, reason: "products:empty" };
  if (presentRows.length > FEEDING_FORM_PRODUCT_CAP) {
    return { ok: false, reason: "products:too_many" };
  }

  for (const row of presentRows) {
    if (rowContainsSecret(row)) {
      return { ok: false, reason: "products:contains_secret" };
    }
  }

  const products: Array<Record<string, unknown>> = [];
  for (const row of presentRows) {
    const entry: Record<string, unknown> = { name: trim(row.name) };
    const amountStr = trim(row.amount);
    if (amountStr !== "") {
      const n = Number(amountStr);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return { ok: false, reason: "products:invalid_amount" };
      }
      entry.amount = n;
    }
    const unit = trim(row.unit);
    if (unit !== "") entry.unit = unit;
    products.push(entry);
  }

  const numericFields: Array<
    [
      keyof QuickLogFeedingFormState,
      keyof Pick<FeedingTypedEventInput, "ph" | "runoff_ml" | "runoff_ph" | "water_temp_c">,
    ]
  > = [
    ["ph", "ph"],
    ["runoffMl", "runoff_ml"],
    ["runoffPh", "runoff_ph"],
    ["waterTempC", "water_temp_c"],
  ];

  const parsedNumerics: Partial<FeedingTypedEventInput> = {};
  for (const [formKey, payloadKey] of numericFields) {
    const parsed = parseOptionalFiniteNumber(input.form[formKey] as string);
    if (!parsed.ok) return { ok: false, reason: "numeric:invalid" };
    if (parsed.value !== null) {
      (parsedNumerics as Record<string, number>)[payloadKey] = parsed.value;
    }
  }

  const ecPairs = [
    ["ecIn", "ppmIn", "ec_in"],
    ["ecOut", "ppmOut", "ec_out"],
    ["runoffEc", "runoffPpm", "runoff_ec"],
  ] as const;
  for (const [ecKey, ppmKey, payloadKey] of ecPairs) {
    const resolved = resolveEcPpm500Pair(input.form[ecKey], input.form[ppmKey]);
    if (resolved.status === "invalid") return { ok: false, reason: "numeric:invalid" };
    if (resolved.status === "mismatch") return { ok: false, reason: "ec_ppm:mismatch" };
    if (resolved.status === "valid") {
      (parsedNumerics as Record<string, number>)[payloadKey] = resolved.ec;
    }
  }

  const note = trim(input.form.note);

  const payload: FeedingTypedEventInput = {
    idempotency_key: idempotencyKey,
    grow_id: growId,
    tent_id: input.tentId ?? null,
    plant_id: input.plantId ?? null,
    nutrient_line_id: lineId,
    products,
    volume_ml: parsedVolume.value,
    note: note === "" ? null : note,
    ...parsedNumerics,
  };

  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Reason → user-facing copy
// ---------------------------------------------------------------------------

export const FEEDING_SAVE_SUCCESS_MESSAGE = "Feeding logged.";
export const FEEDING_SAVE_FAILURE_MESSAGE = "Could not log feeding. Nothing else was changed.";

export function feedingFormReasonToHelper(reason: FeedingFormFailureReason | string): string {
  switch (reason) {
    case "grow_id:missing":
      return "Choose a plant or tent with grow context before saving.";
    case "idempotency_key:invalid":
      return FEEDING_SAVE_FAILURE_MESSAGE;
    case "line_id:missing":
      return "Enter the nutrient line for this feeding.";
    case "volume_ml:missing":
      return "Enter the total nutrient solution applied before saving.";
    case "volume_ml:invalid":
      return "Applied volume must be a positive number of milliliters.";
    case "products:empty":
      return "Add at least one nutrient product before saving.";
    case "products:too_many":
      return `Use no more than ${FEEDING_FORM_PRODUCT_CAP} products in one feeding.`;
    case "products:invalid_amount":
      return "Product amounts must be valid numbers.";
    case "products:contains_secret":
      return "Product entries must not contain tokens or secrets.";
    case "numeric:invalid":
      return "Optional metrics must be valid numbers or left blank.";
    case "ec_ppm:mismatch":
      return "EC and PPM must match the 500 scale. Re-enter either value.";
    default:
      return FEEDING_SAVE_FAILURE_MESSAGE;
  }
}
