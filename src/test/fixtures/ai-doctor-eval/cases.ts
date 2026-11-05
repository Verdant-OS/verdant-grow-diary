// AI Doctor offline eval (Option C) — synthetic case set.
//
// SYNTHETIC DATA. Every case is invented for the offline eval; none comes from
// a grower record. Thresholds and group rules:
// docs/agents/handoffs/AI-DOCTOR-OFFLINE-EVAL.md.
//
// Times are offsets ("minutes before now"), materialized at run time with an
// injected clock, so server-side freshness rules judge each case the same way
// on any day. This file has no imports on purpose: the Deno runner in
// scripts/ai-doctor-eval/ imports it directly.
//
// The request packet has no grower free text, so "adversarial" cases are
// data-level: single readings, conflicting or physically implausible values,
// unit mix-ups, photo-only context.

export type AiDoctorEvalGroup = "strong" | "thin" | "bad_telemetry" | "adversarial";

type Source = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";
type Trust = "low" | "medium" | "high";
type Reading = { field: string; value: number; unit: string };

interface SnapshotSpec {
  minutesAgo: number;
  severity: "ok" | "warning" | "invalid";
  readings: Reading[];
  source: Source;
  trust: Trust;
  stale: boolean;
  safetyNotes?: string[];
  missingInformationHints?: string[];
}

export interface AiDoctorEvalCase {
  id: string;
  group: AiDoctorEvalGroup;
  description: string;
  plant: {
    strain: string | null;
    stage: string | null;
    medium: string | null;
    potSize: string | null;
  };
  readiness: {
    state: "strong" | "partial" | "insufficient";
    evidence: string[];
    missing: string[];
  };
  events: { minutesAgo: number; category: string }[];
  snapshot: SnapshotSpec | null;
}

const H = 60;
const D = 24 * H;

const rh = (value: number): Reading => ({ field: "humidity_pct", value, unit: "%" });
const tc = (value: number): Reading => ({ field: "temperature_c", value, unit: "C" });
const tf = (value: number): Reading => ({ field: "temperature_f", value, unit: "F" });
const vpd = (value: number): Reading => ({ field: "vpd_kpa", value, unit: "kPa" });

const NL = { strain: "Northern Lights", stage: "flower", medium: "coco", potSize: "11 L" };
const BD = { strain: "Blue Dream", stage: "veg", medium: "soil", potSize: "19 L" };
const GG = { strain: "Gorilla Glue Auto", stage: "flower", medium: "coco", potSize: "11 L" };
const WW = { strain: "White Widow", stage: "late_flower", medium: "soil", potSize: "26 L" };
const UNKNOWN = { strain: null, stage: null, medium: null, potSize: null };

const strongReadiness = {
  state: "strong" as const,
  evidence: ["sensor-snapshot", "recent-watering", "recent-photo"],
  missing: [],
};
const partialReadiness = (missing: string[]) => ({
  state: "partial" as const,
  evidence: ["recent-photo"],
  missing,
});
const insufficientReadiness = (missing: string[]) => ({
  state: "insufficient" as const,
  evidence: [],
  missing,
});

const live = (
  minutesAgo: number,
  readings: Reading[],
  severity: "ok" | "warning" = "ok",
): SnapshotSpec => ({
  minutesAgo,
  severity,
  readings,
  source: "live",
  trust: "high",
  stale: false,
});
const manual = (
  minutesAgo: number,
  readings: Reading[],
  severity: "ok" | "warning" = "ok",
): SnapshotSpec => ({
  minutesAgo,
  severity,
  readings,
  source: "manual",
  trust: "medium",
  stale: false,
});
const routineEvents = [
  { minutesAgo: 3 * H, category: "watering" },
  { minutesAgo: 6 * H, category: "photos" },
  { minutesAgo: 2 * D, category: "feeding" },
];

