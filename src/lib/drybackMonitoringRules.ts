/**
 * drybackMonitoringRules — pure, read-only dryback (substrate moisture change)
 * monitoring between recorded waterings.
 *
 * Evidence only. Never:
 *  - recommends watering or changes schedule
 *  - invents missing VWC samples
 *  - treats demo/invalid as live health
 *  - controls devices
 *  - emits Action Queue items
 *
 * A "dryback window" is the soil_moisture_pct series between two watering
 * markers (or an open window after the latest watering). Peak and trough are
 * arithmetic extrema over accepted samples — not crop-steering targets.
 */

export const DRYBACK_MONITORING_TITLE = "Dryback monitoring";
export const DRYBACK_MONITORING_CAVEAT =
  "Evidence only — dryback is arithmetic VWC change between waterings. Not a schedule, not plant health, not a watering recommendation." as const;
export const DRYBACK_EMPTY_NO_SAMPLES =
  "No usable soil moisture samples for this tent yet.";
export const DRYBACK_EMPTY_NO_WATERINGS =
  "No dated watering markers yet — log waterings to open dryback windows.";
export const DRYBACK_INSUFFICIENT_COPY =
  "Not enough paired samples between waterings to form a dryback window.";

/** Samples in the first N ms after watering are eligible for peak search. */
export const DRYBACK_PEAK_SEARCH_MS = 6 * 60 * 60 * 1000;
/** Minimum samples inside a window for "usable" confidence floor. */
export const DRYBACK_MIN_SAMPLES_USABLE = 3;
/** Minimum peak−trough percentage points for a usable closed window. */
export const DRYBACK_MIN_DELTA_PCT_POINTS = 2;
/** Cap recent windows shown in the strip. */
export const DRYBACK_RECENT_WINDOW_CAP = 5;

export type DrybackSourceClass =
  | "live"
  | "manual"
  | "csv"
  | "imported"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export type DrybackWindowKind = "closed" | "open";
export type DrybackWindowQuality = "usable" | "weak" | "unusable";
export type DrybackConfidence = "high" | "medium" | "low" | null;

export interface DrybackVwcSampleInput {
  readonly id: string;
  readonly capturedAt: string | null;
  readonly vwcPct: number | null;
  readonly source?: string | null;
  readonly quality?: string | null;
  readonly metric?: string | null;
}

export interface DrybackWateringMarkerInput {
  readonly id: string;
  readonly occurredAt: string | null;
  readonly volumeMl?: number | null;
}

/** Long-format sensor_readings-shaped row (subset). */
export interface DrybackSensorReadingLike {
  readonly id?: string | null;
  readonly metric?: string | null;
  readonly value?: number | string | null;
  readonly source?: string | null;
  readonly quality?: string | null;
  readonly captured_at?: string | null;
  readonly ts?: string | null;
  readonly created_at?: string | null;
}

export interface DrybackMonitoringOptions {
  readonly now?: number;
  readonly peakSearchMs?: number;
  readonly minSamplesUsable?: number;
  readonly minDeltaPctPoints?: number;
  readonly recentCap?: number;
}

export interface DrybackWindowView {
  readonly id: string;
  readonly kind: DrybackWindowKind;
  readonly quality: DrybackWindowQuality;
  readonly confidence: DrybackConfidence;
  readonly wateringId: string;
  readonly wateringAt: string;
  readonly nextWateringId: string | null;
  readonly nextWateringAt: string | null;
  readonly sampleCount: number;
  readonly peakVwcPct: number | null;
  readonly troughVwcPct: number | null;
  readonly peakAt: string | null;
  readonly troughAt: string | null;
  /** peak − trough in percentage points; null when not computable. */
  readonly deltaPctPoints: number | null;
  /** (peak − trough) / peak × 100 when peak > 0. */
  readonly deltaPctOfPeak: number | null;
  readonly durationLabel: string | null;
  readonly sourceClass: DrybackSourceClass;
  readonly sourceLabel: string;
  readonly summaryLine: string;
  readonly warnings: readonly string[];
}

