/**
 * environmentCheckTimelineViewModel — pure helper that turns Environment
 * Check Quick Log diary entries into a safe, presenter-only timeline
 * view model.
 *
 * Hard constraints:
 *   - Pure. No I/O, no Supabase, no fetch, no React, no Action Queue,
 *     no AI / model calls, no device control.
 *   - Never labels Environment Check data as "live".
 *   - Never classified as a sensor_readings row. `isSensorReading` is
 *     always false. `notLive` is always true.
 *   - Never throws — untrusted inputs.
 *   - Reads structured measurements from `details.environment_check`
 *     when present; otherwise renders the trimmed note safely. Never
 *     parses note text aggressively.
 */

export const ENVIRONMENT_CHECK_TIMELINE_TITLE = "Environment check" as const;
export const ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL =
  "Quick Log environment check — not live sensor telemetry" as const;
export const ENVIRONMENT_CHECK_TIMELINE_PROVENANCE_COPY =
  "Manual / Quick Log draft — never live sensor telemetry." as const;

export interface EnvironmentCheckTimelineRawEntry {
  id?: unknown;
  entry_at?: unknown;
  occurred_at?: unknown;
  event_type?: unknown;
  note?: unknown;
  details?: unknown;
}

export interface EnvironmentCheckTimelineField {
  key: "temp" | "humidity" | "vpd" | "co2";
  label: string;
  value: string;
}

export interface EnvironmentCheckTimelineViewModel {
  entryId: string;
  /** ISO timestamp of the diary entry. */
  occurredAt: string;
  /** YYYY-MM-DD bucket key (UTC). */
  dateKey: string;
  title: typeof ENVIRONMENT_CHECK_TIMELINE_TITLE;
  sourceLabel: typeof ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL;
  provenanceCopy: typeof ENVIRONMENT_CHECK_TIMELINE_PROVENANCE_COPY;
  fields: EnvironmentCheckTimelineField[];
  noteSummary: string | null;
  /** Always false — Environment Check is never a sensor_readings row. */
  isSensorReading: false;
  /** Always true — never label as live telemetry. */
  notLive: true;
}

const ENV_KIND_ALIASES: ReadonlySet<string> = new Set([
  "environment",
  "environment_check",
]);

const NOTE_MAX = 200;

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toIso(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function clipNote(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= NOTE_MAX) return flat;
  return `${flat.slice(0, NOTE_MAX - 1).trimEnd()}…`;
}

export function isEnvironmentCheckTimelineEntry(
  entry: EnvironmentCheckTimelineRawEntry | null | undefined,
): boolean {
  if (!entry || typeof entry !== "object") return false;
  const direct = asString(entry.event_type);
  if (direct && ENV_KIND_ALIASES.has(direct.toLowerCase())) return true;
  if (entry.details && typeof entry.details === "object") {
    const et = asString((entry.details as Record<string, unknown>).event_type);
    if (et && ENV_KIND_ALIASES.has(et.toLowerCase())) return true;
    const env = (entry.details as Record<string, unknown>).environment_check;
    if (env && typeof env === "object") return true;
  }
  return false;
}

function pickEnvelope(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object") return null;
  const ec = (details as Record<string, unknown>).environment_check;
  if (ec && typeof ec === "object" && !Array.isArray(ec)) {
    return ec as Record<string, unknown>;
  }
  return null;
}

function buildFields(
  envelope: Record<string, unknown> | null,
): EnvironmentCheckTimelineField[] {
  if (!envelope) return [];
  const fields: EnvironmentCheckTimelineField[] = [];

  // Temp: prefer Celsius when available; otherwise show Fahrenheit.
  const tempC = asFiniteNumber(
    envelope.temp_c ?? envelope.tempC ?? envelope.air_temp_c,
  );
  const tempF = asFiniteNumber(
    envelope.room_temp_f ?? envelope.tempF ?? envelope.air_temp_f,
  );
  if (tempC != null) {
    fields.push({ key: "temp", label: "Temp", value: `${tempC.toFixed(1)}°C` });
  } else if (tempF != null) {
    fields.push({ key: "temp", label: "Temp", value: `${tempF.toFixed(1)}°F` });
  }

  const rh = asFiniteNumber(
    envelope.humidity_pct ?? envelope.rhPercent ?? envelope.rh_percent,
  );
  if (rh != null) {
    fields.push({ key: "humidity", label: "RH", value: `${rh.toFixed(0)}%` });
  }

  const vpd = asFiniteNumber(envelope.vpd_kpa ?? envelope.vpdKpa);
  if (vpd != null) {
    fields.push({ key: "vpd", label: "VPD", value: `${vpd.toFixed(2)} kPa` });
  }

  const co2 = asFiniteNumber(envelope.co2_ppm ?? envelope.co2Ppm ?? envelope.co2);
  if (co2 != null) {
    fields.push({ key: "co2", label: "CO₂", value: `${Math.round(co2)} ppm` });
  }

  return fields;
}

/**
 * Build a presenter-safe Environment Check timeline view model for a
 * single diary entry. Returns null when the entry is not an Environment
 * Check, is missing a usable id, or has no parseable timestamp.
 */
export function buildEnvironmentCheckTimelineViewModel(
  raw: EnvironmentCheckTimelineRawEntry | null | undefined,
): EnvironmentCheckTimelineViewModel | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    if (!isEnvironmentCheckTimelineEntry(raw)) return null;
    const id = asString(raw.id);
    if (!id) return null;
    const occurredAt = toIso(raw.entry_at ?? raw.occurred_at);
    if (!occurredAt) return null;

    const envelope = pickEnvelope(raw.details);
    const fields = buildFields(envelope);
    // Prefer envelope note when present, fall back to entry note.
    const envelopeNote = envelope ? asString(envelope.note) : null;
    const noteSummary = clipNote(envelopeNote ?? raw.note ?? null);

    return {
      entryId: id,
      occurredAt,
      dateKey: occurredAt.slice(0, 10),
      title: ENVIRONMENT_CHECK_TIMELINE_TITLE,
      sourceLabel: ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL,
      provenanceCopy: ENVIRONMENT_CHECK_TIMELINE_PROVENANCE_COPY,
      fields,
      noteSummary,
      isSensorReading: false,
      notLive: true,
    };
  } catch {
    return null;
  }
}

/**
 * Map a list of raw diary entries into ordered Environment Check timeline
 * view models (newest-first, stable id tiebreaker). Non-environment
 * entries are dropped.
 */
export function buildEnvironmentCheckTimelineList(
  rawEntries: readonly EnvironmentCheckTimelineRawEntry[] | null | undefined,
): EnvironmentCheckTimelineViewModel[] {
  const list = Array.isArray(rawEntries) ? rawEntries : [];
  const out: EnvironmentCheckTimelineViewModel[] = [];
  for (const r of list) {
    const vm = buildEnvironmentCheckTimelineViewModel(r);
    if (vm) out.push(vm);
  }
  out.sort((a, b) => {
    const t = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (t !== 0) return t;
    return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
  });
  return out;
}