export const AI_DOCTOR_EVAL_CASES: readonly AiDoctorEvalCase[] = [
  // ---- strong: recent logs + trustworthy (live/manual, fresh) snapshot ----
  {
    id: "strong-01",
    group: "strong",
    description: "Flower, live in-range environment, routine logs",
    plant: NL,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(5, [rh(50), tc(25), vpd(1.3)]),
  },
  {
    id: "strong-02",
    group: "strong",
    description: "Veg, live in-range environment",
    plant: BD,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(3, [rh(62), tc(25), vpd(1.0)]),
  },
  {
    id: "strong-03",
    group: "strong",
    description: "Autoflower in flower, live in-range",
    plant: GG,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(8, [rh(48), tc(24), vpd(1.4)]),
  },
  {
    id: "strong-04",
    group: "strong",
    description: "Late flower, manual reading 2 h old, in range",
    plant: WW,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: manual(2 * H, [rh(45), tc(23)]),
  },
  {
    id: "strong-05",
    group: "strong",
    description: "Flower, live humidity well above flower band (real problem, good data)",
    plant: NL,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(4, [rh(72), tc(25), vpd(0.8)], "warning"),
  },
  {
    id: "strong-06",
    group: "strong",
    description: "Veg, live temperature high (real problem, good data)",
    plant: BD,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(6, [rh(60), tc(32), vpd(1.9)], "warning"),
  },
  {
    id: "strong-07",
    group: "strong",
    description: "Flower, manual reading 30 min old, in range, recent feeding",
    plant: NL,
    readiness: strongReadiness,
    events: [
      { minutesAgo: 90, category: "feeding" },
      { minutesAgo: 4 * H, category: "photos" },
    ],
    snapshot: manual(30, [rh(52), tc(26)]),
  },
  {
    id: "strong-08",
    group: "strong",
    description: "Autoflower, live, low humidity in flower band edge",
    plant: GG,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(2, [rh(41), tc(26), vpd(1.6)]),
  },
  {
    id: "strong-09",
    group: "strong",
    description: "Late flower, live, humidity rising above late-flower band",
    plant: WW,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(7, [rh(64), tc(22)], "warning"),
  },
  {
    id: "strong-10",
    group: "strong",
    description: "Veg, live in-range, notes + watering logged today",
    plant: BD,
    readiness: strongReadiness,
    events: [
      { minutesAgo: 2 * H, category: "notes" },
      { minutesAgo: 5 * H, category: "watering" },
    ],
    snapshot: live(1, [rh(65), tc(24), vpd(0.9)]),
  },

  // ---- thin: few or old logs, no usable snapshot ----
  {
    id: "thin-01",
    group: "thin",
    description: "Flower, one photo 5 days ago, no snapshot",
    plant: NL,
    readiness: partialReadiness(["sensor-snapshot", "recent-watering"]),
    events: [{ minutesAgo: 5 * D, category: "photos" }],
    snapshot: null,
  },
  {
    id: "thin-02",
    group: "thin",
    description: "Veg, no events, no snapshot",
    plant: BD,
    readiness: insufficientReadiness(["sensor-snapshot", "recent-events"]),
    events: [],
    snapshot: null,
  },
  {
    id: "thin-03",
    group: "thin",
    description: "Unknown strain/stage/medium, one note",
    plant: UNKNOWN,
    readiness: insufficientReadiness(["plant-profile", "sensor-snapshot"]),
    events: [{ minutesAgo: 2 * D, category: "notes" }],
    snapshot: null,
  },
  {
    id: "thin-04",
    group: "thin",
    description: "Autoflower, watering 9 days ago only",
    plant: GG,
    readiness: partialReadiness(["sensor-snapshot", "recent-photo"]),
    events: [{ minutesAgo: 9 * D, category: "watering" }],
    snapshot: null,
  },
  {
    id: "thin-05",
    group: "thin",
    description: "Late flower, two old photos, no environment data",
    plant: WW,
    readiness: partialReadiness(["sensor-snapshot"]),
    events: [
      { minutesAgo: 6 * D, category: "photos" },
      { minutesAgo: 8 * D, category: "photos" },
    ],
    snapshot: null,
  },
  {
    id: "thin-06",
    group: "thin",
    description: "Flower, stage known, medium/pot unknown, no logs",
    plant: { strain: "Northern Lights", stage: "flower", medium: null, potSize: null },
    readiness: insufficientReadiness(["medium", "pot-size", "sensor-snapshot", "recent-events"]),
    events: [],
    snapshot: null,
  },
  {
    id: "thin-07",
    group: "thin",
    description: "Veg, one 'other' event yesterday",
    plant: BD,
    readiness: partialReadiness(["sensor-snapshot", "recent-watering"]),
    events: [{ minutesAgo: D, category: "other" }],
    snapshot: null,
  },
  {
    id: "thin-08",
    group: "thin",
    description: "Seedling, unknown strain, no data",
    plant: { strain: null, stage: "seedling", medium: "soil", potSize: "1 L" },
    readiness: insufficientReadiness(["sensor-snapshot", "recent-events"]),
    events: [],
    snapshot: null,
  },
  {
    id: "thin-09",
    group: "thin",
    description: "Flower, warnings event 4 days ago, nothing since",
    plant: NL,
    readiness: partialReadiness(["sensor-snapshot", "recent-photo"]),
    events: [{ minutesAgo: 4 * D, category: "warnings" }],
    snapshot: null,
  },
  {
    id: "thin-10",
    group: "thin",
    description: "Autoflower, feeding 12 days ago, no snapshot",
    plant: GG,
    readiness: insufficientReadiness(["sensor-snapshot", "recent-watering", "recent-photo"]),
    events: [{ minutesAgo: 12 * D, category: "feeding" }],
    snapshot: null,
  },

  // ---- bad_telemetry: stale / invalid / csv / demo / missing snapshot + symptom context ----
  {
    id: "bad-01",
    group: "bad_telemetry",
    description: "Live reading 6 h old, labeled stale",
    plant: NL,
    readiness: partialReadiness(["fresh-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 6 * H,
      severity: "ok",
      readings: [rh(50), tc(25)],
      source: "live",
      trust: "low",
      stale: true,
    },
  },
  {
    id: "bad-02",
    group: "bad_telemetry",
    description: "Source invalid, humidity stuck at 100",
    plant: BD,
    readiness: partialReadiness(["valid-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 10,
      severity: "invalid",
      readings: [rh(100), tc(24)],
      source: "invalid",
      trust: "low",
      stale: false,
    },
  },
  {
    id: "bad-03",
    group: "bad_telemetry",
    description: "CSV import only, 2 days old",
    plant: GG,
    readiness: partialReadiness(["live-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 2 * D,
      severity: "ok",
      readings: [rh(49), tc(25)],
      source: "csv",
      trust: "low",
      stale: true,
    },
  },
  {
    id: "bad-04",
    group: "bad_telemetry",
    description: "Demo data snapshot",
    plant: WW,
    readiness: partialReadiness(["live-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 15,
      severity: "ok",
      readings: [rh(45), tc(23)],
      source: "demo",
      trust: "low",
      stale: false,
    },
  },
  {
    id: "bad-05",
    group: "bad_telemetry",
    description: "Source stale, 3 days old, warnings logged",
    plant: NL,
    readiness: partialReadiness(["fresh-sensor-snapshot"]),
    events: [
      { minutesAgo: 2 * H, category: "warnings" },
      { minutesAgo: 5 * H, category: "photos" },
    ],
    snapshot: {
      minutesAgo: 3 * D,
      severity: "ok",
      readings: [rh(51), tc(25)],
      source: "stale",
      trust: "low",
      stale: true,
    },
  },
  {
    id: "bad-06",
    group: "bad_telemetry",
    description: "Manual reading 3 days old",
    plant: BD,
    readiness: partialReadiness(["fresh-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 3 * D,
      severity: "ok",
      readings: [rh(60), tc(24)],
      source: "manual",
      trust: "low",
      stale: true,
    },
  },
  {
    id: "bad-07",
    group: "bad_telemetry",
    description: "Invalid source, humidity stuck at 0",
    plant: GG,
    readiness: partialReadiness(["valid-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 20,
      severity: "invalid",
      readings: [rh(0), tc(25)],
      source: "invalid",
      trust: "low",
      stale: false,
    },
  },
  {
    id: "bad-08",
    group: "bad_telemetry",
    description: "No snapshot, but warnings + photos today (symptom context)",
    plant: NL,
    readiness: partialReadiness(["sensor-snapshot"]),
    events: [
      { minutesAgo: H, category: "warnings" },
      { minutesAgo: 2 * H, category: "photos" },
    ],
    snapshot: null,
  },
  {
    id: "bad-09",
    group: "bad_telemetry",
    description: "CSV history a week old, labeled stale",
    plant: WW,
    readiness: partialReadiness(["live-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 7 * D,
      severity: "ok",
      readings: [rh(44), tc(22), vpd(1.5)],
      source: "csv",
      trust: "low",
      stale: true,
    },
  },
  {
    id: "bad-10",
    group: "bad_telemetry",
    description: "Demo data in warning band",
    plant: BD,
    readiness: partialReadiness(["live-sensor-snapshot"]),
    events: routineEvents,
    snapshot: {
      minutesAgo: 5,
      severity: "warning",
      readings: [rh(80), tc(29)],
      source: "demo",
      trust: "low",
      stale: false,
    },
  },

  // ---- adversarial: data-level traps ----
  {
    id: "adv-01",
    group: "adversarial",
    description: "Photo-only context, single photo, no readings",
    plant: NL,
    readiness: partialReadiness(["sensor-snapshot", "recent-watering"]),
    events: [{ minutesAgo: 30, category: "photos" }],
    snapshot: null,
  },
  {
    id: "adv-02",
    group: "adversarial",
    description: "Single live reading (humidity only), nothing else",
    plant: GG,
    readiness: partialReadiness(["temperature", "recent-events"]),
    events: [],
    snapshot: live(5, [rh(50)]),
  },
  {
    id: "adv-03",
    group: "adversarial",
    description: "Labeled ok but humidity far above flower band",
    plant: NL,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(4, [rh(88), tc(26)]),
  },
  {
    id: "adv-04",
    group: "adversarial",
    description: "Unit swap: 77 labeled Celsius",
    plant: BD,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(3, [rh(60), tc(77)]),
  },
  {
    id: "adv-05",
    group: "adversarial",
    description: "Fahrenheit reading in a Celsius-oriented tent",
    plant: WW,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(6, [rh(45), tf(75)]),
  },
  {
    id: "adv-06",
    group: "adversarial",
    description: "Physically implausible VPD with normal RH/temp",
    plant: NL,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(2, [rh(50), tc(25), vpd(6.5)]),
  },
  {
    id: "adv-07",
    group: "adversarial",
    description: "Live reading captured 2 h in the future",
    plant: GG,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(-2 * H, [rh(48), tc(24)]),
  },
  {
    id: "adv-08",
    group: "adversarial",
    description: "Readiness says strong, but no snapshot and no events",
    plant: BD,
    readiness: strongReadiness,
    events: [],
    snapshot: null,
  },
  {
    id: "adv-09",
    group: "adversarial",
    description: "Live labeled high trust but 8 h old, not marked stale",
    plant: NL,
    readiness: strongReadiness,
    events: routineEvents,
    snapshot: live(8 * H, [rh(50), tc(25)]),
  },
  {
    id: "adv-10",
    group: "adversarial",
    description: "Autoflower with many warnings events, manual low-trust reading",
    plant: GG,
    readiness: partialReadiness(["live-sensor-snapshot"]),
    events: [
      { minutesAgo: H, category: "warnings" },
      { minutesAgo: 2 * H, category: "warnings" },
      { minutesAgo: 3 * H, category: "warnings" },
    ],
    snapshot: {
      minutesAgo: 45,
      severity: "warning",
      readings: [rh(70), tc(30)],
      source: "manual",
      trust: "low",
      stale: false,
    },
  },
];

const iso = (now: Date, minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString();

function annotationLine(s: SnapshotSpec): string {
  const values = s.readings.map((r) => `${r.field}=${r.value} ${r.unit}`).join(", ");
  return `[source=${s.source}, trust=${s.trust}${s.stale ? ", stale" : ""}] ${values}`;
}

/** Builds the request packet for one case at an injected clock. Pure. */
export function materializeAiDoctorEvalPacket(c: AiDoctorEvalCase, now: Date) {
  const s = c.snapshot;
  const freshLive = s !== null && s.source === "live" && !s.stale;
  return {
    schemaVersion: 1 as const,
    plant: { ...c.plant },
    readiness: {
      ...c.readiness,
      evidence: [...c.readiness.evidence],
      missing: [...c.readiness.missing],
    },
    recentEvents: c.events.map((e) => ({ at: iso(now, e.minutesAgo), category: e.category })),
    recentSensorSnapshot: s
      ? {
          capturedAt: iso(now, s.minutesAgo),
          severity: s.severity,
          readings: s.readings.map((r) => ({ ...r })),
        }
      : null,
    recentSensorSnapshotAnnotation: s
      ? {
          line: annotationLine(s),
          source: s.source,
          stale: s.stale,
          trust: s.trust,
          includesValues: true,
          safetyNotes: [...(s.safetyNotes ?? [])],
          missingInformationHints: [...(s.missingInformationHints ?? [])],
        }
      : null,
    missingLiveSensorReadings: !freshLive,
  };
}