export type DrybackMonitoringStatus = "empty" | "insufficient" | "windows";

export interface DrybackMonitoringViewModel {
  readonly status: DrybackMonitoringStatus;
  readonly title: string;
  readonly sampleCount: number;
  readonly wateringMarkerCount: number;
  readonly usableWindowCount: number;
  readonly latestClosed: DrybackWindowView | null;
  readonly openWindow: DrybackWindowView | null;
  readonly recentWindows: readonly DrybackWindowView[];
  readonly emptyCopy: string | null;
  readonly caveat: typeof DRYBACK_MONITORING_CAVEAT;
}

interface NormalizedSample {
  id: string;
  capturedAt: string;
  ms: number;
  vwcPct: number;
  sourceClass: DrybackSourceClass;
}

interface NormalizedWatering {
  id: string;
  occurredAt: string;
  ms: number;
  volumeMl: number | null;
}

function trim(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseIso(raw: string | null | undefined): { iso: string; ms: number } | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

export function classifyDrybackSource(source: string | null | undefined): DrybackSourceClass {
  const s = (source ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "live" || s === "pi_bridge" || s === "bridge" || s.startsWith("live")) return "live";
  if (s === "manual") return "manual";
  if (s === "csv" || s === "import" || s === "imported") return "csv";
  if (s === "demo" || s === "sample" || s === "synthetic") return "demo";
  if (s === "stale") return "stale";
  if (s === "invalid" || s === "error" || s === "diagnostic") return "invalid";
  return "unknown";
}

export function drybackSourceLabel(sourceClass: DrybackSourceClass): string {
  switch (sourceClass) {
    case "live":
      return "Live sensor";
    case "manual":
      return "Manual entry";
    case "csv":
    case "imported":
      return "Imported / CSV";
    case "demo":
      return "Demo data";
    case "stale":
      return "Stale reading";
    case "invalid":
      return "Invalid telemetry";
    default:
      return "Source unavailable";
  }
}

/** Reject impossible / often-faulty VWC extremes for dryback math. */
export function isPlausibleDrybackVwc(vwcPct: number): boolean {
  if (!Number.isFinite(vwcPct)) return false;
  if (vwcPct < 0 || vwcPct > 100) return false;
  // Exact 0 / 100 are commonly sensor faults (same fence as manual snapshot quality).
  if (vwcPct === 0 || vwcPct === 100) return false;
  return true;
}

function isSoilMoistureMetric(metric: string | null | undefined): boolean {
  const m = (metric ?? "").trim().toLowerCase();
  return m === "soil_moisture_pct" || m === "soil_moisture" || m === "soil" || m === "vwc";
}

/**
 * Pull soil moisture samples from long-format sensor_readings rows.
 * Demo/invalid rows are kept but tagged so windows can fail quality gates.
 */
export function extractDrybackVwcSamples(
  rows: readonly DrybackSensorReadingLike[] | null | undefined,
): DrybackVwcSampleInput[] {
  if (!Array.isArray(rows)) return [];
  const out: DrybackVwcSampleInput[] = [];
  for (const row of rows) {
    if (!row || !isSoilMoistureMetric(row.metric ?? null)) continue;
    const id = trim(row.id) ?? `${row.metric}-${row.captured_at ?? row.ts ?? ""}`;
    const capturedAt = trim(row.captured_at) ?? trim(row.ts) ?? trim(row.created_at);
    const vwcPct = finiteNumber(row.value);
    out.push({
      id,
      capturedAt,
      vwcPct,
      source: row.source ?? null,
      quality: row.quality ?? null,
      metric: row.metric ?? null,
    });
  }
  return out;
}

function normalizeSamples(samples: readonly DrybackVwcSampleInput[]): NormalizedSample[] {
  const out: NormalizedSample[] = [];
  for (const s of samples) {
    const id = trim(s.id);
    if (!id) continue;
    const occurred = parseIso(s.capturedAt);
    if (!occurred) continue;
    const vwc = finiteNumber(s.vwcPct);
    if (vwc === null || !isPlausibleDrybackVwc(vwc)) continue;
    const sourceClass = classifyDrybackSource(s.source);
    if (sourceClass === "invalid") continue;
    // Quality string invalid also rejected.
    const q = (s.quality ?? "").trim().toLowerCase();
    if (q === "invalid" || q === "error") continue;
    out.push({
      id,
      capturedAt: occurred.iso,
      ms: occurred.ms,
      vwcPct: vwc,
      sourceClass,
    });
  }
  out.sort((a, b) => (a.ms !== b.ms ? a.ms - b.ms : a.id.localeCompare(b.id)));
  return out;
}

function normalizeWaterings(
  markers: readonly DrybackWateringMarkerInput[],
): NormalizedWatering[] {
  const out: NormalizedWatering[] = [];
  for (const m of markers) {
    const id = trim(m.id);
    if (!id) continue;
    const occurred = parseIso(m.occurredAt);
    if (!occurred) continue;
    const volumeMl = finiteNumber(m.volumeMl);
    out.push({
      id,
      occurredAt: occurred.iso,
      ms: occurred.ms,
      volumeMl: volumeMl !== null && volumeMl > 0 ? volumeMl : null,
    });
  }
  out.sort((a, b) => (a.ms !== b.ms ? a.ms - b.ms : a.id.localeCompare(b.id)));
  return out;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function majoritySource(samples: readonly NormalizedSample[]): DrybackSourceClass {
  if (samples.length === 0) return "unknown";
  const counts = new Map<DrybackSourceClass, number>();
  for (const s of samples) {
    counts.set(s.sourceClass, (counts.get(s.sourceClass) ?? 0) + 1);
  }
  let best: DrybackSourceClass = "unknown";
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function scoreWindow(args: {
  kind: DrybackWindowKind;
  sampleCount: number;
  delta: number | null;
  durationMs: number | null;
  sourceClass: DrybackSourceClass;
  minSamples: number;
  minDelta: number;
}): { quality: DrybackWindowQuality; confidence: DrybackConfidence; warnings: string[] } {
  const warnings: string[] = [];
  if (args.sourceClass === "demo") {
    warnings.push("Demo-labeled samples — not live telemetry.");
  }
  if (args.sourceClass === "stale") {
    warnings.push("Stale source present in window.");
  }
  if (args.sampleCount < args.minSamples) {
    return { quality: "unusable", confidence: null, warnings: [...warnings, "Too few samples."] };
  }
  if (args.delta === null || args.delta < args.minDelta) {
    return {
      quality: "unusable",
      confidence: null,
      warnings: [...warnings, "Peak−trough delta below minimum."],
    };
  }
  if (args.kind === "open") {
    warnings.push("Open window — still in progress after last watering.");
    return { quality: "weak", confidence: "low", warnings };
  }
  if (args.sourceClass === "demo") {
    return { quality: "weak", confidence: "low", warnings };
  }
  const longEnough = args.durationMs !== null && args.durationMs >= 4 * 3600_000;
  const rich = args.sampleCount >= 8 && longEnough && args.delta >= 5;
  const trustedSource =
    args.sourceClass === "live" ||
    args.sourceClass === "manual" ||
    args.sourceClass === "csv" ||
    args.sourceClass === "imported";
  if (rich && trustedSource) {
    return { quality: "usable", confidence: "high", warnings };
  }
  if (args.sampleCount >= args.minSamples && trustedSource) {
    return { quality: "usable", confidence: "medium", warnings };
  }
  return { quality: "weak", confidence: "low", warnings };
}

function buildWindow(args: {
  start: NormalizedWatering;
  end: NormalizedWatering | null;
  samples: readonly NormalizedSample[];
  nowMs: number;
  peakSearchMs: number;
  minSamples: number;
  minDelta: number;
}): DrybackWindowView {
  const kind: DrybackWindowKind = args.end ? "closed" : "open";
  const endMs = args.end ? args.end.ms : args.nowMs;
  // Samples strictly after watering start, at or before next watering (or now).
  const inWindow = args.samples.filter((s) => s.ms > args.start.ms && s.ms <= endMs);

  const peakDeadline = args.start.ms + args.peakSearchMs;
  const peakCandidates = inWindow.filter((s) => s.ms <= peakDeadline);
  const peakPool = peakCandidates.length > 0 ? peakCandidates : inWindow;

  let peak: NormalizedSample | null = null;
  for (const s of peakPool) {
    if (!peak || s.vwcPct > peak.vwcPct || (s.vwcPct === peak.vwcPct && s.ms < peak.ms)) {
      peak = s;
    }
  }

  let trough: NormalizedSample | null = null;
  if (peak) {
    for (const s of inWindow) {
      if (s.ms < peak.ms) continue;
      if (!trough || s.vwcPct < trough.vwcPct || (s.vwcPct === trough.vwcPct && s.ms > trough.ms)) {
        trough = s;
      }
    }
  }

  const peakVwc = peak?.vwcPct ?? null;
  const troughVwc = trough?.vwcPct ?? null;
  let delta: number | null = null;
  let deltaOfPeak: number | null = null;
  if (peakVwc !== null && troughVwc !== null && peakVwc > troughVwc) {
    delta = round1(peakVwc - troughVwc);
    if (peakVwc > 0) {
      deltaOfPeak = round1(((peakVwc - troughVwc) / peakVwc) * 100);
    }
  }

  let durationMs: number | null = null;
  let durationLabel: string | null = null;
  if (peak && trough && trough.ms >= peak.ms) {
    durationMs = trough.ms - peak.ms;
    durationLabel = formatDuration(durationMs);
  } else if (kind === "open" && peak) {
    durationMs = Math.max(0, args.nowMs - peak.ms);
    durationLabel = formatDuration(durationMs);
  }

  const sourceClass = majoritySource(inWindow);
  const scored = scoreWindow({
    kind,
    sampleCount: inWindow.length,
    delta,
    durationMs,
    sourceClass,
    minSamples: args.minSamples,
    minDelta: args.minDelta,
  });

  const parts: string[] = [];
  if (delta !== null) {
    parts.push(`Δ ${delta} pt`);
    if (deltaOfPeak !== null) parts.push(`(${deltaOfPeak}% of peak)`);
  }
  if (peakVwc !== null && troughVwc !== null) {
    parts.push(`${round1(peakVwc)}% → ${round1(troughVwc)}%`);
  }
  if (durationLabel) parts.push(durationLabel);
  const summaryLine =
    parts.length > 0
      ? parts.join(" · ")
      : kind === "open"
        ? "Open window — collecting samples"
        : "Window lacks peak/trough pair";

  return {
    id: `${args.start.id}:${args.end?.id ?? "open"}`,
    kind,
    quality: scored.quality,
    confidence: scored.confidence,
    wateringId: args.start.id,
    wateringAt: args.start.occurredAt,
    nextWateringId: args.end?.id ?? null,
    nextWateringAt: args.end?.occurredAt ?? null,
    sampleCount: inWindow.length,
    peakVwcPct: peakVwc !== null ? round1(peakVwc) : null,
    troughVwcPct: troughVwc !== null ? round1(troughVwc) : null,
    peakAt: peak?.capturedAt ?? null,
    troughAt: trough?.capturedAt ?? null,
    deltaPctPoints: delta,
    deltaPctOfPeak: deltaOfPeak,
    durationLabel,
    sourceClass,
    sourceLabel: drybackSourceLabel(sourceClass),
    summaryLine,
    warnings: scored.warnings,
  };
}

/**
 * Build the read-only dryback monitoring view-model from VWC samples + watering markers.
 */
export function buildDrybackMonitoring(
  samplesInput: readonly DrybackVwcSampleInput[] | null | undefined,
  wateringsInput: readonly DrybackWateringMarkerInput[] | null | undefined,
  options: DrybackMonitoringOptions = {},
): DrybackMonitoringViewModel {
  const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
  const peakSearchMs = options.peakSearchMs ?? DRYBACK_PEAK_SEARCH_MS;
  const minSamples = options.minSamplesUsable ?? DRYBACK_MIN_SAMPLES_USABLE;
  const minDelta = options.minDeltaPctPoints ?? DRYBACK_MIN_DELTA_PCT_POINTS;
  const recentCap = Math.max(1, Math.floor(options.recentCap ?? DRYBACK_RECENT_WINDOW_CAP));

  const samples = normalizeSamples(Array.isArray(samplesInput) ? samplesInput : []);
  const waterings = normalizeWaterings(Array.isArray(wateringsInput) ? wateringsInput : []);

  if (samples.length === 0) {
    return {
      status: "empty",
      title: DRYBACK_MONITORING_TITLE,
      sampleCount: 0,
      wateringMarkerCount: waterings.length,
      usableWindowCount: 0,
      latestClosed: null,
      openWindow: null,
      recentWindows: [],
      emptyCopy: DRYBACK_EMPTY_NO_SAMPLES,
      caveat: DRYBACK_MONITORING_CAVEAT,
    };
  }

  if (waterings.length === 0) {
    return {
      status: "empty",
      title: DRYBACK_MONITORING_TITLE,
      sampleCount: samples.length,
      wateringMarkerCount: 0,
      usableWindowCount: 0,
      latestClosed: null,
      openWindow: null,
      recentWindows: [],
      emptyCopy: DRYBACK_EMPTY_NO_WATERINGS,
      caveat: DRYBACK_MONITORING_CAVEAT,
    };
  }

  const windows: DrybackWindowView[] = [];
  for (let i = 0; i < waterings.length; i++) {
    const start = waterings[i];
    const end = waterings[i + 1] ?? null;
    // Only emit open window for the latest watering.
    if (!end && i !== waterings.length - 1) continue;
    windows.push(
      buildWindow({
        start,
        end,
        samples,
        nowMs: now,
        peakSearchMs,
        minSamples,
        minDelta,
      }),
    );
  }

  // Newest first for presentation.
  const newestFirst = [...windows].reverse();
  const closed = newestFirst.filter((w) => w.kind === "closed");
  const openWindow = newestFirst.find((w) => w.kind === "open") ?? null;
  const usableWindowCount = windows.filter((w) => w.quality === "usable").length;
  const latestClosed = closed[0] ?? null;

  const hasAnyEvidence = windows.some(
    (w) => w.sampleCount > 0 && (w.deltaPctPoints !== null || w.kind === "open"),
  );

  if (!hasAnyEvidence) {
    return {
      status: "insufficient",
      title: DRYBACK_MONITORING_TITLE,
      sampleCount: samples.length,
      wateringMarkerCount: waterings.length,
      usableWindowCount: 0,
      latestClosed: null,
      openWindow,
      recentWindows: newestFirst.slice(0, recentCap),
      emptyCopy: DRYBACK_INSUFFICIENT_COPY,
      caveat: DRYBACK_MONITORING_CAVEAT,
    };
  }

  return {
    status: "windows",
    title: DRYBACK_MONITORING_TITLE,
    sampleCount: samples.length,
    wateringMarkerCount: waterings.length,
    usableWindowCount,
    latestClosed,
    openWindow,
    recentWindows: newestFirst.slice(0, recentCap),
    emptyCopy: null,
    caveat: DRYBACK_MONITORING_CAVEAT,
  };
}

/** Convenience: sensor rows + watering markers → view-model. */
export function buildDrybackMonitoringFromSensorRows(
  sensorRows: readonly DrybackSensorReadingLike[] | null | undefined,
  waterings: readonly DrybackWateringMarkerInput[] | null | undefined,
  options?: DrybackMonitoringOptions,
): DrybackMonitoringViewModel {
  return buildDrybackMonitoring(extractDrybackVwcSamples(sensorRows), waterings, options);
}
