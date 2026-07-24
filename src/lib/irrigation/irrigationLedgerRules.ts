/**
 * Pure rules for the one-tent irrigation ledger.
 *
 * No React, no Supabase, no I/O. Never throws. Unifies canonical grow_events
 * (watering + feeding) into one honest chronological ledger row.
 *
 * Evidence truth:
 *  - EVERY non-deleted watering/feeding event yields exactly one row — a
 *    note-only watering is "Logged — no measurements," never omitted (R7).
 *  - Unknown stays null/blank; nothing is coerced to zero.
 *  - EC is canonical mS/cm and labeled so; feeding input EC prefers ec_in then
 *    ec_ms_cm; feeding output EC is ec_out.
 *  - Source keeps voice/ai/import provenance as first-class labels (R9); manual
 *    stays "Manual log"; a genuinely absent/unknown source is the only
 *    "Source unavailable".
 *
 * Keyset pagination is derived from the RAW rows (occurred_at + id verbatim,
 * never a Date round-trip) so no boundary row is dropped at equal timestamps.
 */

// PostgREST projection: parent scope + note/source + both typed children.
export const IRRIGATION_LEDGER_SELECT =
  "id,grow_id,plant_id,tent_id,event_type,occurred_at,note,source,is_deleted," +
  "watering_events(volume_ml,ph,ec_ms_cm,runoff_ml,runoff_ph,runoff_ec,water_temp_c)," +
  "feeding_events(volume_ml,ph,ec_ms_cm,ec_in,ec_out,runoff_ml,runoff_ph,runoff_ec,water_temp_c,line_id,products)";

export type IrrigationEventKind = "watering" | "feeding";
export type IrrigationSource = "manual" | "voice" | "ai" | "import" | "unknown";

export interface IrrigationProduct {
  readonly name: string | null;
  readonly amount: number | null;
  readonly unit: string | null;
}

export interface IrrigationLedgerRow {
  readonly id: string;
  readonly kind: IrrigationEventKind;
  readonly occurredAt: string | null; // raw DB string, kept verbatim
  readonly plantId: string | null;
  readonly tentId: string | null;
  readonly source: IrrigationSource;
  readonly sourceLabel: string;
  readonly note: string | null;
  readonly volumeMl: number | null;
  readonly ph: number | null;
  /** Input EC in mS/cm (feeding prefers ec_in, else ec_ms_cm). */
  readonly ecMsCm: number | null;
  /** Feeding output/drain-line EC (ec_out) in mS/cm; null for watering. */
  readonly outputEcMsCm: number | null;
  readonly runoffMl: number | null;
  readonly runoffPh: number | null;
  readonly runoffEcMsCm: number | null;
  readonly waterTempC: number | null;
  readonly products: readonly IrrigationProduct[];
  /** True when no numeric measurement and no product survived — a truthful "logged, unmeasured" row. */
  readonly unmeasured: boolean;
}

export interface IrrigationCursor {
  readonly occurredAt: string;
  readonly id: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** First typed child of an embedded relation (array or object). */
function child(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return isRecord(v[0]) ? v[0] : null;
  return isRecord(v) ? v : null;
}

export function normalizeIrrigationSource(value: unknown): IrrigationSource {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "manual") return "manual";
  if (s === "voice") return "voice";
  if (s === "ai") return "ai";
  if (s === "import") return "import";
  return "unknown";
}

export function irrigationSourceLabel(source: IrrigationSource): string {
  switch (source) {
    case "manual":
      return "Manual log";
    case "voice":
      return "Voice log";
    case "ai":
      return "AI-generated";
    case "import":
      return "Imported log";
    default:
      return "Source unavailable";
  }
}

function products(v: unknown): IrrigationProduct[] {
  if (!Array.isArray(v)) return [];
  const out: IrrigationProduct[] = [];
  for (const p of v) {
    if (!isRecord(p)) continue;
    out.push({
      name: str(p.name) ?? str(p.product) ?? null,
      amount: num(p.amount),
      unit: str(p.unit),
    });
  }
  return out;
}

