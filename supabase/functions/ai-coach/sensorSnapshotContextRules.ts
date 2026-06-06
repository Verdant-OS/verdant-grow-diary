/**
 * aiSensorSnapshotContextRules — shared, source-aware annotator used by
 * BOTH the ai-coach context builder and the ai-doctor-review request
 * packet builder. Produces a LOCKED annotation string format so model
 * inputs stay byte-stable across releases.
 *
 * Locked single-snapshot format:
 *
 *   LATEST_SENSOR_SNAPSHOT [source=<src>, stale=<true|false>, trust=<low|medium|high>]: <message>
 *
 * Hard constraints:
 *  - Pure. No I/O, no Supabase, no model calls, no Deno.
 *  - Never relabels manual/csv as live.
 *  - Never forwards demo / invalid / unknown reading values.
 *  - Never emits device-control language or secrets.
 *  - Deterministic for the same (snapshot, options.now, options.staleThresholdMs).
 *  - `staleThresholdMs <= 0` means there is NO trustworthy freshness
 *    window: any snapshot with a positive age is treated as stale, and
 *    even a zero-age snapshot is treated as untrusted because the
 *    caller has explicitly removed the freshness window.
 */

export type AiSensorSnapshotSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export type AiSensorSnapshotTrust = "low" | "medium" | "high";

export interface BuildAiSensorSnapshotContextOptions {
  now?: Date;
  /** Defaults to 30 min, matching sensorReadingNormalizationRules. */
  staleThresholdMs?: number;
}

export interface AiSensorSnapshotContext {
  annotationLine: string;
  valuesForModel: Record<string, number> | null;
  safetyNotes: string[];
  missingInformationHints: string[];
  sourceLabel: AiSensorSnapshotSource;
  trustLevel: AiSensorSnapshotTrust;
  stale: boolean;
  isTrustedForAi: boolean;
}

export interface AiSensorSnapshotsContext {
  annotationLines: string[];
  valuesForModel: Array<Record<string, number> | null>;
  safetyNotes: string[];
  missingInformationHints: string[];
  highestTrustLevel: AiSensorSnapshotTrust;
  lowestTrustLevel: AiSensorSnapshotTrust;
  hasUntrustedSnapshots: boolean;
  hasStaleSnapshots: boolean;
  trustedSnapshotCount: number;
  omittedSnapshotCount: number;
}

export const DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS = 30 * 60 * 1000;

const KNOWN_SOURCES: ReadonlySet<AiSensorSnapshotSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

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

function pickString(o: Record<string, unknown>, keys: readonly string[]) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function normalizeSource(raw: string | undefined): AiSensorSnapshotSource {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "imported" || lower === "import") return "csv";
  if (lower === "mock" || lower === "fixture") return "demo";
  if ((KNOWN_SOURCES as ReadonlySet<string>).has(lower)) {
    return lower as AiSensorSnapshotSource;
  }
  return "unknown";
}

type CapturedAt =
  | { kind: "ok"; ms: number; iso: string }
  | { kind: "missing" }
  | { kind: "invalid" };

function parseCapturedAt(snap: Record<string, unknown>): CapturedAt {
  const raw =
    snap.captured_at ?? snap.capturedAt ?? snap.timestamp ?? snap.ts ?? snap.time;
  if (raw === undefined || raw === null) return { kind: "missing" };
  if (typeof raw === "string" && raw.trim() === "") return { kind: "missing" };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { kind: "invalid" };
    return { kind: "ok", ms: d.getTime(), iso: d.toISOString() };
  }
  if (typeof raw === "string") {
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) return { kind: "invalid" };
    return { kind: "ok", ms: d.getTime(), iso: d.toISOString() };
  }
  return { kind: "invalid" };
}

