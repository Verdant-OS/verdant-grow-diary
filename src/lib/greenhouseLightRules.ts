/**
 * greenhouseLightRules — pure rules for mixed-light greenhouse light
 * accounting (PPFD → DLI, dark-cycle leak inspection).
 *
 * Contract:
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers, no
 *    automation, no device control.
 *  - Consumes resolved snapshot-like inputs only. Never parses raw
 *    `sensor_readings` rows. Never re-derives source labels from raw
 *    payloads.
 *  - Unknown / noncanonical source values resolve to "invalid". No
 *    promotion of csv/manual/demo/stale/invalid to "live".
 *  - stale/invalid (and demo) are EXCLUDED from healthy DLI totals.
 *  - A single instantaneous PPFD reading is NOT a DLI — windows with
 *    fewer than two samples report `insufficient_samples` and `null`
 *    DLI rather than fabricating certainty.
 *  - 24h DLI / photoperiod windows are marked `invalid_timezone` if
 *    the IANA timezone is missing or unknown.
 *  - Dark-cycle leak output is REVIEW-only — never a certainty, never
 *    a device command, never an action queue suggestion.
 *  - Returned objects MUST NOT contain `command`, `device_id`,
 *    `action_queue`, `control`, `relay`, or `execute` keys.
 */

/** Canonical source vocabulary. Mirrors docs/data-labeling-spec.md. */
export type GreenhouseSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

const CANONICAL_SOURCES: ReadonlySet<string> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

/**
 * Normalize an arbitrary source-ish value to the canonical vocabulary.
 * Unknown / non-string / noncanonical values resolve to "invalid".
 * Never promotes anything to "live".
 */
export function normalizeGreenhouseSource(input: unknown): GreenhouseSource {
  if (typeof input !== "string") return "invalid";
  const k = input.trim().toLowerCase();
  if (!CANONICAL_SOURCES.has(k)) return "invalid";
  return k as GreenhouseSource;
}

/** Sources that count toward healthy DLI totals. */
const HEALTHY_DLI_SOURCES: ReadonlySet<GreenhouseSource> = new Set<GreenhouseSource>([
  "live",
  "manual",
  "csv",
]);

export type LightChannel = "solar" | "led" | "unknown";

export interface PpfdSample {
  /** ISO-8601 timestamp. */
  ts: string;
  /** Instantaneous PPFD in µmol/m²/s. */
  ppfd: number | null | undefined;
  /** Raw source value — will be normalized. */
  source: unknown;
  /** Optional channel attribution. */
  channel?: LightChannel | string | null;
}

export type DliWindowStatus =
  | "ok"
  | "invalid_timezone"
  | "dst_ambiguous"
  | "insufficient_samples"
  | "no_healthy_samples";

export interface AggregateDliInput {
  samples: ReadonlyArray<PpfdSample>;
  /** IANA timezone (e.g. "America/Los_Angeles"). Required. */
  tzIana?: string | null;
}

export interface AggregateDliResult {
  dliMolM2Day: number | null;
  solarMolM2Day: number | null;
  ledMolM2Day: number | null;
  windowStatus: DliWindowStatus;
  usedCount: number;
  excludedCount: number;
  /** Per-sample normalized source breakdown for inspection. */
  sourceBreakdown: Record<GreenhouseSource, number>;
}

function normalizeChannel(input: unknown): LightChannel {
  if (typeof input !== "string") return "unknown";
  const k = input.trim().toLowerCase();
  if (k === "solar" || k === "led") return k;
  return "unknown";
}