function mapRow(raw: Record<string, unknown>): IrrigationLedgerRow | null {
  const eventType = str(raw.event_type);
  if (eventType !== "watering" && eventType !== "feeding") return null;
  if (raw.is_deleted === true) return null;
  const id = str(raw.id);
  if (!id) return null;

  const kind: IrrigationEventKind = eventType;
  const c = child(kind === "watering" ? raw.watering_events : raw.feeding_events);

  const volumeMl = c ? num(c.volume_ml) : null;
  const ph = c ? num(c.ph) : null;
  // Feeding input EC prefers ec_in, else ec_ms_cm; watering uses ec_ms_cm.
  const ecMsCm = c ? (kind === "feeding" ? (num(c.ec_in) ?? num(c.ec_ms_cm)) : num(c.ec_ms_cm)) : null;
  const outputEcMsCm = c && kind === "feeding" ? num(c.ec_out) : null;
  const runoffMl = c ? num(c.runoff_ml) : null;
  const runoffPh = c ? num(c.runoff_ph) : null;
  const runoffEcMsCm = c ? num(c.runoff_ec) : null;
  const waterTempC = c ? num(c.water_temp_c) : null;
  const prods = c && kind === "feeding" ? products(c.products) : [];

  const measured =
    [volumeMl, ph, ecMsCm, outputEcMsCm, runoffMl, runoffPh, runoffEcMsCm, waterTempC].some(
      (n) => n !== null,
    ) || prods.length > 0;

  const source = normalizeIrrigationSource(raw.source);

  return {
    id,
    kind,
    occurredAt: str(raw.occurred_at),
    plantId: str(raw.plant_id),
    tentId: str(raw.tent_id),
    source,
    sourceLabel: irrigationSourceLabel(source),
    note: str(raw.note),
    volumeMl,
    ph,
    ecMsCm,
    outputEcMsCm,
    runoffMl,
    runoffPh,
    runoffEcMsCm,
    waterTempC,
    products: prods,
    unmeasured: !measured,
  };
}

/** Newest first, deterministic tie-break by id DESC (mirrors the keyset order). */
function compareLedger(a: IrrigationLedgerRow, b: IrrigationLedgerRow): number {
  const aHas = a.occurredAt !== null;
  const bHas = b.occurredAt !== null;
  if (aHas && bHas && a.occurredAt !== b.occurredAt) return a.occurredAt! > b.occurredAt! ? -1 : 1;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC
}

/** Map EVERY non-deleted watering/feeding raw row to a ledger row (never drops). */
export function buildIrrigationLedger(rawRows: readonly unknown[] | null | undefined): IrrigationLedgerRow[] {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const out: IrrigationLedgerRow[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const row = mapRow(raw);
    if (row) out.push(row);
  }
  return out.sort(compareLedger);
}

/**
 * Derive the keyset page from the RAW result set. Fetch pageSize+1 rows; if more
 * than pageSize came back there is another page, and the cursor is the last raw
 * row of THIS page (occurred_at + id verbatim — never a Date round-trip). The
 * page is trimmed to pageSize raw rows for projection.
 */
export function buildKeysetPage(
  rawRows: readonly unknown[] | null | undefined,
  pageSize: number,
): { pageRawRows: Record<string, unknown>[]; hasMore: boolean; nextCursor: IrrigationCursor | null } {
  const rows = (Array.isArray(rawRows) ? rawRows : []).filter(isRecord);
  const size = Math.max(1, Math.floor(pageSize));
  const hasMore = rows.length > size;
  const pageRawRows = rows.slice(0, size);
  const last = pageRawRows[pageRawRows.length - 1];
  const occurredAt = last ? str(last.occurred_at) : null;
  const id = last ? str(last.id) : null;
  const nextCursor = hasMore && occurredAt && id ? { occurredAt, id } : null;
  return { pageRawRows, hasMore, nextCursor };
}
