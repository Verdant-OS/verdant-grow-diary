/**
 * Pure helper that converts the multi-tent baseline diary fixture (or any
 * structurally similar diary fixture) into a compact, deterministic context
 * payload suitable for AI Doctor prompt assembly TESTS.
 *
 * Safety guarantees enforced here (and asserted by tests):
 * - Never relabels imported `csv` / non-live readings as `live`.
 * - Never marks invalid/unknown soil-probe state as healthy.
 * - Never emits executable device commands.
 * - Never produces Action Queue rows; suggestions are context-only and
 *   stay flagged `approval_required: true` / `device_control: false`.
 * - Never invents missing sensor values.
 * - Deterministic: stable ordering, no Date.now(), no randomness.
 *
 * This helper is test-only scaffolding. It is not imported by runtime app
 * code.
 */

export type DiaryFixtureSource =
  | "csv"
  | "manual"
  | "demo"
  | "stale"
  | "invalid"
  | "import";

export interface DiaryFixtureWindow {
  start: string;
  end: string;
  reading_count: number;
}

export interface DiaryFixtureTentAverages {
  temperature_f?: number;
  rh_pct?: number;
  vpd_kpa?: number;
}

export interface DiaryFixtureTent {
  status: string;
  averages?: DiaryFixtureTentAverages;
  recent_peak?: DiaryFixtureTentAverages;
  notes?: string;
}

export interface DiaryFixtureSoilProbes {
  status: string;
  notes?: string;
}

export interface DiaryFixtureActionItem {
  id: string;
  title: string;
  approval_required: boolean;
  device_control: boolean;
  back_pointer?: string;
  checklist?: string[];
}

export interface DiaryFixture {
  id: string;
  logged_at: string;
  source: DiaryFixtureSource | string;
  is_live: boolean;
  window: DiaryFixtureWindow;
  tents: Record<string, DiaryFixtureTent>;
  soil_probes?: DiaryFixtureSoilProbes;
  ai_doctor_context?: {
    treat_as?: string;
    do_not?: string[];
    missing_information?: string[];
  };
  suggested_action_queue_items?: DiaryFixtureActionItem[];
  follow_ups?: { "24_hour"?: string; "3_day"?: string };
  safety?: Record<string, unknown>;
}

export interface CompiledTentContext {
  tent: string;
  status: string;
  averages: DiaryFixtureTentAverages;
  recent_peak: DiaryFixtureTentAverages | null;
  notes: string;
}

export interface CompiledSoilProbeContext {
  status: string;
  notes: string;
  /**
   * True when status/notes mark the probe data as invalid, unknown,
   * blocked, partial, or stale — i.e. not usable as healthy telemetry.
   */
  flagged: boolean;
  /** Bucketed for prompt clarity. Never "healthy". */
  bucket: "invalid_or_unknown" | "usable";
}

export interface CompiledActionSuggestionContext {
  id: string;
  title: string;
  approval_required: true;
  device_control: false;
  checklist: string[];
  /** Always true here: this is context for the model, never a queue write. */
  context_only: true;
}

export interface CompiledDoctorContext {
  diary: {
    id: string;
    logged_at: string;
    window: DiaryFixtureWindow;
  };
  provenance: {
    source: string;
    is_live: false;
    /** Human-readable warning intended to appear in the prompt. */
    source_warning: string;
  };
  tents: CompiledTentContext[];
  soil_probes: CompiledSoilProbeContext | null;
  missing_information: string[];
  do_not: string[];
  suggested_actions_context_only: CompiledActionSuggestionContext[];
  follow_ups: { in_24_hours: string | null; in_3_days: string | null };
}

const ALLOWED_SOURCES = new Set<string>([
  "csv",
  "manual",
  "demo",
  "stale",
  "invalid",
  "import",
]);

const DEVICE_COMMAND_PATTERNS: RegExp[] = [
  /\bturn[_\s-]?on\b/i,
  /\bturn[_\s-]?off\b/i,
  /\bactuat/i,
  /\bdose\b/i,
  /\bpump[_\s-]?(on|off|start|stop)\b/i,
  /\bfan[_\s-]?(on|off|set)\b/i,
  /\bset[_\s-]?(temp|humidity|rh|light|fan|pump)\b/i,
  /\bexec(ute)?[_\s-]?(command|device)\b/i,
  /\bmqtt[_\s-]?publish\b/i,
];

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactAverages(input: DiaryFixtureTentAverages | undefined): DiaryFixtureTentAverages {
  if (!input) return {};
  const out: DiaryFixtureTentAverages = {};
  const t = safeNumber(input.temperature_f);
  const r = safeNumber(input.rh_pct);
  const v = safeNumber(input.vpd_kpa);
  if (t !== undefined) out.temperature_f = t;
  if (r !== undefined) out.rh_pct = r;
  if (v !== undefined) out.vpd_kpa = v;
  return out;
}

