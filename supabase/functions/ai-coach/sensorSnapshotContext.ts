/**
 * aiCoachSensorSnapshotContext — pure, source-aware annotator for the
 * latest `diary_entries.details.sensor_snapshot` blob before it is
 * forwarded to the ai-coach model.
 *
 * Hard constraints:
 *  - Pure function. No I/O, no Deno imports, no network, no Supabase.
 *  - Never relabels manual/csv as live.
 *  - Never forwards demo/invalid reading values to the model.
 *  - Never emits device-control language.
 *  - Deterministic for the same (snapshot, options.now).
 *
 * NOTE: kept self-contained (no `src/lib/*` imports) so it can run
 * inside the edge function bundle. The src-side mirror at
 * `src/lib/aiCoachSensorSnapshotContext.ts` re-exports this file for
 * vitest.
 */

export type AiCoachSnapshotSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export type AiCoachSnapshotTrust = "low" | "medium" | "high";

export interface BuildAiCoachSensorSnapshotContextOptions {
  now?: Date;
  /** Defaults to 30 min, matching sensorReadingNormalizationRules.STALE_THRESHOLD_MS. */
  staleThresholdMs?: number;
}

export interface AiCoachSensorSnapshotContext {
  /** Single line ready to push into the context block. */
  line: string;
  source: AiCoachSnapshotSource;
  stale: boolean;
  trust: AiCoachSnapshotTrust;
  /** False when values were omitted from the context for safety. */
  includesValues: boolean;
  safetyNotes: string[];
  missingInformationHints: string[];
}

export const DEFAULT_AI_COACH_STALE_THRESHOLD_MS = 30 * 60 * 1000;

const KNOWN_SOURCES: ReadonlySet<AiCoachSnapshotSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

/** Reading keys we will summarize when values are trusted. */
const READING_KEYS = [
  "temperature_c",
  "temperature_f",
  "humidity",
  "vpd",
  "vpd_kpa",
  "co2",
  "co2_ppm",
  "ppfd",
  "soil_moisture",
  "soil_water_content",
  "soil_ec",
  "soil_temp_c",
  "soil_temp_f",
  "ph",
  "temp_c",
  "temp_f",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(o: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function normalizeSource(raw: string | undefined): AiCoachSnapshotSource {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "imported") return "csv";
  if (lower === "import") return "csv";
  if (lower === "mock" || lower === "fixture") return "demo";
  if ((KNOWN_SOURCES as ReadonlySet<string>).has(lower)) {
    return lower as AiCoachSnapshotSource;
  }
  return "unknown";
}

function summarizeReadings(snap: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of READING_KEYS) {
    const v = snap[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      parts.push(`${key}=${v}`);
    }
  }
  return parts.length ? parts.join(", ") : "no numeric readings present";
}

function parseCapturedAt(snap: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
  missing: boolean;
} {
  const raw =
    snap.captured_at ?? snap.capturedAt ?? snap.timestamp ?? snap.ts ?? snap.time;
  if (raw === undefined || raw === null) return { iso: null, ms: null, missing: true };
  if (typeof raw === "string" && raw.trim() === "") {
    return { iso: null, ms: null, missing: true };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { iso: null, ms: null, missing: false };
    return { iso: d.toISOString(), ms: d.getTime(), missing: false };
  }
  if (typeof raw === "string") {
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) return { iso: null, ms: null, missing: false };
    return { iso: d.toISOString(), ms: d.getTime(), missing: false };
  }
  return { iso: null, ms: null, missing: false };
}

/**
 * Build a single-line, source-aware annotation for the latest sensor
 * snapshot. Always safe to forward to the model.
 */