function isValidIanaTz(tz: unknown): tz is string {
  if (typeof tz !== "string") return false;
  const trimmed = tz.trim();
  if (!trimmed) return false;
  try {
    // Throws RangeError for unknown zones.
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the UTC offset (ms) for an instant in the given IANA zone.
 * Used to detect DST transitions within a window.
 */
function tzOffsetMs(instantMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(instantMs));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - instantMs;
}

/**
 * True when [startMs, endMs] crosses a DST transition in tz
 * (UTC offset differs between the endpoints).
 */
function windowCrossesDst(startMs: number, endMs: number, tz: string): boolean {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (endMs <= startMs) return false;
  return tzOffsetMs(startMs, tz) !== tzOffsetMs(endMs, tz);
}

function emptyBreakdown(): Record<GreenhouseSource, number> {
  return { live: 0, manual: 0, csv: 0, demo: 0, stale: 0, invalid: 0 };
}

/**
 * Aggregate timestamped PPFD samples into a DLI (mol/m²/day).
 *
 * Uses trapezoidal integration between consecutive healthy samples.
 * Returns null DLI (with status) when input is insufficient, the
 * timezone is missing/unknown, or no healthy samples remain.
 */
export function aggregateDli(input: AggregateDliInput): AggregateDliResult {
  const breakdown = emptyBreakdown();
  const samples = Array.isArray(input?.samples) ? input.samples : [];

  // Tally raw source breakdown first (for inspection regardless of tz).
  for (const s of samples) {
    breakdown[normalizeGreenhouseSource(s?.source)] += 1;
  }

  if (!isValidIanaTz(input?.tzIana)) {
    return {
      dliMolM2Day: null,
      solarMolM2Day: null,
      ledMolM2Day: null,
      windowStatus: "invalid_timezone",
      usedCount: 0,
      excludedCount: samples.length,
      sourceBreakdown: breakdown,
    };
  }

  // Filter healthy samples and parse timestamps.
  type Parsed = { tMs: number; ppfd: number; channel: LightChannel };
  const healthy: Parsed[] = [];
  let excluded = 0;
  for (const s of samples) {
    const src = normalizeGreenhouseSource(s?.source);
    if (!HEALTHY_DLI_SOURCES.has(src)) {
      excluded += 1;
      continue;
    }
    if (s?.ppfd === null || s?.ppfd === undefined) {
      excluded += 1;
      continue;
    }
    const ppfd = typeof s.ppfd === "number" ? s.ppfd : Number(s.ppfd);
    if (!Number.isFinite(ppfd) || ppfd < 0) {
      excluded += 1;
      continue;
    }
    const tMs = Date.parse(String(s?.ts ?? ""));
    if (!Number.isFinite(tMs)) {
      excluded += 1;
      continue;
    }
    healthy.push({ tMs, ppfd, channel: normalizeChannel(s?.channel) });
  }

  if (healthy.length === 0) {
    return {
      dliMolM2Day: null,
      solarMolM2Day: null,
      ledMolM2Day: null,
      windowStatus: "no_healthy_samples",
      usedCount: 0,
      excludedCount: excluded,
      sourceBreakdown: breakdown,
    };
  }

  if (healthy.length < 2) {
    // One instantaneous PPFD is NOT a DLI.
    return {
      dliMolM2Day: null,
      solarMolM2Day: null,
      ledMolM2Day: null,
      windowStatus: "insufficient_samples",
      usedCount: healthy.length,
      excludedCount: excluded,
      sourceBreakdown: breakdown,
    };
  }

  healthy.sort((a, b) => a.tMs - b.tMs);

  // Trapezoidal integration: sum PPFD (µmol/m²/s) * dt (s); convert
  // µmol→mol by /1e6. This produces mol/m² over the covered window,
  // which IS the DLI when the window covers the 24h photoperiod.
  let totalUmolM2 = 0;
  let solarUmolM2 = 0;
  let ledUmolM2 = 0;
  for (let i = 1; i < healthy.length; i += 1) {
    const a = healthy[i - 1];
    const b = healthy[i];
    const dtSec = (b.tMs - a.tMs) / 1000;
    if (dtSec <= 0) continue;
    const avg = (a.ppfd + b.ppfd) / 2;
    const segment = avg * dtSec;
    totalUmolM2 += segment;
    // Channel attribution: only attribute to a channel when BOTH ends
    // share the same known channel; mixed/unknown stays in total.
    if (a.channel === b.channel) {
      if (a.channel === "solar") solarUmolM2 += segment;
      else if (a.channel === "led") ledUmolM2 += segment;
    }
  }

  return {
    dliMolM2Day: totalUmolM2 / 1_000_000,
    solarMolM2Day: solarUmolM2 / 1_000_000,
    ledMolM2Day: ledUmolM2 / 1_000_000,
    windowStatus: "ok",
    usedCount: healthy.length,
    excludedCount: excluded,
    sourceBreakdown: breakdown,
  };
}

export interface DarkCycleLeakInput {
  samples: ReadonlyArray<PpfdSample>;
  /** Inclusive ISO start of intended dark period. */
  darkStartIso?: string | null;
  /** Exclusive ISO end of intended dark period. */
  darkEndIso?: string | null;
  /** IANA timezone — required to interpret the window. */
  tzIana?: string | null;
  /** PPFD above this is suspicious during dark period. Default 1. */
  leakThresholdPpfd?: number;
}

export type DarkCycleLeakStatus = "ok" | "review" | "invalid_window";

export interface DarkCycleLeakResult {
  status: DarkCycleLeakStatus;
  /** Number of healthy samples observed inside the dark window. */
  inWindowSampleCount: number;
  /** Suspicious sample count (PPFD > threshold). */
  suspiciousSampleCount: number;
  /** Human-readable reason for the status. */
  reason: string;
}

/**
 * Inspect a planned dark cycle for possible PPFD leak.
 *
 * REVIEW-only. This never returns certainty, never emits a device
 * command, and never schedules an action. It exists so a human can
 * verify whether the greenhouse went truly dark.
 */
export function detectDarkCycleLeak(
  input: DarkCycleLeakInput,
): DarkCycleLeakResult {
  if (!isValidIanaTz(input?.tzIana)) {
    return {
      status: "invalid_window",
      inWindowSampleCount: 0,
      suspiciousSampleCount: 0,
      reason: "missing_or_unknown_timezone",
    };
  }
  const startMs = Date.parse(String(input?.darkStartIso ?? ""));
  const endMs = Date.parse(String(input?.darkEndIso ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      status: "invalid_window",
      inWindowSampleCount: 0,
      suspiciousSampleCount: 0,
      reason: "invalid_dark_window",
    };
  }
  const threshold =
    typeof input?.leakThresholdPpfd === "number" && Number.isFinite(input.leakThresholdPpfd)
      ? input.leakThresholdPpfd
      : 1;
  const samples = Array.isArray(input?.samples) ? input.samples : [];
  let inWindow = 0;
  let suspicious = 0;
  for (const s of samples) {
    const src = normalizeGreenhouseSource(s?.source);
    if (!HEALTHY_DLI_SOURCES.has(src)) continue;
    const tMs = Date.parse(String(s?.ts ?? ""));
    if (!Number.isFinite(tMs)) continue;
    if (tMs < startMs || tMs >= endMs) continue;
    const ppfd = typeof s?.ppfd === "number" ? s.ppfd : Number(s?.ppfd);
    if (!Number.isFinite(ppfd) || ppfd < 0) continue;
    inWindow += 1;
    if (ppfd > threshold) suspicious += 1;
  }
  if (inWindow === 0) {
    return {
      status: "review",
      inWindowSampleCount: 0,
      suspiciousSampleCount: 0,
      reason: "no_samples_inside_dark_window_review_sensor_coverage",
    };
  }
  if (suspicious > 0) {
    return {
      status: "review",
      inWindowSampleCount: inWindow,
      suspiciousSampleCount: suspicious,
      reason: "ppfd_above_leak_threshold_during_dark_review_for_light_leak",
    };
  }
  return {
    status: "ok",
    inWindowSampleCount: inWindow,
    suspiciousSampleCount: 0,
    reason: "no_ppfd_above_threshold_observed",
  };
}