function isProbeFlagged(status: string, notes: string): boolean {
  const haystack = `${status} ${notes}`.toLowerCase();
  return /(invalid|unknown|blocked|partial|stale|missing|commission)/.test(
    haystack,
  );
}

function containsDeviceCommand(text: string): boolean {
  return DEVICE_COMMAND_PATTERNS.some((p) => p.test(text));
}

/**
 * Compile a diary fixture into AI Doctor prompt context. Pure, deterministic,
 * and null-safe. Throws only when the source field is unrecognised, because
 * an unknown source label is a sensor-truth violation we should not paper
 * over.
 */
export function compileDoctorContextFromDiaryFixture(
  fixture: DiaryFixture,
): CompiledDoctorContext {
  if (!fixture || typeof fixture !== "object") {
    throw new Error("compileDoctorContextFromDiaryFixture: fixture is required");
  }
  const source = safeString(fixture.source);
  if (!ALLOWED_SOURCES.has(source)) {
    throw new Error(
      `compileDoctorContextFromDiaryFixture: refusing unknown source label "${source}"`,
    );
  }
  if (fixture.is_live === true) {
    throw new Error(
      "compileDoctorContextFromDiaryFixture: imported diary fixtures must not be marked is_live=true",
    );
  }

  const window: DiaryFixtureWindow = {
    start: safeString(fixture.window?.start),
    end: safeString(fixture.window?.end),
    reading_count: safeNumber(fixture.window?.reading_count) ?? 0,
  };

  const tents: CompiledTentContext[] = Object.entries(fixture.tents ?? {})
    .map(([tent, value]) => ({
      tent,
      status: safeString(value?.status, "unknown"),
      averages: compactAverages(value?.averages),
      recent_peak: value?.recent_peak ? compactAverages(value.recent_peak) : null,
      notes: safeString(value?.notes),
    }))
    .sort((a, b) => a.tent.localeCompare(b.tent));

  let soil: CompiledSoilProbeContext | null = null;
  if (fixture.soil_probes) {
    const status = safeString(fixture.soil_probes.status, "unknown");
    const notes = safeString(fixture.soil_probes.notes);
    const flagged = isProbeFlagged(status, notes);
    soil = {
      status,
      notes,
      flagged,
      bucket: flagged ? "invalid_or_unknown" : "usable",
    };
  }

  const suggestions: CompiledActionSuggestionContext[] = (
    fixture.suggested_action_queue_items ?? []
  )
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      // Strict safety gating: items missing approval_required or with device
      // control are dropped entirely rather than promoted.
      if (item.approval_required !== true) return null;
      if (item.device_control !== false) return null;
      const checklist = Array.isArray(item.checklist)
        ? item.checklist.map((c) => safeString(c)).filter(Boolean)
        : [];
      // Reject any checklist line shaped like a device command.
      if (checklist.some(containsDeviceCommand)) return null;
      if (containsDeviceCommand(safeString(item.title))) return null;
      return {
        id: safeString(item.id),
        title: safeString(item.title),
        approval_required: true as const,
        device_control: false as const,
        checklist,
        context_only: true as const,
      };
    })
    .filter((x): x is CompiledActionSuggestionContext => x !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const missingInfo = (fixture.ai_doctor_context?.missing_information ?? [])
    .map((x) => safeString(x))
    .filter(Boolean);
  const doNot = (fixture.ai_doctor_context?.do_not ?? [])
    .map((x) => safeString(x))
    .filter(Boolean);

  const source_warning =
    `Historical ${source.toUpperCase()} sensor history — not live telemetry. ` +
    `Treat as context only; visual photos, current readings, and recent logs ` +
    `are required before any grow change.`;

  return {
    diary: {
      id: safeString(fixture.id),
      logged_at: safeString(fixture.logged_at),
      window,
    },
    provenance: {
      source,
      is_live: false,
      source_warning,
    },
    tents,
    soil_probes: soil,
    missing_information: missingInfo,
    do_not: doNot,
    suggested_actions_context_only: suggestions,
    follow_ups: {
      in_24_hours: fixture.follow_ups?.["24_hour"]
        ? safeString(fixture.follow_ups["24_hour"])
        : null,
      in_3_days: fixture.follow_ups?.["3_day"]
        ? safeString(fixture.follow_ups["3_day"])
        : null,
    },
  };
}

/** Flatten compiled context to strings for device-command scanning in tests. */
export function collectContextStrings(ctx: CompiledDoctorContext): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(visit);
    }
  };
  visit(ctx);
  return out;
}

export const __testing = {
  ALLOWED_SOURCES,
  DEVICE_COMMAND_PATTERNS,
  containsDeviceCommand,
  isProbeFlagged,
};