export function buildAiCoachSensorSnapshotContext(
  snapshot: unknown,
  options: BuildAiCoachSensorSnapshotContextOptions = {},
): AiCoachSensorSnapshotContext {
  if (snapshot === null || snapshot === undefined) {
    return {
      line: "LATEST_SENSOR_SNAPSHOT: none",
      source: "unknown",
      stale: false,
      trust: "low",
      includesValues: false,
      safetyNotes: [],
      missingInformationHints: [
        "No sensor snapshot available — log a manual reading or attach live telemetry.",
      ],
    };
  }

  if (!isPlainObject(snapshot)) {
    return {
      line:
        "LATEST_SENSOR_SNAPSHOT [source=invalid, stale=false, trust=low]: values omitted; snapshot payload was not a structured object.",
      source: "invalid",
      stale: false,
      trust: "low",
      includesValues: false,
      safetyNotes: [
        "Snapshot payload is not a structured object; do not infer any environmental conditions from it.",
      ],
      missingInformationHints: [
        "A structured sensor snapshot (manual or live) is needed before environmental diagnosis.",
      ],
    };
  }

  const now = options.now ?? new Date();
  const staleThresholdMs = options.staleThresholdMs ?? DEFAULT_AI_COACH_STALE_THRESHOLD_MS;

  const rawSourceStr = pickString(snapshot, ["source", "data_source", "sensor_source"]);
  let source = normalizeSource(rawSourceStr);
  const captured = parseCapturedAt(snapshot);

  // Staleness: explicit "stale" source OR captured_at older than threshold OR missing entirely.
  let stale = source === "stale";
  if (captured.ms !== null && now.getTime() - captured.ms > staleThresholdMs) {
    stale = true;
    if (source === "live" || source === "manual" || source === "csv") {
      // Demote to stale-flavored variant: keep underlying source label but stale=true.
      // (Do NOT rewrite source to "stale" — preserves provenance per requirement 5.)
    }
  }
  if (captured.missing && (source === "live" || source === "manual" || source === "csv")) {
    // No timestamp at all → cannot prove freshness → treat as stale-ish, downgrade trust.
    stale = true;
  }

  const safetyNotes: string[] = [];
  const missingInformationHints: string[] = [];
  let includesValues = false;
  let trust: AiCoachSnapshotTrust = "low";
  let valuesSummary = "values omitted";

  switch (source) {
    case "demo": {
      trust = "low";
      includesValues = false;
      safetyNotes.push(
        "Demo data is synthetic and MUST NOT be treated as real grow evidence.",
      );
      missingInformationHints.push(
        "Real or manual current sensor readings are needed before drawing environmental conclusions.",
      );
      valuesSummary =
        "values omitted; demo data is not trusted for diagnosis";
      break;
    }
    case "invalid": {
      trust = "low";
      includesValues = false;
      safetyNotes.push(
        "Sensor telemetry was flagged invalid; do not rely on these values.",
      );
      missingInformationHints.push(
        "A valid sensor snapshot (manual or live) is needed before environmental diagnosis.",
      );
      valuesSummary = "values omitted; snapshot was flagged invalid";
      break;
    }
    case "unknown": {
      trust = "low";
      includesValues = false;
      safetyNotes.push(
        "Snapshot source is unlabeled; provenance cannot be verified — treat as untrusted.",
      );
      missingInformationHints.push(
        "Source-labeled (live, manual, csv) snapshot is needed for trustworthy diagnosis.",
      );
      valuesSummary = "values omitted; unlabeled source";
      break;
    }
    case "stale": {
      trust = "low";
      includesValues = true;
      safetyNotes.push(
        "Snapshot is marked stale; readings may not reflect current tent conditions.",
      );
      valuesSummary = summarizeReadings(snapshot);
      break;
    }
    case "live":
    case "manual":
    case "csv": {
      if (stale) {
        trust = "low";
        includesValues = true;
        safetyNotes.push(
          "Snapshot is older than the freshness window; readings may not reflect current tent conditions.",
        );
        valuesSummary = summarizeReadings(snapshot);
      } else {
        trust = "medium";
        includesValues = true;
        valuesSummary = summarizeReadings(snapshot);
      }
      break;
    }
  }

  const capturedAtStr = captured.iso ?? (captured.missing ? "missing" : "invalid");
  const line = `LATEST_SENSOR_SNAPSHOT [source=${source}, stale=${stale ? "true" : "false"}, trust=${trust}, captured_at=${capturedAtStr}]: ${valuesSummary}`;

  return {
    line,
    source,
    stale,
    trust,
    includesValues,
    safetyNotes,
    missingInformationHints,
  };
}
