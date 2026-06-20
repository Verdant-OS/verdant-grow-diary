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
  ph: string;
  ecIn: string;
  ecOut: string;
  runoffMl: string;
  runoffPh: string;
  runoffEc: string;
  waterTempC: string;
  note: string;
}

export const FEEDING_FORM_DEFAULT_UNIT = "ml_per_l";

export const EMPTY_FEEDING_PRODUCT_ROW: QuickLogFeedingFormProductRow = {
  name: "",
  amount: "",
  unit: FEEDING_FORM_DEFAULT_UNIT,
};

export const EMPTY_QUICKLOG_FEEDING_FORM: QuickLogFeedingFormState = {
  lineId: "",
  products: [{ ...EMPTY_FEEDING_PRODUCT_ROW }],
  ph: "",
  ecIn: "",
  ecOut: "",
  runoffMl: "",
  runoffPh: "",
  runoffEc: "",
  waterTempC: "",
  note: "",
};

// ---------------------------------------------------------------------------
// Validation / mapping
// ---------------------------------------------------------------------------

export type FeedingFormFailureReason =
  | "grow_id:missing"
  | "line_id:missing"
  | "products:empty"
  | "products:invalid_amount"
  | "products:contains_secret"
  | "numeric:invalid";

export interface FeedingFormMapInput {
  growId: string | null | undefined;
  tentId?: string | null;
  plantId?: string | null;
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
):
  | { ok: true; value: number | null }
  | { ok: false } {
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

export function buildFeedingFormPayload(
  input: FeedingFormMapInput,
): FeedingFormMapResult {
  const growId = (input.growId ?? "").trim();
  if (!growId) return { ok: false, reason: "grow_id:missing" };

  const lineId = trim(input.form.lineId);
  if (!lineId) return { ok: false, reason: "line_id:missing" };

  const rawRows = Array.isArray(input.form.products) ? input.form.products : [];
  // A product row is "present" if it has at least a name.
  const presentRows = rawRows.filter((r) => trim(r?.name ?? "") !== "");
  if (presentRows.length === 0) return { ok: false, reason: "products:empty" };

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
      if (!Number.isFinite(n)) {
        return { ok: false, reason: "products:invalid_amount" };
      }
      entry.amount = n;
    }
    const unit = trim(row.unit);
    if (unit !== "") entry.unit = unit;
    products.push(entry);
  }

  const numericFields: Array<[keyof QuickLogFeedingFormState,
    keyof Pick<
      FeedingTypedEventInput,
      | "ph"
      | "ec_in"
      | "ec_out"
      | "runoff_ml"
      | "runoff_ph"
      | "runoff_ec"
      | "water_temp_c"
    >]> = [
    ["ph", "ph"],
    ["ecIn", "ec_in"],
    ["ecOut", "ec_out"],
    ["runoffMl", "runoff_ml"],
    ["runoffPh", "runoff_ph"],
    ["runoffEc", "runoff_ec"],
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

  const note = trim(input.form.note);

  const payload: FeedingTypedEventInput = {
    grow_id: growId,
    tent_id: input.tentId ?? null,
    plant_id: input.plantId ?? null,
    nutrient_line_id: lineId,
    products,
    note: note === "" ? null : note,
    ...parsedNumerics,
  };

  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Reason → user-facing copy
// ---------------------------------------------------------------------------

export const FEEDING_SAVE_SUCCESS_MESSAGE = "Feeding logged.";
export const FEEDING_SAVE_FAILURE_MESSAGE =
  "Could not log feeding. Nothing else was changed.";

export function feedingFormReasonToHelper(
  reason: FeedingFormFailureReason | string,
): string {
  switch (reason) {
    case "grow_id:missing":
      return "Choose a plant or tent with grow context before saving.";
    case "line_id:missing":
      return "Enter the nutrient line for this feeding.";
    case "products:empty":
      return "Add at least one nutrient product before saving.";
    case "products:invalid_amount":
      return "Product amounts must be valid numbers.";
    case "products:contains_secret":
      return "Product entries must not contain tokens or secrets.";
    case "numeric:invalid":
      return "Optional metrics must be valid numbers or left blank.";
    default:
      return FEEDING_SAVE_FAILURE_MESSAGE;
  }
}