function extractNumericReadings(snap: Record<string, unknown>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const key of READING_KEYS) {
    const v = snap[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

function fmtNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return String(n);
  // Trim trailing zeros but keep at least one decimal if non-integer.
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Build the stable "temp=…, humidity=…%, vpd=…kPa" reading summary. */
function formatReadingsForLine(snap: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof snap.temperature_f === "number" && Number.isFinite(snap.temperature_f)) {
    parts.push(`temp=${fmtNum(snap.temperature_f)}°F`);
  } else if (typeof snap.temp_f === "number" && Number.isFinite(snap.temp_f)) {
    parts.push(`temp=${fmtNum(snap.temp_f)}°F`);
  } else if (typeof snap.temperature_c === "number" && Number.isFinite(snap.temperature_c)) {
    parts.push(`temp=${fmtNum(snap.temperature_c)}°C`);
  } else if (typeof snap.temp_c === "number" && Number.isFinite(snap.temp_c)) {
    parts.push(`temp=${fmtNum(snap.temp_c)}°C`);
  }
  if (typeof snap.humidity === "number" && Number.isFinite(snap.humidity)) {
    parts.push(`humidity=${fmtNum(snap.humidity)}%`);
  }
  const vpd =
    typeof snap.vpd_kpa === "number" && Number.isFinite(snap.vpd_kpa)
      ? snap.vpd_kpa
      : typeof snap.vpd === "number" && Number.isFinite(snap.vpd)
        ? snap.vpd
        : null;
  if (vpd !== null) parts.push(`vpd=${fmtNum(vpd, 2)}kPa`);
  const co2 =
    typeof snap.co2_ppm === "number" && Number.isFinite(snap.co2_ppm)
      ? snap.co2_ppm
      : typeof snap.co2 === "number" && Number.isFinite(snap.co2)
        ? snap.co2
        : null;
  if (co2 !== null) parts.push(`co2=${fmtNum(co2, 0)}ppm`);
  if (typeof snap.ppfd === "number" && Number.isFinite(snap.ppfd)) {
    parts.push(`ppfd=${fmtNum(snap.ppfd, 0)}`);
  }
  if (typeof snap.ph === "number" && Number.isFinite(snap.ph)) {
    parts.push(`ph=${fmtNum(snap.ph, 2)}`);
  }
  if (
    typeof snap.soil_moisture === "number" &&
    Number.isFinite(snap.soil_moisture)
  ) {
    parts.push(`soil_moisture=${fmtNum(snap.soil_moisture)}%`);
  }
  if (typeof snap.soil_ec === "number" && Number.isFinite(snap.soil_ec)) {
    parts.push(`soil_ec=${fmtNum(snap.soil_ec, 2)}`);
  }
  return parts.length ? parts.join(", ") : "no numeric readings present";
}

function buildLine(
  source: AiSensorSnapshotSource,
  stale: boolean,
  trust: AiSensorSnapshotTrust,
  message: string,
): string {
  return `LATEST_SENSOR_SNAPSHOT [source=${source}, stale=${stale ? "true" : "false"}, trust=${trust}]: ${message}`;
}

const NONE_LINE = "LATEST_SENSOR_SNAPSHOT: none";

export function buildAiSensorSnapshotContext(
  snapshot: unknown,
  options: BuildAiSensorSnapshotContextOptions = {},
): AiSensorSnapshotContext {
  if (snapshot === null || snapshot === undefined) {
    return {
      annotationLine: NONE_LINE,
      valuesForModel: null,
      safetyNotes: [],
      missingInformationHints: [
        "No sensor snapshot available — log a manual reading or attach live telemetry.",
      ],
      sourceLabel: "unknown",
      trustLevel: "low",
      stale: false,
      isTrustedForAi: false,
    };
  }

  if (!isPlainObject(snapshot)) {
    return {
      annotationLine: buildLine(
        "invalid",
        false,
        "low",
        "values omitted; invalid sensor data is not trusted for diagnosis.",
      ),
      valuesForModel: null,
      safetyNotes: [
        "Snapshot payload is not a structured object; do not infer any environmental conditions from it.",
      ],
      missingInformationHints: [
        "A structured sensor snapshot (manual or live) is needed before environmental diagnosis.",
      ],
      sourceLabel: "invalid",
      trustLevel: "low",
      stale: false,
      isTrustedForAi: false,
    };
  }

  const now = options.now ?? new Date();
  const threshold =
    options.staleThresholdMs ?? DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS;
  const rawSourceStr = pickString(snapshot, [
    "source",
    "data_source",
    "sensor_source",
  ]);
  const source = normalizeSource(rawSourceStr);
  const captured = parseCapturedAt(snapshot);

  // Demo / invalid / unknown / explicit-stale: fixed-message paths.
  if (source === "demo") {
    return {
      annotationLine: buildLine(
        "demo",
        false,
        "low",
        "values omitted; demo data is not trusted for diagnosis.",
      ),
      valuesForModel: null,
      safetyNotes: [
        "Demo data is synthetic and MUST NOT be treated as real grow evidence.",
      ],
      missingInformationHints: [
        "Real or manual current sensor readings are needed before drawing environmental conclusions.",
      ],
      sourceLabel: "demo",
      trustLevel: "low",
      stale: false,
      isTrustedForAi: false,
    };
  }
  if (source === "invalid") {
    return {
      annotationLine: buildLine(
        "invalid",
        false,
        "low",
        "values omitted; invalid sensor data is not trusted for diagnosis.",
      ),
      valuesForModel: null,
      safetyNotes: [
        "Sensor telemetry was flagged invalid; do not rely on these values.",
      ],
      missingInformationHints: [
        "A valid sensor snapshot (manual or live) is needed before environmental diagnosis.",
      ],
      sourceLabel: "invalid",
      trustLevel: "low",
      stale: false,
      isTrustedForAi: false,
    };
  }
  if (source === "unknown") {
    return {
      annotationLine: buildLine(
        "unknown",
        false,
        "low",
        "values omitted; unknown source data is not trusted for diagnosis.",
      ),
      valuesForModel: null,
      safetyNotes: [
        "Snapshot source is unlabeled; provenance cannot be verified — treat as untrusted.",
      ],
      missingInformationHints: [
        "Source-labeled (live, manual, csv) snapshot is needed for trustworthy diagnosis.",
      ],
      sourceLabel: "unknown",
      trustLevel: "low",
      stale: false,
      isTrustedForAi: false,
    };
  }
  if (source === "stale") {
    return {
      annotationLine: buildLine(
        "stale",
        true,
        "low",
        "readings may not reflect current tent conditions.",
      ),
      valuesForModel: null,
      safetyNotes: [
        "Snapshot is marked stale; readings may not reflect current tent conditions.",
      ],
      missingInformationHints: [
        "A fresh sensor snapshot is needed before drawing environmental conclusions.",
      ],
      sourceLabel: "stale",
      trustLevel: "low",
      stale: true,
      isTrustedForAi: false,
    };
  }

  // source ∈ {live, manual, csv}
  const safetyNotes: string[] = [];
  const missingInformationHints: string[] = [];
  let stale = false;
  let captureProblem: "missing" | "invalid" | null = null;

  if (captured.kind === "missing") {
    captureProblem = "missing";
    missingInformationHints.push(
      "Snapshot is missing a captured_at timestamp; freshness cannot be verified.",
    );
  } else if (captured.kind === "invalid") {
    captureProblem = "invalid";
    safetyNotes.push(
      "Snapshot captured_at timestamp is invalid; freshness cannot be verified.",
    );
  } else {
    const ageMs = now.getTime() - captured.ms;
    // Exactly on threshold (ageMs === threshold) is NOT stale: strict ">".
    if (threshold <= 0) {
      // No trustworthy freshness window declared by caller.
      stale = ageMs > 0; // any positive age is stale; exact same instant stays not-stale
    } else if (ageMs > threshold) {
      stale = true;
    }
  }

  let trust: AiSensorSnapshotTrust;
  let includeValues: boolean;
  let message: string;

  if (captureProblem || stale || threshold <= 0) {
    trust = "low";
    includeValues = !captureProblem; // still allow values for stale-with-good-ts; omit when ts itself is broken
    if (captureProblem === "missing") {
      message = "values omitted; captured_at missing, freshness cannot be verified.";
      includeValues = false;
    } else if (captureProblem === "invalid") {
      message = "values omitted; captured_at invalid, freshness cannot be verified.";
      includeValues = false;
    } else {
      // stale but timestamp valid
      const readings = formatReadingsForLine(snapshot);
      message = `${readings} (stale: readings may not reflect current tent conditions)`;
      safetyNotes.push(
        "Snapshot is older than the freshness window; readings may not reflect current tent conditions.",
      );
    }
  } else if (source === "live") {
    trust = "high";
    includeValues = true;
    message = formatReadingsForLine(snapshot);
  } else {
    // manual or csv, fresh
    trust = "medium";
    includeValues = true;
    message = formatReadingsForLine(snapshot);
  }

  const valuesForModel = includeValues ? extractNumericReadings(snapshot) : null;
  const isTrustedForAi =
    includeValues && !stale && !captureProblem && (trust === "medium" || trust === "high");

  return {
    annotationLine: buildLine(source, stale, trust, message),
    valuesForModel,
    safetyNotes,
    missingInformationHints,
    sourceLabel: source,
    trustLevel: trust,
    stale,
    isTrustedForAi,
  };
}

// =============================================================
// Multi-snapshot aggregator
// =============================================================

const TRUST_ORDER: Record<AiSensorSnapshotTrust, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function dedupeSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

export function buildAiSensorSnapshotsContext(
  snapshots: unknown[],
  options: BuildAiSensorSnapshotContextOptions = {},
): AiSensorSnapshotsContext {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const annotationLines: string[] = [];
  const valuesForModel: Array<Record<string, number> | null> = [];
  const safety: string[] = [];
  const missing: string[] = [];
  let trustedCount = 0;
  let omittedCount = 0;
  let hasStale = false;
  let hasUntrusted = false;
  let highest: AiSensorSnapshotTrust = "low";
  let lowest: AiSensorSnapshotTrust = "high";
  let any = false;

  for (const snap of list) {
    const ctx = buildAiSensorSnapshotContext(snap, options);
    annotationLines.push(ctx.annotationLine);
    valuesForModel.push(ctx.valuesForModel);
    for (const n of ctx.safetyNotes) safety.push(n);
    for (const h of ctx.missingInformationHints) missing.push(h);
    if (ctx.isTrustedForAi) trustedCount++;
    else hasUntrusted = true;
    if (ctx.valuesForModel === null) omittedCount++;
    if (ctx.stale) hasStale = true;
    if (TRUST_ORDER[ctx.trustLevel] > TRUST_ORDER[highest]) highest = ctx.trustLevel;
    if (TRUST_ORDER[ctx.trustLevel] < TRUST_ORDER[lowest]) lowest = ctx.trustLevel;
    any = true;
  }

  if (!any) {
    return {
      annotationLines: [NONE_LINE],
      valuesForModel: [],
      safetyNotes: [],
      missingInformationHints: [
        "No sensor snapshot available — log a manual reading or attach live telemetry.",
      ],
      highestTrustLevel: "low",
      lowestTrustLevel: "low",
      hasUntrustedSnapshots: true,
      hasStaleSnapshots: false,
      trustedSnapshotCount: 0,
      omittedSnapshotCount: 0,
    };
  }

  return {
    annotationLines,
    valuesForModel,
    safetyNotes: dedupeSorted(safety),
    missingInformationHints: dedupeSorted(missing),
    highestTrustLevel: highest,
    lowestTrustLevel: lowest,
    hasUntrustedSnapshots: hasUntrusted,
    hasStaleSnapshots: hasStale,
    trustedSnapshotCount: trustedCount,
    omittedSnapshotCount: omittedCount,
  };
}
